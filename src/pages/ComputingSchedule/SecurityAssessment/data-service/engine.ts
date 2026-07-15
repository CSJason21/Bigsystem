/**
 * 快照引擎 —— 负责按固定间隔生成或拉取时序快照，维护历史缓冲区，提供订阅机制
 *
 * 模式 1（本地生成）：传入 generate / generateInitial，引擎内部 setInterval 生成
 * 模式 2（远程拉取）：传入 fetchUrl，引擎轮询后端 API，组件无需感知差异
 */
import type { TimelineSnapshot, MetricNode, SnapshotEngine, SnapshotEngineConfig, SnapshotGenerator, InitialHistoryGenerator } from './types';

/** 生成初始历史数据函数签名 */
export type { SnapshotGenerator, InitialHistoryGenerator };

export function createSnapshotEngine(
  config: SnapshotEngineConfig,
  generate?: SnapshotGenerator,
  generateInitial?: InitialHistoryGenerator,
): SnapshotEngine {
  const { intervalMs, maxHistory, registrations, rootId, rootName, fetchUrl, pollIntervalMs } = config;
  let history: TimelineSnapshot[] = [];
  let listeners: Array<(snapshots: TimelineSnapshot[]) => void> = [];
  let timerId: ReturnType<typeof setInterval> | null = null;
  let currentValues: Record<string, number> = {};

  // ---- 本地生成模式 ----

  function initValues(): Record<string, number> {
    const vals: Record<string, number> = {};
    for (const r of registrations) {
      vals[r.id] = r.baseValue ?? 80;
    }
    return vals;
  }

  function takeSnapshot(timestamp?: Date): TimelineSnapshot {
    const ts = timestamp ?? new Date();
    const time = ts.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const root = generate!(currentValues, ts, history, registrations);
    if (!root.id) root.id = rootId;
    if (!root.name) root.name = rootName;
    return { time, root };
  }

  function appendSnapshot(snap: TimelineSnapshot) {
    history = [...history, snap];
    if (history.length > maxHistory) {
      history = history.slice(-maxHistory);
    }
    notify();
  }

  function batchSetHistory(snaps: TimelineSnapshot[]) {
    history = snaps;
    if (history.length > 0) {
      const last = history[history.length - 1];
      updateValuesFromNode(last.root);
    }
    notify();
  }

  function updateValuesFromNode(node: MetricNode) {
    currentValues[node.id] = node.value;
    if (node.children) {
      for (const child of node.children) {
        updateValuesFromNode(child);
      }
    }
  }

  function notify() {
    for (const listener of listeners) {
      listener(history);
    }
  }

  // ---- 远程拉取模式 ----

  async function pollFromBackend() {
    try {
      const resp = await fetch(fetchUrl!);
      if (!resp.ok) return;
      const data: TimelineSnapshot[] = await resp.json();
      if (Array.isArray(data) && data.length > 0) {
        // 只保留最近的 maxHistory 条
        const trimmed = data.length > maxHistory ? data.slice(-maxHistory) : data;
        history = trimmed as TimelineSnapshot[];
        if (trimmed.length > 0) {
          updateValuesFromNode(trimmed[trimmed.length - 1].root);
        }
        notify();
      }
    } catch (err) {
      console.warn(`[SnapshotEngine] fetch from ${fetchUrl} failed:`, err);
    }
  }

  // ---- 公共 ----

  return {
    subscribe(listener) {
      listeners.push(listener);
      if (history.length > 0) {
        listener([...history]);
      }
      return () => {
        listeners = listeners.filter(l => l !== listener);
      };
    },

    getHistory() {
      return history;
    },

    pushSnapshot(snap: TimelineSnapshot) {
      appendSnapshot(snap);
      updateValuesFromNode(snap.root);
    },

    setHistory(snaps: TimelineSnapshot[]) {
      batchSetHistory(snaps);
    },

    start() {
      if (timerId) return;

      if (fetchUrl) {
        // 远程拉取模式：先拉一次，然后轮询
        const pollMs = pollIntervalMs ?? 10000;
        pollFromBackend();
        timerId = setInterval(pollFromBackend, pollMs);
      } else if (generate) {
        // 本地生成模式
        if (history.length === 0) {
          currentValues = initValues();
          if (generateInitial) {
            const initial = generateInitial(registrations, 20, intervalMs);
            batchSetHistory(initial);
            if (initial.length > 0) {
              const last = initial[initial.length - 1];
              updateValuesFromNode(last.root);
            }
          } else {
            const snap = takeSnapshot();
            batchSetHistory([snap]);
          }
        }
        timerId = setInterval(() => {
          const snap = takeSnapshot();
          appendSnapshot(snap);
        }, intervalMs);
      }
    },

    stop() {
      if (timerId) {
        clearInterval(timerId);
        timerId = null;
      }
    },

    get isRunning() {
      return timerId !== null;
    },
  };
}
