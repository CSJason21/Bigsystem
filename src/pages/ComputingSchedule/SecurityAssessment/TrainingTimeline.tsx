import React, { useMemo, useState, useRef, useCallback } from 'react';
import {
  Row, Col, Card, Tag, Typography, Statistic, Drawer, Descriptions,
  Select, Space, Progress, Empty, Table,
} from 'antd';
import {
  ExperimentOutlined, ClockCircleOutlined, ThunderboltOutlined,
  NodeIndexOutlined, SwapOutlined, InfoCircleOutlined, BarChartOutlined,
} from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import {
  TRAINING_EVENTS, GPU_UTIL_DATA, WORKLOAD_META, getTrainingStats,
  type TrainingEvent,
} from './data_training';

const { Text, Title } = Typography;

/* ================================================================
 * Phase/Layer display helpers
 * ================================================================ */
const phaseLabel: Record<string, string> = {
  forward_compute: '前向计算',
  forward_allgather: '前向 AllGather',
  weight_grad_compute: '权重梯度计算',
  input_grad_compute: '输入梯度计算',
  input_grad_comm: '输入梯度通信',
};

const layerColors: Record<string, string> = {
  embedding_layer: '#722ed1',
  attention_column: '#1677ff',
  attention_row: '#52c41a',
  mlp_layer: '#faad14',
};

const PHASE_ORDER = [
  'forward_compute', 'forward_allgather',
  'weight_grad_compute', 'input_grad_compute', 'input_grad_comm',
];

const LAYER_ORDER = ['embedding_layer', 'attention_column', 'attention_row', 'mlp_layer'];

/* ================================================================
 * TrainingTimeline Component
 * ================================================================ */
