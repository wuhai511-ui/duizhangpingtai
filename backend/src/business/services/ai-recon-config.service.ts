/**
 * AI对账配置服务
 * 支持通过自然语言对话修改对账主键、辅助字段等配置
 */

import {
  type ReconTemplate,
  type DynamicTemplateConfig,
  suggestFieldMatching,
  createDynamicTemplate,
  parseTemplateFromConversation,
  BUSINESS_ORDER_FIELDS,
  JY_TRANSACTION_FIELDS,
} from '../../config/reconciliation-templates-enhanced.js';

export interface AIReconConfigRequest {
  message: string;
  sessionId: string;
  businessHeaders?: string[];
  channelHeaders?: string[];
  currentTemplate?: ReconTemplate;
}

export interface AIReconConfigResponse {
  success: boolean;
  message: string;
  suggestedTemplate?: ReconTemplate;
  fieldSuggestions?: Array<{
    businessField: string;
    channelField: string;
    confidence: number;
    reason: string;
  }>;
  configuration?: Partial<DynamicTemplateConfig>;
  actions: Array<{
    type: 'set_primary_key' | 'add_aux_field' | 'set_amount_tolerance' | 'set_date_config' | 'create_template';
    description: string;
    data: unknown;
  }>;
}

export class AIReconConfigService {
  private sessions = new Map<string, ReconTemplate>();

  /**
   * 处理AI配置请求
   */
  async processConfigRequest(request: AIReconConfigRequest): Promise<AIReconConfigResponse> {
    const { message, sessionId, businessHeaders, channelHeaders, currentTemplate } = request;
    
    // 保存当前模板到会话
    if (currentTemplate) {
      this.sessions.set(sessionId, currentTemplate);
    }

    // 1. 如果提供了表头，先给出字段匹配建议
    if (businessHeaders && channelHeaders) {
      return this.handleFieldSuggestion(message, businessHeaders, channelHeaders);
    }

    // 2. 解析配置意图
    const config = this.parseConfigIntent(message);
    
    // 3. 生成响应
    return this.generateResponse(message, config, sessionId);
  }

  /**
   * 处理字段匹配建议
   */
  private handleFieldSuggestion(
    message: string,
    businessHeaders: string[],
    channelHeaders: string[]
  ): AIReconConfigResponse {
    const suggestions = suggestFieldMatching(businessHeaders, channelHeaders);
    
    // 根据用户意图筛选建议
    const intent = this.detectIntent(message);
    
    let responseMessage = '';
    const actions: AIReconConfigResponse['actions'] = [];

    switch (intent) {
      case 'primary_key':
        const primarySuggestions = suggestions.filter(s => 
          s.confidence >= 90 && 
          (s.reason.includes('主键') || s.reason.includes('流水号') || s.reason.includes('订单号'))
        );
        responseMessage = `根据您的文件，推荐以下主键匹配方案：\n${primarySuggestions.map(s => 
          `- ${s.businessField} ↔ ${s.channelField} (置信度: ${s.confidence}%)`
        ).join('\n')}`;
        
        if (primarySuggestions.length > 0) {
          actions.push({
            type: 'set_primary_key',
            description: `设置主键: ${primarySuggestions[0].businessField} ↔ ${primarySuggestions[0].channelField}`,
            data: primarySuggestions[0],
          });
        }
        break;
        
      case 'auxiliary':
        const auxFields = this.suggestAuxiliaryFields(businessHeaders, channelHeaders);
        responseMessage = `推荐辅助字段：${auxFields.join(', ')}`;
        auxFields.forEach(field => {
          actions.push({
            type: 'add_aux_field',
            description: `添加辅助字段: ${field}`,
            data: field,
          });
        });
        break;
        
      default:
        responseMessage = `为您分析文件匹配方案：\n\n主键建议：\n${suggestions.slice(0, 3).map(s => 
          `• ${s.businessField} → ${s.channelField} (${s.confidence}% 置信度: ${s.reason})`
        ).join('\n')}`;
        
        suggestions.slice(0, 2).forEach(s => {
          actions.push({
            type: 'add_aux_field',
            description: s.reason,
            data: s,
          });
        });
    }

    return {
      success: true,
      message: responseMessage,
      fieldSuggestions: suggestions,
      actions,
    };
  }

