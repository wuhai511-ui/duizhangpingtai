import api from './api';
import type {
  AIConversation,
  AIConversationMessage,
  AIQueryResult,
  ApiResponse,
  ConversationReconcileResult,
  ConversationReply,
  ReconcileRequest,
  ReconcileResult,
  SaveBusinessOrderTemplatePayload,
  SavedTemplate,
  TemplateAnalyzeResult,
  TemplateImportPayload,
  TemplateImportResult,
} from '../types';

function isNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  return (error as { response?: { status?: number } }).response?.status === 404;
}

function buildLegacyConversation(title?: string): AIConversation {
  const now = new Date().toISOString();
  return {
    id: 'legacy',
    title: title || '默认会话',
    last_message_at: now,
    created_at: now,
    updated_at: now,
  };
}

export const aiApi = {
  listConversations: async (): Promise<AIConversation[]> => {
    try {
      const response = await api.get<ApiResponse<AIConversation[]>>('/ai/conversations');
      return response.data.data;
    } catch (error) {
      if (isNotFoundError(error)) {
        return [buildLegacyConversation()];
      }
      throw error;
    }
  },

  createConversation: async (payload?: {
    title?: string;
    merchant_id?: string;
    created_by?: string;
  }): Promise<AIConversation> => {
    try {
      const response = await api.post<ApiResponse<AIConversation>>('/ai/conversations', payload || {});
      return response.data.data;
    } catch (error) {
      if (isNotFoundError(error)) {
        return buildLegacyConversation(payload?.title);
      }
      throw error;
    }
  },

  getConversationMessages: async (conversationId: string): Promise<AIConversationMessage[]> => {
    if (conversationId === 'legacy') {
      return [];
    }
    try {
      const response = await api.get<ApiResponse<AIConversationMessage[]>>(
        `/ai/conversations/${conversationId}/messages`,
      );
      return response.data.data;
    } catch (error) {
      if (isNotFoundError(error)) {
        return [];
      }
      throw error;
    }
  },

  sendConversationMessage: async (
    conversationId: string,
    payload: { question: string; merchantId?: string },
  ): Promise<ConversationReply> => {
    const now = new Date().toISOString();
    const toLegacyReply = async (): Promise<ConversationReply> => {
      const fallback = await api.post<ApiResponse<AIQueryResult>>('/ai/query', {
        question: payload.question,
        merchantId: payload.merchantId,
      });
      return {
        user_message: {
          id: `legacy-user-${Date.now()}`,
          conversation_id: 'legacy',
          role: 'user',
          message_type: 'text',
          content: payload.question,
          created_at: now,
        },
        assistant_message: {
          id: `legacy-assistant-${Date.now() + 1}`,
          conversation_id: 'legacy',
          role: 'assistant',
          message_type: 'sql_result',
          content: fallback.data.data.answer || '',
          sql_text: fallback.data.data.sql || null,
          meta_json: { records: fallback.data.data.records || [] },
          created_at: now,
        },
      };
    };

    if (conversationId === 'legacy') {
      return toLegacyReply();
    }
    try {
      const response = await api.post<ApiResponse<ConversationReply>>(
        `/ai/conversations/${conversationId}/messages`,
        payload,
      );
      return response.data.data;
    } catch (error) {
      if (isNotFoundError(error)) {
        return toLegacyReply();
      }
      throw error;
    }
  },

  createFileNotice: async (
    conversationId: string,
    payload: {
      files: Array<{
        file_id: string;
        filename: string;
        type: string;
        records: number;
        source_label?: string;
        source_kind?: string;
        detection_confidence?: number;
      }>;
    },
  ): Promise<AIConversationMessage> => {
    if (conversationId === 'legacy') {
      return {
        id: `legacy-file-${Date.now()}`,
        conversation_id: 'legacy',
        role: 'assistant',
        message_type: 'file_notice',
        content: '已记录上传文件',
        meta_json: { files: payload.files },
        created_at: new Date().toISOString(),
      };
    }
    try {
      const response = await api.post<ApiResponse<AIConversationMessage>>(
        `/ai/conversations/${conversationId}/file-notices`,
        payload,
      );
      return response.data.data;
    } catch (error) {
      if (isNotFoundError(error)) {
        return {
          id: `legacy-file-${Date.now()}`,
          conversation_id: 'legacy',
          role: 'assistant',
          message_type: 'file_notice',
          content: '已记录上传文件',
          meta_json: { files: payload.files },
          created_at: new Date().toISOString(),
        };
      }
      throw error;
    }
  },

  reconcileInConversation: async (
    conversationId: string,
    payload: ReconcileRequest,
  ): Promise<ConversationReconcileResult> => {
    const toLegacyReconcile = async (): Promise<ConversationReconcileResult> => {
      const fallback = await api.post<ApiResponse<ReconcileResult>>('/ai/reconcile', payload);
      const now = new Date().toISOString();
      return {
        batch_id: fallback.data.data.batch_id,
        batch_no: fallback.data.data.batch_no,
        stats: fallback.data.data.stats,
        message: {
          id: `legacy-reconcile-${Date.now()}`,
          conversation_id: 'legacy',
          role: 'assistant',
          message_type: 'reconcile_result',
          content: fallback.data.data.message || `对账完成，批次号 ${fallback.data.data.batch_no}`,
          meta_json: {
            batch_id: fallback.data.data.batch_id,
            batch_no: fallback.data.data.batch_no,
            stats: fallback.data.data.stats,
          },
          created_at: now,
        },
      };
    };

    if (conversationId === 'legacy') {
      return toLegacyReconcile();
    }
    try {
      const response = await api.post<ApiResponse<ConversationReconcileResult>>(
        `/ai/conversations/${conversationId}/reconcile`,
        payload,
      );
      return response.data.data;
    } catch (error) {
      if (isNotFoundError(error)) {
        return toLegacyReconcile();
      }
      throw error;
    }
  },

  query: async (question: string, merchantId?: string): Promise<AIQueryResult> => {
    const response = await api.post<ApiResponse<AIQueryResult>>('/ai/query', {
      question,
      merchantId,
    });
    return response.data.data;
  },

  health: async (): Promise<{ llmAvailable: boolean; llm: string; model?: string }> => {
    const response = await api.get<
      ApiResponse<{ llmAvailable: boolean; llm: string; model?: string }>
    >('/ai/health');
    return response.data.data;
  },

  analyzeBusinessOrderTemplate: async (file: File): Promise<TemplateAnalyzeResult> => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('file_type', 'BUSINESS_ORDER');

    const response = await api.post<ApiResponse<TemplateAnalyzeResult>>(
      '/ai/template/analyze',
      formData,
    );

    return response.data.data;
  },

  saveBusinessOrderTemplate: async (
    payload: SaveBusinessOrderTemplatePayload,
  ): Promise<SavedTemplate> => {
    const response = await api.post<ApiResponse<SavedTemplate>>(
      '/templates/business-order',
      payload,
    );
    return response.data.data;
  },

  importWithTemplate: async (
    payload: TemplateImportPayload,
  ): Promise<TemplateImportResult> => {
    const response = await api.post<ApiResponse<TemplateImportResult>>(
      '/files/import-with-template',
      payload,
    );
    return response.data.data;
  },

  reconcile: async (payload: ReconcileRequest): Promise<ReconcileResult> => {
    const response = await api.post<ApiResponse<ReconcileResult>>('/ai/reconcile', payload);
    return response.data.data;
  },
};
