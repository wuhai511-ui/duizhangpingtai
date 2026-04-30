/**
 * AI 智能模板生成服务
 *
 * 功能：
 * 1. 分析文件表头 → 识别字段类型 → 生成字段映射配置
 * 2. 无匹配模板时，自动生成新模板
 * 3. 评估模板匹配质量
 */

export interface FieldMapping {
  header: string;       // 原始表头
  field: string;        // 标准字段名
  confidence: number;   // 置信度 0-1
  type: 'string' | 'amount' | 'date' | 'number';
  required: boolean;
}

export interface GeneratedTemplate {
  name: string;
  type: string;
  fieldConfig: {
    fields: FieldMapping[];
    dateFormat?: string;
    amountUnit?: 'yuan' | 'fen';
  };
  delimiter: string;
  headerRow: number;
  dataStartRow: number;
  confidence: number;
  reasoning?: string;
}

// 标准字段定义（按文件类型）
const STANDARD_FIELDS: Record<string, { field: string; aliases: string[]; type: string; required: boolean }[]> = {
  JY: [
    { field: 'merchant_no', aliases: ['商户编号', '商户号', 'merchant_no', 'merno', 'mer_no'], type: 'string', required: true },
    { field: 'trans_date', aliases: ['交易日期', '日期', 'trans_date', 'trade_date', '交易时间'], type: 'date', required: true },
    { field: 'trans_time', aliases: ['交易时间', '时间', 'trans_time', 'trade_time'], type: 'string', required: false },
    { field: 'terminal_no', aliases: ['终端号', '终端编号', 'terminal_no', 'term_no', 'tid'], type: 'string', required: false },
    { field: 'trans_type', aliases: ['交易类型', '类型', 'trans_type', 'trade_type', '业务类型'], type: 'string', required: false },
    { field: 'lakala_serial', aliases: ['拉卡拉流水号', '流水号', 'serial_no', 'lakala_serial', 'trace_no', 'sys_ref_no', '系统参考号'], type: 'string', required: true },
    { field: 'orig_lakala_serial', aliases: ['原拉卡拉流水号', '原流水号', 'orig_serial', 'orig_lakala_serial', '原始流水号'], type: 'string', required: false },
    { field: 'card_no', aliases: ['卡号', 'card_no', 'bank_card', '账号'], type: 'string', required: false },
    { field: 'pay_channel', aliases: ['支付渠道', '渠道', 'pay_channel', 'channel', '支付方式'], type: 'string', required: false },
    { field: 'bank_name', aliases: ['银行名称', '银行', 'bank_name', 'bank', '开户行'], type: 'string', required: false },
    { field: 'amount', aliases: ['交易金额', '金额', 'amount', 'total_amount', 'trans_amount', '交易金额(分)'], type: 'amount', required: true },
    { field: 'fee', aliases: ['手续费', 'fee', 'commission', '服务费'], type: 'amount', required: false },
    { field: 'settle_amount', aliases: ['结算金额', '到账金额', 'settle_amount', 'real_amount', '实收金额', '交易金额(分)'], type: 'amount', required: false },
    { field: 'merchant_order_no', aliases: ['商户订单号', '订单号', 'order_no', 'merchant_order_no', 'out_trade_no', '外部订单号'], type: 'string', required: false },
    { field: 'pay_order_no', aliases: ['支付订单号', 'pay_order_no', 'transaction_id', '微信订单号', '支付宝订单号'], type: 'string', required: false },
    { field: 'external_serial', aliases: ['外部流水号', 'external_serial', '商户单号'], type: 'string', required: false },
    { field: 'remark', aliases: ['备注', 'remark', 'note', 'memo'], type: 'string', required: false },
    { field: 'pay_method', aliases: ['支付方式', 'pay_method', 'method', '付款方式'], type: 'string', required: false },
  ],
  JS: [
    { field: 'merchant_no', aliases: ['商户编号', '商户号', 'merchant_no'], type: 'string', required: true },
    { field: 'trans_date', aliases: ['交易日期', '日期', 'trans_date'], type: 'date', required: true },
    { field: 'trans_time', aliases: ['交易时间', '时间'], type: 'string', required: false },
    { field: 'terminal_no', aliases: ['终端号', 'terminal_no', 'tid'], type: 'string', required: false },
    { field: 'lakala_serial', aliases: ['拉卡拉流水号', '流水号', 'serial_no', 'lakala_serial'], type: 'string', required: true },
    { field: 'amount', aliases: ['交易金额', '金额', 'amount', '交易金额(分)'], type: 'amount', required: true },
    { field: 'fee', aliases: ['手续费', 'fee'], type: 'amount', required: false },
    { field: 'settle_amount', aliases: ['结算金额', '到账金额', 'settle_amount', '实收金额'], type: 'amount', required: true },
    { field: 'settle_date', aliases: ['结算日期', 'settle_date', '清分日期'], type: 'date', required: true },
    { field: 'settle_status', aliases: ['结算状态', 'settle_status', '状态'], type: 'number', required: false },
  ],
  BUSINESS_ORDER: [
    { field: 'order_no', aliases: ['订单编号', '订单号', 'order_no', 'order_id', '订单流水号', '确认号', '子单号'], type: 'string', required: true },
    { field: 'order_type', aliases: ['订单类型', 'order_type', '类型', '来源', '是否闪住'], type: 'string', required: false },
    { field: 'pay_method', aliases: ['支付方式', 'pay_method', '付款方式', '协议公司', '付底付面'], type: 'string', required: false },
    { field: 'channel_name', aliases: ['渠道名称', 'channel_name', '渠道', '服务商', '下单酒店名称', '下单酒店ID', '房型名称'], type: 'string', required: false },
    { field: 'customer_phone', aliases: ['顾客手机号', '手机号', 'phone', 'customer_phone'], type: 'string', required: false },
    { field: 'customer_name', aliases: ['顾客姓名', '姓名', 'customer_name', '客户姓名', '入住者'], type: 'string', required: false },
    { field: 'order_amount', aliases: ['订单金额', 'order_amount', '金额', '交易金额', '订单面价', 'PMS金额'], type: 'amount', required: true },
    { field: 'received_amount', aliases: ['实收金额', 'received_amount', '实收', '结算金额', '结算价'], type: 'amount', required: false },
    { field: 'paid_amount', aliases: ['实付金额', 'paid_amount', '实付', '酒店对携程开票金额'], type: 'amount', required: false },
    { field: 'channel_fee', aliases: ['通道手续费', 'channel_fee', '手续费', '费率', '佣金', '携程对酒店开票金额'], type: 'amount', required: false },
    { field: 'order_status', aliases: ['订单状态', 'order_status', '状态', '交易状态', '订单是否金蝉'], type: 'string', required: false },
    { field: 'pay_serial_no', aliases: ['支付流水号', 'pay_serial_no', '流水号', 'serial_no', '原交易流水号', 'orig_serial_no', '交易流水号'], type: 'string', required: false },
    { field: 'orig_serial_no', aliases: ['原交易流水号', 'orig_serial_no', '原始流水号', '订单Id', '订单ID', '订单id', '父单号', '中介单号'], type: 'string', required: false },
    { field: 'trans_date', aliases: ['交易日期', 'trans_date', '日期', '结账日期', '入住时间', '离店时间'], type: 'date', required: false },
  ],
};