  /**
   * 解析配置意图
   */
  private parseConfigIntent(message: string): Partial<DynamicTemplateConfig> {
    const config: Partial<DynamicTemplateConfig> = {
      primaryKeys: [],
      auxiliaryFields: [],
      amountFields: { businessField: 'order_amount', channelField: 'amount', tolerance: 0 },
      dateFields: { businessField: 'trans_date', channelField: 'trans_date', allowEmpty: true, rollingDays: 3 },
    };

    // 解析主键配置
    // 匹配: "主键用支付流水号匹配拉卡拉流水号" 或 "主键：支付流水号"
    const primaryKeyRegex = /主键[:：]?\s*用?\s*(.+?)\s*(?:匹配|对应)?\s*(.+?)?(?:，|；|;|$)/i;
    const primaryMatch = message.match(primaryKeyRegex);
    if (primaryMatch) {
      const businessField = primaryMatch[1].trim();
      const channelField = primaryMatch[2]?.trim() || businessField;
      config.primaryKeys?.push({
        businessField,
        channelField,
        mode: 'exact',
        weight: 100,
      });
    }

    // 解析辅助字段
    // 匹配: "辅助字段包含订单号、商户号" 或 "辅助：订单号、金额"
    const auxRegex = /(?:辅助字段|辅助)[:：]?\s*(.+?)(?:，|；|;|$)/i;
    const auxMatch = message.match(auxRegex);
    if (auxMatch) {
      const fields = auxMatch[1].split(/[,，、]/).map(f => f.trim()).filter(Boolean);
      fields.forEach(field => {
        config.auxiliaryFields?.push({
          businessField: field,
          channelField: field,
          required: false,
        });
      });
    }

    // 解析金额容差
    // 匹配: "容差1分" 或 "允许误差1元" 或 "金额容差：100"
    const toleranceRegex = /(?:容差|误差|容忍)[:：]?\s*(\d+)\s*(分|元)?/i;
    const toleranceMatch = message.match(toleranceRegex);
    if (toleranceMatch && config.amountFields) {
      const value = parseInt(toleranceMatch[1]);
      const unit = toleranceMatch[2];
      config.amountFields.tolerance = unit === '元' ? value * 100 : value;
    }

    // 解析滚动天数
    // 匹配: "滚动3天" 或 "跨天匹配5天"
    const rollingRegex = /(?:滚动|跨天)[:：]?\s*(\d+)\s*天?/i;
    const rollingMatch = message.match(rollingRegex);
    if (rollingMatch && config.dateFields) {
      config.dateFields.rollingDays = parseInt(rollingMatch[1]);
    }

    // 解析是否允许空日期
    // 匹配: "允许空日期" 或 "日期可以为空"
    if (/允许空日期|日期可以为空|忽略日期/.test(message)) {
      if (config.dateFields) {
        config.dateFields.allowEmpty = true;
      }
    }

    return config;
  }

  /**
   * 检测意图
   */
  private detectIntent(message: string): 'primary_key' | 'auxiliary' | 'amount' | 'date' | 'general' {
    if (/主键|流水号|订单号|primary|key/i.test(message)) return 'primary_key';
    if (/辅助|auxiliary|additional/i.test(message)) return 'auxiliary';
    if (/金额|容差|误差|amount|tolerance/i.test(message)) return 'amount';
    if (/日期|时间|滚动|跨天|date|rolling/i.test(message)) return 'date';
    return 'general';
  }

  /**
   * 推荐辅助字段
   */
  private suggestAuxiliaryFields(businessHeaders: string[], channelHeaders: string[]): string[] {
    const suggestions: string[] = [];
    
    // 金额字段
    const businessAmount = businessHeaders.find(h => /金额|amount|price/i.test(h));
    const channelAmount = channelHeaders.find(h => /金额|amount|price/i.test(h));
    if (businessAmount && channelAmount) {
      suggestions.push(`${businessAmount}/${channelAmount}`);
    }
    
    // 日期字段
    const businessDate = businessHeaders.find(h => /日期|时间|date|time/i.test(h));
    const channelDate = channelHeaders.find(h => /日期|时间|date|time/i.test(h));
    if (businessDate && channelDate) {
      suggestions.push(`${businessDate}/${channelDate}`);
    }
    
    // 商户/门店字段
    const businessMerchant = businessHeaders.find(h => /商户|门店|merchant|store/i.test(h));
    const channelMerchant = channelHeaders.find(h => /商户|门店|merchant|store|终端/i.test(h));
    if (businessMerchant && channelMerchant) {
      suggestions.push(`${businessMerchant}/${channelMerchant}`);
    }
    
    return suggestions;
  }

