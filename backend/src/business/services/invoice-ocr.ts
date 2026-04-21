/**
 * 电子发票 OCR 服务
 * 使用 LLM API（DeepSeek/OpenAI）识别发票信息
 */

export interface InvoiceOCRResult {
  invoice_no: string;
  invoice_code: string;
  buyer_name: string;
  buyer_tax_no: string;
  seller_name: string;
  seller_tax_no: string;
  amount: number;
  tax_amount: number;
  total_amount: number;
  invoice_date: string;
  raw_text?: string;
}

const INVOICE_PROMPT = `你是一个发票识别助手。请从图片中提取发票信息，返回 JSON 格式：
{
  "invoice_no": "发票号码",
  "invoice_code": "发票代码",
  "buyer_name": "购买方名称",
  "buyer_tax_no": "购买方税号",
  "seller_name": "销售方名称",
  "seller_tax_no": "销售方税号",
  "amount": 金额(分),
  "tax_amount": 税额(分),
  "total_amount": 价税合计(分),
  "invoice_date": "开票日期 YYYY-MM-DD"
}

只返回 JSON，不返回其他内容。如果某字段无法识别，返回空字符串或 0。`;

export async function recognizeInvoice(
  imageBase64: string,
  mimeType: string = 'image/png'
): Promise<InvoiceOCRResult> {
  const apiKey = process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return mockRecognizeInvoice();
  }

  // PDF 不支持直接 OCR（Vision API 只支持图片格式）
  if (mimeType === 'application/pdf') {
    throw new Error('PDF format is not supported for OCR. Please upload an image (PNG, JPG, etc.)');
  }

  try {
    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: INVOICE_PROMPT },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${mimeType};base64,${imageBase64}`,
                },
              },
            ],
          },
        ],
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      throw new Error(`LLM API error: ${response.status}`);
    }

    const data = await response.json() as any;
    const content = data.choices[0]?.message?.content || '';

    // 解析 JSON
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        ...parsed,
        raw_text: content,
      };
    }

    throw new Error('Failed to parse invoice JSON');
  } catch (error) {
    console.error('Invoice OCR error:', error);
    throw error;
  }
}

function mockRecognizeInvoice(): InvoiceOCRResult {
  return {
    invoice_no: '12345678',
    invoice_code: '1100201130',
    buyer_name: '示例购买方公司',
    buyer_tax_no: '91110000MA00ABCD12',
    seller_name: '示例销售方公司',
    seller_tax_no: '91110000MA00EFGH34',
    amount: 100000,
    tax_amount: 13000,
    total_amount: 113000,
    invoice_date: '2026-04-09',
  };
}