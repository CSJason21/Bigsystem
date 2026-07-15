import type { ForecastFitResponse } from '@/services/api/predictionAllocation';
import type { PerspectiveProfile } from '../nodeMeta';
import type { ForecastReplayState } from './types';
import { clamp, round, FORECAST_PAST_POINTS } from '../constants';

export type ForecastMetric = 'cpu' | 'gpu' | 'memory' | 'bandwidth';
export type TimeGranularity = '30m' | '1h' | '6h';
export type TimeMode = 'live' | 'fixed';

export const getGranularityConfig = (granularity: TimeGranularity) => {
  switch (granularity) {
    case '30m':
      return { stepMinutes: 3, futurePoints: 10 };
    case '6h':
      return { stepMinutes: 20, futurePoints: 18 };
    case '1h':
    default:
      return { stepMinutes: 5, futurePoints: 12 };
  }
};

export const getForecastMeta = (metric: ForecastMetric) => {
  if (metric === 'memory') {
    return { label: '内存利用率', unit: '%', base: 56 };
  }
  if (metric === 'bandwidth') {
    return { label: '网络带宽', unit: 'Gbps', base: 72 };
  }
  if (metric === 'gpu') {
    return { label: 'GPU利用率', unit: '%', base: 68 };
  }
  return { label: 'CPU利用率', unit: '%', base: 62 };
};

export const createForecastReplay = (
  metric: ForecastMetric,
  granularity: TimeGranularity,
  anchorTime: number,
  perspective: PerspectiveProfile,
): ForecastReplayState => {
  const { stepMinutes, futurePoints } = getGranularityConfig(granularity);
  const meta = getForecastMeta(metric);
  const totalPoints = FORECAST_PAST_POINTS + futurePoints + 1;
  const baseOffset = perspective.kind === 'province' ? 6 : perspective.kind === 'region' ? 4 : 0;

  const timeline = Array.from({ length: totalPoints }, (_, index) => (
    anchorTime + (index - FORECAST_PAST_POINTS) * stepMinutes * 60 * 1000
  ));

  const actual = timeline.map((_, index) => round(clamp(
    meta.base
    + baseOffset
    + Math.sin(index / 2.6) * 7
    + Math.cos(index / 4.5) * 4,
    metric === 'bandwidth' ? 18 : 16,
    metric === 'bandwidth' ? 120 : 95,
  )));

  const predicted = timeline.map((_, index) => round(clamp(
    actual[index] + Math.sin(index / 3.1 + 0.6) * 4 + (index > FORECAST_PAST_POINTS ? (index - FORECAST_PAST_POINTS) * 0.8 : 0),
    metric === 'bandwidth' ? 20 : 18,
    metric === 'bandwidth' ? 125 : 98,
  )));

  const upper = predicted.map((value) => round(value + (metric === 'bandwidth' ? 8 : 6)));
  const lower = predicted.map((value) => round(Math.max(metric === 'bandwidth' ? 10 : 0, value - (metric === 'bandwidth' ? 8 : 6))));

  return {
    timeline,
    actual,
    predicted,
    upper,
    lower,
    cursor: FORECAST_PAST_POINTS,
    unit: meta.unit,
    label: meta.label,
  };
};

export const advanceForecastReplay = (
  previous: ForecastReplayState,
  metric: ForecastMetric,
  granularity: TimeGranularity,
  virtualTime: number,
  perspective: PerspectiveProfile,
): ForecastReplayState => {
  if (previous.cursor >= previous.timeline.length - 3) {
    return createForecastReplay(metric, granularity, virtualTime, perspective);
  }
  return { ...previous, cursor: previous.cursor + 1 };
};

export const normalizeForecastFit = (
  payload: ForecastFitResponse,
  metric: ForecastMetric,
): ForecastReplayState | null => {
  if (!payload?.timeline?.length || !payload.predicted?.length) return null;
  const meta = getForecastMeta(metric);
  return {
    timeline: payload.timeline,
    actual: payload.actual?.length ? payload.actual.map((value) => round(value)) : payload.predicted.map((value) => round(value)),
    predicted: payload.predicted.map((value) => round(value)),
    lower: payload.lower?.length ? payload.lower.map((value) => round(value)) : payload.predicted.map((value) => round(Math.max(0, value - 6))),
    upper: payload.upper?.length ? payload.upper.map((value) => round(value)) : payload.predicted.map((value) => round(value + 6)),
    cursor: Math.min(Math.max(payload.cursor ?? FORECAST_PAST_POINTS, 0), payload.timeline.length - 1),
    unit: payload.unit || meta.unit,
    label: payload.label || meta.label,
  };
};