  /**
   * 生成响应
   */
  private generateResponse(
    message: string,
    config: Partial<DynamicTemplateConfig>,
    sessionId: string
  ): AIReconConfigResponse {
    const actions: AIReconConfigResponse['actions'] = [];
    let responseMessage = '';

    // 创建建议模板
    const suggestedTemplate = createDynamicTemplate({
      name: 'AI推荐模板',
      batchType: 'ORDER_VS_JY',
      businessFileType: 'BUSINESS_ORDER',
      channelFileType: 'JY',
      primaryKeys: config.primaryKeys || [{ businessField: 'pay_serial_no', channelField: 'lakala_serial', mode: 'exact', weight: 100 }],
      auxiliaryFields: config.auxiliaryFields || [],
      amountFields: config.amountFields || { businessField: 'order_amount', channelField: 'amount', tolerance: 0 },
      dateFields: config.dateFields || { businessField: 'trans_date', channelField: 'trans_date', allowEmpty: true, rollingDays: 3 },
    });

    // 生成配置描述
    const descriptions: string[] = [];
    
    if (config.primaryKeys && config.primaryKeys.length > 0) {
      const pk = config.primaryKeys[0];
      descriptions.push(`✓ 主键匹配：${pk.businessField} ↔ ${pk.channelField}`);
      actions.push({
        type: 'set_primary_key',
        description: `设置主键为 ${pk.businessField} ↔ ${pk.channelField}`,
        data: pk,
      });
    }
    
    if (config.auxiliaryFields && config.auxiliaryFields.length > 0) {
      const auxList = config.auxiliaryFields.map(f => f.businessField).join('、');
      descriptions.push(`✓ 辅助字段：${auxList}`);
      actions.push({
        type: 'add_aux_field',
        description: `添加 ${config.auxiliaryFields.length} 个辅助字段`,
        data: config.auxiliaryFields,
      });
    }
    
    if (config.amountFields && config.amountFields.tolerance > 0) {
      descriptions.push(`✓ 金额容差：${config.amountFields.tolerance}分`);
      actions.push({
        type: 'set_amount_tolerance',
        description: `设置金额容差为 ${config.amountFields.tolerance}分`,
        data: config.amountFields.tolerance,
      });
    }
    
    if (config.dateFields) {
      const dateDesc = [];
      if (config.dateFields.allowEmpty) dateDesc.push('允许空日期');
      if (config.dateFields.rollingDays > 0) dateDesc.push(`滚动${config.dateFields.rollingDays}天`);
      if (dateDesc.length > 0) {
        descriptions.push(`✓ 日期配置：${dateDesc.join('，')}`);
        actions.push({
          type: 'set_date_config',
          description: `设置日期配置`,
          data: config.dateFields,
        });
      }
    }

    if (descriptions.length > 0) {
      responseMessage = `已为您配置对账规则：\n${descriptions.join('\n')}\n\n是否应用此配置？`;
    } else {
      responseMessage = `我可以帮您配置对账规则。请告诉我：\n\n1. 主键用什么字段匹配（如：主键用支付流水号匹配拉卡拉流水号）\n2. 需要哪些辅助字段（如：辅助字段包含订单号、商户号）\n3. 金额容差（如：容差1分）\n4. 滚动匹配天数（如：滚动3天）`;
    }

    actions.push({
      type: 'create_template',
      description: '创建动态模板',
      data: suggestedTemplate,
    });

    return {
      success: true,
      message: responseMessage,
      suggestedTemplate,
      configuration: config,
      actions,
    };
  }

  /**
   * 应用配置创建模板
   */
  applyConfig(sessionId: string, config: DynamicTemplateConfig): ReconTemplate {
    const template = createDynamicTemplate(config);
    this.sessions.set(sessionId, template);
    return template;
  }

  /**
   * 获取会话中的模板
   */
  getSessionTemplate(sessionId: string): ReconTemplate | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * 清除会话
   */
  clearSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }
}

// 导出单例
export const aiReconConfigService = new AIReconConfigService();
