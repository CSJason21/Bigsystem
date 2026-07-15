/**
 * 全局任务流转总线（Zustand Store）
 *
 * 作用：在 5 个页面之间传递「当前操作的任务」，实现页面联动。
 *
 * 数据流：
 *   任务管理页 → 提交任务 → store 记录 currentTaskId
 *   → 跳转到调度中枢 → 读取 currentTaskId，展示该任务的调度决策
 *   → 跳转到需求预测 → 读取 currentTaskId，展示调度建议
 *   → 跳转到安全评估 → 读取 currentTaskId，展示该任务的安全评分
 *
 * 注意：任务的真实数据（状态、资源需求等）存在数据库里，
 *       store 只负责传递"当前选中哪个任务"。
 */
import { create } from 'zustand';

/** 任务流转状态（对应任务在 5 个页面之间的流转阶段） */
export type TaskFlowStage = 'created' | 'submitted' | 'scheduled' | 'running' | 'completed';

/** 流转任务信息（从任务管理页带到后续页面） */
export interface FlowTask {
  /** 任务 ID */
  id: string;
  /** 任务名称 */
  name: string;
  /** 任务类型 */
  type: string;
  /** 任务优先级 */
  priority: string;
  /** 资源需求摘要 */
  cpu?: number;
  memory?: number;
  gpu?: number;
  /** 当前流转阶段 */
  stage: TaskFlowStage;
  /** 提交时间戳 */
  submittedAt?: number;
  /** 调度决策的算法（由调度中枢填入） */
  selectedAlgorithm?: string;
  /** 调度决策的目标节点（由调度中枢填入） */
  targetNode?: string;
  /** 安全评分（由安全评估页填入） */
  securityScore?: number;
}

interface TaskFlowState {
  /** 当前流转中的任务（null 表示没有任务在流转） */
  currentTask: FlowTask | null;
  /** 历史流转记录（用于展示操作轨迹） */
  flowHistory: FlowTask[];

  /** 设置当前任务（任务管理页提交时调用） */
  setCurrentTask: (task: FlowTask) => void;
  /** 更新当前任务的部分字段（后续页面更新阶段/算法/评分时调用） */
  updateCurrentTask: (patch: Partial<FlowTask>) => void;
  /** 完成当前任务，移入历史记录 */
  completeCurrentTask: () => void;
  /** 清空当前任务 */
  clearCurrentTask: () => void;
}

export const useTaskFlowStore = create<TaskFlowState>((set) => ({
  currentTask: null,
  flowHistory: [],

  setCurrentTask: (task) =>
    set({ currentTask: task }),

  updateCurrentTask: (patch) =>
    set((state) => ({
      currentTask: state.currentTask
        ? { ...state.currentTask, ...patch }
        : null,
    })),

  completeCurrentTask: () =>
    set((state) => {
      if (!state.currentTask) return {};
      return {
        currentTask: null,
        flowHistory: [...state.flowHistory, state.currentTask].slice(-20),
      };
    }),

  clearCurrentTask: () =>
    set({ currentTask: null }),
}));
