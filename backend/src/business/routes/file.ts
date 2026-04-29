/**
 * 鏂囦欢绠＄悊 API
 * POST /files/upload multipart 涓婁紶
 * POST /files/ingest 绗笁鏂圭郴缁熸帹閫佷簩杩涘埗
 * GET  /files 鏂囦欢鍒楄〃
 * GET  /files/:id 鏂囦欢璇︽儏
 * GET  /files/:id/records 鏂囦欢瑙ｆ瀽璁板綍
 */
import type { FastifyPluginAsync } from 'fastify';
import { FileProcessor, guessFileType } from '../services/file-processor.js';
import { askAIForTemplateGeneration, analyzeHeaders, inferDelimiter } from '../services/template-ai.js';
import { detectSource, getSupportedSources, type SourceKind } from '../../utils/source-detector.js';
import { decodeTextBuffer, parseFileContent, parseExcelBuffer, isExcelFile } from '../../utils/file-parser.js';

interface ApiResponse<T = unknown> {
  code: number;
  message: string;
  data: T;
  pagination?: { page: number; pageSize: number; total: number };
}

function ok<T>(data: T, pagination?: ApiResponse<T>['pagination']): ApiResponse<T> {
  return { code: 0, message: 'success', data, pagination };
}

function err(code: number, message: string) {
  return { code, message, data: null as unknown };
}

function normalizeTemplateFieldConfig(config: any): Array<{
  header: string;
  field: string;
  type?: string;
}> {
  if (Array.isArray(config?.fields)) {
    return config.fields
      .filter((item: any) => item?.header && item?.field)
      .map((item: any) => ({
        header: String(item.header),
        field: String(item.field),
        type: item.type ? String(item.type) : undefined,
      }));
  }

  const fieldMapping =
    config?.fieldMapping && typeof config.fieldMapping === 'object' ? config.fieldMapping : {};

  return Object.entries(fieldMapping).map(([header, field]) => ({
    header: String(header),
    field: String(field),
  }));
}

function parseAmountByType(value: unknown, type?: string, amountUnit?: string): number {
  if (value === null || value === undefined || value === '') {
    return 0;
  }

  const raw = String(value).replace(/[%￥¥,\s，]/g, '').trim();
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return 0;
  }

  if (type === 'amount') {
    if (amountUnit === 'fen') {
      return Math.round(parsed);
    }
    return Math.round(parsed * 100);
  }

  return parsed;
}

function parseDateValue(value: unknown): string | undefined {
  if (value === null || value === undefined || value === '') {
    return undefined;
  }

  const text = String(value).trim();
  const match = text.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})/);
  if (match) {
    const [, year, month, day] = match;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  const numeric = Number(text);
  if (Number.isFinite(numeric) && numeric > 25569) {
    const epoch = new Date(Math.round((numeric - 25569) * 86400 * 1000));
    return epoch.toISOString().slice(0, 10);
  }

  return text || undefined;
}

function mapRowsWithTemplate(
  headers: string[],
  rows: string[][],
  fieldConfig: any,
): any[] {
  const mappings = normalizeTemplateFieldConfig(fieldConfig);
  const amountUnit = fieldConfig?.amountUnit === 'fen' ? 'fen' : 'yuan';

  return rows
    .map((row) => {
      const record: Record<string, unknown> = {};

      mappings.forEach((mapping) => {
        const columnIndex = headers.findIndex((header) => String(header).trim() === mapping.header);
        if (columnIndex < 0) {
          return;
        }

        const rawValue = row[columnIndex];
        if (mapping.type === 'amount') {
          record[mapping.field] = parseAmountByType(rawValue, mapping.type, amountUnit);
          return;
        }

        if (mapping.type === 'date') {
          record[mapping.field] = parseDateValue(rawValue);
          return;
        }

        record[mapping.field] = rawValue === undefined || rawValue === null ? undefined : String(rawValue).trim();
      });

      return {
        order_no: String(record.order_no || '').trim(),
        order_type: String(record.order_type || '').trim(),
        pay_method: String(record.pay_method || '').trim(),
        channel_name: String(record.channel_name || '').trim(),
        customer_phone: record.customer_phone ? String(record.customer_phone).trim() : undefined,
        customer_name: record.customer_name ? String(record.customer_name).trim() : undefined,
        order_amount: Number(record.order_amount || 0),
        received_amount: Number(record.received_amount || 0),
        paid_amount: Number(record.paid_amount || 0),
        channel_fee: Number(record.channel_fee || 0),
        order_status: String(record.order_status || '').trim(),
        pay_serial_no: record.pay_serial_no ? String(record.pay_serial_no).trim() : undefined,
        orig_serial_no: record.orig_serial_no ? String(record.orig_serial_no).trim() : undefined,
        trans_date: record.trans_date ? String(record.trans_date).trim() : undefined,
      };
    })
    .filter((record) => record.order_no && record.order_amount !== undefined);
}

