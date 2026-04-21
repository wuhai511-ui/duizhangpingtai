/**
 * 文件管理 API
 * POST /files/upload multipart 上传
 * POST /files/ingest 第三方系统推送二进制
 * GET  /files 文件列表
 * GET  /files/:id 文件详情
 * GET  /files/:id/records 文件解析记录
 */
import type { FastifyPluginAsync } from 'fastify';
import { FileProcessor, guessFileType } from '../../services/file-processor.js';

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

/** 从请求中提取 merchantId（支持 header、multipart field、JSON body） */
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

/** 从 multipart 表单提取 merchantId */
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
              content = buffer.toString('utf-8');
            }
          } else if (part.type === 'field') {
            if (part.fieldname === 'file_type' || part.fieldname === 'fileType') {
              forcedFileType = String(part.value);
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
        if (!merchantId) {
          merchantId = extractMerchantId(request);
        }
      }

      // 也尝试从 header 获取
      if (!merchantId) {
        merchantId = (request.headers['x-merchant-id'] as string) || undefined;
      }

      if (!content && !buffer) {
        return reply.status(400).send(err(1, 'No content provided'));
      }

      const result = await processor.processBuffer(content, filename, 'upload', forcedFileType, buffer, merchantId);

      if (!result.success) {
        return reply.status(400).send(err(2, result.error || 'Process failed'));
      }

      return ok({ file_id: result.fileId, records: result.records, type: result.type });
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
            ? body.content.toString('utf-8')
            : Buffer.isBuffer(body.file)
              ? body.file.toString('utf-8')
              : Buffer.isBuffer(body.data)
                ? body.data.toString('utf-8')
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
  };
}
