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
import MappingReviewModal from '../../components/template-mapping/MappingReviewModal';
import { aiApi } from '../../services/ai';
import { fileApi } from '../../services/file';
import { reconciliationApi } from '../../services/reconciliation';
import type {
  AIConversation,
  AIConversationMessage,
  ConversationReconcileResult,
  FileAnalyzeResult,
  FileUploadResult,
  ReconTemplateConfigItem,
  SaveBusinessOrderTemplatePayload,
  TemplateAnalyzeResult,
  TemplateMappingConfig,
  UploadFileType,
} from '../../types';
import { detectSourceTemplate, SOURCE_TEMPLATES } from '../../utils/fileSource';

const { TextArea } = Input;
const { Paragraph, Text, Title } = Typography;

interface UploadedAttachment {
  file_id: string;
  filename: string;
  type: UploadFileType;
  records: number;
  source_label?: string;
  source_kind?: string;
  detection_confidence?: number;
  channel_primary_key?: string;
}

interface PendingFileInsight {
  filename: string;
  sourceLabel?: string;
  sourceKind?: string;
  confidence?: number;
  detectedType?: string;
  guessedType?: string;
  headers?: string[];
  matchedHeaders?: string[];
}

const ALLOWED_FILE_TYPES: UploadFileType[] = [
  'JY',
  'JS',
  'SEP',
  'JZ',
  'ACC',
  'DW',
  'D0',
  'JY_FQ',
  'INVOICE',
  'BUSINESS_ORDER',
];

const FILE_TYPE_LABELS: Record<UploadFileType, string> = {
  BUSINESS_ORDER: '业务订单',
  JY: '交易明细(JY)',
  JS: '结算明细(JS)',
  SEP: '代付明细(SEP)',
  JZ: '记账文件(JZ)',
  ACC: 'ACC',
  DW: 'DW',
  D0: 'D0',
  JY_FQ: '交易分期(JY_FQ)',
  INVOICE: '发票',
};

const FILE_TYPE_OPTIONS: Array<{ label: string; value: UploadFileType }> = [
  { label: FILE_TYPE_LABELS.BUSINESS_ORDER, value: 'BUSINESS_ORDER' },
  { label: FILE_TYPE_LABELS.JY, value: 'JY' },
  { label: FILE_TYPE_LABELS.JS, value: 'JS' },
  { label: FILE_TYPE_LABELS.SEP, value: 'SEP' },
];

const CHANNEL_PRIMARY_KEY_OPTIONS: Array<{ label: string; value: string }> = [
  { label: 'merchant_order_no', value: 'merchant_order_no' },
  { label: 'lakala_serial', value: 'lakala_serial' },
  { label: 'pay_order_no', value: 'pay_order_no' },
  { label: 'external_serial', value: 'external_serial' },
  { label: 'sys_ref_no', value: 'sys_ref_no' },
];

const QUICK_QUESTIONS = [
  '今天交易总额多少？',
  '今天交易笔数多少？',
  '退款记录有哪些？',
  '本周交易趋势如何？',
];

function getPendingFileKey(file: File): string {
  return `${file.name}-${file.size}-${file.lastModified}`;
}

function toUploadedAttachment(item: {
  id: string;
  filename: string;
  type: string;
  records: number;
  source_label?: string;
  source_kind?: string;
  detection_confidence?: number;
  channel_primary_key?: string;
}): UploadedAttachment | null {
  const type = item.type as UploadFileType;
  if (!ALLOWED_FILE_TYPES.includes(type)) {
    return null;
  }

  const fallbackSource = detectSourceTemplate({
    filename: item.filename,
    fileType: type,
  });

  return {
    file_id: item.id,
    filename: item.filename,
    type,
    records: Number(item.records || 0),
    source_label: item.source_label || fallbackSource?.label,
    source_kind: item.source_kind || fallbackSource?.key,
    detection_confidence:
      typeof item.detection_confidence === 'number'
        ? item.detection_confidence
        : fallbackSource?.confidence,
    channel_primary_key: item.channel_primary_key,
  };
}

function formatUploadSummary(items: UploadedAttachment[]): string {
  const total = items.reduce((sum, item) => sum + item.records, 0);
  return `上传完成，共 ${items.length} 个文件，合计 ${total} 条记录。`;
}

