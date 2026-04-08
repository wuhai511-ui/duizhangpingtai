import api from './api';
import type { ApiResponse, AIQueryResult } from '../types';

export const aiApi = {
  query: async (question: string, merchantId?: string): Promise<AIQueryResult> => {
    const response = await api.post<ApiResponse<AIQueryResult>>('/ai/query', {
      question,
      merchantId,
    });
    return response.data.data;
  },

  health: async (): Promise<{ llmAvailable: boolean; llm: string }> => {
    const response = await api.get<ApiResponse<{ llmAvailable: boolean; llm: string }>>('/ai/health');
    return response.data.data;
  },
};
