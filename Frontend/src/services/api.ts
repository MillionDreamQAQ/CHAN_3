import axios from 'axios';
import type {
  ChanRequest,
  ChanResponse,
  ScanRequest,
  ScanTaskResponse,
  ScanProgress,
  ScanResultResponse,
  ScanTaskListResponse,
  ScanTaskDetailResponse,
  AllResultsResponse
} from '../types';

const apiClient = axios.create({
  baseURL: '/api',
  timeout: 90000,
  headers: {
    'Content-Type': 'application/json'
  }
});

export const chanApi = {
  calculateChan: async (request: ChanRequest): Promise<ChanResponse> => {
    const response = await apiClient.post<ChanResponse>('/chan/calculate', request);
    return response.data;
  }
};

export const scanApi = {
  /**
   * 启动扫描任务
   */
  startScan: async (request: ScanRequest): Promise<ScanTaskResponse> => {
    const response = await apiClient.post<ScanTaskResponse>('/scan/start', request);
    return response.data;
  },

  /**
   * 订阅扫描进度 (SSE)
   * @param taskId 任务ID
   * @param onProgress 进度回调
   * @param onError 错误回调
   * @returns EventSource实例，用于关闭连接
   */
  subscribeProgress: (
    taskId: string,
    onProgress: (progress: ScanProgress) => void,
    onError?: (error: Event) => void
  ): EventSource => {
    const eventSource = new EventSource(`/api/scan/progress/${taskId}`);

    eventSource.addEventListener('progress', (event: MessageEvent) => {
      try {
        const progress: ScanProgress = JSON.parse(event.data);
        onProgress(progress);

        // 如果任务完成，自动关闭连接
        if (['completed', 'cancelled', 'error'].includes(progress.status)) {
          eventSource.close();
        }
      } catch (e) {
        console.error('解析进度数据失败:', e);
      }
    });

    eventSource.onerror = (error) => {
      console.error('SSE连接错误:', error);
      eventSource.close();
      onError?.(error);
    };

    return eventSource;
  },

  /**
   * 获取扫描结果
   */
  getResults: async (taskId: string): Promise<ScanResultResponse> => {
    const response = await apiClient.get<ScanResultResponse>(`/scan/result/${taskId}`);
    return response.data;
  },

  /**
   * 取消扫描任务
   */
  cancelScan: async (taskId: string): Promise<void> => {
    await apiClient.post(`/scan/cancel/${taskId}`);
  },

  /**
   * 获取任务列表
   */
  getTasks: async (
    page: number = 1,
    pageSize: number = 20,
    status?: string
  ): Promise<ScanTaskListResponse> => {
    const params: Record<string, any> = { page, page_size: pageSize };
    if (status) {
      params.status = status;
    }
    const response = await apiClient.get<ScanTaskListResponse>('/scan/tasks', { params });
    return response.data;
  },

  /**
   * 获取任务详情（含结果）
   */
  getTaskDetail: async (taskId: string): Promise<ScanTaskDetailResponse> => {
    const response = await apiClient.get<ScanTaskDetailResponse>(`/scan/tasks/${taskId}`);
    return response.data;
  },

  /**
   * 删除任务
   */
  deleteTask: async (taskId: string): Promise<void> => {
    await apiClient.delete(`/scan/tasks/${taskId}`);
  },

  /**
   * 获取所有已完成任务的结果汇总
   */
  getAllResults: async (
    status: string = 'completed',
    limit?: number
  ): Promise<AllResultsResponse> => {
    const params: Record<string, any> = { status };
    if (limit) {
      params.limit = limit;
    }
    const response = await apiClient.get<AllResultsResponse>('/scan/all-results', { params });
    return response.data;
  }
};
