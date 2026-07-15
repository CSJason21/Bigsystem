import dayjs from 'dayjs';
import type { NodeId } from './nodeMeta';
import { NODE_META, ALL_COMPUTE_NODE_IDS } from './nodeMeta';
import { clamp, round } from './constants';

export type TaskStatus = 'pending' | 'running' | 'completed';
export type TaskType = '训练任务' | '推理服务' | '数据预处理' | '联邦聚合' | '弹性迁移';

export interface ScheduleTask {
  id: string;
  name: string;
  type: TaskType;
  status: TaskStatus;
  cpu: number;
  memory: number;
  gpu: number;
  targetNodeId?: NodeId;
  matchScore?: number;
  estimatedLatency?: number;
}

export const TASK_TYPES: TaskType[] = ['训练任务', '推理服务', '数据预处理', '联邦聚合', '弹性迁移'];
export const TASK_TYPE_COLORS: Record<TaskType, string> = {
  '训练任务': 'blue',
  '推理服务': 'purple',
  '数据预处理': 'cyan',
  '联邦聚合': 'geekblue',
  '弹性迁移': 'orange',
};

export type ScheduleLogPhase = '感知' | '决策' | '下发' | '监控';

export interface ScheduleLogEntry {
  time: string;
  phase: ScheduleLogPhase;
  message: string;
}

export const SCHEDULE_LOG_PHASES: Record<string, (task: ScheduleTask) => ScheduleLogEntry[]> = {
  manager: (task) => {
    const nodeName = NODE_META[task.targetNodeId ?? 'BJ_DC1']?.name ?? '未知节点';
    const score = task.matchScore ?? 90;
    const latency = task.estimatedLatency ?? 12;
    return [
      { time: dayjs().format('HH:mm:ss'), phase: '感知', message: `收到新任务: ${task.name} (${task.type})` },
      { time: dayjs().format('HH:mm:ss'), phase: '感知', message: '正在进行算力网络状态拉取与资源检查...' },
      { time: dayjs().format('HH:mm:ss'), phase: '决策', message: `候选节点评估: ${nodeName} 匹配度最高` },
      { time: dayjs().format('HH:mm:ss'), phase: '决策', message: `综合匹配度: ${score}%（预计时延 ${latency}ms）` },
      { time: dayjs().format('HH:mm:ss'), phase: '下发', message: `任务 ${task.name} 正在绑定至 ${nodeName}...` },
      { time: dayjs().format('HH:mm:ss'), phase: '下发', message: `资源预留: CPU ${task.cpu}% / 内存 ${task.memory}GB / GPU ${task.gpu}%` },
      { time: dayjs().format('HH:mm:ss'), phase: '监控', message: '链路就绪，任务流已激活，开始实时监控' },
    ];
  },
  hub_beijing: (task) => [
    { time: dayjs().format('HH:mm:ss'), phase: '感知', message: `京津冀枢纽收到调度指令: ${task.name}` },
    { time: dayjs().format('HH:mm:ss'), phase: '监控', message: `当前负载: ${(55 + Math.random() * 20).toFixed(1)}%，队列: ${Math.floor(3 + Math.random() * 8)}` },
  ],
  hub_shanghai: (task) => [
    { time: dayjs().format('HH:mm:ss'), phase: '感知', message: `长三角枢纽收到调度指令: ${task.name}` },
    { time: dayjs().format('HH:mm:ss'), phase: '监控', message: `当前负载: ${(50 + Math.random() * 25).toFixed(1)}%，队列: ${Math.floor(2 + Math.random() * 6)}` },
  ],
  hub_guangdong: (task) => [
    { time: dayjs().format('HH:mm:ss'), phase: '感知', message: `粤港澳枢纽收到调度指令: ${task.name}` },
    { time: dayjs().format('HH:mm:ss'), phase: '监控', message: `当前负载: ${(48 + Math.random() * 22).toFixed(1)}%，队列: ${Math.floor(2 + Math.random() * 7)}` },
  ],
  hub_chengdu: (task) => [
    { time: dayjs().format('HH:mm:ss'), phase: '感知', message: `成渝枢纽收到调度指令: ${task.name}` },
    { time: dayjs().format('HH:mm:ss'), phase: '监控', message: `当前负载: ${(42 + Math.random() * 18).toFixed(1)}%，队列: ${Math.floor(1 + Math.random() * 5)}` },
  ],
  rc_neimenggu: (task) => [
    { time: dayjs().format('HH:mm:ss'), phase: '监控', message: `内蒙古区域中心: ${(38 + Math.random() * 15).toFixed(1)}%` },
  ],
  rc_zhangjiakou: (task) => [
    { time: dayjs().format('HH:mm:ss'), phase: '监控', message: `张家口区域中心: ${(36 + Math.random() * 12).toFixed(1)}%` },
  ],
  rc_guizhou: (task) => [
    { time: dayjs().format('HH:mm:ss'), phase: '监控', message: `贵州区域中心: ${(35 + Math.random() * 12).toFixed(1)}%` },
  ],
  rc_hefei: (task) => [
    { time: dayjs().format('HH:mm:ss'), phase: '监控', message: `合肥区域中心: ${(33 + Math.random() * 14).toFixed(1)}%` },
  ],
  rc_nanning: (task) => [
    { time: dayjs().format('HH:mm:ss'), phase: '监控', message: `广西区域中心: ${(30 + Math.random() * 10).toFixed(1)}%` },
  ],
  rc_haikou: (task) => [
    { time: dayjs().format('HH:mm:ss'), phase: '监控', message: `海南区域中心: ${(28 + Math.random() * 12).toFixed(1)}%` },
  ],
  rc_ningxia: (task) => [
    { time: dayjs().format('HH:mm:ss'), phase: '监控', message: `宁夏区域中心: ${(32 + Math.random() * 10).toFixed(1)}%` },
  ],
  rc_gansu: (task) => [
    { time: dayjs().format('HH:mm:ss'), phase: '监控', message: `甘肃区域中心: ${(30 + Math.random() * 14).toFixed(1)}%` },
  ],
};

