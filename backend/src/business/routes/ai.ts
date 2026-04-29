/**
 * AI 对话入口
 * POST /ai/query — Sanitize + DeepSeek LLM SQL 生成 + 执行
 * POST /ai/recognize — AI识别文件类型
 * POST /ai/upload — AI上传对账文件
 */
import type { FastifyPluginAsync } from 'fastify';
import { sanitize, isInjection } from '../../utils/prompt-sanitizer.js';
import { ask, mockAsk } from '../../services/llm.js';
import { guessFileType } from '../../services/file-processor.js';
import { decodeTextBuffer } from '../../utils/file-parser.js';
import {
  getDefaultTemplateByBatchType,
  getReconTemplate,
  type BatchType,
  type ReconTemplate,
} from '../../config/reconciliation-templates.js';

interface ApiResponse<T = unknown> {
  code: number;
  message: string;
  data: T;
}

function ok<T>(data: T): ApiResponse<T> {
  return { code: 0, message: 'success', data };
}

function err(code: number, message: string): ApiResponse<null> {
  return { code, message, data: null };
}

function extractMerchantId(request: any, body?: Record<string, unknown>): string | undefined {
  const headerMerchantId = request?.headers?.['x-merchant-id'];
  if (typeof headerMerchantId === 'string' && headerMerchantId.trim()) {
    return headerMerchantId.trim();
  }
  const userMerchantId = request?.user?.merchantId || request?.user?.merchant_id;
  if (typeof userMerchantId === 'string' && userMerchantId.trim()) {
    return userMerchantId.trim();
  }
  if (body) {
    const bodyMerchantId = body.merchantId || body.merchant_id;
    if (typeof bodyMerchantId === 'string' && bodyMerchantId.trim()) {
      return bodyMerchantId.trim();
    }
  }
  return undefined;
}

const RECON_TEMPLATE_TYPE = 'RECON_TEMPLATE';

async function getCustomReconTemplate(prisma: any, templateId: string): Promise<ReconTemplate | null> {
  if (!prisma?.billTemplate?.findUnique) return null;
  const row = await prisma.billTemplate.findUnique({ where: { id: templateId } });
  if (!row || row.type !== RECON_TEMPLATE_TYPE) return null;
  try {
    const parsed = JSON.parse(row.field_config || '{}');
    return { ...parsed, id: row.id } as ReconTemplate;
  } catch {
    return null;
  }
}

async function getDefaultCustomReconTemplate(prisma: any, batchType: BatchType): Promise<ReconTemplate | null> {
  if (!prisma?.billTemplate?.findMany) return null;
  const rows = await prisma.billTemplate.findMany({
    where: { type: RECON_TEMPLATE_TYPE, is_default: true },
    orderBy: { updated_at: 'desc' },
  });
  for (const row of rows || []) {
    try {
      const parsed = JSON.parse(row.field_config || '{}');
      if (parsed?.batch_type === batchType) {
        return { ...parsed, id: row.id } as ReconTemplate;
      }
    } catch {
      continue;
    }
  }
  return null;
}

async function resolveReconTemplate(
  prisma: any,
  batchType: BatchType,
  templateId?: string,
): Promise<ReconTemplate | null> {
  if (templateId) {
    const custom = await getCustomReconTemplate(prisma, templateId);
    if (custom) return custom;
    return getReconTemplate(templateId);
  }
  const customDefault = await getDefaultCustomReconTemplate(prisma, batchType);
  if (customDefault) return customDefault;
  return getDefaultTemplateByBatchType(batchType);
}