/** 浠庤姹備腑鎻愬彇 merchantId锛堟敮鎸?header銆乵ultipart field銆丣SON body锛?*/
function extractMerchantId(request: any): string | undefined {
  // 1. Header x-merchant-id
  const headerMerchantId = request.headers['x-merchant-id'] as string;
  if (headerMerchantId) return headerMerchantId;

  // 2. JSON body
  const body = request.body;
  if (body && typeof body === 'object') {
    if (body.merchantId) return String(body.merchantId);
    if (body.merchant_id) return String(body.merchant_id);
  }

  return undefined;
}

/** 浠?multipart 琛ㄥ崟鎻愬彇 merchantId */
async function extractMerchantIdFromMultipart(request: any): Promise<string | undefined> {
  const parts = request.parts();
  for await (const part of parts) {
    if (part.type === 'field' && (part.fieldname === 'merchantId' || part.fieldname === 'merchant_id')) {
      return String(part.value);
    }
  }
  return undefined;
}

export function createFileRoutes(processor: FileProcessor): FastifyPluginAsync {
  return async (fastify) => {
    fastify.post('/files/upload', async (request, reply) => {
      let content = '';
      let filename = 'uploaded.txt';
      let buffer: Buffer | undefined;
      let forcedFileType: string | undefined;
      let amountUnit: 'fen' | 'yuan' | undefined;
      let merchantId: string | undefined;

      if (request.isMultipart()) {
        const parts = request.parts();
        for await (const part of parts) {
          if (part.type === 'file') {
            filename = part.filename || 'uploaded.txt';
            buffer = await part.toBuffer();

            const ext = filename.toLowerCase().split('.').pop();
            if (ext === 'xlsx' || ext === 'xls') {
              content = '';
            } else {
              content = decodeTextBuffer(buffer);
            }
          } else if (part.type === 'field') {
            if (part.fieldname === 'file_type' || part.fieldname === 'fileType') {
              forcedFileType = String(part.value);
            } else if (part.fieldname === 'amount_unit' || part.fieldname === 'amountUnit') {
              const normalized = String(part.value).trim().toLowerCase();
              if (normalized === 'fen' || normalized === 'yuan') {
                amountUnit = normalized;
              }
            } else if (part.fieldname === 'merchantId' || part.fieldname === 'merchant_id') {
              merchantId = String(part.value);
            }
          }
        }
      } else {
        const body = request.body as Record<string, unknown>;
        if (typeof body.content === 'string') {
          content = body.content;
        }
        if (typeof body.filename === 'string') {
          filename = body.filename;
        }
        if (typeof body.file_type === 'string') {
          forcedFileType = body.file_type;
        } else if (typeof body.fileType === 'string') {
          forcedFileType = body.fileType;
        }
        if (typeof body.amount_unit === 'string') {
          const normalized = body.amount_unit.trim().toLowerCase();
          if (normalized === 'fen' || normalized === 'yuan') {
            amountUnit = normalized;
          }
        } else if (typeof body.amountUnit === 'string') {
          const normalized = body.amountUnit.trim().toLowerCase();
          if (normalized === 'fen' || normalized === 'yuan') {
            amountUnit = normalized;
          }
        }
        if (!merchantId) {
          merchantId = extractMerchantId(request);
        }
      }

      // 涔熷皾璇曚粠 header 鑾峰彇
      if (!merchantId) {
        merchantId = (request.headers['x-merchant-id'] as string) || undefined;
      }

      if (!content && !buffer) {
        return reply.status(400).send(err(1, 'No content provided'));
      }

      const result = await processor.processBuffer(
        content,
        filename,
        'upload',
        forcedFileType,
        buffer,
        merchantId,
        { amountUnit },
      );

      if (!result.success) {
        return reply.status(400).send(err(2, result.error || 'Process failed'));
      }

      return ok({
        file_id: result.fileId,
        records: result.records,
        type: result.type,
        channel_amount_unit: result.channel_amount_unit,
      });
    });
    fastify.post('/files/import-with-template', async (request, reply) => {
      const body = request.body as Record<string, unknown>;
      const templateId = String(body.template_id || '').trim();
      const filename = String(body.filename || 'business-order.txt');
      const contentBase64 = typeof body.content_base64 === 'string' ? body.content_base64 : '';
      const merchantId = extractMerchantId(request);

      if (!templateId || !contentBase64) {
        return reply.status(400).send(err(1, 'template_id and content_base64 are required'));
      }

      let buffer: Buffer;
      try {
        buffer = Buffer.from(contentBase64, 'base64');
      } catch {
        return reply.status(400).send(err(1, 'invalid content_base64'));
      }

      if (!buffer || buffer.length === 0) {
        return reply.status(400).send(err(1, 'empty file content'));
      }

      const prisma = processor.getPrisma();
      if (!prisma) {
        return reply.status(500).send(err(1, 'template import is not configured'));
      }

      const template = await prisma.billTemplate.findUnique({ where: { id: templateId } });
      if (!template) {
        return reply.status(404).send(err(1, 'template not found'));
      }

      const ext = filename.toLowerCase().split('.').pop();
      const content = ext === 'xlsx' || ext === 'xls' ? '' : decodeTextBuffer(buffer);

      let parsedData;
      try {
        parsedData =
          ext === 'xlsx' || ext === 'xls'
            ? parseExcelBuffer(buffer)
            : parseFileContent(content, filename);
      } catch (parseError) {
        return reply.status(400).send(err(1, `failed to parse file: ${(parseError as Error).message}`));
      }

      const fieldConfig = JSON.parse(template.field_config || '{}');
      const records = mapRowsWithTemplate(parsedData.headers || [], parsedData.rows || [], fieldConfig);
      const result = await processor.saveImportedBusinessOrders(
        filename,
        records,
        'upload',
        parsedData.headers || [],
        merchantId,
      );

      if (!result.success) {
        return reply.status(400).send(err(2, result.error || 'Process failed'));
      }

      return ok({
        file_id: result.fileId,
        template_id: templateId,
        records: result.records,
        warnings: [],
      });
    });

    fastify.post('/files/ingest', async (request, reply) => {
      const body = request.body as Record<string, unknown>;

      if (!body.content && !body.file && !body.data) {
        return reply.status(400).send(err(1, 'No content provided'));
      }

      const content =
        typeof body.content === 'string'
          ? String(body.content)
          : Buffer.isBuffer(body.content)
            ? decodeTextBuffer(body.content)
            : Buffer.isBuffer(body.file)
              ? decodeTextBuffer(body.file)
              : Buffer.isBuffer(body.data)
                ? decodeTextBuffer(body.data)
                : typeof body.file === 'string'
                  ? String(body.file)
                  : '';

      const filename = String(body.filename || body.name || body.file_name || 'ingest.dat');
      const source = String(body.source || 'api');
      const merchantId = extractMerchantId(request);

      if (source !== 'sftp' && source !== 'upload' && source !== 'api') {
        return reply.status(400).send(err(3, 'Invalid source'));
      }

      const result = await processor.processBuffer(content, filename, source as 'sftp' | 'upload' | 'api', undefined, undefined, merchantId);

      if (!result.success) {
        return reply.status(400).send(err(2, result.error || 'Process failed'));
      }

      return ok({ file_id: result.fileId, records: result.records, type: result.type });
    });

    fastify.get('/files', async (request) => {
      const query = request.query as Record<string, unknown>;
      const page = Math.max(1, Number(query.page || 1));
      const pageSize = Math.min(100, Math.max(1, Number(query.pageSize || 20)));
      const fileType = query.fileType as string | undefined;

      const result = processor.listFiles({ page, pageSize, fileType });

      return ok(result.items as unknown[], { page, pageSize, total: result.total });
    });

    fastify.get('/files/:id', async (request, reply) => {
      const { id } = request.params as { id: string };
      const file = processor.getFile(id);

      if (!file) {
        return reply.status(404).send(err(4, 'File not found'));
      }

      return ok(file);
    });

    fastify.get('/files/:id/records', async (request, reply) => {
      const { id } = request.params as { id: string };
      const query = request.query as Record<string, unknown>;
      const page = Math.max(1, Number(query.page || 1));
      const pageSize = Math.min(100, Math.max(1, Number(query.pageSize || 20)));

      const result = processor.getFileRecords(id, { page, pageSize });

      if (result === null) {
        return reply.status(404).send(err(4, 'File not found'));
      }

      return ok(result.records as unknown[], { page, pageSize, total: result.total });
    });

    fastify.get('/files/guess', async (request) => {
      const { filename } = request.query as { filename?: string };
      if (!filename) {
        return err(1, 'filename required');
      }
      const type = guessFileType(filename);
      return ok({ filename, guess: type });
    });

    /**
     * POST /files/analyze 鈥?AI 鍒嗘瀽鏂囦欢琛ㄥご锛岀敓鎴愭ā鏉垮缓璁紙涓嶈惤搴擄級
     *
     * body: { filename, content, type_hint?, sample_rows? }
     */
    fastify.post('/files/analyze', async (request) => {
      const body = request.body as Record<string, unknown>;
      const filename = String(body.filename || 'uploaded.txt');
      const content = typeof body.content === 'string' ? body.content : '';
      const typeHint = body.type_hint as string | undefined;
      const sampleRows = (body.sample_rows as string[][]) || [];

      if (!content.trim()) {
        return err(1, 'content is required and cannot be empty');
      }

      const lines = content.split(/[\r\n]+/).filter(l => l.trim());
      if (lines.length === 0) {
        return err(1, 'file content is empty');
      }

      const headerLine = lines[0];
      const delimiter = inferDelimiter(headerLine);

      // 瑙ｆ瀽琛ㄥご锛堝幓鎺?BOM 鍜屽紩鍙凤級
      const headers = headerLine.split(delimiter).map(h => h.trim().replace(/^[\uFEFF"']|[\uFEFF"']$/g, ''));

      // 鎻愬彇鏍蜂緥琛岋紙鏈€澶?琛岋級
      const rows = lines.slice(1, 4).map(line =>
        line.split(delimiter).map(v => v.trim().replace(/^[\uFEFF"']|[\uFEFF"']$/g, ''))
      );
      const effectiveSampleRows = sampleRows.length > 0 ? sampleRows : rows;

      // 璋冪敤 AI 鐢熸垚妯℃澘寤鸿锛堟湰鍦板垎鏋?+ DeepSeek API 鍙屾ā寮忥級
      const generated = await askAIForTemplateGeneration(headers, effectiveSampleRows, {
        fileTypeHint: typeHint,
      });

      const guessedType = guessFileType(filename);

      // 来源检测
      const sourceDetection = detectSource(filename, headers);

      return ok({
        filename,
        guessed_type: guessedType,
        detected_type: generated.type,
        detected_source: sourceDetection.source_kind,
        source_label: sourceDetection.source_label,
        source_confidence: sourceDetection.confidence,
        supported_sources: getSupportedSources(),
        headers,
        delimiter,
        suggested_template: {
          name: generated.name,
          type: generated.type,
          field_config: generated.fieldConfig,
          delimiter: generated.delimiter,
          header_row: generated.headerRow,
          data_start_row: generated.dataStartRow,
        },
        confidence: generated.confidence,
        unknown_fields: generated.fieldConfig.fields
          .filter(f => !f.field || f.field === 'unknown')
          .map(f => f.header),
        reasoning: generated.reasoning || null,
        rows_preview: effectiveSampleRows.slice(0, 3),
      });
    });

    /**
     * POST /files/analyze-binary — Binary file analysis (supports Excel)
     * multipart: file + filename
     */
    fastify.post('/files/analyze-binary', async (request, reply) => {
      if (!request.isMultipart()) {
        return reply.status(400).send(err(1, 'multipart required'));
      }

      let filename = 'uploaded.txt';
      let buffer: Buffer | undefined;

      const parts = request.parts();
      for await (const part of parts) {
        if (part.type === 'file') {
          filename = part.filename || filename;
          buffer = await part.toBuffer();
        }
      }

      if (!buffer) {
        return reply.status(400).send(err(2, 'No file uploaded'));
      }

      let headers: string[] = [];
      let content = '';

      try {
        if (isExcelFile(filename)) {
          const parsed = parseExcelBuffer(buffer);
          headers = parsed.headers;
        } else {
          content = decodeTextBuffer(buffer);
          const parsed = parseFileContent(content, filename);
          headers = parsed.headers;
        }
      } catch (parseError) {
        return reply.status(400).send(err(3, 'Failed to parse file'));
      }

      const guessedType = guessFileType(filename);
      const sourceDetection = detectSource(filename, headers);

      return ok({
        filename,
        guessed_type: guessedType,
        detected_source: sourceDetection.source_kind,
        source_label: sourceDetection.source_label,
        source_confidence: sourceDetection.confidence,
        supported_sources: getSupportedSources(),
        headers,
        row_count: headers.length > 0 ? 1 : 0,
      });
    });
  };
}
