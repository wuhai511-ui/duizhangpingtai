import api from './api';
import type { ApiResponse } from '../types';

export interface FileUploadResult {
  file_id: string;
  records: number;
  type: string;
}

export interface FileInfo {
  id: string;
  filename: string;
  type: string;
  status: string;
  records: number;
  created_at: string;
}

export const fileApi = {
  upload: async (file: File): Promise<FileUploadResult> => {
    const formData = new FormData();
    formData.append('file', file);

    const response = await api.post<ApiResponse<FileUploadResult>>('/files/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });

    return response.data.data;
  },

  list: async (params?: { page?: number; pageSize?: number; fileType?: string }): Promise<FileInfo[]> => {
    const response = await api.get<ApiResponse<FileInfo[]>>('/files', { params });
    return response.data.data;
  },

  get: async (id: string): Promise<FileInfo> => {
    const response = await api.get<ApiResponse<FileInfo>>(`/files/${id}`);
    return response.data.data;
  },

  getRecords: async (id: string, params?: { page?: number; pageSize?: number }) => {
    const response = await api.get<ApiResponse<unknown[]>>(`/files/${id}/records`, { params });
    return response.data.data;
  },
};
