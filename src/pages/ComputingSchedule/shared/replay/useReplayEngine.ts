import { useEffect, useState } from 'react';
import dayjs from 'dayjs';
import { INITIAL_TIME, REPLAY_STEP_SECONDS } from '../constants';
import type { NodeId } from '../nodeMeta';
import type { NodeReplayState } from './types';
import { createInitialNodeReplay, advanceNodeReplay } from './nodeReplay';

/**
 * 节点资源回放引擎：维护虚拟时钟与每个节点的滚动监控序列。
 * 每 3 秒推进 5 秒虚拟时间，滚动各节点的 CPU/内存曲线。
 * 每个页面独立调用一次，组件卸载时自动清理定时器。
 */
export function useReplayEngine() {
  const [replayTick, setReplayTick] = useState(120);
  const [virtualTime, setVirtualTime] = useState(INITIAL_TIME);
  const [nodeReplayMap, setNodeReplayMap] = useState<Record<NodeId, NodeReplayState>>(() => createInitialNodeReplay(INITIAL_TIME));

  useEffect(() => {
    const timer = window.setInterval(() => {
      setReplayTick((previousTick) => {
        const nextTick = previousTick + 1;

        setVirtualTime((previousTime) => {
          const nextVirtualTime = dayjs(previousTime).add(REPLAY_STEP_SECONDS, 'second').valueOf();
          setNodeReplayMap((previous) => advanceNodeReplay(previous, nextVirtualTime, nextTick));
          return nextVirtualTime;
        });

        return nextTick;
      });
    }, 3000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  return { replayTick, virtualTime, nodeReplayMap };
}
