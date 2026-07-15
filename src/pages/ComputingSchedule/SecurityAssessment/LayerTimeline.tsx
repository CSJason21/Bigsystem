import React, { useEffect, useState, useCallback } from 'react';
import { Row, Col, Card, Tag, Typography, Modal, Space } from 'antd';
import {
  DatabaseOutlined,
  ExperimentOutlined,
  WifiOutlined,
  DesktopOutlined,
  LineChartOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  MinusOutlined,
} from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import type { SecurityLayer } from './types';
import { SECURITY_LAYER_LABELS } from './types';

const { Text } = Typography;

/* ================================================================
 * 子指标配置
 * ================================================================ */

interface SubIndicatorDef {
  key: string;
  name: string;
  weight: number; // 百分比，如 40 表示 40%
  baseScore: number; // 初始基准分
}

interface SubIndicatorSnapshot {
  key: string;
  score: number;
}

interface LayerSnapshot {
  time: string;
  totalScore: number;
  subs: SubIndicatorSnapshot[];
}

const LAYER_COLORS: Record<SecurityLayer, string> = {
  data: '#1677ff',
  algorithm: '#faad14',
  network: '#52c41a',
  system: '#eb2f96',
};

const LAYER_BG: Record<SecurityLayer, string> = {
  data: '#e6f0ff',
  algorithm: '#fffbe6',
  network: '#e6ffef',
  system: '#fde6f0',
};

const LAYER_ICONS: Record<SecurityLayer, React.ReactNode> = {
  data: <DatabaseOutlined />,
  algorithm: <ExperimentOutlined />,
  network: <WifiOutlined />,
  system: <DesktopOutlined />,
};

const SUB_INDICATORS: Record<SecurityLayer, SubIndicatorDef[]> = {
  data: [
    { key: 'epsilon', name: 'ε合规率', weight: 40, baseScore: 89 },
    { key: 'correlation', name: '关联泄露风险', weight: 35, baseScore: 86 },
    { key: 'compliance', name: '业务方合规', weight: 25, baseScore: 84 },
  ],
  algorithm: [
    { key: 'attack_defense', name: '攻击防御率', weight: 25, baseScore: 83 },
    { key: 'malicious_defense', name: '恶意比防御', weight: 20, baseScore: 85 },
    { key: 'avg_accuracy', name: '平均训练精度', weight: 20, baseScore: 80 },
    { key: 'fairness', name: '公平性指数', weight: 20, baseScore: 82 },
    { key: 'distillation', name: '蒸馏鲁棒性', weight: 15, baseScore: 79 },
  ],
  network: [
    { key: 'packet_loss', name: '丢包率防御', weight: 35, baseScore: 78 },
    { key: 'link_health', name: '链路健康度', weight: 25, baseScore: 80 },
    { key: 'comm_saving', name: '通信节省率', weight: 40, baseScore: 77 },
  ],
  system: [
    { key: 'trust', name: '节点可信度', weight: 25, baseScore: 75 },
    { key: 'health', name: '节点健康度', weight: 20, baseScore: 78 },
    { key: 'alert', name: '告警扣分', weight: 20, baseScore: 73 },
    { key: 'schedule', name: '调度成功率', weight: 20, baseScore: 80 },
    { key: 'storage', name: '存储集群健康', weight: 15, baseScore: 76 },
  ],
};

