import type { ForecastReplayState } from './types';
import { useForecastReplay } from './useForecastReplay';
import type { UseForecastReplayOptions } from './useForecastReplay';

export interface MultiMetricForecast {
  cpu: ForecastReplayState;
  gpu: ForecastReplayState;
  memory: ForecastReplayState;
  bandwidth: ForecastReplayState;
}

/**
 * 同时获取 CPU/GPU/内存/带宽 四个维度的预测序列。
 * 每个 metric 独立调用 useForecastReplay（各自的 API 拉取、降级与 Now 推进）。
 * GPU 无后端短时预测，会自动降级到日级预测/前端演示。
 */
export function useMultiMetricForecast(opts: Omit<UseForecastReplayOptions, 'metric'>): MultiMetricForecast {
  const cpu = useForecastReplay({ ...opts, metric: 'cpu' });
  const gpu = useForecastReplay({ ...opts, metric: 'gpu' });
  const memory = useForecastReplay({ ...opts, metric: 'memory' });
  const bandwidth = useForecastReplay({ ...opts, metric: 'bandwidth' });
  return { cpu, gpu, memory, bandwidth };
}