function applyChannelPrimaryKeyOverride(
  template: ReconTemplate | null,
  batchType: BatchType,
  channelPrimaryKey?: string,
): ReconTemplate | null {
  const normalizedKey = String(channelPrimaryKey || '').trim();
  if (!template || batchType !== 'ORDER_VS_JY') {
    return template;
  }

  const nextPrimaryKeys = Array.isArray(template.primary_keys)
    ? [...template.primary_keys]
    : [];

  if (nextPrimaryKeys.length === 0) {
    nextPrimaryKeys.push({
      mode: 'exact',
      business_field: 'order_no',
      channel_field: normalizedKey || 'merchant_order_no',
      weight: 100,
    });
  } else {
    nextPrimaryKeys[0] = {
      ...nextPrimaryKeys[0],
      business_field:
        !nextPrimaryKeys[0].business_field || nextPrimaryKeys[0].business_field === 'orig_serial_no'
          ? 'order_no'
          : nextPrimaryKeys[0].business_field,
      channel_field: normalizedKey || nextPrimaryKeys[0].channel_field || 'merchant_order_no',
    };
  }

  return {
    ...template,
    primary_keys: nextPrimaryKeys,
  };
}

function normalizeStoredAmountTransform(template: ReconTemplate | null): ReconTemplate | null {
  if (!template?.amount_check) return template;
  // 文件导入后金额已统一存储为“分”，对账阶段强制按分比较，避免重复换算。
  return {
    ...template,
    amount_check: {
      ...template.amount_check,
      business_transform: 'fen_identity',
      channel_transform: 'fen_identity',
    },
  };
}

function extractPrimaryKeyConfig(template: ReconTemplate | null): {
  business_field: string;
  channel_field: string;
  mode: string;
} | null {
  if (!template || !Array.isArray(template.primary_keys) || template.primary_keys.length === 0) {
    return null;
  }
  const first = template.primary_keys[0];
  if (!first?.business_field || !first?.channel_field) return null;
  return {
    business_field: String(first.business_field),
    channel_field: String(first.channel_field),
    mode: String(first.mode || 'exact'),
  };
}

export const aiRoutes: FastifyPluginAsync = async (fastify) => {
  /** AI 自然语言查询 */
  fastify.post('/ai/query', async (request, reply) => {
    const body = request.body as Record<string, unknown>;
    const question = body.question as string;
    const merchantId = body.merchantId as string | undefined;

    // 参数校验
    if (!question || typeof question !== 'string') {
      return reply.status(400).send(err(1, 'question is required'));
    }

    // 第1步：Sanitize（移除模板注入 {$}、反引号、换行符等）
    const safeQuestion = sanitize(question);

    // 第2步：注入检测（检查 sanitize 后的内容是否含危险 SQL 关键词）
    // 注意：sanitize 已移除 {$} {{} ` 等模板注入字符
    if (isInjection(safeQuestion)) {
      return reply.status(400).send(err(1, 'Invalid input detected'));
    }

    // 判断是否使用真实 LLM（有 API Key）
    const useRealLLM = !!(process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY);

    try {
      const result = useRealLLM
        ? await ask(safeQuestion, merchantId ? { merchantId } : undefined)
        : await mockAsk(safeQuestion, merchantId ? { merchantId } : undefined);

      return ok({
        answer: result.answer,
        sql: result.sql,
        records: result.records ?? [],
        confidence: result.confidence,
        llm: useRealLLM ? 'deepseek' : 'mock',
      });
    } catch (error) {
      const message = (error as Error).message;
      fastify.log.error({ error }, 'LLM ask failed');
      return reply.status(500).send(err(2, `LLM error: ${message}`));
    }
  });

  /** LLM 健康检查 */
  fastify.get('/ai/health', async () => {
    const hasKey = !!(process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY);
    return ok({
      llmAvailable: hasKey,
      llm: hasKey ? 'deepseek' : 'mock',
      model: 'deepseek-chat',
    });
  });

  /** AI 分账解析 - 解析自然语言分账指令 */
  fastify.post('/ai/parse-split', async (request, reply) => {
    const body = request.body as Record<string, unknown>;
    const text = body.text as string;
    const merchantId = body.merchantId as string | undefined;

    // 参数校验
    if (!text || typeof text !== 'string') {
      return reply.status(400).send(err(1, 'text is required'));
    }

    // Sanitize 输入
    const safeText = sanitize(text);

    // 判断是否使用真实 LLM
    const useRealLLM = !!(process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY);

    try {
      // 构建分账解析 prompt
      const prompt = `你是一个分账规则解析助手。请解析以下分账指令，提取分账规则：

用户指令：${safeText}

请返回 JSON 格式的分账规则：
{
  "rules": [
    {
      "account": "账户名称",
      "ratio": 比例(小数，如0.3表示30%),
      "amount": 固定金额(分，可选),
      "type": "ratio/fix"
    }
  ],
  "description": "规则描述"
}

只返回 JSON，不返回其他内容。`;

      let result;
      if (useRealLLM) {
        const apiKey = process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY;
        const response = await fetch('https://api.deepseek.com/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: 'deepseek-chat',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.1,
          }),
        });

        if (!response.ok) {
          throw new Error(`LLM API error: ${response.status}`);
        }

        const data = await response.json() as { choices: Array<{ message: { content: string } }> };
        const content = data.choices[0]?.message?.content || '';
        
        // 尝试解析 JSON
        try {
          result = JSON.parse(content);
        } catch {
          // 如果不是有效 JSON，返回默认结构
          result = {
            rules: [],
            description: content,
          };
        }
      } else {
        // Mock 响应
        result = parseSplitMock(safeText);
      }

      return ok({
        success: true,
        rules: result.rules || [],
        description: result.description || '',
        llm: useRealLLM ? 'deepseek' : 'mock',
      });
    } catch (error) {
      const message = (error as Error).message;
      fastify.log.error({ error }, 'AI parse-split failed');
      return reply.status(500).send(err(2, `AI error: ${message}`));
    }
  });
};