/** 子指标分析文案 */
function getSubAnalysis(layer: SecurityLayer, key: string, score: number, trend: 'up' | 'down' | 'same', prevScore?: number): string {
  const delta = prevScore != null ? score - prevScore : 0;
  const level = score >= 85 ? '优' : score >= 75 ? '良' : score >= 65 ? '中' : '差';
  const trendLabel = trend === 'up' ? '改善' : trend === 'down' ? '恶化' : '稳定';
  const trendDetail = trend === 'up' ? `上升 +${delta}` : trend === 'down' ? `下降 ${delta}` : `持平`;

  const eventReasons: Record<string, Record<string, string>> = {
    data: {
      epsilon: 'ε合规率变动：高ε任务数变化或新增数据集接入',
      correlation: '关联泄露风险变化：数据集间关联度波动或新增关联对',
      compliance: '业务方合规变化：合规审批等级调整或新业务方接入',
    },
    algorithm: {
      attack_defense: '攻击防御率变动：训练任务检测到投毒攻击或攻击缓解',
      malicious_defense: '恶意比防御变化：恶意节点检测比例波动或算法切换',
      avg_accuracy: '训练精度变化：模型收敛速度波动或数据分布偏移',
      fairness: '公平性变化：跨节点资源分配不均或Jain指数波动',
      distillation: '蒸馏鲁棒性变化：知识蒸馏效果波动或节点差异扩大',
    },
    network: {
      packet_loss: '丢包率变化：网络链路拥塞或节点间通信波动',
      link_health: '链路健康变化：链路降级/恢复切换或新链路加入',
      comm_saving: '通信节省变化：优化策略调整或梯度压缩比率变动',
    },
    system: {
      trust: '节点可信度变化：超算节点信任评分更新或异常行为检测',
      health: '节点健康度变化：节点资源使用率波动或硬件异常',
      alert: '告警扣分变化：新增告警触发或告警恢复',
      schedule: '调度成功率变化：任务调度拥塞或资源争抢',
      storage: '存储健康变化：集群容量使用率波动或IO性能下降',
    },
  };

  const reason = eventReasons[layer]?.[key] || '';
  if (trend === 'same') {
    return `当前${level}，态势${trendLabel}。${reason}`;
  }
  return `当前${level}，${trendLabel}（${trendDetail}）。可能原因：${reason}`;
}

/* ================================================================
 * LayerTimeline 组件
 * ================================================================ */

interface Props {
  layer: SecurityLayer;
}

