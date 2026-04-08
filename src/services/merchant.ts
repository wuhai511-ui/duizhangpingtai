import api from './api';
import type { ApiResponse, Merchant, PaginatedResponse } from '../types';

export const merchantApi = {
  list: async (params?: { page?: number; pageSize?: number; search?: string }): Promise<PaginatedResponse<Merchant>> => {
    const response = await api.get<ApiResponse<PaginatedResponse<Merchant>>>('/merchants', { params });
    return response.data.data;
  },

  get: async (id: string): Promise<Merchant> => {
    const response = await api.get<ApiResponse<Merchant>>(`/merchants/${id}`);
    return response.data.data;
  },

  create: async (data: Partial<Merchant>): Promise<Merchant> => {
    const response = await api.post<ApiResponse<Merchant>>('/merchants', data);
    return response.data.data;
  },

  update: async (id: string, data: Partial<Merchant>): Promise<Merchant> => {
    const response = await api.put<ApiResponse<Merchant>>(`/merchants/${id}`, data);
    return response.data.data;
  },

  delete: async (id: string): Promise<void> => {
    await api.delete(`/merchants/${id}`);
  },
};
