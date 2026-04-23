import api from './api';
import type {
  ApiResponse,
  FileAnalyzeResult,
  FileInfo,
  FileUploadResult,
  PaginatedResponse,
  UploadFileType,
} from '../types';

function normalizeFileInfo(file: Record<string, unknown>): FileInfo {
  return {
    id: String(file.id || ''),
    filename: String(file.filename || ''),
    type: String(file.type || ''),
    records: Number(file.records || 0),
    status: String(file.status || 'processed'),
    createdAt: String(file.createdAt || file.created_at || ''),
  };
}

export const fileApi = {
  upload: async (
    file: File,
    fileType?: UploadFileType,
    options?: { amountUnit?: 'fen' | 'yuan' },
  ): Promise<FileUploadResult> => {
    const formData = new FormData();
    formData.append('file', file);
    if (fileType) {
      formData.append('file_type', fileType);
    }
    if (options?.amountUnit) {
      formData.append('amount_unit', options.amountUnit);
    }

    const response = await api.post<ApiResponse<FileUploadResult>>('/files/upload', formData);

    return response.data.data;
  },

  list: async (params?: {
    page?: number;
    pageSize?: number;
    fileType?: string;
  }): Promise<PaginatedResponse<FileInfo>> => {
    const response = await api.get<ApiResponse<Record<string, unknown>[]>>('/files', { params });
    return {
      list: (response.data.data || []).map(normalizeFileInfo),
      pagination: response.data.pagination || {
        page: params?.page || 1,
        pageSize: params?.pageSize || 20,
        total: (response.data.data || []).length,
      },
    };
  },

  get: async (id: string): Promise<FileInfo> => {
    const response = await api.get<ApiResponse<Record<string, unknown>>>(`/files/${id}`);
    return normalizeFileInfo(response.data.data);
  },

  getRecords: async (
    id: string,
    params?: { page?: number; pageSize?: number },
  ): Promise<PaginatedResponse<unknown>> => {
    const response = await api.get<ApiResponse<unknown[]>>(`/files/${id}/records`, { params });
    return {
      list: response.data.data || [],
      pagination: response.data.pagination || {
        page: params?.page || 1,
        pageSize: params?.pageSize || 20,
        total: (response.data.data || []).length,
      },
    };
  },

  analyze: async (file: File, typeHint?: UploadFileType): Promise<FileAnalyzeResult> => {
    const ext = file.name.toLowerCase().split('.').pop();
    const isExcel = ext === 'xlsx' || ext === 'xls';
    const content = isExcel ? '' : await file.text();

    const response = await api.post<ApiResponse<FileAnalyzeResult>>('/files/analyze', {
      filename: file.name,
      content,
      type_hint: typeHint,
    });

    return response.data.data;
  },
};