function formatFileOptionLabel(file: UploadedAttachment): string {
  const sourceSuffix = file.source_label ? ` / ${file.source_label}` : '';
  return `${file.filename} (${FILE_TYPE_LABELS[file.type] || file.type}${sourceSuffix} / ${file.records} 条)`;
}

function getFileTypeTagColor(type: UploadFileType): string {
  if (type === 'BUSINESS_ORDER') {
    return 'gold';
  }
  if (type === 'JY') {
    return 'blue';
  }
  if (type === 'JS') {
    return 'purple';
  }
  return 'default';
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
    if (message.message_type !== 'file_notice' || !Array.isArray(message.meta_json?.files)) {
      return;
    }

    message.meta_json.files.forEach((item) => {
      if (
        item &&
        typeof item === 'object' &&
        'file_id' in item &&
        'filename' in item &&
        'type' in item &&
        'records' in item
      ) {
        const attachment = toUploadedAttachment({
          id: String(item.file_id),
          filename: String(item.filename),
          type: String(item.type),
          records: Number(item.records || 0),
          source_label: 'source_label' in item ? String(item.source_label || '') : undefined,
          source_kind: 'source_kind' in item ? String(item.source_kind || '') : undefined,
          detection_confidence:
            'detection_confidence' in item ? Number(item.detection_confidence || 0) : undefined,
          channel_primary_key:
            'channel_primary_key' in item ? String(item.channel_primary_key || '') : undefined,
        });

        if (attachment) {
          files.push(attachment);
        }
      }
    });
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

function toPendingInsight(file: File, analysis?: FileAnalyzeResult | null): PendingFileInsight {
  const fallbackSource = detectSourceTemplate({
    filename: file.name,
    headers: analysis?.headers,
    fileType: (analysis?.detected_type || analysis?.guessed_type || 'JY') as UploadFileType,
  });
  const detectedSource = analysis?.detected_source || fallbackSource;
  const matchedHeaders = analysis?.detected_source
    ? analysis.detected_source.matched_headers
    : fallbackSource?.matchedHeaders;

  return {
    filename: file.name,
    sourceLabel: detectedSource?.label,
    sourceKind: detectedSource?.key,
    confidence: detectedSource?.confidence,
    detectedType: analysis?.detected_type,
    guessedType: analysis?.guessed_type,
    headers: analysis?.headers,
    matchedHeaders,
  };
}

const AIQuery: React.FC = () => {
  const [messageApi, contextHolder] = message.useMessage();
  const queryClient = useQueryClient();

  const [input, setInput] = useState('');
  const [uploadModalVisible, setUploadModalVisible] = useState(false);
  const [selectedFileType, setSelectedFileType] = useState<UploadFileType>('BUSINESS_ORDER');
  const [pendingFiles, setPendingFiles] = useState<UploadFile[]>([]);
  const [pendingInsights, setPendingInsights] = useState<Record<string, PendingFileInsight>>({});
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [mappingModalVisible, setMappingModalVisible] = useState(false);
  const [templateAnalysis, setTemplateAnalysis] = useState<TemplateAnalyzeResult | null>(null);
  const [pendingBusinessFile, setPendingBusinessFile] = useState<File | null>(null);
  const [selectedBusinessFileId, setSelectedBusinessFileId] = useState<string>();
  const [selectedChannelFileId, setSelectedChannelFileId] = useState<string>();
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>();
  const [pendingChannelPrimaryKey, setPendingChannelPrimaryKey] = useState<string>('merchant_order_no');
  const [channelPrimaryKeyByFileId, setChannelPrimaryKeyByFileId] = useState<Record<string, string>>({});

  const conversationsQuery = useQuery({
    queryKey: ['ai-conversations'],
    queryFn: () => aiApi.listConversations(),
  });

  const messagesQuery = useQuery({
    queryKey: ['ai-conversation-messages', selectedConversationId],
    queryFn: () => aiApi.getConversationMessages(selectedConversationId as string),
    enabled: Boolean(selectedConversationId),
  });

  const legacyFilesQuery = useQuery({
    queryKey: ['ai-legacy-files'],
    queryFn: async () => {
      const res = await fileApi.list({ page: 1, pageSize: 200 });
      return res.list
        .map((item) =>
          toUploadedAttachment({
            id: item.id,
            filename: item.filename,
            type: item.type,
            records: item.records,
            source_label: item.source_label,
            source_kind: item.source_kind,
            detection_confidence: item.detection_confidence,
            channel_primary_key: (item as { channel_primary_key?: string }).channel_primary_key,
          }),
        )
        .filter(Boolean) as UploadedAttachment[];
    },
    enabled: selectedConversationId === 'legacy',
  });

  const reconTemplatesQuery = useQuery({
    queryKey: ['recon-template-configs', 'ORDER_VS_JY'],
    queryFn: () => reconciliationApi.listTemplateConfigs('ORDER_VS_JY'),
  });

  useEffect(() => {
    if (selectedTemplateId || !reconTemplatesQuery.data || reconTemplatesQuery.data.length === 0) {
      return;
    }
    const defaultTemplate =
      reconTemplatesQuery.data.find((item) => item.is_default) || reconTemplatesQuery.data[0];
    if (defaultTemplate?.id) {
      setSelectedTemplateId(defaultTemplate.id);
    }
  }, [reconTemplatesQuery.data, selectedTemplateId]);

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

  const uploadedFiles = useMemo(() => {
    const fromMessages = extractUploadedFiles(messagesQuery.data || []);
    if (selectedConversationId !== 'legacy') {
      return fromMessages;
    }

    const fromLegacyList = legacyFilesQuery.data || [];
    const byId = new Map<string, UploadedAttachment>();
    [...fromLegacyList, ...fromMessages].forEach((item) => {
      byId.set(item.file_id, item);
    });
    return Array.from(byId.values());
  }, [legacyFilesQuery.data, messagesQuery.data, selectedConversationId]);

  const availableFiles = useMemo(
    () => uploadedFiles.filter((item) => item.records > 0),
    [uploadedFiles],
  );

  const selectedBusinessFile = useMemo(
    () => availableFiles.find((item) => item.file_id === selectedBusinessFileId),
    [availableFiles, selectedBusinessFileId],
  );

  const selectedChannelFile = useMemo(
    () => availableFiles.find((item) => item.file_id === selectedChannelFileId),
    [availableFiles, selectedChannelFileId],
  );

  const selectableFileOptions = useMemo(
    () =>
      availableFiles.map((item) => ({
        label: formatFileOptionLabel(item),
        value: item.file_id,
      })),
    [availableFiles],
  );

  useEffect(() => {
    if (
      selectedBusinessFileId &&
      availableFiles.some((item) => item.file_id === selectedBusinessFileId)
    ) {
      return;
    }

    const fallback = [...availableFiles]
      .reverse()
      .find((item) => item.type === 'BUSINESS_ORDER');
    setSelectedBusinessFileId(fallback?.file_id);
  }, [availableFiles, selectedBusinessFileId]);

  useEffect(() => {
    if (
      selectedChannelFileId &&
      availableFiles.some((item) => item.file_id === selectedChannelFileId)
    ) {
      return;
    }

    const fallback = [...availableFiles]
      .reverse()
      .find((item) => item.type === 'JY');
    setSelectedChannelFileId(fallback?.file_id);
  }, [availableFiles, selectedChannelFileId]);

  useEffect(() => {
    const files = pendingFiles.map((item) => item.originFileObj).filter(Boolean) as File[];

    if (!uploadModalVisible || files.length === 0) {
      setPendingInsights({});
      return;
    }

    let cancelled = false;

    const analyzeFiles = async () => {
      const nextInsights: Record<string, PendingFileInsight> = {};

      await Promise.all(
        files.map(async (file) => {
          try {
            const analysis = await fileApi.analyze(file, selectedFileType);
            nextInsights[getPendingFileKey(file)] = toPendingInsight(file, analysis);
          } catch {
            nextInsights[getPendingFileKey(file)] = toPendingInsight(file, null);
          }
        }),
      );

      if (!cancelled) {
        setPendingInsights(nextInsights);
      }
    };

    analyzeFiles();

    return () => {
      cancelled = true;
    };
  }, [pendingFiles, selectedFileType, uploadModalVisible]);

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
      conversationsQuery.isLoading ||
      !conversationsQuery.data ||
      conversationsQuery.data.length > 0 ||
      createConversationMutation.isPending
    ) {
      return;
    }

    createConversationMutation.mutate('');
  }, [conversationsQuery.data, conversationsQuery.isLoading, createConversationMutation]);

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
    onSuccess: async (data, variables) => {
      const insight = pendingInsights[getPendingFileKey(variables.file)];
      const fileItem: UploadedAttachment = {
        file_id: data.file_id,
        filename: variables.file.name,
        type: 'BUSINESS_ORDER',
        records: data.records,
        source_label: insight?.sourceLabel,
        source_kind: insight?.sourceKind,
        detection_confidence: insight?.confidence,
      };

      if (data.records > 0) {
        setSelectedBusinessFileId(data.file_id);
      }

      if (selectedConversationId === 'legacy') {
        await queryClient.invalidateQueries({ queryKey: ['ai-legacy-files'] });
      } else if (selectedConversationId) {
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
      setPendingInsights({});
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
    mutationFn: async (payload: {
      files: File[];
      fileType: UploadFileType;
      channelPrimaryKey?: string;
    }) => {
      const results: UploadedAttachment[] = [];

      for (const file of payload.files) {
        const result: FileUploadResult = await fileApi.upload(file, payload.fileType);
        const insight = pendingInsights[getPendingFileKey(file)];

        results.push({
          file_id: result.file_id,
          filename: file.name,
          type: payload.fileType,
          records: result.records,
          source_label: result.source_label || insight?.sourceLabel,
          source_kind: result.source_kind || insight?.sourceKind,
          detection_confidence:
            typeof result.detection_confidence === 'number'
              ? result.detection_confidence
              : insight?.confidence,
          channel_primary_key:
            payload.fileType === 'JY' ? payload.channelPrimaryKey : undefined,
        });
      }

      return results;
    },
    onSuccess: async (items) => {
      const latestBusiness = [...items]
        .reverse()
        .find((item) => item.type === 'BUSINESS_ORDER' && item.records > 0);
      const latestChannel = [...items]
        .reverse()
        .find((item) => item.type !== 'BUSINESS_ORDER' && item.records > 0);

      if (latestBusiness) {
        setSelectedBusinessFileId(latestBusiness.file_id);
      }
      if (latestChannel) {
        setSelectedChannelFileId(latestChannel.file_id);
      }
      const channelKeyPairs = items
        .filter((item) => item.type === 'JY' && item.channel_primary_key)
        .map((item) => [item.file_id, String(item.channel_primary_key)] as const);
      if (channelKeyPairs.length > 0) {
        setChannelPrimaryKeyByFileId((prev) => {
          const next = { ...prev };
          channelKeyPairs.forEach(([fileId, key]) => {
            next[fileId] = key;
          });
          return next;
        });
      }

      if (selectedConversationId === 'legacy') {
        await queryClient.invalidateQueries({ queryKey: ['ai-legacy-files'] });
      } else if (selectedConversationId) {
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
      setPendingInsights({});
      setPendingChannelPrimaryKey('merchant_order_no');
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

      const businessFile =
        selectedBusinessFile ||
        [...availableFiles].reverse().find((item) => item.type === 'BUSINESS_ORDER');
      const channelFile =
        selectedChannelFile ||
        [...availableFiles].reverse().find((item) => item.type === 'JY');

      if (!businessFile || !channelFile) {
        throw new Error('请先选择业务方文件和渠道方文件');
      }
      if (businessFile.file_id === channelFile.file_id) {
        throw new Error('业务方文件和渠道方文件不能是同一个文件');
      }
      if (businessFile.records <= 0) {
        throw new Error('业务方文件没有有效记录，请重新上传或重新导入');
      }
      if (channelFile.records <= 0) {
        throw new Error('渠道方文件没有有效记录，请检查内容后重新上传');
      }

      const channelPrimaryKey =
        channelFile.channel_primary_key || channelPrimaryKeyByFileId[channelFile.file_id];

      return aiApi.reconcileInConversation(selectedConversationId, {
        business_file_id: businessFile.file_id,
        channel_file_id: channelFile.file_id,
        batch_type: 'ORDER_VS_JY',
        channel_primary_key: channelPrimaryKey,
        template_id: selectedTemplateId,
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
      analyzeTemplateMutation.isPending,
      importWithTemplateMutation.isPending,
      saveTemplateMutation.isPending,
      uploadMutation.isPending,
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
        messageApi.warning('业务订单模板识别暂时只支持一次上传 1 个文件。');
        return;
      }
      analyzeTemplateMutation.mutate(files[0]);
      return;
    }

    if (selectedFileType === 'JY' && !pendingChannelPrimaryKey) {
      messageApi.warning('璇烽€夋嫨娓犻亾鏂囦欢涓婚敭瀛楁');
      return;
    }

    uploadMutation.mutate({
      files,
      fileType: selectedFileType,
      channelPrimaryKey: selectedFileType === 'JY' ? pendingChannelPrimaryKey : undefined,
    });
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
    window.location.href = `/reconciliation/batches/${encodeURIComponent(batchId)}`;
  };

  const pendingInsightList = useMemo(() => {
    const files = pendingFiles.map((item) => item.originFileObj).filter(Boolean) as File[];
    return files.map((file) => ({
      key: getPendingFileKey(file),
      insight: pendingInsights[getPendingFileKey(file)],
    }));
  }, [pendingFiles, pendingInsights]);

  const templateOptions = useMemo(
    () =>
      (reconTemplatesQuery.data || []).map((item: ReconTemplateConfigItem) => ({
        value: item.id,
        label: `${item.template.name}${item.is_default ? '（默认）' : ''}`,
      })),
    [reconTemplatesQuery.data],
  );

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
              message="会话已经持久化到后端，可以跨设备继续查看和聊天。"
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
                      border:
                        selectedConversationId === item.id ? '1px solid #91caff' : '1px solid #f0f0f0',
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
              <Button onClick={() => (window.location.href = '/reconciliation')}>查看对账管理</Button>
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

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 16 }}>
            <Card>
              <Space direction="vertical" style={{ width: '100%' }} size={16}>
                <div>
                  <Title level={5} style={{ marginBottom: 4 }}>
                    {selectedConversation
                      ? buildConversationTitle(selectedConversation, messagesQuery.data || [])
                      : '加载会话中'}
                  </Title>
                  <Text type="secondary">切换左侧会话后，可以继续在原上下文里提问和执行对账。</Text>
                </div>

                <List
                  loading={messagesQuery.isLoading}
                  dataSource={messagesQuery.data || []}
                  locale={{ emptyText: '可以直接提问，也可以先上传文件再执行对账。' }}
                  renderItem={(item) => {
                    const stats = item.meta_json?.stats as Record<string, unknown> | undefined;
                    const files = Array.isArray(item.meta_json?.files)
                      ? (item.meta_json?.files as Array<Record<string, unknown>>)
                      : [];

                    return (
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
                                      <Tag color="blue">批次号 {String(item.meta_json.batch_no || '-')}</Tag>
                                      <Tag>总数 {Number(stats?.total || 0)}</Tag>
                                      <Tag color="green">匹配 {Number(stats?.match || 0)}</Tag>
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

                                {item.message_type === 'file_notice' && files.length > 0 ? (
                                  <Space direction="vertical" size={8}>
                                    <Text type="secondary">当前会话已记录以下文件：</Text>
                                    <Space wrap>
                                      {files.map((file, index) => (
                                        <Tag key={`${String(file.file_id || index)}`}>
                                          {String(file.filename || '未知文件')} ({Number(file.records || 0)} 条)
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
                    );
                  }}
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
                      if (event.shiftKey) {
                        return;
                      }
                      event.preventDefault();
                      handleSend();
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
              <Space direction="vertical" style={{ width: '100%' }} size={12}>
                <Alert
                  type="info"
                  showIcon
                  message="支持手动指定比对双方，同时会自动识别微信、拉卡拉、支付宝、美团、抖音、银行流水等来源标签。"
                />

                <div>
                  <Text strong>对账模板</Text>
                  <Select
                    style={{ width: '100%', marginTop: 8 }}
                    placeholder="请选择对账模板"
                    value={selectedTemplateId}
                    onChange={setSelectedTemplateId}
                    options={templateOptions}
                    loading={reconTemplatesQuery.isLoading}
                    allowClear
                  />
                </div>

                <div>
                  <Text strong>业务方文件</Text>
                  <Select
                    style={{ width: '100%', marginTop: 8 }}
                    placeholder="请选择业务方文件"
                    value={selectedBusinessFileId}
                    onChange={setSelectedBusinessFileId}
                    options={selectableFileOptions}
                    allowClear
                  />
                </div>

                <div>
                  <Text strong>渠道方文件</Text>
                  <Select
                    style={{ width: '100%', marginTop: 8 }}
                    placeholder="请选择渠道方文件"
                    value={selectedChannelFileId}
                    onChange={setSelectedChannelFileId}
                    options={selectableFileOptions}
                    allowClear
                  />
                </div>

                {uploadedFiles.length === 0 ? (
                  <Text type="secondary">当前会话还没有上传文件。</Text>
                ) : (
                  uploadedFiles.map((file) => {
                    const isBusinessSelected = selectedBusinessFileId === file.file_id;
                    const isChannelSelected = selectedChannelFileId === file.file_id;

                    return (
                      <Card key={file.file_id} size="small">
                        <Space direction="vertical" size={4} style={{ width: '100%' }}>
                          <Text strong>{file.filename}</Text>
                          <Space wrap>
                            <Tag color={getFileTypeTagColor(file.type)}>
                              {FILE_TYPE_LABELS[file.type] || file.type}
                            </Tag>
                            {file.source_label ? <Tag color="cyan">{file.source_label}</Tag> : null}
                            <Tag>{file.records} 条</Tag>
                            {isBusinessSelected ? <Tag color="green">当前业务方</Tag> : null}
                            {isChannelSelected ? <Tag color="blue">当前渠道方</Tag> : null}
                          </Space>
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            {file.file_id}
                          </Text>
                        </Space>
                      </Card>
                    );
                  })
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

          {selectedFileType === 'JY' ? (
            <Select
              value={pendingChannelPrimaryKey}
              onChange={setPendingChannelPrimaryKey}
              options={CHANNEL_PRIMARY_KEY_OPTIONS}
              style={{ width: '100%' }}
              placeholder="channel primary key"
            />
          ) : null}

          <Upload
            multiple={selectedFileType !== 'BUSINESS_ORDER'}
            beforeUpload={() => false}
            fileList={pendingFiles}
            onChange={({ fileList }) => setPendingFiles(fileList)}
            accept={selectedFileType === 'BUSINESS_ORDER' ? '.txt,.csv,.xlsx,.xls' : '.txt,.csv,.tsv,.dat,.xlsx,.xls'}
          >
            <Button icon={<UploadOutlined />}>选择文件</Button>
          </Upload>

          {pendingInsightList.length > 0 ? (
            <Card size="small" title="自动识别结果">
              <Space direction="vertical" style={{ width: '100%' }} size={12}>
                {pendingInsightList.map(({ key, insight }) => (
                  <div key={key}>
                    <Text strong>{insight?.filename || key}</Text>
                    <div style={{ marginTop: 8 }}>
                      <Space wrap>
                        {insight?.detectedType ? <Tag color="blue">检测类型 {insight.detectedType}</Tag> : null}
                        {insight?.guessedType ? <Tag>文件猜测 {insight.guessedType}</Tag> : null}
                        {insight?.sourceLabel ? <Tag color="cyan">{insight.sourceLabel}</Tag> : <Tag>来源待确认</Tag>}
                        {typeof insight?.confidence === 'number' ? (
                          <Tag>{Math.round(insight.confidence * 100)}%</Tag>
                        ) : null}
                      </Space>
                    </div>
                    {insight?.matchedHeaders?.length ? (
                      <Text type="secondary" style={{ display: 'block', marginTop: 4 }}>
                        命中字段：{insight.matchedHeaders.join('、')}
                      </Text>
                    ) : null}
                  </div>
                ))}
              </Space>
            </Card>
          ) : null}

          <Alert
            type="warning"
            showIcon
            message={
              selectedFileType === 'BUSINESS_ORDER'
                ? '业务订单会先做模板识别；若未命中模板，会弹出人工确认映射。'
                : '渠道文件会先做来源识别，再按所选文件类型上传解析。'
            }
          />

          <Alert
            type="info"
            showIcon
            message={`当前已支持来源标签：${SOURCE_TEMPLATES.map((item) => item.label).join('、')}`}
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
