/**
 * AI对账配置 API
 * 支持通过自然语言对话修改对账主键、辅助字段
 */

import type { FastifyPluginAsync } from 'fastify';
import { aiReconConfigService } from '../services/ai-recon-config.service.js';
import { createDynamicTemplate, getAvailableTemplates } from '../../config/reconciliation-templates-enhanced.js';

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

export const aiReconConfigRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * POST /ai/recon-config
   * AI对话配置对账规则
   */
  fastify.post('/ai/recon-config', async (request) => {
    const body = request.body as {
      message: string;
      session_id: string;
      business_headers?: string[];
      channel_headers?: string[];
    };

    if (!body.message || !body.session_id) {
      return err(400, '缺少必要参数: message, session_id');
    }

    const result = await aiReconConfigService.processConfigRequest({
      message: body.message,
      sessionId: body.session_id,
      businessHeaders: body.business_headers,
      channelHeaders: body.channel_headers,
    });

    return ok(result);
  });

  /**
   * POST /ai/recon-config/apply
   * 应用配置创建模板
   */
  fastify.post('/ai/recon-config/apply', async (request) => {
    const body = request.body as {
      session_id: string;
      config: {
        name: string;
        batch_type: 'ORDER_VS_JY' | 'JY_VS_JS';
        primary_keys: Array<{
          business_field: string;
          channel_field: string;
          mode: 'exact' | 'prefix' | 'suffix' | 'contains';
          weight: number;
        }>;
        auxiliary_fields?: Array<{
          business_field: string;
          channel_field: string;
          required: boolean;
        }>;
        amount_tolerance?: number;
        allow_empty_date?: boolean;
        rolling_days?: number;
      };
    };

    if (!body.session_id || !body.config) {
      return err(400, '缺少必要参数');
    }

    const template = aiReconConfigService.applyConfig(body.session_id, {
      name: body.config.name,
      batchType: body.config.batch_type,
      businessFileType: body.config.batch_type === 'ORDER_VS_JY' ? 'BUSINESS_ORDER' : 'JY',
      channelFileType: body.config.batch_type === 'ORDER_VS_JY' ? 'JY' : 'JS',
      primaryKeys: body.config.primary_keys.map(pk => ({
        businessField: pk.business_field,
        channelField: pk.channel_field,
        mode: pk.mode,
        weight: pk.weight,
      })),
      auxiliaryFields: (body.config.auxiliary_fields || []).map(af => ({
        businessField: af.business_field,
        channelField: af.channel_field,
        required: af.required,
      })),
      amountFields: {
        businessField: 'order_amount',
        channelField: 'amount',
        tolerance: body.config.amount_tolerance ?? 0,
      },
      dateFields: {
        businessField: 'trans_date',
        channelField: 'trans_date',
        allowEmpty: body.config.allow_empty_date ?? true,
        rollingDays: body.config.rolling_days ?? 3,
      },
    });

    return ok({ template });
  });

  // 注意：GET /reconciliation/templates 已在 template.ts 中定义，此处不再重复

  /**
   * POST /reconciliation/templates/analyze
   * 分析文件表头推荐匹配方案
   */
  fastify.post('/reconciliation/templates/analyze', async (request) => {
    const body = request.body as {
      business_headers: string[];
      channel_headers: string[];
    };

    if (!body.business_headers || !body.channel_headers) {
      return err(400, '缺少表头信息');
    }

    const result = await aiReconConfigService.processConfigRequest({
      message: '分析字段匹配',
      sessionId: `analyze_${Date.now()}`,
      businessHeaders: body.business_headers,
      channelHeaders: body.channel_headers,
    });

    return ok({
      suggestions: result.fieldSuggestions,
      message: result.message,
    });
  });

  /**
   * POST /reconciliation/retry-with-template
   * 使用指定模板重新对账
   */
  fastify.post('/reconciliation/retry-with-template', async (request, reply) => {
    const body = request.body as {
      batch_id: string;
      template_id?: string;
      template_config?: {
        primary_keys: Array<{
          business_field: string;
          channel_field: string;
        }>;
        auxiliary_fields?: Array<{
          business_field: string;
          channel_field: string;
        }>;
      };
    };

    if (!body.batch_id) {
      return err(400, '缺少批次ID');
    }

    // TODO: 实现重新对账逻辑
    // 1. 查询批次详情
    // 2. 获取业务数据和渠道数据
    // 3. 使用新模板重新对账
    // 4. 更新批次结果

    return ok({
      batch_id: body.batch_id,
      message: '重新对账已提交',
      status: 'processing',
    });
  });

  /**
   * GET /reconciliation/batches/:id/debug
   * 获取批次对账调试信息
   */
  fastify.get('/reconciliation/batches/:id/debug', async (request, reply) => {
    const params = request.params as { id: string };

    // TODO: 查询批次调试信息
    // 返回：匹配失败原因、未匹配记录、字段映射情况等

    return ok({
      batch_id: params.id,
      debug_info: {
        unmatched_business: [],
        unmatched_channel: [],
        match_attempts: [],
      },
    });
  });
};
