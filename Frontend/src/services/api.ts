import axios from 'axios';
import type { ChanRequest, ChanResponse } from '../types';

const apiClient = axios.create({
  baseURL: '/api',
  timeout: 60000,
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