const TrainingTimeline: React.FC = () => {
  const [selectedEvent, setSelectedEvent] = useState<TrainingEvent | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [filterLayer, setFilterLayer] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');
  const chartRef = useRef<ReactECharts>(null);

  const stats = useMemo(() => getTrainingStats(), []);

  // Filtered events
  const filteredEvents = useMemo(() => {
    return TRAINING_EVENTS.filter(e => {
      if (filterLayer !== 'all' && e.layer !== filterLayer) return false;
      if (filterType !== 'all' && e.event_type !== filterType) return false;
      return true;
    });
  }, [filterLayer, filterType]);

  // Build step-layer categories for Y-axis
  const stepLayerCategories = useMemo(() => {
    const cats = [...new Set(TRAINING_EVENTS.map(e => `${e.step}:${e.layer}`))];
    // Sort by step then layer order
    return cats.sort((a, b) => {
      const [sa, la] = a.split(':');
      const [sb, lb] = b.split(':');
      if (sa !== sb) return parseInt(sa) - parseInt(sb);
      return LAYER_ORDER.indexOf(la) - LAYER_ORDER.indexOf(lb);
    });
  }, []);

  // Category index map: step:layer -> index
  const catIndexMap = useMemo(() => {
    const m = new Map<string, number>();
    stepLayerCategories.forEach((c, i) => m.set(c, i));
    return m;
  }, [stepLayerCategories]);

  // Max duration for sizing
  const maxDurationNs = useMemo(() =>
    Math.max(...TRAINING_EVENTS.map(e => e.duration_ns)), []);

  // Scatter data for compute and communication series
  const computeScatterData = useMemo(() => {
    return filteredEvents
      .filter(e => e.event_type === 'compute')
      .map(e => {
        const cat = `${e.step}:${e.layer}`;
        const yi = catIndexMap.get(cat) ?? 0;
        return {
          value: [e.timestamp_us, yi, e.duration_ns, e.gpu_util_pct],
          event: e,
        };
      });
  }, [filteredEvents, catIndexMap]);

  const commScatterData = useMemo(() => {
    return filteredEvents
      .filter(e => e.event_type === 'communication')
      .map(e => {
        const cat = `${e.step}:${e.layer}`;
        const yi = catIndexMap.get(cat) ?? 0;
        return {
          value: [e.timestamp_us, yi, e.duration_ns, e.gpu_util_pct],
          event: e,
        };
      });
  }, [filteredEvents, catIndexMap]);

  // GPU utilization line data: aggregate by timestamp (take average where duplicates)
  const gpuLineData = useMemo(() => {
    const map = new Map<number, number[]>();
    GPU_UTIL_DATA.forEach(p => {
      const t = Math.round(p.timestamp_us * 10) / 10;
      if (!map.has(t)) map.set(t, []);
      map.get(t)!.push(p.gpu_util_pct);
    });
    return Array.from(map.entries())
      .sort(([a], [b]) => a - b)
      .map(([t, vals]) => [t, Math.round(vals.reduce((s, v) => s + v, 0) / vals.length)]);
  }, []);

  // ===== ECharts option =====
  const chartOption = useMemo(() => {
    const yCategories = stepLayerCategories.map(c => {
      const [s, layer] = c.split(':');
      return `S${s}: ${layer === 'embedding_layer' ? 'Embed' : layer === 'attention_column' ? 'Attn-Col' : layer === 'attention_row' ? 'Attn-Row' : 'MLP'}`;
    });

    return {
      tooltip: {
        trigger: 'item',
        formatter: (params: any) => {
          if (params.seriesType === 'line') {
            return `<b>时间 ${params.value[0]}μs</b><br/>GPU 利用率: ${params.value[1]}%`;
          }
          const ev = params.data?.event as TrainingEvent | undefined;
          if (!ev) return '';
          const durUs = (ev.duration_ns / 1000).toFixed(3);
          return `
            <div style="font-size:13px;font-weight:bold;margin-bottom:4px">S${ev.step} · ${ev.layer}</div>
            <div>阶段: ${phaseLabel[ev.phase] || ev.phase}</div>
            <div>时间: ${ev.timestamp_us}μs</div>
            <div>耗时: ${durUs}μs (${ev.duration_ns}ns)</div>
            <div>GPU: ${ev.gpu_util_pct}%</div>
            ${ev.event_type === 'communication' ? `<div>通信: ${ev.comm_type} · ${(ev.comm_size_bytes / 1024 / 1024).toFixed(0)}MB</div>` : ''}
            <div style="color:#999;font-size:11px;margin-top:4px">点击查看详情</div>
          `;
        },
      },
      grid: { left: 100, right: 80, top: 10, bottom: 60 },
      xAxis: {
        type: 'value',
        name: '时间 (μs)',
        nameLocation: 'center',
        nameGap: 35,
        axisLabel: { fontSize: 11 },
      },
      yAxis: {
        type: 'category',
        data: yCategories,
        axisLabel: { fontSize: 11, width: 80, overflow: 'truncate' },
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { show: true, lineStyle: { color: '#f0f0f0', type: 'dashed' } },
      },
      series: [
        // GPU utilisation line (top overlay)
        {
          type: 'line',
          data: gpuLineData,
          smooth: true,
          showSymbol: false,
          lineStyle: { color: 'rgba(22,119,255,0.3)', width: 1.5 },
          areaStyle: { color: 'rgba(22,119,255,0.06)' },
          z: 1,
        },
        // Compute scatter
        {
          name: '计算 (Compute)',
          type: 'scatter',
          data: computeScatterData,
          symbolSize: (val: number[]) => {
            const dur = val[2] || 0;
            return Math.max(8, Math.min(40, 8 + (dur / maxDurationNs) * 32));
          },
          itemStyle: {
            color: '#1677ff',
            opacity: 0.85,
            borderColor: '#0d5bdd',
            borderWidth: 1,
          },
          z: 3,
        },
        // Communication scatter
        {
          name: '通信 (Communication)',
          type: 'scatter',
          data: commScatterData,
          symbolSize: (val: number[]) => {
            const dur = val[2] || 0;
            return Math.max(8, Math.min(40, 8 + (dur / maxDurationNs) * 32));
          },
          itemStyle: {
            color: '#fa8c16',
            opacity: 0.85,
            borderColor: '#d46b08',
            borderWidth: 1,
          },
          z: 3,
        },
      ],
      legend: {
        data: [
          { name: '计算 (Compute)', icon: 'circle', textStyle: { color: '#1677ff' } },
          { name: '通信 (Communication)', icon: 'circle', textStyle: { color: '#fa8c16' } },
        ],
        bottom: 0,
        left: 'center',
      },
      // Visual map for point color intensity
      visualMap: {
        show: false,
        dimension: 3,
        min: 0,
        max: 100,
        inRange: { opacity: [0.5, 1] },
        calculable: false,
      },
    };
  }, [stepLayerCategories, computeScatterData, commScatterData, gpuLineData, maxDurationNs]);

  // ===== Click handler =====
  const onChartClick = useCallback((params: any) => {
    const ev = params.data?.event as TrainingEvent | undefined;
    if (ev) {
      setSelectedEvent(ev);
      setDrawerOpen(true);
    }
  }, []);

  // ===== Nearby GPU util for selected event =====
  const nearbyGPUUtil = useMemo(() => {
    if (!selectedEvent) return [];
    const t = selectedEvent.timestamp_us;
    return GPU_UTIL_DATA
      .filter(p => Math.abs(p.timestamp_us - t) < 5)
      .slice(0, 8);
  }, [selectedEvent]);

  // ===== Layer time breakdown for selected event's step =====
  const stepBreakdown = useMemo(() => {
    if (!selectedEvent) return [];
    const step = selectedEvent.step;
    const events = TRAINING_EVENTS.filter(e => e.step === step);
    return events.map(e => ({
      ...e,
      durUs: e.duration_ns / 1000,
    }));
  }, [selectedEvent]);

  const selectedLabel = selectedEvent
    ? `S${selectedEvent.step} · ${selectedEvent.layer} · ${phaseLabel[selectedEvent.phase] || selectedEvent.phase}`
    : '';

  return (
    <div>
      {/* ===== Row 1: Statistics Summary ===== */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col span={4}>
          <Card size="small"><Statistic title="总步数" value={stats.uniqueSteps} suffix="步" prefix={<NodeIndexOutlined />} /></Card>
        </Col>
        <Col span={4}>
          <Card size="small"><Statistic title="总耗时" value={stats.totalTimeUs.toFixed(1)} suffix="μs" prefix={<ClockCircleOutlined />} /></Card>
        </Col>
        <Col span={4}>
          <Card size="small">
            <Statistic title="计算事件" value={stats.computeEventCount} suffix={`/${stats.computeEventCount + stats.commEventCount}`} prefix={<ThunderboltOutlined />} />
          </Card>
        </Col>
        <Col span={4}>
          <Card size="small"><Statistic title="计算占比" value={stats.computePct} suffix="%" valueStyle={{ color: '#1677ff' }} prefix={<BarChartOutlined />} /></Card>
        </Col>
        <Col span={4}>
          <Card size="small"><Statistic title="通信占比" value={stats.commPct} suffix="%" valueStyle={{ color: '#fa8c16' }} prefix={<SwapOutlined />} /></Card>
        </Col>
        <Col span={4}>
          <Card size="small"><Statistic title="模型并行" value={WORKLOAD_META.model_parallel_group_size} suffix="GPU" prefix={<ExperimentOutlined />} /></Card>
        </Col>
      </Row>

      {/* ===== Row 2: Layer compute/comm breakdown bar ===== */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        {Object.entries(stats.layerStats).map(([layer, s]) => {
          const total = s.compute_ns + s.comm_ns;
          const computePct = total > 0 ? +(s.compute_ns / total * 100).toFixed(0) : 0;
          const commPct = total > 0 ? +(s.comm_ns / total * 100).toFixed(0) : 0;
          return (
            <Col span={6} key={layer}>
              <Card size="small" title={
                <Space>
                  <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: layerColors[layer] }} />
                  <Text style={{ fontSize: 12 }}>{layer === 'embedding_layer' ? 'Embedding' : layer === 'attention_column' ? 'Attention-Col' : layer === 'attention_row' ? 'Attention-Row' : 'MLP'}</Text>
                </Space>
              }>
                <div style={{ fontSize: 12, marginBottom: 4 }}>计算 <Text type="secondary">{computePct}%</Text> | 通信 <Text type="secondary">{commPct}%</Text></div>
                <Progress
                  percent={computePct}
                  success={{ percent: computePct, strokeColor: '#1677ff' }}
                  strokeColor="#fa8c16"
                  format={() => ''}
                  size="small"
                />
                <div style={{ fontSize: 11, color: '#999', marginTop: 4 }}>{s.count} 个事件</div>
              </Card>
            </Col>
          );
        })}
      </Row>

      {/* ===== Row 3: Filters ===== */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap>
          <span style={{ fontSize: 13, fontWeight: 500 }}>筛选: </span>
          <Select
            value={filterLayer}
            onChange={setFilterLayer}
            style={{ width: 160 }}
            options={[
              { value: 'all', label: '全部 Layer' },
              ...LAYER_ORDER.map(l => ({
                value: l,
                label: l === 'embedding_layer' ? 'Embedding' : l === 'attention_column' ? 'Attention-Col' : l === 'attention_row' ? 'Attention-Row' : 'MLP',
              })),
            ]}
          />
          <Select
            value={filterType}
            onChange={setFilterType}
            style={{ width: 160 }}
            options={[
              { value: 'all', label: '全部类型' },
              { value: 'compute', label: '计算 (Compute)' },
              { value: 'communication', label: '通信 (Communication)' },
            ]}
          />
          <Text type="secondary" style={{ fontSize: 12 }}>
            <InfoCircleOutlined style={{ marginRight: 4 }} />
            点击任意圆点查看该时间点的详细信息。点大小 = 耗时长短。
          </Text>
        </Space>
      </Card>

      {/* ===== Row 4: The Big Chart ===== */}
      <Card
        title={
          <Space>
            <ClockCircleOutlined />
            <span>训练时间线大图</span>
            <Text type="secondary" style={{ fontSize: 12, fontWeight: 400 }}>
              Y 轴 = 训练步数 (Step) + 网络层 / X 轴 = 时间 (μs)
            </Text>
          </Space>
        }
        style={{ marginBottom: 16 }}
      >
        <ReactECharts
          ref={chartRef}
          option={chartOption}
          style={{ height: Math.max(400, stepLayerCategories.length * 36) }}
          onEvents={{ click: onChartClick }}
        />
      </Card>

      {/* ===== Detail Drawer ===== */}
      <Drawer
        title={
          <Space>
            <InfoCircleOutlined />
            <span>事件详情: {selectedLabel}</span>
          </Space>
        }
        placement="right"
        width={520}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      >
        {selectedEvent && (
          <>
            <Card size="small" title="事件基本信息" style={{ marginBottom: 12 }}>
              <Descriptions column={2} size="small">
                <Descriptions.Item label="时间戳 (μs)">{selectedEvent.timestamp_us}</Descriptions.Item>
                <Descriptions.Item label="时间戳 (ns)">{selectedEvent.timestamp_ns}</Descriptions.Item>
                <Descriptions.Item label="步数 (Step)"><Tag color="blue">S{selectedEvent.step}</Tag></Descriptions.Item>
                <Descriptions.Item label="网络层">
                  <Tag color={layerColors[selectedEvent.layer]}>{selectedEvent.layer}</Tag>
                </Descriptions.Item>
                <Descriptions.Item label="阶段">{phaseLabel[selectedEvent.phase] || selectedEvent.phase}</Descriptions.Item>
                <Descriptions.Item label="事件类型">
                  <Tag color={selectedEvent.event_type === 'compute' ? 'blue' : 'orange'}>
                    {selectedEvent.event_type === 'compute' ? '计算' : '通信'}
                  </Tag>
                </Descriptions.Item>
                <Descriptions.Item label="GPU 利用率">{selectedEvent.gpu_util_pct}%</Descriptions.Item>
                <Descriptions.Item label="GPU ID">{selectedEvent.gpu_id}</Descriptions.Item>
              </Descriptions>
            </Card>

            <Card size="small" title="耗时分析" style={{ marginBottom: 12 }}>
              <Descriptions column={2} size="small">
                <Descriptions.Item label="持续时间 (ns)">
                  <Text strong style={{ color: '#1677ff', fontSize: 16 }}>{selectedEvent.duration_ns.toLocaleString()}</Text>
                </Descriptions.Item>
                <Descriptions.Item label="持续时间 (μs)">
                  {(selectedEvent.duration_ns / 1000).toFixed(3)}
                </Descriptions.Item>
              </Descriptions>
              {selectedEvent.comm_type !== 'NONE' && (
                <div style={{ marginTop: 8, padding: '8px 12px', background: '#fff7e6', borderRadius: 6 }}>
                  <Text strong style={{ color: '#d46b08' }}>通信详情</Text>
                  <div style={{ marginTop: 4 }}>
                    类型: <Tag color="orange">{selectedEvent.comm_type}</Tag>
                    数据量: <Text strong>{(selectedEvent.comm_size_bytes / 1024 / 1024).toFixed(0)} MB</Text>
                  </div>
                </div>
              )}
            </Card>

            {/* Nearby GPU Util */}
            <Card size="small" title="附近 GPU 利用率" style={{ marginBottom: 12 }}>
              {nearbyGPUUtil.length > 0 ? (
                <Table
                  dataSource={nearbyGPUUtil}
                  rowKey={(_, i) => String(i)}
                  pagination={false}
                  size="small"
                  columns={[
                    { title: '时间 (μs)', dataIndex: 'timestamp_us', key: 't', width: 90, render: (v: number) => v.toFixed(1) },
                    { title: 'GPU 利用率', dataIndex: 'gpu_util_pct', key: 'gpu', width: 90, render: (v: number) => <Tag color={v >= 80 ? 'blue' : v >= 50 ? 'orange' : 'red'}>{v}%</Tag> },
                    { title: '类型', dataIndex: 'event_type', key: 'type', width: 80 },
                    { title: 'Layer', dataIndex: 'layer', key: 'layer' },
                  ]}
                />
              ) : (
                <Empty description="无附近数据" />
              )}
            </Card>

            {/* Step breakdown */}
            <Card size="small" title={`S${selectedEvent.step} 完整事件序列`}>
              <Table
                dataSource={stepBreakdown}
                rowKey={(_, i) => String(i)}
                pagination={false}
                size="small"
                columns={[
                  { title: '阶段', dataIndex: 'phase', key: 'phase', render: (v: string) => phaseLabel[v] || v, width: 120 },
                  { title: 'Layer', dataIndex: 'layer', key: 'layer', render: (v: string) => <Tag color={layerColors[v]} style={{ fontSize: 10 }}>{v}</Tag>, width: 120 },
                  { title: '类型', dataIndex: 'event_type', key: 'type', render: (v: string) => <Tag color={v === 'compute' ? 'blue' : 'orange'} style={{ fontSize: 10 }}>{v === 'compute' ? '计算' : '通信'}</Tag>, width: 70 },
                  { title: '耗时 (μs)', dataIndex: 'durUs', key: 'dur', render: (v: number) => v.toFixed(3), width: 100 },
                  { title: 'GPU %', dataIndex: 'gpu_util_pct', key: 'gpu', width: 70 },
                ]}
              />
            </Card>
          </>
        )}
      </Drawer>
    </div>
  );
};

export default TrainingTimeline;
