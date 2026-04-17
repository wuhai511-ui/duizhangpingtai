import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Input,
  List,
  Modal,
  Select,
  Space,
  Spin,
  Tag,
  Typography,
  Upload,
  message,
} from 'antd';
import type { UploadFile } from 'antd';
import {
  MessageOutlined,
  PlusOutlined,
  RobotOutlined,
  SendOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { aiApi } from '../../services/ai';
import { fileApi } from '../../services/file';
import MappingReviewModal from '../../components/template-mapping/MappingReviewModal';
import type {
  AIConversation,
  AIConversationMessage,
  ConversationReconcileResult,
  FileUploadResult,
  SaveBusinessOrderTemplatePayload,
  TemplateAnalyzeResult,
  TemplateMappingConfig,
  UploadFileType,
} from '../../types';

const { TextArea } = Input;
const { Paragraph, Text, Title } = Typography;

interface UploadedAttachment {
  file_id: string;
  filename: string;
  type: UploadFileType;
  records: number;
}

const FILE_TYPE_OPTIONS: Array<{ label: string; value: UploadFileType }> = [
  { label: '业务订单', value: 'BUSINESS_ORDER' },
  { label: '交易明细(JY)', value: 'JY' },
  { label: '结算明细(JS)', value: 'JS' },
  { label: '代付明细(SEP)', value: 'SEP' },
];

const QUICK_QUESTIONS = [
  '今天交易总额多少？',
  '今天交易笔数多少？',
  '退款记录有哪些？',
  '本周交易趋势如何？',
];

function formatUploadSummary(items: UploadedAttachment[]): string {
  const total = items.reduce((sum, item) => sum + item.records, 0);
  return `上传完成，共 ${items.length} 个文件，合计 ${total} 条记录。`;
}

async function toBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return window.btoa(binary);
}

function buildConversationTitle(conversation: AIConversation, messages: AIConversationMessage[]): string {
  if (conversation.title && conversation.title !== '新会话') {
    return conversation.title;
  }

  const firstUserMessage = messages.find((item) => item.role === 'user');
  return firstUserMessage?.content || conversation.title || '新会话';
}

function extractUploadedFiles(messages: AIConversationMessage[]): UploadedAttachment[] {
  const files: UploadedAttachment[] = [];

  messages.forEach((message) => {
    if (message.message_type === 'file_notice' && Array.isArray(message.meta_json?.files)) {
      message.meta_json.files.forEach((item) => {
        if (
          item &&
          typeof item === 'object' &&
          'file_id' in item &&
          'filename' in item &&
          'type' in item &&
          'records' in item
        ) {
          files.push({
            file_id: String(item.file_id),
            filename: String(item.filename),
            type: item.type as UploadFileType,
            records: Number(item.records || 0),
          });
        }
      });
    }
  });

  const byId = new Map(files.map((item) => [item.file_id, item]));
  return Array.from(byId.values());
}

function getConversationPreview(messages: AIConversationMessage[]): string {
  const lastMessage = [...messages].reverse().find((item) => item.content?.trim());
  if (!lastMessage) {
    return '新会话';
  }

  if (lastMessage.message_type === 'reconcile_result' && lastMessage.meta_json?.batch_no) {
    return `对账结果 ${String(lastMessage.meta_json.batch_no)}`;
  }

  if (lastMessage.message_type === 'file_notice' && Array.isArray(lastMessage.meta_json?.files)) {
    const firstFile = lastMessage.meta_json.files[0] as { filename?: string } | undefined;
    return firstFile?.filename ? `已上传 ${firstFile.filename}` : '已上传文件';
  }

  return lastMessage.content.length > 28 ? `${lastMessage.content.slice(0, 28)}...` : lastMessage.content;
}