/** Mock 分账解析（无 API Key 时使用） */
function parseSplitMock(text: string): { rules: Array<{ account: string; ratio: number; type: string }>; description: string } {
  const t = text.toLowerCase();

  // 简单规则匹配
  if (t.includes('平分') || t.includes('50%') || t.includes('一半')) {
    return {
      rules: [
        { account: '账户A', ratio: 0.5, type: 'ratio' },
        { account: '账户B', ratio: 0.5, type: 'ratio' },
      ],
      description: '按 50%:50% 比例平分',
    };
  }

  if (t.includes('3:7') || t.includes('三七')) {
    return {
      rules: [
        { account: '账户A', ratio: 0.3, type: 'ratio' },
        { account: '账户B', ratio: 0.7, type: 'ratio' },
      ],
      description: '按 30%:70% 比例分账',
    };
  }

  if (t.includes('手续费') || t.includes('扣费')) {
    return {
      rules: [
        { account: '手续费账户', ratio: 0.006, type: 'ratio' },
        { account: '主账户', ratio: 0.994, type: 'ratio' },
      ],
      description: '扣除 0.6% 手续费后入主账户',
    };
  }

  // 默认返回
  return {
    rules: [],
    description: '抱歉，无法解析分账指令。请尝试描述如"按50%:50%平分"或"扣除手续费后入主账户"',
  };
}

/** 文件类型映射 */
const FILE_TYPE_NAMES: Record<string, string> = {
  JY: '交易明细',
  JS: '结算明细',
  SEP: '代付明细',
  JZ: '钱包结算',
  ACC: '账户结算',
  DW: '提现明细',
  D0: 'D0提现',
  JY_FQ: '分期交易',
  INVOICE: '电子发票',
  BUSINESS_ORDER: '业务订单',
};

/** 电子发票关键词 */
const INVOICE_KEYWORDS = ['发票', 'invoice', '增值税', 'tax', '金额', '税率', '价税合计'];

/** 数据类型识别关键词 */
const CHANNEL_KEYWORDS = ['lakala', '拉卡拉', 'channel', '渠道', '支付', '银行'];
const BUSINESS_KEYWORDS = ['merchant', '商户', 'order', '订单', '内部', '业务'];

