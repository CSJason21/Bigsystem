import { useEffect, useState } from 'react';
import dayjs from 'dayjs';
import { INITIAL_TIME, FORECAST_PAST_POINTS, round } from '../constants';
import type { PerspectiveProfile } from '../nodeMeta';
import type { ForecastReplayState } from './types';
import {
  createForecastReplay,
  advanceForecastReplay,
  getForecastMeta,
  normalizeForecastFit,
} from './forecastReplay';
import type { ForecastMetric, TimeGranularity, TimeMode } from './forecastReplay';
import { getAllocationForecast, getDayDemandPrediction } from '@/services/api/predictionAllocation';

export interface UseForecastReplayOptions {
  metric: ForecastMetric;
  granularity: TimeGranularity;
  perspective: PerspectiveProfile;
  timeMode: TimeMode;
  fixedRange: [dayjs.Dayjs, dayjs.Dayjs] | null;
  viewId: string;
  virtualTime: number;
  warnFallback: (module: string) => void;
}

/**
 * 算力资源需求预测回放：封装本地预测序列生成、后端预测曲线拉取与降级、
 * 以及实时模式下随虚拟时钟推进的 Now 标记线。
 */
export function useForecastReplay(opts: UseForecastReplayOptions) {
  const {
    metric,
    granularity,
    perspective,
    timeMode,
    fixedRange,
    viewId,
    virtualTime,
    warnFallback,
  } = opts;

  const [forecastReplay, setForecastReplay] = useState<ForecastReplayState>(() => (
    createForecastReplay('cpu', '1h', INITIAL_TIME, perspective)
  ));

  // 参数变化时重建本地预测序列
  useEffect(() => {
    setForecastReplay(createForecastReplay(metric, granularity, virtualTime, perspective));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perspective, metric, granularity, timeMode]);

  // 拉取后端预测曲线，失败则降级到日级预测/前端演示
  useEffect(() => {
    let cancelled = false;
    const params = {
      metric,
      mode: (timeMode === 'fixed' ? 'fixed' : 'realtime') as 'fixed' | 'realtime',
      view_id: viewId,
      start: timeMode === 'fixed' && fixedRange ? fixedRange[0].toISOString() : undefined,
      end: timeMode === 'fixed' && fixedRange ? fixedRange[1].toISOString() : undefined,
    };

    getAllocationForecast(params)
      .then((payload) => {
        if (cancelled) return;
        const normalized = normalizeForecastFit(payload, metric);
        if (normalized) {
          setForecastReplay(normalized);
        }
      })
      .catch(() => {
        if (timeMode === 'fixed') {
          warnFallback('预测曲线');
          return;
        }

        getDayDemandPrediction()
          .then((payload) => {
            if (cancelled || !payload?.labels?.length) return;
            const meta = getForecastMeta(metric);
            const now = Date.now();
            const timeline = payload.labels.map((_, index) => now + (index - FORECAST_PAST_POINTS) * 5 * 60 * 1000);
            const actualSource = metric === 'memory'
              ? payload.memory_actual
              : metric === 'bandwidth'
                ? payload.bandwidth_actual_mbps?.map((value) => round(value / 1000, 1))
                : metric === 'gpu'
                  ? payload.gpu_actual
                  : payload.cpu_actual;
            const predictedSource = metric === 'memory'
              ? payload.memory_predicted
              : metric === 'bandwidth'
                ? payload.bandwidth_predicted_mbps?.map((value) => round(value / 1000, 1))
                : metric === 'gpu'
                  ? payload.gpu_predicted
                  : payload.cpu_predicted;
            if (!predictedSource?.length) return;
            const actual = (actualSource?.length ? actualSource : predictedSource).map((value) => round(value));
            const predicted = predictedSource.map((value) => round(value));
            setForecastReplay({
              timeline,
              actual,
              predicted,
              lower: predicted.map((value) => round(Math.max(0, value - 6))),
              upper: predicted.map((value) => round(value + 6)),
              cursor: Math.min(FORECAST_PAST_POINTS, timeline.length - 1),
              unit: meta.unit,
              label: meta.label,
            });
          })
          .catch(() => warnFallback('预测曲线'));
      });
    return () => {
      cancelled = true;
    };
  }, [metric, fixedRange, viewId, timeMode, warnFallback]);

  // 实时模式下，随虚拟时钟推进 Now 标记线
  useEffect(() => {
    if (timeMode !== 'live') return;
    setForecastReplay((previous) => advanceForecastReplay(previous, metric, granularity, virtualTime, perspective));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [virtualTime]);

  return forecastReplay;
}
