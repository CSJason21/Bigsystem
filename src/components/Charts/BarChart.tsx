
import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';

interface BarChartProps {
  title?: string;
  xData: string[];
  series: {
    name: string;
    data: number[];
    color?: string;
  }[];
  height?: number;
  horizontal?: boolean;
}

/**
 * Reusable bar chart component for statistics and comparisons
 */
const BarChart: React.FC<BarChartProps> = ({
  title,
  xData,
  series,
  height = 300,
  horizontal = false,
}) => {
  const option: EChartsOption = useMemo(() => {
    const categoryAxis = { type: 'category' as const, data: xData };
    const valueAxis = { type: 'value' as const };

    return {
      title: title ? { text: title, textStyle: { fontSize: 14, fontWeight: 500 } } : undefined,
      tooltip: { trigger: 'axis' },
      legend: { bottom: 0 },
      grid: { top: title ? 40 : 20, right: 20, bottom: 40, left: horizontal ? 100 : 50 },
      xAxis: horizontal ? valueAxis : categoryAxis,
      yAxis: horizontal ? categoryAxis : valueAxis,
      series: series.map((s) => ({
        name: s.name,
        type: 'bar' as const,
        data: s.data,
        itemStyle: s.color ? { color: s.color } : undefined,
        barMaxWidth: 40,
      })),
    };
  }, [title, xData, series, horizontal]);

  return <ReactECharts option={option} style={{ height }} />;
};

export default BarChart;
