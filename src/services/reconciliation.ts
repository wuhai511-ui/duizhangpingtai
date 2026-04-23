import api from './api';
import type {
  ApiResponse,
  Pagination,
  ReconciliationBatch,
  ReconciliationDetailItem,
  ReconBatchType,
  ReconTemplateConfig,
  ReconTemplateConfigItem,
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

  rerunBatch: async (id: string, templateId?: string): Promise<{ batch_id: string; stats: any }> => {
    const response = await api.post<ApiResponse<{ batch_id: string; stats: any }>>(
      `/reconciliation/batches/${id}/rerun`,
      { template_id: templateId },
    );
    return response.data.data;
  },

  listTemplateConfigs: async (batchType?: ReconBatchType): Promise<ReconTemplateConfigItem[]> => {
    const response = await api.get<ApiResponse<ReconTemplateConfigItem[]>>(
      '/reconciliation/template-configs',
      {
        params: batchType ? { batch_type: batchType } : undefined,
      },
    );
    return response.data.data;
  },

  createTemplateConfig: async (payload: {
    template: ReconTemplateConfig;
    is_default?: boolean;
  }): Promise<ReconTemplateConfigItem> => {
    const response = await api.post<ApiResponse<ReconTemplateConfigItem>>(
      '/reconciliation/template-configs',
      payload,
    );
    return response.data.data;
  },

  updateTemplateConfig: async (
    id: string,
    payload: { template: ReconTemplateConfig; is_default?: boolean },
  ): Promise<ReconTemplateConfigItem> => {
    const response = await api.put<ApiResponse<ReconTemplateConfigItem>>(
      `/reconciliation/template-configs/${id}`,
      payload,
    );
    return response.data.data;
  },

  deleteTemplateConfig: async (id: string): Promise<{ id: string }> => {
    const response = await api.delete<ApiResponse<{ id: string }>>(
      `/reconciliation/template-configs/${id}`,
    );
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
