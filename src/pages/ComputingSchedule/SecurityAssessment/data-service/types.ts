/* ================================================================
 * data-service 类型定义
 * 基于 types.ts 中的 MetricNode / TimelineSnapshot，补充引擎专属类型
 * ================================================================ */

import type { MetricNode, TimelineSnapshot } from '../types';

export type { MetricNode, TimelineSnapshot };

/** 指标注册表——声明哪些指标需要被追踪 */
export interface MetricRegistration {
  id: string;
  name: string;
  parentId?: string;       // 所属父指标 id
  weight?: number;         // 在父级中的权重
  unit?: string;
  threshold?: MetricNode['threshold'];
  baseValue?: number;      // 初始基准值
  volatility?: number;     // 每步波动幅度（默认 2）
}

/** 快照生成器的配置 */
export interface SnapshotEngineConfig {
  intervalMs: number;         // 生成间隔（毫秒）
  maxHistory: number;         // 保留最大快照数
  registrations: MetricRegistration[];  // 所有被测指标
  rootId: string;             // 根节点 id
  rootName: string;           // 根节点展示名
  /** 可选：后端 URL。设置后引擎不再本地生成，改为从该 URL 拉取数据 */
  fetchUrl?: string;
  /** 从后端拉取数据的轮询间隔（毫秒），默认 10000 */
  pollIntervalMs?: number;
}

/** 快照生成器对外暴露的接口 */
export interface SnapshotEngine {
  subscribe: (listener: (snapshots: TimelineSnapshot[]) => void) => () => void;
  getHistory: () => TimelineSnapshot[];
  pushSnapshot: (snap: TimelineSnapshot) => void;
  setHistory: (snaps: TimelineSnapshot[]) => void;
  start: () => void;
  stop: () => void;
  isRunning: boolean;
}

/** 快照生成函数签名：输入（各指标当前值，时间，已有历史）→ 输出一棵 MetricNode 树 */
export type SnapshotGenerator = (
  prevValues: Record<string, number>,
  timestamp: Date,
  history: TimelineSnapshot[],
  registrations: MetricRegistration[],
) => MetricNode;

/** 生成初始历史数据函数签名 */
export type InitialHistoryGenerator = (
  registrations: MetricRegistration[],
  count: number,
  intervalMs: number,
) => TimelineSnapshot[];