const LayerTimeline: React.FC<Props> = ({ layer }) => {
  const subsDef = SUB_INDICATORS[layer];
  const [history, setHistory] = useState<LayerSnapshot[]>([]);
  const [selectedSnap, setSelectedSnap] = useState<LayerSnapshot | null>(null);
  const [snapModalOpen, setSnapModalOpen] = useState(false);

  // 初始造历史数据
  useEffect(() => {
    const now = new Date();
    const initial: LayerSnapshot[] = Array.from({ length: 20 }, (_, i) => {
      const t = new Date(now.getTime() - (19 - i) * 30000);
      const time = t.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const ratio = (i + 1) / 20;
      const subs: SubIndicatorSnapshot[] = subsDef.map(s => {
        const r = 1 - ratio * 0.6;
        const sScore = Math.max(50, Math.min(100, Math.round(s.baseScore + (Math.random() - 0.5) * 12 * r)));
        return { key: s.key, score: sScore };
      });
      const total = subs.reduce((sum, s) => {
        const w = subsDef.find(d => d.key === s.key)?.weight || 25;
        return sum + s.score * (w / 100);
      }, 0);
      return { time, totalScore: Math.round(total * 10) / 10, subs };
    });
    setHistory(initial);
  }, []);// eslint-disable-line react-hooks/exhaustive-deps

  // 每 30s 追加新快照
  useEffect(() => {
    const tick = setInterval(() => {
      setHistory(prev => {
        if (prev.length === 0) return prev;
        const last = prev[prev.length - 1];
        const time = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const subs: SubIndicatorSnapshot[] = subsDef.map(s => {
          const prevSub = last.subs.find(ps => ps.key === s.key);
          const base = prevSub ? prevSub.score : s.baseScore;
          const delta = Math.round((Math.random() - 0.5) * 4);
          return { key: s.key, score: Math.max(50, Math.min(100, base + delta)) };
        });
        const total = subs.reduce((sum, s) => {
          const w = subsDef.find(d => d.key === s.key)?.weight || 25;
          return sum + s.score * (w / 100);
        }, 0);
        const snap: LayerSnapshot = { time, totalScore: Math.round(total * 10) / 10, subs };
        const next = [...prev, snap];
        return next.length > 30 ? next.slice(-30) : next;
      });
    }, 30000);
    return () => clearInterval(tick);
  }, []);// eslint-disable-line react-hooks/exhaustive-deps

  const scores = history.map(h => h.totalScore);
  const avgScore = scores.length > 0 ? +(scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : 0;
  const maxScore = scores.length > 0 ? Math.max(...scores) : 0;
  const minScore = scores.length > 0 ? Math.min(...scores) : 0;
  const maxIdx = scores.indexOf(maxScore);
  const minIdx = scores.indexOf(minScore);

  const scoreColor = (s: number) => s >= 85 ? '#52c41a' : s >= 75 ? '#1677ff' : s >= 65 ? '#faad14' : '#ff4d4f';

  const chartOption = {
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255,255,255,0.95)',
      borderColor: LAYER_COLORS[layer],
      borderWidth: 2,
      padding: [10, 14],
      textStyle: { fontSize: 12 },
      formatter: (params: any) => {
        const p = params[0];
        const val = Number(p.value);
        const grade = val >= 85 ? '优' : val >= 75 ? '良' : val >= 65 ? '中' : '差';
        const gradeColor = val >= 85 ? '#52c41a' : val >= 75 ? '#1677ff' : val >= 65 ? '#faad14' : '#ff4d4f';
        const diffNum = +(val - avgScore).toFixed(1);
        const diffLabel = diffNum > 0 ? `高于均值 ${diffNum}` : diffNum < 0 ? `低于均值 ${diffNum}` : `等于均值`;
        const diffColor = diffNum > 0 ? '#52c41a' : diffNum < 0 ? '#ff4d4f' : '#999';
        return `
          <div style="font-size:13px;font-weight:700;margin-bottom:4px">${p.axisValue}</div>
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
            <span>${SECURITY_LAYER_LABELS[layer]}评分</span>
            <span style="font-size:20px;font-weight:700;color:${gradeColor}">${val}</span>
            <span style="font-size:11px;color:${gradeColor};background:${gradeColor}22;padding:0 6px;border-radius:4px">${grade}</span>
          </div>
          <div style="font-size:11px;color:${diffColor}">${diffLabel}</div>
          <div style="font-size:10px;color:#999;margin-top:4px;border-top:1px solid #eee;padding-top:4px">点击查看子指标详情</div>
        `;
      },
    },
    grid: { top: 16, right: 16, bottom: 36, left: 48 },
    xAxis: {
      type: 'category',
      data: history.map(h => h.time),
      axisLabel: { fontSize: 10, rotate: 30, color: '#888' },
      axisLine: { lineStyle: { color: '#ddd' } },
      axisTick: { lineStyle: { color: '#ddd' } },
      boundaryGap: false,
    },
    yAxis: {
      type: 'value', min: 55, max: 100,
      axisLabel: { fontSize: 10, color: '#888' },
      splitLine: { lineStyle: { type: 'dashed', opacity: 0.25, color: '#ccc' } },
      axisLine: { show: false },
      axisTick: { show: false },
    },
    // 分区背景色带
    visualMap: {
      show: false,
      min: 55,
      max: 100,
      calculable: false,
      inRange: {
        color: ['#ff4d4f33', '#faad1433', '#1677ff33', '#52c41a33'],
      },
    },
    // 区域缩放滑块
    dataZoom: [
      {
        type: 'slider',
        show: scores.length > 8,
        start: 0,
        end: 100,
        height: 14,
        bottom: 0,
        borderColor: '#ddd',
        fillerColor: LAYER_COLORS[layer] + '33',
        handleStyle: { color: LAYER_COLORS[layer], borderColor: LAYER_COLORS[layer] },
        textStyle: { fontSize: 9 },
        labelFormatter: (v: number, vStr: string) => vStr,
      },
      {
        type: 'inside',
        start: 0,
        end: 100,
      },
    ],
    series: [{
      type: 'line',
      smooth: true,
      symbol: 'circle',
      data: scores.map((v, i) => ({
        value: v,
        itemStyle: {
          color: scoreColor(v),
          borderColor: '#fff',
          borderWidth: i === scores.length - 1 ? 2.5 : 1.5,
          shadowBlur: i === scores.length - 1 ? 8 : 0,
          shadowColor: scoreColor(v) + '66',
        },
        symbolSize: i === scores.length - 1 ? 10 : i === maxIdx || i === minIdx ? 8 : 4,
      })),
      lineStyle: {
        width: 2.5,
        color: LAYER_COLORS[layer],
        shadowBlur: 4,
        shadowColor: LAYER_COLORS[layer] + '44',
      },
      areaStyle: {
        color: {
          type: 'linear',
          x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: LAYER_COLORS[layer] + '55' },
            { offset: 0.6, color: LAYER_COLORS[layer] + '22' },
            { offset: 1, color: LAYER_COLORS[layer] + '05' },
          ],
        },
      },
      // 最高/最低标注
      markPoint: {
        silent: true,
        symbol: 'pin',
        symbolSize: 36,
        data: [
          {
            name: '最高',
            coord: [history[maxIdx]?.time, maxScore],
            value: maxScore,
            itemStyle: { color: '#52c41a' },
            label: { formatter: `最高\n${maxScore}`, fontSize: 9, color: '#fff', lineHeight: 12 },
          },
          {
            name: '最低',
            coord: [history[minIdx]?.time, minScore],
            value: minScore,
            itemStyle: { color: '#ff4d4f' },
            label: { formatter: `最低\n${minScore}`, fontSize: 9, color: '#fff', lineHeight: 12 },
          },
        ].filter(Boolean),
      },
      // 等级参考线
      markLine: {
        silent: true, symbol: 'none',
        data: [
          { yAxis: 85, label: { formatter: '优 85', fontSize: 9, color: '#52c41a', position: 'insideEndTop' }, lineStyle: { type: 'dashed', color: '#52c41a', width: 1, opacity: 0.6 } },
          { yAxis: 75, label: { formatter: '良 75', fontSize: 9, color: '#1677ff', position: 'insideEndTop' }, lineStyle: { type: 'dashed', color: '#1677ff', width: 1, opacity: 0.6 } },
          { yAxis: 65, label: { formatter: '中 65', fontSize: 9, color: '#faad14', position: 'insideEndTop' }, lineStyle: { type: 'dashed', color: '#faad14', width: 1, opacity: 0.6 } },
          // 均值线
          {
            yAxis: avgScore,
            label: { formatter: `均值 ${avgScore}`, fontSize: 9, color: '#888', position: 'insideEndTop' },
            lineStyle: { type: 'dotted', color: '#888', width: 1, opacity: 0.5 },
          },
        ],
      },
    }],
  };

  // 标注最高最低点索引（用于 symbolSize）
  if (maxIdx >= 0 && maxIdx < history.length) {
    chartOption.series[0].data[maxIdx] = {
      ...chartOption.series[0].data[maxIdx],
      symbolSize: 8,
    };
  }
  if (minIdx >= 0 && minIdx < history.length) {
    chartOption.series[0].data[minIdx] = {
      ...chartOption.series[0].data[minIdx],
      symbolSize: 8,
    };
  }

  const handleChartClick = useCallback((params: any) => {
    if (params.componentType === 'series' && params.dataIndex != null) {
      const snap = history[params.dataIndex];
      if (snap) { setSelectedSnap(snap); setSnapModalOpen(true); }
    }
  }, [history]);

  const noHistory = history.length === 0;
  // 图表高度自适应：根据数据点数量动态计算，最少 160px，最多 280px
  const chartHeight = Math.max(160, Math.min(280, 140 + history.length * 2.5));

  return (
    <>
      <Card
        size="small"
        title={
          <span>
            <LineChartOutlined /> {SECURITY_LAYER_LABELS[layer]}评分时序
            <Text type="secondary" style={{ fontSize: 11, marginLeft: 8 }}>每30s采集 · 点击数据点查看子指标详情</Text>
          </span>
        }
        styles={{ body: { padding: '8px 12px' } }}
        style={{ marginBottom: 16 }}
      >
        {noHistory ? (
          <div style={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999' }}>
            数据采集中...
          </div>
        ) : (
          <ReactECharts option={chartOption} style={{ height: chartHeight }} onEvents={{ click: handleChartClick }} />
        )}
        {/* 悬浮统计条 */}
        {history.length >= 2 && (() => {
          const scores = history.map(h => h.totalScore);
          const cur = scores[scores.length - 1];
          const max = Math.max(...scores);
          const min = Math.min(...scores);
          const avg = +(scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1);
          const range = +(max - min).toFixed(1);
          const lastDelta = +(cur - scores[scores.length - 2]).toFixed(1);
          const curLevel = cur >= 85 ? '优' : cur >= 75 ? '良' : cur >= 65 ? '中' : '差';
          const curColor = cur >= 85 ? '#52c41a' : cur >= 75 ? '#1677ff' : cur >= 65 ? '#faad14' : '#ff4d4f';
          return (
            <div style={{ marginTop: 6, padding: '4px 8px', background: '#f8f9fa', borderRadius: 6, fontSize: 11 }}>
              <Row gutter={[8, 0]}>
                <Col span={3} style={{ textAlign: 'center' }}>
                  <Text type="secondary" style={{ fontSize: 9 }}>当前</Text>
                  <div style={{ fontWeight: 700, color: curColor }}>{cur}</div>
                </Col>
                <Col span={2} style={{ textAlign: 'center' }}>
                  <Text type="secondary" style={{ fontSize: 9 }}>趋势</Text>
                  <div style={{ color: lastDelta > 0 ? '#52c41a' : lastDelta < 0 ? '#ff4d4f' : '#999', fontWeight: 600 }}>
                    {lastDelta > 0 ? `↑+${lastDelta}` : lastDelta < 0 ? `↓${lastDelta}` : '→0'}
                  </div>
                </Col>
                <Col span={3} style={{ textAlign: 'center' }}>
                  <Text type="secondary" style={{ fontSize: 9 }}>最高</Text>
                  <div style={{ fontWeight: 600, color: '#52c41a' }}>{max}</div>
                </Col>
                <Col span={3} style={{ textAlign: 'center' }}>
                  <Text type="secondary" style={{ fontSize: 9 }}>最低</Text>
                  <div style={{ fontWeight: 600, color: '#ff4d4f' }}>{min}</div>
                </Col>
                <Col span={3} style={{ textAlign: 'center' }}>
                  <Text type="secondary" style={{ fontSize: 9 }}>均值</Text>
                  <div style={{ fontWeight: 600, color: '#1677ff' }}>{avg}</div>
                </Col>
                <Col span={3} style={{ textAlign: 'center' }}>
                  <Text type="secondary" style={{ fontSize: 9 }}>波动</Text>
                  <div style={{ fontWeight: 600, color: '#722ed1' }}>±{(range / 2).toFixed(1)}</div>
                </Col>
                <Col span={4} style={{ textAlign: 'center' }}>
                  <Text type="secondary" style={{ fontSize: 9 }}>采样点</Text>
                  <div style={{ fontWeight: 600 }}>{scores.length}个</div>
                </Col>
                <Col span={3} style={{ textAlign: 'center' }}>
                  <Text type="secondary" style={{ fontSize: 9 }}>等级</Text>
                  <div><Tag color={curColor} style={{ fontSize: 9, margin: 0 }}>{curLevel}</Tag></div>
                </Col>
              </Row>
            </div>
          );
        })()}
      </Card>

      {/* 快照详情弹窗 */}
      <Modal
        title={
          <Space>
            {LAYER_ICONS[layer]}
            <span>{SECURITY_LAYER_LABELS[layer]}快照</span>
            {selectedSnap && <span style={{ fontSize: 13, color: '#666' }}>{selectedSnap.time}</span>}
          </Space>
        }
        open={snapModalOpen}
        onCancel={() => setSnapModalOpen(false)}
        footer={null}
        width={660}
      >
        {selectedSnap && (() => {
          const idx = history.indexOf(selectedSnap);
          const prev = idx > 0 ? history[idx - 1] : null;
          const level = selectedSnap.totalScore >= 85 ? '优' : selectedSnap.totalScore >= 75 ? '良' : selectedSnap.totalScore >= 65 ? '中' : '差';

          return (
            <div>
              {/* 总分概览 */}
              <div style={{ textAlign: 'center', marginBottom: 20 }}>
                <Text type="secondary">{SECURITY_LAYER_LABELS[layer]}综合评分</Text>
                <div style={{ fontSize: 48, fontWeight: 700, color: scoreColor(selectedSnap.totalScore), lineHeight: 1.3 }}>
                  {selectedSnap.totalScore}
                  <Tag color={scoreColor(selectedSnap.totalScore)} style={{ fontSize: 14, marginLeft: 8, verticalAlign: 'middle' }}>
                    {level}
                  </Tag>
                </div>
                {prev && (
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    较上一时刻 ({prev.time})
                    {selectedSnap.totalScore > prev.totalScore
                      ? <span style={{ color: '#52c41a' }}> 上升 {+(selectedSnap.totalScore - prev.totalScore).toFixed(1)}</span>
                      : selectedSnap.totalScore < prev.totalScore
                        ? <span style={{ color: '#ff4d4f' }}> 下降 {+(prev.totalScore - selectedSnap.totalScore).toFixed(1)}</span>
                        : <span style={{ color: '#999' }}> 持平</span>}
                  </Text>
                )}
              </div>

              {/* 子指标列表 */}
              <Row gutter={[12, 12]}>
                {selectedSnap.subs.map(sub => {
                  const def = subsDef.find(d => d.key === sub.key);
                  if (!def) return null;
                  const prevSub = prev?.subs.find(s => s.key === sub.key);
                  const trend = prevSub ? (sub.score > prevSub.score ? 'up' : sub.score < prevSub.score ? 'down' : 'same') as 'up' | 'down' | 'same' : 'same';
                  const analysis = getSubAnalysis(layer, sub.key, sub.score, trend, prevSub?.score);
                  const subLevel = sub.score >= 85 ? '优' : sub.score >= 75 ? '良' : sub.score >= 65 ? '中' : '差';

                  return (
                    <Col span={12} key={sub.key}>
                      <Card
                        size="small"
                        styles={{
                          body: { padding: '12px 14px', background: LAYER_BG[layer], borderRadius: 6 },
                        }}
                      >
                        <Space>
                          <Text strong style={{ fontSize: 13 }}>{def.name}</Text>
                          <Tag color="default" style={{ fontSize: 9 }}>权重 {def.weight}%</Tag>
                          {trend === 'up' && <ArrowUpOutlined style={{ color: '#52c41a', fontSize: 11 }} />}
                          {trend === 'down' && <ArrowDownOutlined style={{ color: '#ff4d4f', fontSize: 11 }} />}
                          {trend === 'same' && <MinusOutlined style={{ color: '#999', fontSize: 11 }} />}
                        </Space>
                        <div style={{ fontSize: 26, fontWeight: 700, color: scoreColor(sub.score), marginTop: 4 }}>
                          {sub.score} <Tag color={scoreColor(sub.score)} style={{ fontSize: 10, verticalAlign: 'middle' }}>{subLevel}</Tag>
                          {prevSub && (
                            <span style={{ fontSize: 11, marginLeft: 4 }}>
                              {sub.score > prevSub.score
                                ? <span style={{ color: '#52c41a' }}>↑+{(sub.score - prevSub.score).toFixed(0)}</span>
                                : sub.score < prevSub.score
                                  ? <span style={{ color: '#ff4d4f' }}>↓{((sub.score - prevSub.score).toFixed(0))}</span>
                                  : <span style={{ color: '#999' }}>→0</span>}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 11, color: '#555', marginTop: 6, lineHeight: 1.5 }}>
                          {analysis}
                        </div>
                      </Card>
                    </Col>
                  );
                })}
              </Row>
            </div>
          );
        })()}
      </Modal>
    </>
  );
};

export default LayerTimeline;
