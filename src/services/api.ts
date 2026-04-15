
import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' },
});

// Request interceptor
api.interceptors.request.use(
  (config) => {
    // TODO: Add auth token
    return config;
  },
  (error) => Promise.reject(error),
);

// Response interceptor
api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    console.error('API Error:', error);
    return Promise.reject(error);
  },
);

export default api;

// === API Endpoints ===

// Resource monitoring
export const getNodeResources = () => api.get('/resources/nodes');
export const getNodeHistory = (nodeId: string) => api.get(`/resources/nodes/${nodeId}/history`);

// Task management
export const getTasks = () => api.get('/tasks');
export const createTask = (data: any) => api.post('/tasks', data);

// Fraud detection
export const getFraudOverview = () => api.get('/fraud/overview');
export const getFraudUsers = (params?: any) => api.get('/fraud/users', { params });

// Chat
export const sendChatMessage = (message: string) => api.post('/chat', { message });

// === 算力网络协同预测与分配 API ===
export const getDemandPrediction = (period: 'daily' | 'monthly') =>
  api.get(period === 'daily' ? '/prediction/daily' : '/prediction/monthly');

export const getAllocationResults = () =>
  api.get('/allocation/results');

export const getStrategyComparison = () =>
  api.get('/allocation/strategy-comparison');