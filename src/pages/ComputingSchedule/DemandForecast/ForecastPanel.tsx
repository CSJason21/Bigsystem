import React from 'react';
import { Card } from 'antd';
import type { EChartsOption } from 'echarts';
import ReactECharts from 'echarts-for-react';

export interface ForecastPanelProps {
  title: string;
  forecastOption: EChartsOption;
  current?: number;
  predicted?: number;
  unit?: string;
}

const ForecastPanel: React.FC<ForecastPanelProps> = ({
  title,
  forecastOption,
  current,
  predicted,
  unit,
}) => {
  const extra = (current !== undefined || predicted !== undefined) && (
    <span style={{ fontSize: 13, color: '#8c8c8c' }}>
      {current !== undefined && <span style={{ marginRight: 12 }}>当前 <b style={{ color: '#1677ff' }}>{current}{unit}</b></span>}
      {predicted !== undefined && <span>预测 <b style={{ color: '#faad14' }}>{predicted}{unit}</b></span>}
    </span>
  );

  return (
    <Card title={title} extra={extra} styles={{ body: { padding: '12px 16px 8px' } }}>
      <ReactECharts option={forecastOption} style={{ height: 230 }} notMerge lazyUpdate />
    </Card>
  );
};

export default ForecastPanel;