const AIQuery: React.FC = () => {
  const [messageApi, contextHolder] = message.useMessage();
  const queryClient = useQueryClient();
  const [input, setInput] = useState('');
  const [uploadModalVisible, setUploadModalVisible] = useState(false);
  const [selectedFileType, setSelectedFileType] = useState<UploadFileType>('BUSINESS_ORDER');
  const [pendingFiles, setPendingFiles] = useState<UploadFile[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [mappingModalVisible, setMappingModalVisible] = useState(false);
  const [templateAnalysis, setTemplateAnalysis] = useState<TemplateAnalyzeResult | null>(null);
  const [pendingBusinessFile, setPendingBusinessFile] = useState<File | null>(null);

  const conversationsQuery = useQuery({
    queryKey: ['ai-conversations'],
    queryFn: () => aiApi.listConversations(),
  });

  const messagesQuery = useQuery({
    queryKey: ['ai-conversation-messages', selectedConversationId],
    queryFn: () => aiApi.getConversationMessages(selectedConversationId as string),
    enabled: Boolean(selectedConversationId),
  });

  useEffect(() => {
    if (selectedConversationId || !conversationsQuery.data) {
      return;
    }

    if (conversationsQuery.data.length > 0) {
      setSelectedConversationId(conversationsQuery.data[0].id);
    }
  }, [conversationsQuery.data, selectedConversationId]);

  const selectedConversation = useMemo(
    () => conversationsQuery.data?.find((item) => item.id === selectedConversationId) || null,
    [conversationsQuery.data, selectedConversationId],
  );

  const uploadedFiles = useMemo(
    () => extractUploadedFiles(messagesQuery.data || []),
    [messagesQuery.data],
  );

  const createConversationMutation = useMutation({
    mutationFn: (title?: string) => aiApi.createConversation(title ? { title } : {}),
    onSuccess: async (conversation) => {
      await queryClient.invalidateQueries({ queryKey: ['ai-conversations'] });
      setSelectedConversationId(conversation.id);
    },
    onError: (error) => {
      messageApi.error(`创建会话失败：${(error as Error).message}`);
    },
  });

  useEffect(() => {
    if (
      !conversationsQuery.isLoading &&
      conversationsQuery.data &&
      conversationsQuery.data.length === 0 &&
      !createConversationMutation.isPending
    ) {
      createConversationMutation.mutate('');
    }
  }, [
    conversationsQuery.data,
    conversationsQuery.isLoading,
    createConversationMutation,
  ]);

  const sendMessageMutation = useMutation({
    mutationFn: async (question: string) => {
      if (!selectedConversationId) {
        throw new Error('请先创建会话');
      }
      return aiApi.sendConversationMessage(selectedConversationId, { question });
    },
    onSuccess: async () => {
      setInput('');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['ai-conversation-messages', selectedConversationId] }),
        queryClient.invalidateQueries({ queryKey: ['ai-conversations'] }),
      ]);
    },
    onError: (error) => {
      messageApi.error(`发送失败：${(error as Error).message}`);
    },
  });

  const importWithTemplateMutation = useMutation({
    mutationFn: async (payload: { templateId: string; templateName: string; file: File }) => {
      return aiApi.importWithTemplate({
        template_id: payload.templateId,
        filename: payload.file.name,
        content_base64: await toBase64(payload.file),
      });
    },
    onSuccess: (data, variables) => {
      const fileItem: UploadedAttachment = {
        file_id: data.file_id,
        filename: variables.file.name,
        type: 'BUSINESS_ORDER',
        records: data.records,
      };
      if (selectedConversationId) {
        aiApi
          .createFileNotice(selectedConversationId, { files: [fileItem] })
          .then(() =>
            Promise.all([
              queryClient.invalidateQueries({ queryKey: ['ai-conversation-messages', selectedConversationId] }),
              queryClient.invalidateQueries({ queryKey: ['ai-conversations'] }),
            ]),
          )
          .catch((error) => messageApi.warning(`文件上下文保存失败：${(error as Error).message}`));
      }
      messageApi.success(`业务订单已按模板“${variables.templateName}”导入，生成 ${data.records} 条记录。`);
      setMappingModalVisible(false);
      setTemplateAnalysis(null);
      setPendingBusinessFile(null);
      setUploadModalVisible(false);
      setPendingFiles([]);
    },
    onError: (error) => {
      messageApi.error(`模板导入失败：${(error as Error).message}`);
    },
  });

  const saveTemplateMutation = useMutation({
    mutationFn: async (payload: {
      templateName: string;
      mapping: TemplateMappingConfig;
      saveAsDefault: boolean;
      file: File;
    }) => {
      if (!templateAnalysis) {
        throw new Error('缺少模板分析结果');
      }

      const request: SaveBusinessOrderTemplatePayload = {
        name: payload.templateName,
        field_config: payload.mapping,
        profile: templateAnalysis.profile,
        confidence: templateAnalysis.ai_mapping?.confidence,
        is_default: payload.saveAsDefault,
      };

      const template = await aiApi.saveBusinessOrderTemplate(request);
      return { template, file: payload.file };
    },
    onSuccess: ({ template, file }) => {
      importWithTemplateMutation.mutate({
        templateId: template.id,
        templateName: template.name,
        file,
      });
    },
    onError: (error) => {
      messageApi.error(`模板保存失败：${(error as Error).message}`);
    },
  });

  const analyzeTemplateMutation = useMutation({
    mutationFn: async (file: File) => {
      const analysis = await aiApi.analyzeBusinessOrderTemplate(file);
      return { file, analysis };
    },
    onSuccess: ({ file, analysis }) => {
      setPendingBusinessFile(file);
      setTemplateAnalysis(analysis);

      if (analysis.matched_template) {
        importWithTemplateMutation.mutate({
          templateId: analysis.matched_template.id,
          templateName: analysis.matched_template.name,
          file,
        });
        return;
      }

      setMappingModalVisible(true);
    },
    onError: (error) => {
      messageApi.error(`模板分析失败：${(error as Error).message}`);
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async (payload: { files: File[]; fileType: UploadFileType }) => {
      const results: UploadedAttachment[] = [];
      for (const file of payload.files) {
        const result: FileUploadResult = await fileApi.upload(file, payload.fileType);
        results.push({
          file_id: result.file_id,
          filename: file.name,
          type: payload.fileType,
          records: result.records,
        });
      }
      return results;
    },
    onSuccess: (items) => {
      if (selectedConversationId) {
        aiApi
          .createFileNotice(selectedConversationId, { files: items })
          .then(() =>
            Promise.all([
              queryClient.invalidateQueries({ queryKey: ['ai-conversation-messages', selectedConversationId] }),
              queryClient.invalidateQueries({ queryKey: ['ai-conversations'] }),
            ]),
          )
          .catch((error) => messageApi.warning(`文件上下文保存失败：${(error as Error).message}`));
      }
      messageApi.success(formatUploadSummary(items));
      if (items.some((item) => item.records === 0)) {
        messageApi.warning('存在 0 条记录的文件，请检查文件类型或表头后重新上传。');
      }
      setUploadModalVisible(false);
      setPendingFiles([]);
    },
    onError: (error) => {
      messageApi.error(`上传失败：${(error as Error).message}`);
    },
  });

  const reconcileMutation = useMutation({
    mutationFn: async () => {
      if (!selectedConversationId) {
        throw new Error('请先选择会话');
      }

      const businessFile = [...uploadedFiles].reverse().find((item) => item.type === 'BUSINESS_ORDER');
      const jyFile = [...uploadedFiles].reverse().find((item) => item.type === 'JY');

      if (!businessFile || !jyFile) {
        throw new Error('请先上传业务订单和交易明细(JY)文件');
      }
      if (businessFile.records <= 0) {
        throw new Error('业务订单文件暂无有效记录，请重新导入后再执行对账');
      }
      if (jyFile.records <= 0) {
        throw new Error('交易明细(JY)文件暂无有效记录，请检查文件内容后重新上传');
      }

      return aiApi.reconcileInConversation(selectedConversationId, {
        business_file_id: businessFile.file_id,
        channel_file_id: jyFile.file_id,
        batch_type: 'ORDER_VS_JY',
      });
    },
    onSuccess: async (result: ConversationReconcileResult) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['ai-conversation-messages', selectedConversationId] }),
        queryClient.invalidateQueries({ queryKey: ['ai-conversations'] }),
      ]);
      messageApi.success(`对账完成，批次号 ${result.batch_no}`);
    },
    onError: (error) => {
      messageApi.error(`执行对账失败：${(error as Error).message}`);
    },
  });

  const pendingUpload = useMemo(
    () =>
      uploadMutation.isPending ||
      analyzeTemplateMutation.isPending ||
      saveTemplateMutation.isPending ||
      importWithTemplateMutation.isPending,
    [
      uploadMutation.isPending,
      analyzeTemplateMutation.isPending,
      saveTemplateMutation.isPending,
      importWithTemplateMutation.isPending,
    ],
  );

  const handleSend = () => {
    const question = input.trim();
    if (!question) {
      return;
    }
    sendMessageMutation.mutate(question);
  };

  const handleConfirmUpload = () => {
    const files = pendingFiles.map((file) => file.originFileObj).filter(Boolean) as File[];

    if (files.length === 0) {
      messageApi.warning('请先选择文件');
      return;
    }

    if (selectedFileType === 'BUSINESS_ORDER') {
      if (files.length !== 1) {
        messageApi.warning('业务订单模板学习暂时只支持一次上传 1 个文件');
        return;
      }
      analyzeTemplateMutation.mutate(files[0]);
      return;
    }

    uploadMutation.mutate({ files, fileType: selectedFileType });
  };

  const handleMappingSubmit = (payload: {
    templateName: string;
    mapping: TemplateMappingConfig;
    saveAsDefault: boolean;
  }) => {
    if (!pendingBusinessFile) {
      messageApi.error('缺少待导入的业务订单文件');
      return;
    }

    saveTemplateMutation.mutate({ ...payload, file: pendingBusinessFile });
  };

  const openReconciliationDetail = (batchId: string) => {
    window.location.href = `/reconciliation-batch.html?batch_id=${encodeURIComponent(batchId)}`;
  };

  return (
    <div>
      {contextHolder}
      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 16 }}>
        <Card
          title="历史会话"
          extra={
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => createConversationMutation.mutate('')}
              loading={createConversationMutation.isPending}
            >
              新建
            </Button>
          }
        >
          <Space direction="vertical" style={{ width: '100%' }} size={12}>
            <Alert
              type="info"
              showIcon
              message="会话已持久化到后端，可跨设备继续查看和聊天。"
            />
            <List
              loading={conversationsQuery.isLoading}
              dataSource={conversationsQuery.data || []}
              locale={{ emptyText: '暂无会话' }}
              renderItem={(item) => {
                const messagesForConversation =
                  selectedConversationId === item.id ? messagesQuery.data || [] : [];
                const title = buildConversationTitle(item, messagesForConversation);
                const preview =
                  item.latest_message_preview ||
                  (selectedConversationId === item.id ? getConversationPreview(messagesForConversation) : '新会话');
                return (
                  <List.Item
                    style={{
                      cursor: 'pointer',
                      padding: 12,
                      borderRadius: 12,
                      background: selectedConversationId === item.id ? '#e6f4ff' : '#fafafa',
                      border: selectedConversationId === item.id ? '1px solid #91caff' : '1px solid #f0f0f0',
                    }}
                    onClick={() => setSelectedConversationId(item.id)}
                  >
                    <Space align="start">
                      <MessageOutlined />
                      <div>
                        <Text strong>{title}</Text>
                        <div>
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            {preview}
                          </Text>
                        </div>
                        <div>
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            {new Date(item.last_message_at).toLocaleString()}
                          </Text>
                        </div>
                      </div>
                    </Space>
                  </List.Item>
                );
              }}
            />
          </Space>
        </Card>

        <div style={{ display: 'grid', gridTemplateRows: 'auto 1fr', gap: 16 }}>
          <Card>
            <Space wrap>
              <Text type="secondary">快捷问题：</Text>
              {QUICK_QUESTIONS.map((question) => (
                <Button key={question} onClick={() => setInput(question)}>
                  {question}
                </Button>
              ))}
              <Button onClick={() => (window.location.href = '/reconciliation.html')}>查看对账管理</Button>
              <Button onClick={() => setUploadModalVisible(true)} disabled={!selectedConversation}>
                上传对账文件
              </Button>
              <Button
                type="primary"
                onClick={() => reconcileMutation.mutate()}
                loading={reconcileMutation.isPending}
                disabled={!selectedConversation}
              >
                执行对账
              </Button>
            </Space>
          </Card>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16 }}>
            <Card>
              <Space direction="vertical" style={{ width: '100%' }} size={16}>
                <div>
                  <Title level={5} style={{ marginBottom: 4 }}>
                    {selectedConversation
                      ? buildConversationTitle(selectedConversation, messagesQuery.data || [])
                      : '加载会话中'}
                  </Title>
                  <Text type="secondary">切换左侧会话后，可以继续在原上下文中提问和执行对账。</Text>
                </div>

                <List
                  loading={messagesQuery.isLoading}
                  dataSource={messagesQuery.data || []}
                  locale={{ emptyText: '可以直接提问，也可以先上传文件再执行对账。' }}
                  renderItem={(item) => (
                    <List.Item style={{ border: 'none' }}>
                      <div
                        style={{
                          width: '100%',
                          display: 'flex',
                          justifyContent: item.role === 'user' ? 'flex-end' : 'flex-start',
                        }}
                      >
                        <div
                          style={{
                            maxWidth: '85%',
                            background: item.role === 'user' ? '#e6f4ff' : '#f6ffed',
                            borderRadius: 12,
                            padding: 16,
                          }}
                        >
                          <Space align="start">
                            {item.role === 'assistant' ? <RobotOutlined /> : <Text strong>我</Text>}
                            <div>
                              <Paragraph style={{ marginBottom: item.sql_text ? 12 : 0 }}>{item.content}</Paragraph>
                              {item.sql_text ? <Paragraph code>{item.sql_text}</Paragraph> : null}
                              {item.message_type === 'reconcile_result' && item.meta_json ? (
                                <Space direction="vertical" size={8}>
                                  <Space wrap>
                                    <Tag color="blue">批次号 {(item.meta_json.batch_no as string) || '-'}</Tag>
                                    <Tag>总数 {(item.meta_json.stats as Record<string, unknown> | undefined)?.total as number}</Tag>
                                    <Tag color="green">匹配 {(item.meta_json.stats as Record<string, unknown> | undefined)?.match as number}</Tag>
                                  </Space>
                                  <Button
                                    type="link"
                                    style={{ padding: 0 }}
                                    onClick={() => openReconciliationDetail(String(item.meta_json?.batch_id || ''))}
                                  >
                                    查看对账详情
                                  </Button>
                                </Space>
                              ) : null}
                              {item.message_type === 'file_notice' && Array.isArray(item.meta_json?.files) ? (
                                <Space direction="vertical" size={8}>
                                  <Text type="secondary">当前会话已记录以下文件：</Text>
                                  <Space wrap>
                                    {item.meta_json.files.map((file, index) => (
                                      <Tag key={`${String((file as { file_id?: string }).file_id || index)}`}>
                                        {String((file as { filename?: string }).filename || '未知文件')} (
                                        {Number((file as { records?: number }).records || 0)}条)
                                      </Tag>
                                    ))}
                                  </Space>
                                </Space>
                              ) : null}
                            </div>
                          </Space>
                        </div>
                      </div>
                    </List.Item>
                  )}
                />

                {(sendMessageMutation.isPending || pendingUpload) && (
                  <div style={{ textAlign: 'center', padding: 16 }}>
                    <Spin />
                  </div>
                )}

                <Space.Compact style={{ width: '100%' }}>
                  <TextArea
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                    placeholder="输入你的问题，例如：今天交易总额多少？"
                    autoSize={{ minRows: 1, maxRows: 4 }}
                    disabled={!selectedConversation}
                    onPressEnter={(event) => {
                      if (!event.shiftKey) {
                        event.preventDefault();
                        handleSend();
                      }
                    }}
                  />
                  <Button
                    type="primary"
                    icon={<SendOutlined />}
                    onClick={handleSend}
                    loading={sendMessageMutation.isPending}
                    disabled={!selectedConversation}
                  >
                    发送
                  </Button>
                </Space.Compact>
              </Space>
            </Card>

            <Card title="当前会话文件状态">
              <Space direction="vertical" style={{ width: '100%' }}>
                <Alert
                  type="info"
                  showIcon
                  message="推荐顺序：先上传业务订单，再上传 JY 交易明细，最后执行对账。"
                />
                {uploadedFiles.length === 0 ? (
                  <Text type="secondary">当前会话还没有上传文件。</Text>
                ) : (
                  uploadedFiles.map((file) => (
                    <Card key={file.file_id} size="small">
                      <Space direction="vertical" size={4} style={{ width: '100%' }}>
                        <Text strong>{file.filename}</Text>
                        <Space wrap>
                          <Tag color={file.type === 'BUSINESS_ORDER' ? 'gold' : 'blue'}>{file.type}</Tag>
                          <Tag>{file.records} 条</Tag>
                          <Tag color="green">{file.file_id}</Tag>
                        </Space>
                      </Space>
                    </Card>
                  ))
                )}
              </Space>
            </Card>
          </div>
        </div>
      </div>

      <Modal
        title="上传文件"
        open={uploadModalVisible}
        onCancel={() => setUploadModalVisible(false)}
        onOk={handleConfirmUpload}
        okText="开始处理"
        cancelText="取消"
        confirmLoading={pendingUpload}
      >
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Select
            value={selectedFileType}
            onChange={setSelectedFileType}
            options={FILE_TYPE_OPTIONS}
            style={{ width: '100%' }}
          />
          <Upload
            multiple={selectedFileType !== 'BUSINESS_ORDER'}
            beforeUpload={() => false}
            fileList={pendingFiles}
            onChange={({ fileList }) => setPendingFiles(fileList)}
            accept={selectedFileType === 'BUSINESS_ORDER' ? '.txt,.csv,.xlsx,.xls' : '.txt,.csv,.dat,.xlsx,.xls'}
          >
            <Button icon={<UploadOutlined />}>选择文件</Button>
          </Upload>
          <Alert
            type="warning"
            showIcon
            message={
              selectedFileType === 'BUSINESS_ORDER'
                ? '业务订单会先做模板识别，未命中模板时会打开人工确认弹窗。'
                : '渠道文件按选定类型直接上传。'
            }
          />
          <Alert
            type="info"
            showIcon
            message="上传成功后，文件会作为会话上下文写入历史消息，跨设备切换时也能恢复。"
          />
        </Space>
      </Modal>

      <MappingReviewModal
        open={mappingModalVisible}
        analysis={templateAnalysis}
        loading={saveTemplateMutation.isPending || importWithTemplateMutation.isPending}
        onCancel={() => setMappingModalVisible(false)}
        onSubmit={handleMappingSubmit}
      />
    </div>
  );
};

export default AIQuery;