SCHEDULE_LOG_PHASES['national-center'] = SCHEDULE_LOG_PHASES.manager;
SCHEDULE_LOG_PHASES['dc-guangdong-02'] = SCHEDULE_LOG_PHASES.manager;

export const createMockTasks = (count: number, startIndex: number): ScheduleTask[] => {
  const statusPool: TaskStatus[] = ['pending', 'pending', 'running', 'running', 'running', 'completed', 'completed'];
  return Array.from({ length: count }, (_, i) => {
    const type = TASK_TYPES[(startIndex + i) % TASK_TYPES.length];
    const status = statusPool[(startIndex + i) % statusPool.length];
    const cpu = round(clamp(20 + Math.sin(startIndex + i) * 15 + Math.random() * 10, 8, 60));
    const memory = round(clamp(16 + Math.cos(startIndex + i) * 12 + Math.random() * 8, 6, 48));
    const gpu = round(clamp(10 + Math.sin(startIndex + i * 1.3) * 8, 2, 40));
    const task: ScheduleTask = {
      id: `T-${String(startIndex + i + 1).padStart(4, '0')}`,
      name: `${type}-${startIndex + i + 1}`,
      type,
      status,
      cpu,
      memory,
      gpu,
    };

    if (status === 'running') {
      task.targetNodeId = ALL_COMPUTE_NODE_IDS[(startIndex + i) % ALL_COMPUTE_NODE_IDS.length];
    } else if (status === 'pending') {
      task.targetNodeId = ALL_COMPUTE_NODE_IDS[(startIndex + i) % ALL_COMPUTE_NODE_IDS.length];
      task.matchScore = round(clamp(78 + Math.sin(startIndex + i * 2.1) * 18, 60, 99));
      task.estimatedLatency = round(clamp(8 + Math.sin(startIndex + i * 1.7) * 6 + cpu * 0.15, 4, 32));
    }

    return task;
  });
};
