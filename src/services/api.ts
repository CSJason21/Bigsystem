import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' },
});

// 请求拦截器
api.interceptors.request.use(
  (config) => {
    // TODO: 添加 auth token
    return config;
  },
  (error) => Promise.reject(error),
);

// 响应拦截器
api.interceptors.response.use(
  (response) => response.data,
  async (error) => {
    // 取消请求不报错
    if (axios.isCancel(error) || error?.code === 'ERR_CANCELED' || error?.name === 'CanceledError') {
      return Promise.reject(error);
    }

    // ===== 自动重试：超时 / 500 / 502 / 503（后端重启中） =====
    const config = error.config;
    const isRetryable =
      config &&
      !config._isRetry &&
      (error.code === 'ECONNABORTED' ||
       error.code === 'ETIMEDOUT' ||
       [500, 502, 503, 504].includes(error.response?.status));

    if (isRetryable) {
      config._retryCount = (config._retryCount || 0) + 1;
      if (config._retryCount <= 3) {
        const delay = config._retryCount * 1500; // 1.5s → 3s → 4.5s
        await new Promise((r) => setTimeout(r, delay));
        config._isRetry = true;
        return api.request(config);
      }
    }

    console.error('API Error:', error);
    return Promise.reject(error);
  },
);

export default api;

// === API 接口定义 ===

// ---- 资源监控 ----
export const getNodeResources = () => api.get('/resources/nodes');
export const getNodeHistory = (nodeId: string) => api.get(`/resources/nodes/${nodeId}/history`);

/**
 * 算力资源感知页综合接口（数据源：ts_node_metric 仿真表）
 * 返回 14 节点最新指标 + 最近 N 点 CPU/内存趋势 + 汇总统计
 */
export const getSensingData = (points: number = 40) =>
  api.get('/resources/sensing', { params: { points } });

// ---- 算力任务需求管理（来源：cst 同学）----

/**
 * 获取算力任务需求列表
 * 接口：GET /api/tasks/demands
 * 用途：页面中的"算力需求管理视图"表格
 */
export const getTaskDemands = (config?: any) => api.get('/tasks/demands', config);

/**
 * 获取顶部统计卡片数据
 * 接口：GET /api/tasks/stats
 * 用途：任务总数 / 运行中任务 / 空闲节点 / 资源利用率
 */
export const getTaskStats = () => api.get('/tasks/stats');

/** 通用任务接口 */
export const getTasks = () => api.get('/tasks');
export const createTask = (data: any) => api.post('/tasks', data);

/**
 * 批量创建任务（批量录入）
 * 接口：POST /api/tasks/batch
 */
export const createTasksBatch = (tasks: any[]) => api.post('/tasks/batch', { tasks });

/**
 * 获取任务完整生命周期时间线
 * 接口：GET /api/tasks/{task_id}/timeline
 */
export const getTaskTimeline = (taskId: string) => api.get(`/tasks/${taskId}/timeline`);

/**
 * 获取所有任务状态概览
 * 接口：GET /api/tasks/states/overview
 */
export const getTaskStatesOverview = () => api.get('/tasks/states/overview');

/**
 * 标记任务完成（演示用）
 * 接口：POST /api/tasks/{task_id}/complete
 */
export const completeTask = (taskId: string) => api.post(`/tasks/${taskId}/complete`);

// ---- 资源详情（来源：cst 同学）----

/**
 * 获取节点资源详情列表（含最新 CPU/GPU/内存/磁盘使用率）
 * 接口：GET /api/resources/nodes
 */
export const getNodes = () => api.get('/resources/nodes');

/**
 * 获取资源占比数据（饼图）
 * 接口：GET /api/resources/usage
 */
export const getResourceUsage = () => api.get('/resources/usage');

/**
 * 获取资源动态趋势数据（折线图，含 dailyOverview + dailyDetail）
 * 接口：GET /api/resources/trend
 */
export const getResourceTrend = () => api.get('/resources/trend');

/**
 * 获取全国算力节点地图分布数据
 * 接口：GET /api/resources/map
 */
export const getMapData = () => api.get('/resources/map');

// ---- 资源预测（来源：cst 同学）----
export const getPredictDates = () => api.get('/resources/predict/dates');
export const getPredictTrend = (date: string) => api.get('/resources/predict/trend', { params: { date } });
export const getPredictOverview = () => api.get('/resources/predict/overview');

// ---- 量化安全评估（来源：lzz 同学）----
export const getSecurityTimeline = () => api.get('/security/timeline');
export const getSecurityLatest = () => api.get('/security/timeline/latest');

// ---- 欺诈检测 ----
export const getFraudOverview = () => api.get('/fraud/overview');
export const getFraudUsers = (params?: any) => api.get('/fraud/users', { params });

// ---- 聊天 ----
export const sendChatMessage = (message: string) => api.post('/chat', { message });

// ============================================================
// 任务流转接口（串联 5 个页面）
// ============================================================

/**
 * 流转①：任务管理页 → 提交至调度中枢
 * 更新任务状态为 scheduling，返回候选节点列表
 */
export const submitToSchedule = (data: {
  task_id: string;
  task_name?: string;
  task_type?: string;
  priority?: string;
  cpu?: number;
  memory?: number;
  gpu?: number;
}) => api.post('/tasks/flow/submit-schedule', data);

/**
 * 流转②：调度中枢 → 执行调度
 * 绑定节点 + 记录算法决策 + 更新状态为 running
 */
export const executeSchedule = (data: {
  task_id: string;
  target_node_id: string;
  algorithm?: string;
}) => api.post('/tasks/flow/execute-schedule', data);

/**
 * 流转③：安全评估 → 反馈评分
 * 计算当前算法安全评分，推荐是否需要升级
 */
export const securityFeedback = (data: {
  task_id: string;
  algorithm?: string;
  malicious_ratio?: number;
  security_score?: number;
}) => api.post('/tasks/flow/security-feedback', data);
