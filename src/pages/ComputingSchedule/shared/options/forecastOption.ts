import type { EChartsOption } from 'echarts';
import dayjs from 'dayjs';
import type { ThemeToken } from '../theme';
import type { PerspectiveProfile } from '../nodeMeta';
import type { ForecastReplayState } from '../replay/types';
import { clamp, round } from '../constants';
import { getForecastMeta } from '../replay/forecastReplay';
import type { ForecastMetric } from '../replay/forecastReplay';

export const buildForecastOption = (
  replay: ForecastReplayState,
  token: ThemeToken,
): EChartsOption => {
  const actualData = replay.timeline.map((time, index) => [time, index <= replay.cursor ? replay.actual[index] : null]);
  const predictData = replay.timeline.map((time, index) => [time, index >= replay.cursor ? replay.predicted[index] : null]);
  const lowerData = replay.timeline.map((time, index) => [time, index >= replay.cursor ? replay.lower[index] : null]);
  const bandData = replay.timeline.map((time, index) => [time, index >= replay.cursor ? replay.upper[index] - replay.lower[index] : null]);
  const nowTime = replay.timeline[replay.cursor];

  return {
    tooltip: { trigger: 'axis' },
    legend: {
      top: 0,
      textStyle: { color: token.colorTextSecondary },
    },
    grid: { left: 48, right: 28, top: 48, bottom: 36 },
    xAxis: {
      type: 'time',
      axisLabel: {
        color: token.colorTextSecondary,
        formatter: (value: number) => dayjs(value).format('HH:mm'),
      },
    },
    yAxis: {
      type: 'value',
      axisLabel: {
        color: token.colorTextSecondary,
        formatter: `{value}${replay.unit}`,
      },
      splitLine: { lineStyle: { color: token.colorBorderSecondary } },
    },
    series: [
      {
        name: '历史真实数据',
        type: 'line',
        smooth: true,
        symbol: 'none',
        lineStyle: { width: 3, color: token.colorPrimary },
        areaStyle: { color: `${token.colorPrimary}18` },
        data: actualData,
        markLine: {
          symbol: ['none', 'none'],
          label: {
            formatter: '当前时间 Now',
            color: token.colorInfo,
          },
          lineStyle: {
            color: token.colorInfo,
            type: 'dashed',
            width: 1.5,
          },
          data: [{ xAxis: nowTime }],
        },
      },
      {
        name: '预测下限',
        type: 'line',
        symbol: 'none',
        smooth: true,
        lineStyle: { opacity: 0 },
        stack: 'forecast-band',
        data: lowerData,
      },
      {
        name: '预测置信区间',
        type: 'line',
        symbol: 'none',
        smooth: true,
        lineStyle: { opacity: 0 },
        areaStyle: { color: `${token.colorWarning}22` },
        stack: 'forecast-band',
        data: bandData,
      },
      {
        name: '未来预测数据',
        type: 'line',
        smooth: true,
        symbol: 'none',
        lineStyle: { width: 3, type: 'dashed', color: token.colorWarning },
        data: predictData,
      },
    ],
  };
};

export const buildFixedForecastOption = (
  metric: ForecastMetric,
  rangeStart: number,
  rangeEnd: number,
  perspective: PerspectiveProfile,
  token: ThemeToken,
): EChartsOption => {
  const meta = getForecastMeta(metric);
  const durationMs = rangeEnd - rangeStart;
  const forecastMs = durationMs * 0.4;
  const splitMs = rangeEnd - forecastMs;
  const points = Math.max(12, Math.round(durationMs / (5 * 60 * 1000)));
  const baseOffset = perspective.kind === 'province' ? 6 : perspective.kind === 'region' ? 4 : 0;

  const timeline = Array.from({ length: points }, (_, i) => rangeStart + (durationMs * i) / (points - 1));

  const actual = timeline.map((_, i) => round(clamp(
    meta.base + baseOffset + Math.sin(i / 2.6) * 7 + Math.cos(i / 4.5) * 4,
    metric === 'bandwidth' ? 18 : 16,
    metric === 'bandwidth' ? 120 : 95,
  )));

  const predicted = timeline.map((_, i) => round(clamp(
    actual[i] + Math.sin(i / 3.1 + 0.6) * 4,
    metric === 'bandwidth' ? 20 : 18,
    metric === 'bandwidth' ? 125 : 98,
  )));

  const upper = predicted.map((v) => round(v + (metric === 'bandwidth' ? 8 : 6)));
  const lower = predicted.map((v) => round(Math.max(metric === 'bandwidth' ? 10 : 0, v - (metric === 'bandwidth' ? 8 : 6))));
  const band = upper.map((v, i) => round(v - lower[i]));

  const actualData = timeline.map((t, i) => [t, t <= splitMs ? actual[i] : null]);
  const predictData = timeline.map((t, i) => [t, t >= splitMs ? predicted[i] : null]);
  const lowerData = timeline.map((t, i) => [t, t >= splitMs ? lower[i] : null]);
  const bandData = timeline.map((t, i) => [t, t >= splitMs ? band[i] : null]);

  return {
    tooltip: { trigger: 'axis' },
    legend: { top: 0, textStyle: { color: token.colorTextSecondary } },
    grid: { left: 48, right: 28, top: 48, bottom: 36 },
    xAxis: {
      type: 'time',
      axisLabel: {
        color: token.colorTextSecondary,
        formatter: (value: number) => dayjs(value).format('HH:mm'),
      },
    },
    yAxis: {
      type: 'value',
      axisLabel: { color: token.colorTextSecondary, formatter: `{value}${meta.unit}` },
      splitLine: { lineStyle: { color: token.colorBorderSecondary } },
    },
    series: [
      {
        name: '历史真实数据',
        type: 'line',
        smooth: true,
        symbol: 'none',
        lineStyle: { width: 3, color: token.colorPrimary },
        areaStyle: { color: `${token.colorPrimary}18` },
        data: actualData,
        markLine: {
          symbol: ['none', 'none'],
          label: { formatter: '预测起点', color: token.colorInfo },
          lineStyle: { color: token.colorInfo, type: 'dashed', width: 1.5 },
          data: [{ xAxis: splitMs }],
        },
      },
      {
        name: '预测下限',
        type: 'line',
        symbol: 'none',
        smooth: true,
        lineStyle: { opacity: 0 },
        stack: 'forecast-band',
        data: lowerData,
      },
      {
        name: '预测置信区间',
        type: 'line',
        symbol: 'none',
        smooth: true,
        lineStyle: { opacity: 0 },
        areaStyle: { color: `${token.colorWarning}22` },
        stack: 'forecast-band',
        data: bandData,
      },
      {
        name: '未来预测数据',
        type: 'line',
        smooth: true,
        symbol: 'none',
        lineStyle: { width: 3, type: 'dashed', color: token.colorWarning },
        data: predictData,
      },
    ],
  };
};
