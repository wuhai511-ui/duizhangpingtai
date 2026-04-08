import React, { useState } from 'react';
import { Card, Input, Button, List, Typography, Space, Tag, Spin, Alert } from 'antd';
import { SendOutlined, RobotOutlined } from '@ant-design/icons';
import { useMutation } from '@tanstack/react-query';
import { aiApi } from '../../services/ai';

const { TextArea } = Input;
const { Text, Paragraph } = Typography;

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sql?: string;
  timestamp: Date;
}

const AIQuery: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');

  const queryMutation = useMutation({
    mutationFn: (question: string) => aiApi.query(question),
    onSuccess: (data) => {
      const assistantMessage: Message = {
        id: Date.now().toString(),
        role: 'assistant',
        content: data.answer,
        sql: data.sql,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMessage]);
    },
    onError: (error) => {
      const errorMessage: Message = {
        id: Date.now().toString(),
        role: 'assistant',
        content: `查询失败：${(error as Error).message}`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    },
  });

  const handleSend = () => {
    if (!input.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    queryMutation.mutate(input);
    setInput('');
  };

  const quickQuestions = [
    '今天交易总额多少？',
    '今天交易笔数多少？',
    '退款记录有哪些？',
    '本周交易趋势如何？',
  ];

  return (
    <div style={{ display: 'flex', gap: 16, height: 'calc(100vh - 200px)' }}>
      <Card style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div style={{ marginBottom: 16 }}>
          <Space wrap>
            <Text type="secondary">快捷问题：</Text>
            {quickQuestions.map((q) => (
              <Tag
                key={q}
                style={{ cursor: 'pointer' }}
                onClick={() => {
                  setInput(q);
                }}
              >
                {q}
              </Tag>
            ))}
          </Space>
        </div>

        <div style={{ flex: 1, overflow: 'auto', marginBottom: 16 }}>
          <List
            dataSource={messages}
            renderItem={(item) => (
              <List.Item style={{ border: 'none', padding: '8px 0' }}>
                <div
                  style={{
                    display: 'flex',
                    gap: 8,
                    width: '100%',
                    flexDirection: item.role === 'user' ? 'row-reverse' : 'row',
                  }}
                >
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: '50%',
                      background: item.role === 'user' ? '#1890ff' : '#87e8de',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#fff',
                    }}
                  >
                    {item.role === 'user' ? '我' : <RobotOutlined />}
                  </div>
                  <div style={{ flex: 1 }}>
                    <Card size="small" style={{ background: item.role === 'user' ? '#e6f7ff' : '#f5f5f5' }}>
                      <Paragraph>{item.content}</Paragraph>
                      {item.sql && (
                        <Paragraph code style={{ marginTop: 8, background: '#f0f0f0', padding: 8 }}>
                          {item.sql}
                        </Paragraph>
                      )}
                    </Card>
                  </div>
                </div>
              </List.Item>
            )}
          />
          {queryMutation.isPending && (
            <div style={{ textAlign: 'center', padding: 16 }}>
              <Spin tip="AI正在思考..." />
            </div>
          )}
        </div>

        <Space.Compact style={{ width: '100%' }}>
          <TextArea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="输入您的问题，例如：今天交易总额多少？"
            autoSize={{ minRows: 1, maxRows: 4 }}
            onPressEnter={(e) => {
              if (!e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
          />
          <Button type="primary" icon={<SendOutlined />} onClick={handleSend} loading={queryMutation.isPending}>
            发送
          </Button>
        </Space.Compact>
      </Card>

      <Card title="使用说明" style={{ width: 300 }}>
        <Alert
          type="info"
          message="AI查询功能"
          description="使用自然语言查询交易数据，支持查询交易总额、笔数、退款记录等。"
          style={{ marginBottom: 16 }}
        />
        <Paragraph type="secondary">
          <ul style={{ paddingLeft: 16 }}>
            <li>支持中文自然语言提问</li>
            <li>自动生成SQL查询语句</li>
            <li>结果以表格或图表展示</li>
          </ul>
        </Paragraph>
      </Card>
    </div>
  );
};

export default AIQuery;
