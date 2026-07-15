import { useEffect, useState } from 'react';
import type { TimelineSnapshot, SnapshotEngine } from './types';

/**
 * React Hook —— 订阅快照引擎的数据
 *
 * @param engine 快照引擎实例（可为 null，此时返回空数组）
 * @param autoStart 是否自动启动引擎
 * @returns 历史快照数组
 */
export function useSnapshotEngine(engine: SnapshotEngine | null, autoStart = true): TimelineSnapshot[] {
  const [history, setHistory] = useState<TimelineSnapshot[]>(() => engine?.getHistory() ?? []);

  useEffect(() => {
    if (!engine) return;
    const unsub = engine.subscribe((snaps) => {
      setHistory([...snaps]);
    });
    if (autoStart && !engine.isRunning) {
      engine.start();
    }
    return () => {
      unsub();
      // 注意：组件卸载时不断 stop()，因为引擎可能被多个组件共享
      // 单个组件不应该 stop 全局引擎
    };
  }, [engine, autoStart]);

  return history;
}