/**
 * AI识别文件类型
 * 分析文件内容和文件名，自动判断：
 * 1. 数据类型：业务系统数据 / 支付渠道对账数据
 * 2. 文件类型：JY/JS/SEP等
 * 3. 记录数
 */
export const createAiFileRoutes = (processor: { processBuffer: (content: string, filename: string, source: 'sftp' | 'upload' | 'api', forcedFileType?: string, buffer?: Buffer, merchantId?: string) => Promise<{ success: boolean; records: number; type?: string; error?: string; fileId?: string }> }): FastifyPluginAsync => {
  return async (fastify) => {
    /** AI识别文件类型 */
    fastify.post('/ai/recognize', async (request, reply) => {
      let content = '';
      let filename = 'unknown.dat';

      // 处理 multipart/form-data 文件上传
      const file = await request.file();
      if (file) {
        filename = file.filename || 'uploaded.txt';
        const buffer = await file.toBuffer();
        content = decodeTextBuffer(buffer);
      } else {
        // 兼容 JSON body 方式
        const body = request.body as Record<string, unknown>;
        if (typeof body.content === 'string') {
          content = body.content;
          filename = String(body.filename || body.file_name || body.name || 'uploaded.txt');
        }
      }

      if (!content || content.trim().length === 0) {
        return reply.status(400).send(err(1, 'No file content provided'));
      }

      // 1. 根据文件名猜测类型
      const guessedType = guessFileType(filename);

      // 2. 分析文件内容特征
      const contentLower = content.toLowerCase();
      const lines = content.split('\n').filter(line => line.trim().length > 0);
      const recordCount = lines.length > 1 ? lines.length - 1 : lines.length; // 减去可能的表头

      // 3. 判断数据类型（业务系统 vs 支付渠道）
      let dataType: 'business' | 'channel' = 'channel'; // 默认为渠道数据
      let confidence = 0.7;

      // 检查渠道关键词
      const channelScore = CHANNEL_KEYWORDS.reduce((score, keyword) => {
        return score + (contentLower.includes(keyword) ? 1 : 0);
      }, 0);

      // 检查业务关键词
      const businessScore = BUSINESS_KEYWORDS.reduce((score, keyword) => {
        return score + (contentLower.includes(keyword) ? 1 : 0);
      }, 0);

      // 检查是否有拉卡拉流水号特征
      const hasLakalaSerial = /lakala|拉卡拉/i.test(content) || /\d{15,}/.test(content);

      if (channelScore > businessScore || hasLakalaSerial) {
        dataType = 'channel';
        confidence = Math.min(0.95, 0.7 + channelScore * 0.05);
      } else if (businessScore > channelScore) {
        dataType = 'business';
        confidence = Math.min(0.95, 0.7 + businessScore * 0.05);
      }

      // 4. 确定文件类型
      let fileType: 'JY' | 'JS' | 'SEP' | 'INVOICE' = 'JY';
      if (guessedType && ['JY', 'JS', 'SEP'].includes(guessedType)) {
        fileType = guessedType as 'JY' | 'JS' | 'SEP';
        confidence = Math.min(confidence + 0.1, 0.98);
      } else if (filename.toUpperCase().includes('INVOICE') || filename.includes('发票')) {
        fileType = 'INVOICE';
        confidence = Math.min(confidence + 0.15, 0.98);
      } else if (INVOICE_KEYWORDS.some(kw => contentLower.includes(kw))) {
        fileType = 'INVOICE';
        confidence = Math.min(confidence + 0.1, 0.95);
      } else if (contentLower.includes('settle') || contentLower.includes('结算')) {
        fileType = 'JS';
      } else if (contentLower.includes('sep') || contentLower.includes('代付')) {
        fileType = 'SEP';
      } else {
        fileType = 'JY';
      }

      // 5. 提取预览数据（前5条记录）
      const previewLines = lines.slice(0, 6);
      const preview = previewLines.map(line => {
        const fields = line.split('|');
        const record: Record<string, unknown> = {};
        fields.forEach((field, index) => {
          record[`field_${index}`] = field.trim();
        });
        return record;
      });

      return ok({
        data_type: dataType,
        file_type: fileType,
        records: recordCount,
        preview,
        confidence,
        file_type_name: FILE_TYPE_NAMES[fileType] || fileType,
      });
    });

    /** AI上传对账文件 */
    fastify.post('/ai/upload', async (request, reply) => {
      const body = (request.body as Record<string, unknown> | undefined) || {};
      const merchantId = extractMerchantId(request, body);
      let content = '';
      let filename = 'unknown.dat';
      let fileBuffer: Buffer | undefined;
      let dataType: 'business' | 'channel' = 'channel';
      let fileType: 'JY' | 'JS' | 'SEP' | 'INVOICE' | 'BUSINESS_ORDER' = 'JY';

      // 处理 multipart/form-data 文件上传
      const parts = request.parts();
      for await (const part of parts) {
        if (part.type === 'file') {
          filename = part.filename || 'uploaded.txt';
          fileBuffer = await part.toBuffer();
          content = decodeTextBuffer(fileBuffer);
        } else if (part.type === 'field') {
          if (part.fieldname === 'data_type' && typeof part.value === 'string') {
            dataType = part.value as 'business' | 'channel';
          } else if (part.fieldname === 'file_type' && typeof part.value === 'string') {
            fileType = part.value as 'JY' | 'JS' | 'SEP' | 'INVOICE' | 'BUSINESS_ORDER';
          }
        }
      }

      if (!content && !fileBuffer) {
        return reply.status(400).send(err(1, 'No file content provided'));
      }

      // 处理文件，传递用户指定的文件类型和 buffer（支持 Excel）
      const result = await processor.processBuffer(content, filename, 'upload', fileType, fileBuffer, merchantId);

      if (!result.success) {
        return reply.status(400).send(err(2, result.error || 'File processing failed'));
      }

      return ok({
        file_id: result.fileId,
        data_type: dataType,
        file_type: fileType,
        records: result.records,
        message: `文件上传成功！共 ${result.records} 条${FILE_TYPE_NAMES[fileType] || ''}记录。`,
      });
    });

    /** 批量上传文件 */
    fastify.post('/ai/upload/batch', async (request, reply) => {
      const body = (request.body as Record<string, unknown> | undefined) || {};
      const merchantId = extractMerchantId(request, body);
      const files: Array<{ content: string; filename: string; buffer: Buffer }> = [];
      let dataType: 'business' | 'channel' = 'channel';
      let fileType: 'JY' | 'JS' | 'SEP' | 'INVOICE' | 'BUSINESS_ORDER' = 'JY';

      // 处理 multipart/form-data 文件上传
      const parts = request.parts();
      for await (const part of parts) {
        if (part.type === 'file') {
          const filename = part.filename || 'unknown.dat';
          const buffer = await part.toBuffer();
          files.push({
            content: decodeTextBuffer(buffer),
            filename,
            buffer,
          });
        } else if (part.type === 'field') {
          if (part.fieldname === 'data_type' && typeof part.value === 'string') {
            dataType = part.value as 'business' | 'channel';
          } else if (part.fieldname === 'file_type' && typeof part.value === 'string') {
            fileType = part.value as 'JY' | 'JS' | 'SEP' | 'INVOICE' | 'BUSINESS_ORDER';
          }
        }
      }

      if (files.length === 0) {
        return reply.status(400).send(err(1, 'No files provided'));
      }

      const results: Array<{
        file_id: string;
        filename: string;
        data_type: string;
        file_type: string;
        records: number;
        success: boolean;
        error?: string;
      }> = [];

      let successCount = 0;
      let failedCount = 0;

      for (const fileObj of files) {
        const content = fileObj.content;
        const filename = fileObj.filename;

        if (!content && !fileObj.buffer) {
          results.push({
            file_id: '',
            filename,
            data_type: dataType,
            file_type: fileType,
            records: 0,
            success: false,
            error: 'Empty file content',
          });
          failedCount++;
          continue;
        }

        const result = await processor.processBuffer(content, filename, 'upload', fileType, fileObj.buffer, merchantId);

        if (result.success) {
          results.push({
            file_id: result.fileId || '',
            filename,
            data_type: dataType,
            file_type: fileType,
            records: result.records,
            success: true,
          });
          successCount++;
        } else {
          results.push({
            file_id: '',
            filename,
            data_type: dataType,
            file_type: fileType,
            records: 0,
            success: false,
            error: result.error || 'Processing failed',
          });
          failedCount++;
        }
      }

      return ok({
        success: successCount,
        failed: failedCount,
        total: files.length,
        results,
        message: `批量上传完成！成功 ${successCount} 个，失败 ${failedCount} 个。`,
      });
    });
  };
};

