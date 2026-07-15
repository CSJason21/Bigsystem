import type { EChartsOption } from 'echarts';
import dayjs from 'dayjs';
import type { ThemeToken } from '../theme';
import type { NodeMeta } from '../nodeMeta';
import type { NodeSample, SeriesPoint } from '../replay/types';

export const buildNodeLineOption = (
  title: string,
  points: SeriesPoint[],
  color: string,
  token: ThemeToken,
): EChartsOption => ({
  title: {
    text: title,
    left: 0,
    textStyle: { fontSize: 14, fontWeight: 600, color: token.colorText },
  },
  tooltip: { trigger: 'axis', valueFormatter: (value) => `${value}%` },
  grid: { left: 40, right: 16, top: 42, bottom: 26 },
  xAxis: {
    type: 'category',
    boundaryGap: false,
    data: points.map((item) => dayjs(item.timestamp).format('HH:mm:ss')),
    axisLabel: { color: token.colorTextTertiary, interval: 4 },
  },
  yAxis: {
    type: 'value',
    min: 0,
    max: 100,
    axisLabel: { color: token.colorTextTertiary },
    splitLine: { lineStyle: { color: token.colorBorderSecondary } },
  },
  series: [{
    type: 'line',
    smooth: true,
    symbol: 'none',
    data: points.map((item) => item.value),
    lineStyle: { width: 3, color },
    areaStyle: { color: `${color}22` },
  }],
});

export const buildGpuOption = (
  meta: NodeMeta,
  sample: NodeSample,
  token: ThemeToken,
): EChartsOption => ({
  tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
  legend: {
    top: 0,
    textStyle: { color: token.colorTextSecondary },
  },
  grid: { left: 64, right: 24, top: 58, bottom: 32, containLabel: true },
  xAxis: {
    type: 'value',
    axisLabel: { color: token.colorTextSecondary, margin: 10, hideOverlap: true },
    splitLine: { lineStyle: { color: token.colorBorderSecondary } },
  },
  yAxis: {
    type: 'category',
    axisLabel: { color: token.colorTextSecondary, width: 56, overflow: 'truncate' },
    data: meta.gpuNames,
  },
  series: [
    {
      name: '算力使用率(%)',
      type: 'bar',
      data: sample.gpuUsage,
      itemStyle: { color: token.colorPrimary, borderRadius: 8 },
      barWidth: 14,
    },
    {
      name: '显存使用量(GB)',
      type: 'bar',
      data: sample.gpuMemory,
      itemStyle: { color: token.colorSuccess, borderRadius: 8 },
      barWidth: 14,
    },
  ],
});
