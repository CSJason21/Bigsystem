export interface DiskUsage {
  name: string;
  percent: number;
  color: string;
}

export interface SeriesPoint {
  timestamp: number;
  value: number;
}

export interface NodeSample {
  cpu: number;
  memory: number;
  bandwidth: number;
  latency: number;
  jitter: number;
  packetLoss: number;
  egressBandwidth: number;
  gpuUsage: number[];
  gpuMemory: number[];
  disks: DiskUsage[];
}

export interface NodeReplayState {
  cpuSeries: SeriesPoint[];
  memorySeries: SeriesPoint[];
  latest: NodeSample;
}

export interface ForecastReplayState {
  timeline: number[];
  actual: number[];
  predicted: number[];
  upper: number[];
  lower: number[];
  cursor: number;
  unit: string;
  label: string;
}