/** 计算两个字符串的相似度（简单包含匹配） */
function similarity(a: string, b: string): number {
  const [la, lb] = [a.toLowerCase(), b.toLowerCase()];
  if (la === lb) return 1;
  if (la.includes(lb) || lb.includes(la)) return 0.8;
  // 简拼匹配
  const soundex = (s: string) => s.replace(/[a-z]/gi, '').slice(0, 4);
  if (soundex(la) === soundex(lb)) return 0.6;
  return 0;
}

/** 智能推断分隔符（导出供 file.ts 使用） */
export function inferDelimiter(headerLine: string): string {
  const delimiters = ['|', '\t', ',', ';', '\u0001'];
  let best = '|';
  let bestScore = 0;
  for (const d of delimiters) {
    const count = (headerLine.match(new RegExp(d.replace(/[|]/g, '\\$&'), 'g')) || []).length;
    if (count > bestScore) {
      bestScore = count;
      best = d;
    }
  }
  return best;
}

/**
 * 分析表头 → 生成字段映射
 * 本地实现，不依赖外部 API
 */
export function analyzeHeaders(
  headers: string[],
  fileTypeHint?: string
): { mappings: FieldMapping[]; detectedType: string; confidence: number } {
  const mappings: FieldMapping[] = [];
  const candidates = fileTypeHint ? [fileTypeHint] : Object.keys(STANDARD_FIELDS);

  let bestType = 'JY';
  let bestTotalScore = 0;

  for (const fileType of candidates) {
    const stdFields = STANDARD_FIELDS[fileType];
    let totalScore = 0;
    const typeMappings: FieldMapping[] = [];

    for (const header of headers) {
      const trimmed = header.trim();
      if (!trimmed) continue;

      let bestMatch: typeof stdFields[0] | null = null;
      let bestScore = 0;

      for (const sf of stdFields) {
        // 别名匹配
        for (const alias of sf.aliases) {
          const score = similarity(trimmed, alias);
          if (score > bestScore) {
            bestScore = score;
            bestMatch = sf;
          }
        }
      }

      if (bestMatch && bestScore >= 0.5) {
        typeMappings.push({
          header: trimmed,
          field: bestMatch.field,
          confidence: bestScore,
          type: bestMatch.type as FieldMapping['type'],
          required: bestMatch.required,
        });
        totalScore += bestScore;
      } else {
        // 无法识别，记录为 unknown 字段
        typeMappings.push({
          header: trimmed,
          field: 'unknown',
          confidence: 0,
          type: 'string',
          required: false,
        });
      }
    }

    if (totalScore > bestTotalScore) {
      bestTotalScore = totalScore;
      bestType = fileType;
      mappings.length = 0;
      mappings.push(...typeMappings);
    }
  }

  const identifiedCount = mappings.filter(m => m.field !== 'unknown').length;
  const confidence = headers.length > 0 ? identifiedCount / headers.length : 0;

  return { mappings, detectedType: bestType, confidence };
}

