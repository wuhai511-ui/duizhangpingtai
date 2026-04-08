import api from './api';
import type { ApiResponse, Transaction, PaginatedResponse } from '../types';

interface TransactionQuery {
  page?: number;
  pageSize?: number;
  merchantId?: string;
  startDate?: string;
  endDate?: string;
  transType?: string;
}

export const transactionApi = {
  list: async (params?: TransactionQuery): Promise<PaginatedResponse<Transaction>> => {
    const response = await api.get<ApiResponse<PaginatedResponse<Transaction>>>('/transactions', { params });
    return response.data.data;
  },

  get: async (id: string): Promise<Transaction> => {
    const response = await api.get<ApiResponse<Transaction>>(`/transactions/${id}`);
    return response.data.data;
  },

  export: async (params?: TransactionQuery): Promise<Blob> => {
    const response = await api.get('/transactions/export', {
      params,
      responseType: 'blob',
    });
    return response.data;
  },
};
