import type { NodeId, NodeMeta } from '../nodeMeta';
import { NODE_META } from '../nodeMeta';
import type { NodeReplayState, NodeSample, SeriesPoint } from './types';
import { clamp, round, DISK_COLORS, ROLLING_POINTS, REPLAY_STEP_SECONDS } from '../constants';

export const seriesValue = (base: number, seed: number, step: number, amplitude = 6) => clamp(
  base
  + Math.sin(step / 3 + seed) * amplitude
  + Math.cos(step / 5 + seed * 1.7) * (amplitude * 0.55),
  8,
  98,
);

export const createNodeSample = (meta: NodeMeta, step: number): NodeSample => {
  const seed = meta.id.split('').reduce((s, c) => s + c.charCodeAt(0), 0) / 500;
  const cpu = seriesValue(meta.baseCpu, seed, step, 9);
  const memory = seriesValue(meta.baseMemory, seed + 0.7, step, 6);
  const bandwidth = seriesValue(meta.baseBandwidth, seed + 1.1, step, 7);
  const latency = round(clamp(18 + Math.sin(step / 4 + seed) * 9 + cpu * 0.18, 8, 78));
  const jitter = round(clamp(2 + Math.cos(step / 4 + seed) * 2 + bandwidth * 0.03, 1, 10));
  const packetLoss = round(clamp(cpu > 84 ? Math.abs(Math.sin(step / 6)) * 0.8 : Math.abs(Math.cos(step / 8)) * 0.08, 0, 1.6), 2);
  const egressBandwidth = round(clamp(40 + bandwidth * 1.15 + Math.sin(step / 5) * 8, 20, 160));
  const gpuUsage = meta.gpuNames.map((_, index) => round(clamp(cpu - 12 + index * 5 + Math.sin(step / 3 + index) * 10, 5, 100)));
  const gpuMemory = meta.gpuTotals.map((total, index) => round(clamp(total * (0.3 + gpuUsage[index] / 160), 2, total), 1));
  const disks = [
    { name: '/system', percent: round(clamp(memory - 18 + seed * 3, 22, 88)), color: DISK_COLORS[0] },
    { name: '/data', percent: round(clamp(cpu - 6 + seed * 2.4, 35, 94)), color: DISK_COLORS[1] },
    { name: '/models', percent: round(clamp(memory - 4 + seed * 2.1, 28, 90)), color: DISK_COLORS[2] },
    { name: '/cache', percent: round(clamp(24 + Math.sin(step / 8 + seed) * 14, 10, 72)), color: DISK_COLORS[3] },
  ];

  return {
    cpu: round(cpu),
    memory: round(memory),
    bandwidth: round(bandwidth),
    latency,
    jitter,
    packetLoss,
    egressBandwidth,
    gpuUsage,
    gpuMemory,
    disks,
  };
};

export const createInitialNodeReplay = (virtualTime: number): Record<NodeId, NodeReplayState> => (
  Object.values(NODE_META).reduce<Record<NodeId, NodeReplayState>>((accumulator, meta) => {
    const cpuSeries: SeriesPoint[] = [];
    const memorySeries: SeriesPoint[] = [];

    for (let index = 0; index < ROLLING_POINTS; index += 1) {
      const step = index - (ROLLING_POINTS - 1);
      const timestamp = virtualTime + step * REPLAY_STEP_SECONDS * 1000;
      const sample = createNodeSample(meta, step + 120);
      cpuSeries.push({ timestamp, value: sample.cpu });
      memorySeries.push({ timestamp, value: sample.memory });
    }

    accumulator[meta.id] = {
      cpuSeries,
      memorySeries,
      latest: createNodeSample(meta, 120),
    };
    return accumulator;
  }, {} as Record<NodeId, NodeReplayState>)
);

export const advanceNodeReplay = (
  previous: Record<NodeId, NodeReplayState>,
  virtualTime: number,
  tick: number,
): Record<NodeId, NodeReplayState> => (
  Object.values(NODE_META).reduce<Record<NodeId, NodeReplayState>>((accumulator, meta) => {
    const nextSample = createNodeSample(meta, tick + meta.id.split('').reduce((s, c) => s + c.charCodeAt(0), 0));
    accumulator[meta.id] = {
      latest: nextSample,
      cpuSeries: [...previous[meta.id].cpuSeries.slice(1), { timestamp: virtualTime, value: nextSample.cpu }],
      memorySeries: [...previous[meta.id].memorySeries.slice(1), { timestamp: virtualTime, value: nextSample.memory }],
    };
    return accumulator;
  }, {} as Record<NodeId, NodeReplayState>)
);