/**
 * 根据分析结果生成完整模板配置
 */
export function generateTemplateFromAnalysis(
  headers: string[],
  mappings: FieldMapping[],
  detectedType: string,
  confidence: number
): GeneratedTemplate {
  // 推断分隔符（从表头猜）
  const delimiter = inferDelimiter(headers.join('|'));

  // 判断金额单位：表头含"(分)" → fen，否则默认 yuan
  const hasFenMarker = headers.some(h => h.includes('(分)') || h.includes('（分）'));
  const amountUnit = hasFenMarker ? 'fen' : 'yuan';

  const identifiedFields = mappings.filter(m => m.field !== 'unknown');
  const name = `AI生成_${detectedType}_${new Date().toISOString().slice(0, 10)}`;

  return {
    name,
    type: detectedType,
    fieldConfig: {
      fields: mappings.map(m => ({
        header: m.header,
        field: m.field === 'unknown' ? '' : m.field,
        confidence: m.confidence,
        type: m.type,
        required: m.required,
      })),
      amountUnit,
    },
    delimiter,
    headerRow: 1,
    dataStartRow: 2,
    confidence,
  };
}

/**
 * 用 DeepSeek AI 分析表头并生成模板（高级版）
 */
export async function askAIForTemplateGeneration(
  headers: string[],
  sampleRows: string[][] = [],
  options?: { fileTypeHint?: string; merchantId?: string }
): Promise<GeneratedTemplate> {
  const apiKey = process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY;

  if (!apiKey) {
    // Fallback 到本地分析
    const { mappings, detectedType, confidence } = analyzeHeaders(headers, options?.fileTypeHint);
    return generateTemplateFromAnalysis(headers, mappings, detectedType, confidence);
  }

  const fileTypeHint = options?.fileTypeHint
    ? `\n文件类型提示：${options.fileTypeHint}`
    : '\n文件类型提示：未知，请根据表头自行判断（JY/JS/BUSINESS_ORDER）';

  const sampleSection = sampleRows.length > 0
    ? `\n前 3 行数据示例（分隔符为 |）：\n${sampleRows.slice(0, 3).map(r => r.join(' | ')).join('\n')}`
    : '';

  const prompt = `你是一个账单文件模板识别专家。请根据以下表头分析文件格式，生成标准字段映射。

## 任务
分析表头列表，判断这是哪种文件类型（JY=交易流水, JS=结算流水, BUSINESS_ORDER=业务订单），然后将每个表头映射到标准字段名。

## 标准字段定义

### JY（交易流水）必填：merchant_no, trans_date, lakala_serial, amount
可选：trans_time, terminal_no, trans_type, orig_lakala_serial, card_no, pay_channel, bank_name, fee, settle_amount, merchant_order_no, pay_order_no, external_serial, sys_ref_no, remark, pay_method

### JS（结算流水）必填：merchant_no, trans_date, lakala_serial, amount, settle_amount, settle_date
可选：trans_time, terminal_no, fee, settle_status

### BUSINESS_ORDER（业务订单）必填：order_no, order_amount
可选：order_type, pay_method, channel_name, customer_phone, customer_name, received_amount, paid_amount, channel_fee, order_status, pay_serial_no, orig_serial_no, trans_date

## 表头列表
${headers.map((h, i) => `  ${i + 1}. "${h}"`).join('\n')}
${sampleSection}
${fileTypeHint}

## 输出格式
请以 JSON 格式返回，结构如下：
{
  "detected_type": "JY" | "JS" | "BUSINESS_ORDER",
  "confidence": 0.85,
  "mappings": [
    {"header": "原始表头", "field": "标准字段名", "confidence": 0.9, "type": "string|amount|date|number", "required": true|false},
    ...
  ],
  "delimiter": "|"（推断的分隔符）,
  "amount_unit": "yuan" | "fen"（根据表头是否含(分)判断）,
  "reasoning": "简要说明判断依据"
}

注意：
1. field 使用英文标准字段名，不是原始表头
2. 只映射能确定的字段，无法判断的字段 field 留空字符串
3. amount_unit 判断：如果表头含"(分)"或"（分）"则为"fen"，否则为"yuan"
4. 返回的 mappings 顺序与输入表头顺序一致`;

  try {
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
      throw new Error(`DeepSeek API error: ${response.status}`);
    }

    const data = await response.json() as { choices: Array<{ message: { content: string } }> };
    const raw = data.choices[0]?.message?.content || '';

    // 提取 JSON
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('AI response does not contain valid JSON');
    }

    const aiResult = JSON.parse(jsonMatch[0]) as {
      detected_type: string;
      confidence: number;
      mappings: Array<{ header: string; field: string; confidence: number; type: string; required: boolean }>;
      delimiter?: string;
      amount_unit?: 'yuan' | 'fen';
      reasoning?: string;
    };

    const typeMap: Record<string, FieldMapping['type']> = {
      string: 'string',
      amount: 'amount',
      date: 'date',
      number: 'number',
    };

    return {
      name: `AI生成_${aiResult.detected_type}_${new Date().toISOString().slice(0, 10)}`,
      type: aiResult.detected_type,
      fieldConfig: {
        fields: aiResult.mappings.map(m => ({
          ...m,
          type: typeMap[m.type] ?? 'string',
        })),
        amountUnit: aiResult.amount_unit || 'yuan',
      },
      delimiter: aiResult.delimiter || inferDelimiter(headers.join('|')),
      headerRow: 1,
      dataStartRow: 2,
      confidence: aiResult.confidence,
      reasoning: aiResult.reasoning,
    };
  } catch (err) {
    console.warn('[template-ai] DeepSeek API failed, fallback to local analysis:', err instanceof Error ? err.message : String(err));
    const { mappings, detectedType, confidence } = analyzeHeaders(headers, options?.fileTypeHint);
    return generateTemplateFromAnalysis(headers, mappings, detectedType, confidence);
  }
}
