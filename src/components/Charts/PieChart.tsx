
import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';

interface PieChartProps {
  title?: string;
  data: { name: string; value: number }[];
  height?: number;
  roseType?: boolean;
}

/**
 * Reusable pie chart component for ratio/proportion display
 */
const PieChart: React.FC<PieChartProps> = ({
  title,
  data,
  height = 300,
  roseType = false,
}) => {
  const option: EChartsOption = useMemo(() => ({
    title: title ? { text: title, textStyle: { fontSize: 14, fontWeight: 500 } } : undefined,
    tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
    legend: { bottom: 0, type: 'scroll' },
    series: [
      {
        type: 'pie',
        radius: roseType ? ['20%', '65%'] : ['40%', '65%'],
        center: ['50%', '45%'],
        roseType: roseType ? 'area' : undefined,
        data,
        emphasis: {
          itemStyle: { shadowBlur: 10, shadowOffsetX: 0, shadowColor: 'rgba(0, 0, 0, 0.2)' },
        },
        label: { formatter: '{b}\n{d}%' },
      },
    ],
  }), [title, data, roseType]);

  return <ReactECharts option={option} style={{ height }} />;
};

export default PieChart;
