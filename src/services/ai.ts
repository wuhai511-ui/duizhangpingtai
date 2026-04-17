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

export const aiApi = {
  listConversations: async (): Promise<AIConversation[]> => {
    const response = await api.get<ApiResponse<AIConversation[]>>('/ai/conversations');
    return response.data.data;
  },

  createConversation: async (payload?: {
    title?: string;
    merchant_id?: string;
    created_by?: string;
  }): Promise<AIConversation> => {
    const response = await api.post<ApiResponse<AIConversation>>('/ai/conversations', payload || {});
    return response.data.data;
  },

  getConversationMessages: async (conversationId: string): Promise<AIConversationMessage[]> => {
    const response = await api.get<ApiResponse<AIConversationMessage[]>>(
      `/ai/conversations/${conversationId}/messages`,
    );
    return response.data.data;
  },

  sendConversationMessage: async (
    conversationId: string,
    payload: { question: string; merchantId?: string },
  ): Promise<ConversationReply> => {
    const response = await api.post<ApiResponse<ConversationReply>>(
      `/ai/conversations/${conversationId}/messages`,
      payload,
    );
    return response.data.data;
  },

  createFileNotice: async (
    conversationId: string,
    payload: { files: Array<{ file_id: string; filename: string; type: string; records: number }> },
  ): Promise<AIConversationMessage> => {
    const response = await api.post<ApiResponse<AIConversationMessage>>(
      `/ai/conversations/${conversationId}/file-notices`,
      payload,
    );
    return response.data.data;
  },

  reconcileInConversation: async (
    conversationId: string,
    payload: ReconcileRequest,
  ): Promise<ConversationReconcileResult> => {
    const response = await api.post<ApiResponse<ConversationReconcileResult>>(
      `/ai/conversations/${conversationId}/reconcile`,
      payload,
    );
    return response.data.data;
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
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      },
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
