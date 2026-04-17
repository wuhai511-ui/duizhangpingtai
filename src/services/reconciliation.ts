import api from './api';
import type {
  ApiResponse,
  Pagination,
  ReconciliationBatch,
  ReconciliationDetailItem,
} from '../types';

export const reconciliationApi = {
  listBatches: async (params?: {
    page?: number;
    pageSize?: number;
    status?: number;
    batchType?: string;
  }): Promise<{ list: ReconciliationBatch[]; pagination?: Pagination }> => {
    const response = await api.get<
      ApiResponse<{ list: ReconciliationBatch[]; pagination?: Pagination }>
    >('/reconciliation/batches', { params });
    return response.data.data;
  },

  getBatch: async (id: string): Promise<ReconciliationBatch> => {
    const response = await api.get<ApiResponse<ReconciliationBatch>>(`/reconciliation/batches/${id}`);
    return response.data.data;
  },

  getBatchDetails: async (
    id: string,
    params?: { page?: number; pageSize?: number; result_type?: string },
  ): Promise<{ list: ReconciliationDetailItem[]; pagination?: Pagination }> => {
    const response = await api.get<ApiResponse<ReconciliationDetailItem[]>>(
      `/reconciliation/batches/${id}/details`,
      { params },
    );
    return {
      list: response.data.data,
      pagination: response.data.pagination,
    };
  },
};