/** 对账触发关键词 */
const RECONCILIATION_KEYWORDS = ['对账', '核对', '比对', '对比', '匹配', '检查差异'];

/** 检测对账意图 */
function detectReconciliationIntent(text: string): boolean {
  return RECONCILIATION_KEYWORDS.some(kw => text.includes(kw));
}

/**
 * AI 对账触发路由
 * POST /ai/reconcile — AI 触发对账
 */
export const createAiReconcileRoutes = (
  prisma: {
    reconciliationBatch: { create: Function; findMany: Function; update: Function };
    reconciliationDetail: { create: Function };
    reconProcessLog: { create: Function };
    businessOrder: { findMany: Function };
    jyTransaction: { findMany: Function };
    jsSettlement: { findMany: Function };
    billTemplate?: { findUnique: Function; findMany: Function };
  },
  engine: { reconcile: Function }
): FastifyPluginAsync => {
  return async (fastify) => {
    /** AI 触发对账 */
    fastify.post('/ai/reconcile', async (request, reply) => {
      const body = request.body as Record<string, unknown>;
      const businessFileId = body.business_file_id as string | undefined;
      const channelFileId = body.channel_file_id as string | undefined;
      const batchType = body.batch_type as 'ORDER_VS_JY' | 'JY_VS_JS';
      const checkDate = body.check_date as string | undefined;

      if (!businessFileId && !channelFileId) {
        return reply.status(400).send(err(1, 'At least one file ID is required'));
      }

      // 创建对账批次
      const batchNo = `BATCH_AI_${Date.now()}`;
      const batch = await prisma.reconciliationBatch.create({
        data: {
          batch_no: batchNo,
          check_date: checkDate || new Date().toISOString().split('T')[0],
          batch_type: batchType || 'ORDER_VS_JY',
          business_file_id: businessFileId,
          channel_file_id: channelFileId,
          record_count: 0,
          total_amount: 0n,
          status: 0,
        },
      });

      // 执行对账
      let businessData: any[] = [];
      let channelData: any[] = [];

      if (batch.batch_type === 'ORDER_VS_JY') {
        // 按批次关联的文件ID过滤（如果可用）
        const businessWhere: any = {};
        const channelWhere: any = {};
        if (batch.business_file_id) {
          businessWhere.file_id = batch.business_file_id;
        } else if (batch.check_date) {
          businessWhere.trans_date = batch.check_date;
        }
        if (batch.channel_file_id) {
          channelWhere.file_id = batch.channel_file_id;
        } else if (batch.check_date) {
          channelWhere.trans_date = batch.check_date;
        }

        businessData = await prisma.businessOrder.findMany({
          where: Object.keys(businessWhere).length > 0 ? businessWhere : undefined,
        });
        channelData = await prisma.jyTransaction.findMany({
          where: Object.keys(channelWhere).length > 0 ? channelWhere : undefined,
        });
      } else if (batch.batch_type === 'JY_VS_JS') {
        const businessWhere: any = {};
        const channelWhere: any = {};
        if (batch.business_file_id) {
          businessWhere.file_id = batch.business_file_id;
        } else if (batch.check_date) {
          businessWhere.trans_date = batch.check_date;
        }
        if (batch.channel_file_id) {
          channelWhere.file_id = batch.channel_file_id;
        } else if (batch.check_date) {
          channelWhere.trans_date = batch.check_date;
        }

        businessData = await prisma.jyTransaction.findMany({
          where: Object.keys(businessWhere).length > 0 ? businessWhere : undefined,
        });
        channelData = await prisma.jsSettlement.findMany({
          where: Object.keys(channelWhere).length > 0 ? channelWhere : undefined,
        });
      }

      const template = await resolveReconTemplate(
        prisma,
        batch.batch_type as BatchType,
        body.template_id as string | undefined,
      );
      const templateWithPrimaryKey = applyChannelPrimaryKeyOverride(
        template,
        batch.batch_type as BatchType,
        body.channel_primary_key as string | undefined,
      );
      const templateWithAmountUnit = normalizeStoredAmountTransform(templateWithPrimaryKey);
      const primaryKeyConfig = extractPrimaryKeyConfig(templateWithPrimaryKey);
      if (primaryKeyConfig) {
        await prisma.reconProcessLog.create({
          data: {
            batch_id: batch.id,
            action: 'BATCH_MATCH_KEY_USED',
            action_data: JSON.stringify({
              ...primaryKeyConfig,
              source: 'template',
            }),
          },
        });
      }
      const result = engine.reconcile(
        businessData,
        channelData,
        batch.batch_type as any,
        templateWithAmountUnit ? { template: templateWithAmountUnit } : {},
      );

      // ??????
      for (const detail of result.details) {
        await prisma.reconciliationDetail.create({
          data: {
            batch_id: batch.id,
            serial_no: detail.serial_no,
            result_type: detail.result_type,
            business_amount: detail.business_amount ? BigInt(detail.business_amount) : null,
            channel_amount: detail.channel_amount ? BigInt(detail.channel_amount) : null,
            diff_amount: detail.diff_amount ? BigInt(detail.diff_amount) : null,
            match_date: detail.match_date || null,
            business_data: null,
            channel_data: null,
            remark:
              detail.match_key || detail.match_mode
                ? JSON.stringify({
                    match_key: detail.match_key || null,
                    match_mode: detail.match_mode || null,
                  })
                : null,
          },
        });
      }

      // 更新批次统计
      const totalAmount = result.details.reduce((sum: bigint, d: { business_amount?: bigint; channel_amount?: bigint }) => {
        return sum + (d.business_amount || d.channel_amount || 0n);
      }, 0n);

      await prisma.reconciliationBatch.update({
        where: { id: batch.id },
        data: {
          record_count: result.stats.total,
          total_amount: totalAmount,
          match_count: result.stats.match,
          rolling_count: result.stats.rolling,
          long_count: result.stats.long,
          short_count: result.stats.short,
          amount_diff_count: result.stats.amount_diff,
          status: 2,
          finished_at: new Date(),
        },
      });

      return ok({
        batch_id: batch.id,
        batch_no: batchNo,
        stats: result.stats,
        message: '对账任务已完成，请查看对账结果',
      });
    });

    /** AI 对话中检测对账意图 */
    fastify.post('/ai/detect-reconcile', async (request) => {
      const body = request.body as Record<string, unknown>;
      const text = body.text as string;

      if (!text) {
        return ok({ intent: false, confidence: 0 });
      }

      const hasIntent = detectReconciliationIntent(text);
      const confidence = hasIntent ? 0.9 : 0;

      return ok({
        intent: hasIntent,
        confidence,
        message: hasIntent ? '检测到对账意图' : '未检测到对账意图',
      });
    });
  };
};
