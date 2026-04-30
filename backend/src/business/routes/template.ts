/**
 * 璐﹀崟妯℃澘 API
 * GET  /templates           鈥?妯℃澘鍒楄〃
 * POST /templates           鈥?鍒涘缓妯℃澘
 * PUT  /templates/:id      鈥?鏇存柊妯℃澘
 * DELETE /templates/:id    鈥?鍒犻櫎妯℃澘
 * POST /templates/match     鈥?鏅鸿兘鍖归厤妯℃澘锛堟棤鍖归厤鏃惰嚜鍔?AI 鐢熸垚锛? * POST /templates/ai-generate 鈥?绾?AI 鐢熸垚妯℃澘锛堜笉淇濆瓨锛? */
import type { FastifyPluginAsync } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { createHash } from 'node:crypto';
import { isExcelFile, parseExcelBuffer, parseFileContent } from '../../utils/file-parser.js';
import {
  askAIForTemplateGeneration,
  analyzeHeaders,
  generateTemplateFromAnalysis,
} from '../services/template-ai.js';

interface ApiResponse<T = unknown> {
  code: number;
  message: string;
  data: T;
}

function ok<T>(data: T): ApiResponse<T> {
  return { code: 0, message: 'success', data };
}

function err(code: number, message: string) {
  return { code, message, data: null as unknown };
}

interface FieldConfig {
  fields: Array<{
    header: string;
    field: string;
    required?: boolean;
    type?: 'string' | 'amount' | 'date' | 'number';
    confidence?: number;
  }>;
  dateFormat?: string;
  amountUnit?: 'yuan' | 'fen';
}

let prisma: PrismaClient;

function normalizeTemplateHeaders(template: any): string[] {
  try {
    const config = JSON.parse(template.field_config || '{}') as any;
    if (Array.isArray(config?.fields)) {
      return config.fields.map((f: any) => String(f?.header || '').toLowerCase()).filter(Boolean);
    }
    const fieldMapping = config?.fieldMapping;
    if (fieldMapping && typeof fieldMapping === 'object') {
      return Object.keys(fieldMapping).map((k) => k.toLowerCase());
    }
  } catch {
    return [];
  }
  return [];
}

function buildCompatFieldConfig(mapping: any, headers: string[] = []): any {
  if (mapping && Array.isArray(mapping.fields)) {
    return mapping;
  }

  const fieldMapping =
    mapping?.fieldMapping && typeof mapping.fieldMapping === 'object' ? mapping.fieldMapping : {};
  const transforms =
    mapping?.transforms && typeof mapping.transforms === 'object' ? mapping.transforms : {};

  const fields = headers.map((header) => {
    const field = fieldMapping[header] || '';
    const transform = field ? transforms[field] || 'identity' : 'identity';
    const type = String(transform).includes('date')
      ? 'date'
      : String(transform).includes('fen') || String(transform).includes('yuan')
        ? 'amount'
        : 'string';
    return {
      header,
      field,
      required: field === 'order_no' || field === 'order_amount',
      type,
      confidence: Number(mapping?.confidence || 0),
    };
  });

  return {
    fields,
    amountUnit: Object.values(transforms).some((v: any) => String(v) === 'fen_identity')
      ? 'fen'
      : 'yuan',
  };
}

function buildCompatAiMapping(generated: any, headers: string[]) {
  const fieldMapping: Record<string, string> = {};
  const transforms: Record<string, string> = {};

  for (const field of generated?.fieldConfig?.fields || []) {
    if (!field?.header || !field?.field) continue;
    fieldMapping[String(field.header)] = String(field.field);
    if (field.type === 'amount') {
      transforms[String(field.field)] =
        generated?.fieldConfig?.amountUnit === 'fen' ? 'fen_identity' : 'yuan_to_fen';
    } else if (field.type === 'date') {
      transforms[String(field.field)] = 'datetime_to_date';
    } else {
      transforms[String(field.field)] = 'identity';
    }
  }

  const mappedValues = new Set(Object.values(fieldMapping));
  const requiredMissing = ['order_no', 'order_amount'].filter((k) => !mappedValues.has(k));
  const unmappedColumns = headers.filter((h) => !fieldMapping[h]);

  return {
    fieldMapping,
    transforms,
    requiredMissing,
    unmappedColumns,
    confidence: Number(generated?.confidence || 0),
    headerRow: Number(generated?.headerRow || 1),
    dataStartRow: Number(generated?.dataStartRow || 2),
    delimiter: generated?.delimiter || null,
    reasoning: generated?.reasoning
      ? String(generated.reasoning).split(/\n+/).filter(Boolean)
      : [],
  };
}

