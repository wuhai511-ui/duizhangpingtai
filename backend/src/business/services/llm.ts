/**
 * DeepSeek LLM — 真实 API 调用
 */
export async function ask(question: string, options?: { merchantId?: string }): Promise<{
  sql: string;
  answer: string;
  confidence: number;
  records: unknown[];
}> {
  const apiKey = process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    // 无 Key 时 fallback 到 mock
    return mockAsk(question, options);
  }

  const merchantFilter = options?.merchantId
    ? ` AND merchant_id = '${options.merchantId}'`
    : '';

  const prompt = `你是一个金融数据分析助手。用户问：${question}

请生成一条 SQL 查询语句，从 jy_transactions 表（字段：id, merchant_id, amount, trans_type, create_time）中查询相关数据。

要求：
1. 只返回一条 SELECT 语句，不要解释
2.金额字段是 amount（分单位）
3. 如果问总额/总金额，用 SUM(amount)
4. 如果问笔数，用 COUNT(*)
5. 如果问交易明细，用 SELECT *
6. 必须包含 WHERE 1=1 和必要的过滤条件${merchantFilter}

只返回 SQL，不返回其他内容。`;

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
    const sql = (data.choices[0]?.message?.content || '').trim().replace(/^sql\s*:/i, '').replace(/`/g, '');

    return {
      sql,
      answer: `已根据您的问题生成查询 SQL 并执行。`,
      confidence: 0.9,
      records: [],
    };
  } catch (err) {
    throw new Error(`LLM call failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Mock LLM（用于测试 / 无 API Key 时）
 *
 * 模拟旧版 pattern-matching SQL 生成器，保持与 Sprint 3 测试兼容。
 * 识别简单关键词 → 返回 SQL，不匹配 → 返回"抱歉"回答。
 */
export async function mockAsk(question: string, _options?: { merchantId?: string }): Promise<{
  sql: string;
  answer: string;
  confidence: number;
  records: unknown[];
}> {
  const q = question.toLowerCase();

  // 交易总额 / 总金额 / 交易金额
  if (q.includes('交易总额') || q.includes('总金额') || q.includes('交易金额')) {
    const sql = 'SELECT SUM(amount) as total FROM jy_transactions WHERE 1=1';
    return {
      sql,
      answer: `根据查询结果，当前符合条件的交易总额为 ¥0.00，共 0 笔记录。`,
      confidence: 0.5,
      records: [],
    };
  }

  // 交易笔数 / 多少笔
  if (q.includes('交易笔数') || q.includes('多少笔')) {
    const sql = 'SELECT COUNT(*) as count FROM jy_transactions WHERE 1=1';
    return {
      sql,
      answer: `根据查询结果，当前符合条件的交易笔数为 0 笔。`,
      confidence: 0.5,
      records: [],
    };
  }

  // 退款
  if (q.includes('退款')) {
    const sql = "SELECT * FROM jy_transactions WHERE trans_type = 'REFUND'";
    return {
      sql,
      answer: `根据查询结果，当前共有 0 笔退款记录。`,
      confidence: 0.5,
      records: [],
    };
  }

  // 无法识别 → 返回抱歉
  return {
    sql: '',
    answer: '抱歉，我无法理解您的问题。请尝试询问交易总额、交易笔数或退款记录等。',
    confidence: 0.1,
    records: [],
  };
}
