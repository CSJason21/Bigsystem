
import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';

interface LineChartProps {
  title?: string;
  xData: string[];
  series: {
    name: string;
    data: number[];
    color?: string;
    areaStyle?: boolean;
  }[];
  height?: number;
  smooth?: boolean;
}

/**
 * Reusable line chart component for trends and history data
 */
const LineChart: React.FC<LineChartProps> = ({
  title,
  xData,
  series,
  height = 300,
  smooth = true,
}) => {
  const option: EChartsOption = useMemo(() => ({
    title: title ? { text: title, textStyle: { fontSize: 14, fontWeight: 500 } } : undefined,
    tooltip: { trigger: 'axis' },
    legend: { bottom: 0 },
    grid: { top: title ? 40 : 20, right: 20, bottom: 40, left: 50 },
    xAxis: { type: 'category', data: xData, boundaryGap: false },
    yAxis: { type: 'value' },
    series: series.map((s) => ({
      name: s.name,
      type: 'line' as const,
      data: s.data,
      smooth,
      itemStyle: s.color ? { color: s.color } : undefined,
      areaStyle: s.areaStyle ? { opacity: 0.15 } : undefined,
    })),
  }), [title, xData, series, smooth]);

  return <ReactECharts option={option} style={{ height }} />;
};

export default LineChart;