function normalizeHeader(value: unknown): string {
  return String(value || '')
    .trim()
    .replace(/^\uFEFF/, '')
    .replace(/\s+/g, '')
    .toLowerCase();
}

function templateHasRequiredBusinessOrderFields(template: any, headers: string[]): boolean {
  try {
    const config = JSON.parse(template.field_config || '{}') as any;
    const fields = Array.isArray(config?.fields) ? config.fields : [];
    const normalizedHeaders = new Set(headers.map((header) => normalizeHeader(header)));

    const hasOrderNo = fields.some(
      (field: any) =>
        String(field?.field || '') === 'order_no' &&
        normalizedHeaders.has(normalizeHeader(field?.header)),
    );
    const hasOrderAmount = fields.some(
      (field: any) =>
        String(field?.field || '') === 'order_amount' &&
        normalizedHeaders.has(normalizeHeader(field?.header)),
    );

    return hasOrderNo && hasOrderAmount;
  } catch {
    return false;
  }
}

export const createTemplateRoutes = (prismaClient: PrismaClient): FastifyPluginAsync => {
  prisma = prismaClient;
  return templateRoutes;
};

export const templateRoutes: FastifyPluginAsync = async (fastify) => {
  /** 妯℃澘鍒楄〃 */
  fastify.get('/templates', async (request) => {
    const query = request.query as Record<string, unknown>;
    const type = query.type as string | undefined;

    const where: any = {};
    if (type) where.type = type;

    const items = await prisma.billTemplate.findMany({
      where,
      orderBy: [{ is_default: 'desc' }, { created_at: 'desc' }],
    });

    return ok(items.map((item: any) => ({
      ...item,
      field_config: JSON.parse(item.field_config),
    })));
  });

  /** 鍒涘缓妯℃澘 */
  fastify.post('/ai/template/analyze', async (request, reply) => {
    let filename = 'uploaded.txt';
    let content = '';
    let buffer: Buffer | undefined;
    let fileType = 'BUSINESS_ORDER';

    if (request.isMultipart()) {
      const parts = request.parts();
      for await (const part of parts) {
        if (part.type === 'file') {
          filename = part.filename || filename;
          buffer = await part.toBuffer();
          content = buffer.toString('utf-8');
        } else if (
          part.type === 'field' &&
          part.fieldname === 'file_type' &&
          typeof part.value === 'string'
        ) {
          fileType = part.value || fileType;
        }
      }
    } else {
      const body = ((request.body as Record<string, unknown> | undefined) || {});
      filename = String(body.filename || filename);
      if (typeof body.file_type === 'string') fileType = body.file_type;
      if (typeof body.content === 'string') content = body.content;
    }

    if (!buffer && !content.trim()) {
      return reply.status(400).send(err(1, 'file is required'));
    }

    let parsed: { headers: string[]; rows: string[][] } = { headers: [], rows: [] };
    try {
      if (buffer && isExcelFile(filename)) {
        parsed = parseExcelBuffer(buffer);
      } else {
        parsed = parseFileContent(content, filename);
      }
    } catch (error) {
      return reply.status(400).send(err(1, `failed to parse file: ${(error as Error).message}`));
    }

    const headers = (parsed.headers || []).map((h) => String(h || '').trim()).filter(Boolean);
    const sampleRows = (parsed.rows || [])
      .slice(0, 3)
      .map((row) => row.map((c) => String(c || '')));

    if (headers.length === 0) {
      return reply.status(400).send(err(1, 'no headers detected'));
    }

    const templates = await prisma.billTemplate.findMany({ where: { type: fileType } });
    let bestMatch: any = null;
    let bestScore = 0;

    for (const template of templates) {
      const templateHeaders = normalizeTemplateHeaders(template);
      if (templateHeaders.length === 0) continue;
      let matchCount = 0;
      for (const header of headers) {
        if (templateHeaders.includes(header.toLowerCase())) matchCount++;
      }
      const score = matchCount / templateHeaders.length;
      if (score > bestScore) {
        bestScore = score;
        bestMatch = template;
      }
    }

    const generated = await askAIForTemplateGeneration(headers, sampleRows, {
      fileTypeHint: fileType,
    });
    const aiMapping = buildCompatAiMapping(generated, headers);

    const ext = filename.toLowerCase().split('.').pop() || 'txt';
    const profile = {
      format: ext === 'xlsx' || ext === 'xls' || ext === 'csv' ? ext : 'txt',
      delimiter: ext === 'xlsx' || ext === 'xls' ? null : generated.delimiter || '|',
      header_row: Number(generated.headerRow || 1),
      data_start_row: Number(generated.dataStartRow || 2),
      headers,
      sample_rows: sampleRows,
      fingerprint: createHash('sha1')
        .update(`${filename}|${headers.join('|')}`)
        .digest('hex'),
      column_count: headers.length,
    };

    const matchedTemplate =
      bestMatch &&
      bestScore >= 0.5 &&
      templateHasRequiredBusinessOrderFields(bestMatch, headers)
        ? {
            ...bestMatch,
            field_config: JSON.parse(bestMatch.field_config || '{}'),
            match_rules: JSON.parse(bestMatch.match_rules || '{}'),
            match_score: bestScore,
          }
        : null;

    return ok({
      matched_template: matchedTemplate,
      profile,
      ai_mapping: aiMapping,
    });
  });

  fastify.post('/templates', async (request, reply) => {
    const body = request.body as Record<string, unknown>;
    const name = body.name as string;
    const type = body.type as string;
    const fieldConfig = body.field_config as FieldConfig;
    const delimiter = body.delimiter as string || '|';
    const headerRow = body.header_row as number || 1;
    const dataStartRow = body.data_start_row as number || 2;
    const isDefault = body.is_default as boolean || false;

    if (!name || !type || !fieldConfig) {
      return reply.status(400).send(err(1, 'name, type, and field_config are required'));
    }

    const template = await prisma.billTemplate.create({
      data: {
        name,
        type,
        field_config: JSON.stringify(fieldConfig),
        delimiter,
        header_row: headerRow,
        data_start_row: dataStartRow,
        is_default: isDefault,
      },
    });

    return ok({ ...template, field_config: fieldConfig });
  });

  /** 鏇存柊妯℃澘 */
  fastify.post('/templates/business-order', async (request, reply) => {
    const body = request.body as Record<string, any>;
    const name = String(body.name || '').trim();
    const profile = body.profile && typeof body.profile === 'object' ? body.profile : {};
    const mapping = body.field_config;

    if (!name || !mapping) {
      return reply.status(400).send(err(1, 'name and field_config are required'));
    }

    const headers = Array.isArray(profile.headers) ? profile.headers.map((h: any) => String(h)) : [];
    const normalizedFieldConfig = buildCompatFieldConfig(mapping, headers);
    const matchRules =
      body.match_rules && typeof body.match_rules === 'object'
        ? body.match_rules
        : {
            format: profile.format || null,
            delimiter: profile.delimiter || null,
            columnCount: Number(profile.column_count || headers.length || 0),
            fingerprint: profile.fingerprint || null,
            sourceHint: body.source_hint || null,
          };

    const template = await prisma.billTemplate.create({
      data: {
        name,
        type: 'BUSINESS_ORDER',
        field_config: JSON.stringify(normalizedFieldConfig),
        match_rules: JSON.stringify(matchRules || {}),
        delimiter: String(profile.delimiter || '|'),
        header_row: Number(profile.header_row || profile.headerRow || 1),
        data_start_row: Number(profile.data_start_row || profile.dataStartRow || 2),
        sample_fingerprint: profile.fingerprint || null,
        confidence: body.confidence !== undefined ? Number(body.confidence) : null,
        source_hint: body.source_hint ? String(body.source_hint) : null,
        created_by: body.created_by ? String(body.created_by) : null,
        is_default: Boolean(body.is_default),
      },
    });

    return ok({
      ...template,
      field_config: mapping,
      match_rules: matchRules || {},
    });
  });

  fastify.put('/templates/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as Record<string, unknown>;

    const updateData: any = {};
    if (body.name) updateData.name = body.name;
    if (body.type) updateData.type = body.type;
    if (body.field_config) updateData.field_config = JSON.stringify(body.field_config);
    if (body.delimiter) updateData.delimiter = body.delimiter;
    if (body.header_row !== undefined) updateData.header_row = body.header_row;
    if (body.data_start_row !== undefined) updateData.data_start_row = body.data_start_row;
    if (body.is_default !== undefined) updateData.is_default = body.is_default;

    const template = await prisma.billTemplate.update({
      where: { id },
      data: updateData,
    });

    return ok({ ...template, field_config: JSON.parse(template.field_config) });
  });

  /** 鍒犻櫎妯℃澘 */
  fastify.delete('/templates/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    await prisma.billTemplate.delete({
      where: { id },
    });

    return ok({ success: true });
  });

  /**
   * 鏅鸿兘鍖归厤妯℃澘
   * 娴佺▼锛?   * 1. 鍦ㄥ凡鏈夋ā鏉夸腑鏌ユ壘鏈€浣冲尮閰嶏紙缃俊搴?>= 0.5锛?   * 2. 鑻ユ棤鍖归厤 鈫?鑷姩璋冪敤 AI 鐢熸垚鏂版ā鏉垮苟淇濆瓨 鈫?杩斿洖鐢熸垚鐨勬ā鏉?   */
  fastify.post('/templates/match', async (request) => {
    const body = request.body as Record<string, unknown>;
    const headers = body.headers as string[];
    const type = body.type as string | undefined;
    const autoGenerate = body.auto_generate !== false; // 榛樿鍙敓鎴?
    if (!headers || !Array.isArray(headers)) {
      return err(1, 'headers array is required');
    }

    // Step 1: search existing templates
    const templates = await prisma.billTemplate.findMany({
      where: type ? { type } : {},
    });

    let bestMatch: any = null;
    let bestScore = 0;

    for (const template of templates) {
      const config = JSON.parse(template.field_config) as FieldConfig;
      const templateHeaders = config.fields
        .map(f => f.header?.toLowerCase())
        .filter(Boolean);

      // score by header overlap ratio
      let matchCount = 0;
      for (const header of headers) {
        if (templateHeaders.includes(header.toLowerCase())) {
          matchCount++;
        }
      }
      const score = templateHeaders.length > 0 ? matchCount / templateHeaders.length : 0;

      if (score > bestScore) {
        bestScore = score;
        bestMatch = template;
      }
    }

    if (bestMatch && bestScore >= 0.5) {
      return ok({
        matched: true,
        auto_generated: false,
        template: {
          ...bestMatch,
          field_config: JSON.parse(bestMatch.field_config),
        },
        confidence: bestScore,
      });
    }

    // Step 2: fallback behavior when no match
    if (!autoGenerate) {
      return ok({
        matched: false,
        auto_generated: false,
        confidence: bestScore,
        message: 'No matching template found',
      });
    }

    // AI 鐢熸垚妯℃澘锛堟湰鍦板垎鏋?+ DeepSeek API 鍙屾ā寮忥級
    const generated = await askAIForTemplateGeneration(headers, [], { fileTypeHint: type });

    // 淇濆瓨鍒版暟鎹簱
    const savedTemplate = await prisma.billTemplate.create({
      data: {
        name: generated.name,
        type: generated.type,
        field_config: JSON.stringify(generated.fieldConfig),
        delimiter: generated.delimiter,
        header_row: generated.headerRow,
        data_start_row: generated.dataStartRow,
        confidence: generated.confidence,
        is_default: false,
      },
    });

    return ok({
      matched: false,
      auto_generated: true,
      template: {
        ...savedTemplate,
        field_config: generated.fieldConfig,
      },
      confidence: generated.confidence,
      reasoning: generated.reasoning || null,
    });
  });

  /**
   * 绾?AI 鐢熸垚妯℃澘锛堜笉淇濆瓨锛?   * 鐢ㄤ簬棰勮锛氫笂浼犲墠鍏堢湅 AI 璇嗗埆缁撴灉锛屽啀鍐冲畾鏄惁淇濆瓨
   */
  fastify.post('/templates/ai-generate', async (request) => {
    const body = request.body as Record<string, unknown>;
    const headers = body.headers as string[];
    const sampleRows = (body.sample_rows as string[][]) || [];
    const type = body.type as string | undefined;

    if (!headers || !Array.isArray(headers)) {
      return err(1, 'headers array is required');
    }

    // local quick analysis
    const localResult = analyzeHeaders(headers, type);

    // 璋冪敤 AI 鐢熸垚锛圖eepSeek API锛屽け璐ユ椂闄嶇骇鍒版湰鍦帮級
    let aiResult: Awaited<ReturnType<typeof askAIForTemplateGeneration>> | null = null;
    try {
      aiResult = await askAIForTemplateGeneration(headers, sampleRows, { fileTypeHint: type });
    } catch (err) {
      console.warn('[template] AI generation failed, using local result:', err);
    }

    const result = aiResult || generateTemplateFromAnalysis(
      headers,
      localResult.mappings,
      localResult.detectedType,
      localResult.confidence
    );

    return ok({
      detected_type: result.type,
      confidence: result.confidence,
      field_config: result.fieldConfig,
      delimiter: result.delimiter,
      amount_unit: result.fieldConfig.amountUnit,
      reasoning: result.reasoning || null,
      unknown_fields: result.fieldConfig.fields
        .filter(f => !f.field || f.field === 'unknown')
        .map(f => f.header),
    });
  });
};


