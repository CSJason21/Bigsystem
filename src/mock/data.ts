
/**
 * Utility for generating mock data for charts and tables
 */

// Generate random number within range
export const randomNum = (min: number, max: number): number =>
  Math.floor(Math.random() * (max - min + 1)) + min;

// Generate time labels (e.g., last N hours)
export const generateTimeLabels = (count: number, unit: 'hour' | 'day' | 'month' = 'hour'): string[] => {
  const labels: string[] = [];
  const now = new Date();
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now);
    if (unit === 'hour') {
      d.setHours(d.getHours() - i);
      labels.push(`${d.getHours().toString().padStart(2, '0')}:00`);
    } else if (unit === 'day') {
      d.setDate(d.getDate() - i);
      labels.push(`${d.getMonth() + 1}/${d.getDate()}`);
    } else {
      d.setMonth(d.getMonth() - i);
      labels.push(`${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`);
    }
  }
  return labels;
};

// Generate random series data
export const generateSeriesData = (count: number, min: number, max: number): number[] =>
  Array.from({ length: count }, () => randomNum(min, max));

// Mock node list
export const mockNodes = [
  { id: 'node-01', name: '算力节点-01', ip: '192.168.1.101', cpu: 72, memory: 65, disk: 48, gpu: 55, status: 'running' },
  { id: 'node-02', name: '算力节点-02', ip: '192.168.1.102', cpu: 45, memory: 52, disk: 33, gpu: 80, status: 'running' },
  { id: 'node-03', name: '算力节点-03', ip: '192.168.1.103', cpu: 88, memory: 79, disk: 67, gpu: 42, status: 'warning' },
  { id: 'node-04', name: '算力节点-04', ip: '192.168.1.104', cpu: 23, memory: 31, disk: 25, gpu: 15, status: 'idle' },
  { id: 'node-05', name: '算力节点-05', ip: '192.168.1.105', cpu: 91, memory: 85, disk: 72, gpu: 93, status: 'critical' },
  { id: 'node-06', name: '算力节点-06', ip: '192.168.1.106', cpu: 56, memory: 44, disk: 38, gpu: 60, status: 'running' },
];

// Mock task list
export const mockTasks = [
  { id: 'task-001', name: '联邦学习训练任务A', type: '训练', status: '运行中', node: 'node-01', cpu: 4, memory: 8, gpu: 1, progress: 67 },
  { id: 'task-002', name: '模型聚合任务B', type: '聚合', status: '运行中', node: 'node-02', cpu: 2, memory: 4, gpu: 0, progress: 45 },
  { id: 'task-003', name: '数据预处理C', type: '预处理', status: '已完成', node: 'node-03', cpu: 8, memory: 16, gpu: 2, progress: 100 },
  { id: 'task-004', name: '推理任务D', type: '推理', status: '排队中', node: 'node-04', cpu: 2, memory: 4, gpu: 1, progress: 0 },
  { id: 'task-005', name: '安全检测任务E', type: '检测', status: '运行中', node: 'node-05', cpu: 4, memory: 8, gpu: 1, progress: 82 },
];

// Mock fraud data for cities
export const mockFraudCities = [
  { name: '北京', value: 342 },
  { name: '上海', value: 287 },
  { name: '广州', value: 256 },
  { name: '深圳', value: 231 },
  { name: '杭州', value: 189 },
  { name: '成都', value: 167 },
  { name: '武汉', value: 145 },
  { name: '南京', value: 134 },
  { name: '重庆', value: 128 },
  { name: '西安', value: 112 },
];
