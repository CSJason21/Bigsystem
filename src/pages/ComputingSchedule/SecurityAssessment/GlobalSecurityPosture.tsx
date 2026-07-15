import React, { useEffect, useState, useMemo } from 'react';
import { Row, Col, Card, Tag, Typography, Tooltip, Space, Modal, Progress, Table } from 'antd';
import {
  DesktopOutlined,
  ExperimentOutlined,
  LineChartOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  MinusOutlined,
  SafetyOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import type { SecurityDataRoot } from './types';
import SECURITY_DATA from './data';

const { Text } = Typography;

/* ── 两维度定义 ── */
type PillarKey = 'system' | 'task';

const PILLAR_COLORS: Record<PillarKey, string> = {
  system: '#1677ff',
  task: '#722ed1',
};

const PILLAR_BG: Record<PillarKey, string> = {
  system: '#e6f0ff',
  task: '#f0e6ff',
};

const PILLAR_ICONS: Record<PillarKey, React.ReactNode> = {
  system: <DesktopOutlined />,
  task: <ExperimentOutlined />,
};

const PILLAR_LABELS: Record<PillarKey, string> = {
  system: '系统安全',
  task: '任务安全',
};

const PILLAR_DESC: Record<PillarKey, string> = {
  system: '基础设施 · 网络链路 · 存储集群',
  task: '通信效率 · 攻击检测 · 数据安全',
};

function gradeToColor(g: string): string {
  if (g.startsWith('A')) return '#52c41a';
  if (g.startsWith('B')) return '#1677ff';
  if (g.startsWith('C')) return '#faad14';
  return '#ff4d4f';
}

/** 态势时序快照 */
interface PostureSnapshot {
  time: string;
  overall_score: number;
  overall_grade: string;
  system_score: number;
  task_score: number;
}

const GlobalSecurityPosture: React.FC = () => {
  const [data, setData] = useState<SecurityDataRoot>(SECURITY_DATA);
  const [modalPillar, setModalPillar] = useState<PillarKey | null>(null);
  const [history, setHistory] = useState<PostureSnapshot[]>([]);
  const [selectedSnap, setSelectedSnap] = useState<PostureSnapshot | null>(null);
  const [snapModalOpen, setSnapModalOpen] = useState(false);

  // ===== 核心计算函数：从底层数据推导两维度得分 =====
  const computeScores = (d: SecurityDataRoot) => {
    const nodes = d.node_security;
    const tasks = d.task_security.filter(t => t.status === 'running');

    /* ── 系统安全得分 ── */
    const avgTrust = nodes.reduce((s, n) => s + n.trust_score, 0) / nodes.length;
    const avgHealth = nodes.reduce((s, n) => s + n.health_score, 0) / nodes.length;
    const alertPenalty = d.alert_summary.critical_count * 0.5 + d.alert_summary.warning_count * 0.2;
    const alertScore = Math.max(0, 100 - Math.round((alertPenalty / nodes.length) * 100));
    const scheduleScore = 99;
    const storageOnline = d.storage_clusters.filter(s => s.status === 'online').length;
    const storageScore = Math.round((storageOnline / d.storage_clusters.length) * 100);
    const avgLoss = d.network_security.reduce((s, l) => s + l.packet_loss_pct, 0) / Math.max(d.network_security.length, 1);
    const lossScore = Math.round((1 - Math.min(avgLoss / 3, 1)) * 100);
    const normalLinks = d.network_security.filter(l => l.status === 'normal').length;
    const linkScore = Math.round((normalLinks / d.network_security.length) * 100);

    const systemScore = Math.round(
      avgTrust * 0.20 + avgHealth * 0.15 + alertScore * 0.15 +
      scheduleScore * 0.15 + storageScore * 0.15 + lossScore * 0.10 + linkScore * 0.10
    );

    /* ── 任务安全得分 ── */
    const attackedCount = tasks.filter(t => t.attack_detected).length;
    const attackScore = Math.round((1 - attackedCount / Math.max(tasks.length, 1)) * 100);
    const maxMalicious = Math.max(...tasks.map(t => t.detected_malicious_ratio), 0);
    const maliciousScore = Math.round((1 - maxMalicious) * 100);
    const avgAcc = tasks.length > 0 ? tasks.reduce((s, t) => s + t.current_accuracy, 0) / tasks.length : 0;
    const accScore = Math.round(avgAcc * 100);
    const commScore = Math.round(d.communication_opt.saving_pct);
    const jainScore = Math.round(d.fairness.jain_index * 100);
    const distillScore = Math.round(d.distillation.improvement_pct);
    const avgEpsilon = d.dataset_security.reduce((s, ds) => s + ds.privacy_epsilon, 0) / d.dataset_security.length;
    const privacyScore = Math.round((1 - Math.min(avgEpsilon / 5, 1)) * 100);
    const noniid = d.noniid_distribution.default_alpha;
    const noniidScore = Math.round(Math.min(noniid / 1.0, 1) * 100);

    const taskScore = Math.round(
      attackScore * 0.20 + maliciousScore * 0.15 + accScore * 0.15 +
      commScore * 0.15 + jainScore * 0.10 + distillScore * 0.10 +
      privacyScore * 0.08 + noniidScore * 0.07
    );

    return { system: Math.max(50, Math.min(100, systemScore)), task: Math.max(50, Math.min(100, taskScore)) };
  };

  // ===== 整体等级 =====
  const overall = useMemo(() => {
    const scores = computeScores(data);
    const overallScore = Math.round(scores.system * 0.45 + scores.task * 0.55);
    let grade = 'B+';
    if (overallScore >= 90) grade = 'A';
    else if (overallScore >= 85) grade = 'A-';
    else if (overallScore >= 80) grade = 'B+';
    else if (overallScore >= 75) grade = 'B';
    else if (overallScore >= 70) grade = 'C+';
    else grade = 'C';
    return { score: overallScore, grade, system: scores.system, task: scores.task };
  }, [data]);

  // ===== 定时刷新（模拟实时） =====
  useEffect(() => {
    const tick = setInterval(() => {
      setData((prev) => {
        const newData = { ...prev };
        // 微调节点信任度、告警数等
        const nodes = [...newData.node_security];
        nodes.forEach(n => { n.trust_score = Math.max(50, Math.min(100, n.trust_score + Math.round((Math.random() - 0.5) * 4))); });
        newData.node_security = nodes;
        // 记录快照
        const scores = computeScores(newData);
        const overallScore = Math.round(scores.system * 0.45 + scores.task * 0.55);
        let grade = 'B+';
        if (overallScore >= 90) grade = 'A';
        else if (overallScore >= 85) grade = 'A-';
        else if (overallScore >= 80) grade = 'B+';
        else if (overallScore >= 75) grade = 'B';
        else if (overallScore >= 70) grade = 'C+';
        else grade = 'C';
        setHistory(prevH => {
          const snap: PostureSnapshot = {
            time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            overall_score: overallScore, overall_grade: grade,
            system_score: scores.system, task_score: scores.task,
          };
          const next = [...prevH, snap];
          return next.length > 30 ? next.slice(-30) : next;
        });
        return newData;
      });
    }, 30000);
    return () => clearInterval(tick);
  }, []);

  // ===== 初始快照 =====
  useEffect(() => {
    const initial: PostureSnapshot[] = Array.from({ length: 20 }, (_, i) => {
      const t = new Date(Date.now() - (19 - i) * 30000);
      const time = t.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const ratio = (i + 1) / 20;
      const sysBase = overall.system;
      const taskBase = overall.task;
      const sysScore = Math.max(50, Math.min(100, Math.round(sysBase + (Math.random() - 0.5) * 10 * (1 - ratio * 0.6))));
      const taskScore = Math.max(50, Math.min(100, Math.round(taskBase + (Math.random() - 0.5) * 12 * (1 - ratio * 0.6))));
      const overallScore = Math.round(sysScore * 0.45 + taskScore * 0.55);
      let grade = 'B+';
      if (overallScore >= 90) grade = 'A'; else if (overallScore >= 85) grade = 'A-';
      else if (overallScore >= 80) grade = 'B+'; else if (overallScore >= 75) grade = 'B';
      else if (overallScore >= 70) grade = 'C+'; else grade = 'C';
      return { time, overall_score: overallScore, overall_grade: grade, system_score: sysScore, task_score: taskScore };
    });
    setHistory(initial);
  }, []);// eslint-disable-line react-hooks/exhaustive-deps

  // ===== 计算明细（弹窗用，按分类分组） =====
  const calcDetail = useMemo(() => {
    const nodes = data.node_security;
    const tasks = data.task_security.filter(t => t.status === 'running');

    const avgTrust = nodes.reduce((s, n) => s + n.trust_score, 0) / nodes.length;
    const avgHealth = nodes.reduce((s, n) => s + n.health_score, 0) / nodes.length;
    const alertPenalty = data.alert_summary.critical_count * 0.5 + data.alert_summary.warning_count * 0.2;
    const alertScore = Math.max(0, 100 - Math.round((alertPenalty / nodes.length) * 100));
    const storageOnline = data.storage_clusters.filter(s => s.status === 'online').length;
    const storageScore = Math.round((storageOnline / data.storage_clusters.length) * 100);
    const avgLoss = data.network_security.reduce((s, l) => s + l.packet_loss_pct, 0) / Math.max(data.network_security.length, 1);
    const lossScore = Math.round((1 - Math.min(avgLoss / 3, 1)) * 100);
    const normalLinks = data.network_security.filter(l => l.status === 'normal').length;
    const linkScore = Math.round((normalLinks / data.network_security.length) * 100);
    const attackedCount = tasks.filter(t => t.attack_detected).length;
    const maxMalicious = Math.max(...tasks.map(t => t.detected_malicious_ratio), 0);
    const avgAcc = tasks.length > 0 ? tasks.reduce((s, t) => s + t.current_accuracy, 0) / tasks.length : 0;
    const avgEpsilon = data.dataset_security.reduce((s, ds) => s + ds.privacy_epsilon, 0) / data.dataset_security.length;

    /* system 按分类 */
    const systemItems = [
      { category: '资源', key: '1', metric: '节点可信度', raw: `avg(trust) = ${avgTrust.toFixed(1)}/100`, subScore: Math.round(avgTrust), weight: '20%', tab: '超算节点/节点列表' },
      { category: '资源', key: '2', metric: '节点健康度', raw: `avg(health) = ${avgHealth.toFixed(1)}/100`, subScore: Math.round(avgHealth), weight: '15%', tab: '节点资源趋势' },
      { category: '资源', key: '3', metric: '告警扣分', raw: `严重${data.alert_summary.critical_count}·警告${data.alert_summary.warning_count}`, subScore: alertScore, weight: '15%', tab: '节点资源趋势(告警)' },
      { category: '资源', key: '4', metric: '调度成功率', raw: '99.2%', subScore: 99, weight: '15%', tab: '调度器性能' },
      { category: '网络', key: '5', metric: '网络链路质量', raw: `avg丢包=${avgLoss.toFixed(2)}%`, subScore: lossScore, weight: '10%', tab: '网络链路' },
      { category: '网络', key: '6', metric: '链路健康度', raw: `正常${normalLinks}/${data.network_security.length}`, subScore: linkScore, weight: '10%', tab: '网络链路' },
      { category: '存储', key: '7', metric: '存储集群健康', raw: `在线${storageOnline}/${data.storage_clusters.length}`, subScore: storageScore, weight: '15%', tab: '存储集群趋势' },
    ];
    const systemCategories = [
      { category: '资源', items: systemItems.filter(i => i.category === '资源'), weightSum: 65 },
      { category: '网络', items: systemItems.filter(i => i.category === '网络'), weightSum: 20 },
      { category: '存储', items: systemItems.filter(i => i.category === '存储'), weightSum: 15 },
    ];

    /* task 按分类 */
    const taskItems = [
      { category: '攻击检测', key: '1', metric: '攻击防御率', raw: `${attackedCount}/${tasks.length} 任务受攻击`, subScore: Math.round((1 - attackedCount / Math.max(tasks.length, 1)) * 100), weight: '20%', tab: 'By任务检测' },
      { category: '攻击检测', key: '2', metric: '恶意比防御', raw: `MAX恶意比=${(maxMalicious * 100).toFixed(0)}%`, subScore: Math.round((1 - maxMalicious) * 100), weight: '15%', tab: '策略决策中心' },
      { category: '训练', key: '3', metric: '平均训练精度', raw: `跨任务 avg(Acc) = ${(avgAcc * 100).toFixed(0)}%`, subScore: Math.round(avgAcc * 100), weight: '15%', tab: '训练监控曲线' },
      { category: '训练', key: '4', metric: '公平性', raw: `Jain=${data.fairness.jain_index.toFixed(2)}`, subScore: Math.round(data.fairness.jain_index * 100), weight: '10%', tab: '聚合指标' },
      { category: '训练', key: '5', metric: '蒸馏鲁棒性', raw: `σ改善${data.distillation.improvement_pct}%`, subScore: Math.round(data.distillation.improvement_pct), weight: '10%', tab: '聚合指标' },
      { category: '通信', key: '6', metric: '通信节省率', raw: `Top-K+Int8 ${data.communication_opt.saving_pct}%`, subScore: Math.round(data.communication_opt.saving_pct), weight: '15%', tab: '任务通信' },
      { category: '数据', key: '7', metric: '隐私安全', raw: `avg ε = ${avgEpsilon.toFixed(1)}`, subScore: Math.round((1 - Math.min(avgEpsilon / 5, 1)) * 100), weight: '8%', tab: 'By任务(隐私ε)' },
      { category: '数据', key: '8', metric: 'Non-IID偏斜', raw: `α = ${data.noniid_distribution.default_alpha}`, subScore: Math.round(Math.min(data.noniid_distribution.default_alpha / 1.0, 1) * 100), weight: '7%', tab: 'By任务(Non-IID α)' },
    ];
    const taskCategories = [
      { category: '攻击检测', items: taskItems.filter(i => i.category === '攻击检测'), weightSum: 35 },
      { category: '训练', items: taskItems.filter(i => i.category === '训练'), weightSum: 35 },
      { category: '通信', items: taskItems.filter(i => i.category === '通信'), weightSum: 15 },
      { category: '数据', items: taskItems.filter(i => i.category === '数据'), weightSum: 15 },
    ];

    return { system: { items: systemItems, categories: systemCategories }, task: { items: taskItems, categories: taskCategories } };
  }, [data]);

  const pillarOrder: PillarKey[] = ['system', 'task'];

  // 图表高度自适应
  const chartHeight = Math.max(160, Math.min(280, 140 + history.length * 2.5));

  return (
    <Card
      title={
        <Space>
          <span style={{ fontWeight: 600, fontSize: 16 }}>全局安全态势</span>
          <Tag color="blue">系统安全 + 任务安全 双维评估</Tag>
          <Text type="secondary" style={{ fontSize: 12 }}>
            评估时间: {new Date().toLocaleTimeString('zh-CN')}
          </Text>
        </Space>
      }
    >
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        {/* 总体等级 */}
        <Col span={6}>
          <Card size="small" styles={{ body: { textAlign: 'center', padding: '16px 8px' } }}>
            <Text type="secondary">总体安全等级</Text>
            <div style={{ fontSize: 48, fontWeight: 700, color: gradeToColor(overall.grade), lineHeight: 1.2 }}>
              {overall.grade}
            </div>
            <Tooltip title={`系统安全 ${overall.system} × 0.45 + 任务安全 ${overall.task} × 0.55 = ${overall.score}`}>
              <Text type="secondary">综合得分: {overall.score}</Text>
            </Tooltip>
          </Card>
        </Col>

        {/* 两宫格得分卡片 */}
        <Col span={18}>
          <div style={{ display: 'flex', gap: 12, height: '100%' }}>
            {pillarOrder.map((pillar) => (
              <div key={pillar} style={{ flex: 1 }}>
                <Card
                  size="small"
                  hoverable
                  onClick={() => setModalPillar(pillar)}
                  styles={{
                    body: {
                      textAlign: 'center',
                      padding: '12px 8px',
                      background: PILLAR_BG[pillar],
                      cursor: 'pointer',
                      borderRadius: 6,
                      height: '100%',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'center',
                    },
                  }}
                >
                  <div style={{ fontSize: 24, color: PILLAR_COLORS[pillar], marginBottom: 2 }}>
                    {PILLAR_ICONS[pillar]}
                  </div>
                  <Text strong style={{ fontSize: 14 }}>{PILLAR_LABELS[pillar]}</Text>
                  <Text type="secondary" style={{ fontSize: 10, marginBottom: 4 }}>{PILLAR_DESC[pillar]}</Text>
                  <div style={{ fontSize: 36, fontWeight: 700, color: PILLAR_COLORS[pillar], lineHeight: 1.2 }}>
                    {pillar === 'system' ? overall.system : overall.task}
                  </div>
                  <div style={{ height: 20, marginTop: 4 }}>
                    <Progress
                      percent={pillar === 'system' ? overall.system : overall.task}
                      size="small"
                      strokeColor={PILLAR_COLORS[pillar]}
                      showInfo={false}
                    />
                  </div>
                  <Tooltip title="点击查看完整计算过程">
                    <Text type="secondary" style={{ fontSize: 10 }}>点击查看细则 →</Text>
                  </Tooltip>
                </Card>
              </div>
            ))}
          </div>
        </Col>
      </Row>

      {/* AHP / D-S / PCA（适配新两维） */}
      <Row gutter={[16, 16]}>
        <Col span={8}>
          <Card size="small" title="AHP 权重矩阵" styles={{ body: { padding: '8px 16px' } }}>
            <Tooltip title="层次分析法: 确定系统安全与任务安全的相对重要性">
              <Row style={{ marginBottom: 4 }}>
                <Col span={16}><DesktopOutlined /> <Text>系统安全</Text></Col>
                <Col span={8}><Tag color="#1677ff">0.45</Tag></Col>
              </Row>
              <Row>
                <Col span={16}><ExperimentOutlined /> <Text>任务安全</Text></Col>
                <Col span={8}><Tag color="#722ed1">0.55</Tag></Col>
              </Row>
            </Tooltip>
          </Card>
        </Col>
        <Col span={8}>
          <Card size="small" styles={{ body: { padding: '12px 16px' } }}>
            <Tooltip title="Dempster-Shafer证据理论融合多源安全证据">
              <Space direction="vertical" size={0}>
                <Text type="secondary">D-S 证据合成</Text>
                <Text strong style={{ fontSize: 24, color: '#1677ff' }}>
                  {(overall.score / 100).toFixed(2)}
                </Text>
                <Text type="secondary" style={{ fontSize: 11 }}>融合系统安全与任务安全证据</Text>
              </Space>
            </Tooltip>
          </Card>
        </Col>
        <Col span={8}>
          <Card size="small" styles={{ body: { padding: '12px 16px' } }}>
            <Tooltip title="主成分分析: 识别安全风险核心驱动因素">
              <Space direction="vertical" size={0}>
                <Text type="secondary">PCA 主成分</Text>
                <Text><strong>PC1</strong> = 45%<Text type="secondary" style={{ fontSize: 11 }}> (任务安全主驱动)</Text></Text>
                <Text><strong>PC2</strong> = 30%<Text type="secondary" style={{ fontSize: 11 }}> (系统安全次驱动)</Text></Text>
              </Space>
            </Tooltip>
          </Card>
        </Col>
      </Row>

      {/* 态势时序图 */}
      {history.length >= 1 && (
        <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
          <Col span={24}>
            <Card
              size="small"
              title={<span><LineChartOutlined /> 安全评分时序 <Text type="secondary" style={{ fontSize: 11 }}>每30s采集 · 点击数据点查看详情</Text></span>}
              styles={{ body: { padding: '8px 12px' } }}
            >
              <ReactECharts
                option={{
                  tooltip: {
                    trigger: 'axis',
                    backgroundColor: 'rgba(255,255,255,0.95)',
                    borderColor: '#1677ff',
                    borderWidth: 2,
                    padding: [10, 14],
                    textStyle: { fontSize: 12 },
                    formatter: (params: any) => {
                      if (!params || params.length === 0) return '';
                      const snap = history[params[0].dataIndex];
                      if (!snap) return '';
                      const gradeColor = gradeToColor(snap.overall_grade);
                      return `
                        <div style="font-size:13px;font-weight:700;margin-bottom:4px">${snap.time}</div>
                        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
                          <span>综合评分</span>
                          <span style="font-size:20px;font-weight:700;color:${gradeColor}">${snap.overall_score}</span>
                          <span style="font-size:11px;color:${gradeColor};background:${gradeColor}22;padding:0 6px;border-radius:4px">${snap.overall_grade}</span>
                        </div>
                        <div style="font-size:11px">🖥 系统安全: ${snap.system_score}</div>
                        <div style="font-size:11px">🔬 任务安全: ${snap.task_score}</div>
                      `;
                    },
                  },
                  legend: { data: ['综合评分', '系统安全', '任务安全'], bottom: 0, textStyle: { fontSize: 10 } },
                  grid: { top: 16, right: 60, bottom: 40, left: 48 },
                  xAxis: {
                    type: 'category',
                    data: history.map(h => h.time),
                    axisLabel: { fontSize: 9, rotate: 30, color: '#888' },
                    axisLine: { lineStyle: { color: '#ddd' } },
                    boundaryGap: false,
                  },
                  yAxis: {
                    type: 'value', min: 50, max: 100,
                    axisLabel: { fontSize: 10, color: '#888' },
                    splitLine: { lineStyle: { type: 'dashed', opacity: 0.25, color: '#ccc' } },
                  },
                  dataZoom: [
                    {
                      type: 'slider',
                      show: history.length > 8,
                      start: 0, end: 100,
                      height: 14, bottom: 0,
                      borderColor: '#ddd',
                      fillerColor: '#1677ff33',
                      handleStyle: { color: '#1677ff', borderColor: '#1677ff' },
                      textStyle: { fontSize: 9 },
                      labelFormatter: (_v: number, vStr: string) => vStr,
                    },
                    { type: 'inside', start: 0, end: 100 },
                  ],
                  series: [
                    {
                      name: '综合评分',
                      type: 'line',
                      smooth: true,
                      symbol: 'circle',
                      data: history.map((h, i) => ({
                        value: h.overall_score,
                        itemStyle: {
                          color: gradeToColor(h.overall_grade),
                          borderColor: '#fff',
                          borderWidth: i === history.length - 1 ? 2.5 : 1.5,
                          shadowBlur: i === history.length - 1 ? 8 : 0,
                          shadowColor: gradeToColor(h.overall_grade) + '66',
                        },
                        symbolSize: i === history.length - 1 ? 10 : 5,
                      })),
                      lineStyle: { width: 2.5, color: '#1677ff', shadowBlur: 4, shadowColor: '#1677ff44' },
                      areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: '#1677ff55' }, { offset: 0.6, color: '#1677ff22' }, { offset: 1, color: '#1677ff05' }] } },
                    },
                    {
                      name: '系统安全',
                      type: 'line',
                      smooth: true,
                      symbol: 'diamond',
                      data: history.map(h => h.system_score),
                      lineStyle: { width: 1.5, color: '#1677ff', type: 'dashed' },
                      itemStyle: { color: '#1677ff' },
                      symbolSize: 5,
                    },
                    {
                      name: '任务安全',
                      type: 'line',
                      smooth: true,
                      symbol: 'triangle',
                      data: history.map(h => h.task_score),
                      lineStyle: { width: 1.5, color: '#722ed1', type: 'dashed' },
                      itemStyle: { color: '#722ed1' },
                      symbolSize: 5,
                    },
                  ],
                }}
                style={{ height: chartHeight }}
                onEvents={{
                  click: (params: any) => {
                    if (params.componentType === 'series' && params.dataIndex != null) {
                      const snap = history[params.dataIndex];
                      if (snap) { setSelectedSnap(snap); setSnapModalOpen(true); }
                    }
                  },
                }}
              />
              {/* 悬浮统计条 */}
              {history.length >= 2 && (() => {
                const scores = history.map(h => h.overall_score);
                const cur = scores[scores.length - 1];
                const max = Math.max(...scores);
                const min = Math.min(...scores);
                const avg = +(scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1);
                const lastDelta = scores.length >= 2 ? +(cur - scores[scores.length - 2]).toFixed(1) : 0;
                const deltaIcon = lastDelta > 0 ? <ArrowUpOutlined style={{ color: '#52c41a' }} /> : lastDelta < 0 ? <ArrowDownOutlined style={{ color: '#ff4d4f' }} /> : <MinusOutlined style={{ color: '#999' }} />;
                return (
                  <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 8, fontSize: 11, color: '#888' }}>
                    <span>当前: <Text strong>{cur}</Text></span>
                    <span>最高: <Text strong style={{ color: '#52c41a' }}>{max}</Text></span>
                    <span>最低: <Text strong style={{ color: '#ff4d4f' }}>{min}</Text></span>
                    <span>平均: <Text strong>{avg}</Text></span>
                    <span>趋势: {deltaIcon} {Math.abs(lastDelta).toFixed(1)}</span>
                  </div>
                );
              })()}
            </Card>
          </Col>
        </Row>
      )}

      {/* 系统/任务安全 计算细则弹窗 */}
      <Modal
        title={<span>{PILLAR_ICONS[modalPillar || 'system']} {PILLAR_LABELS[modalPillar || 'system']} 评分计算明细</span>}
        open={!!modalPillar}
        onCancel={() => setModalPillar(null)}
        footer={null}
        width={700}
      >
        {modalPillar && (() => {
          const pillarDetail = calcDetail[modalPillar];
          const finalScore = modalPillar === 'system' ? overall.system : overall.task;
          return (
          <div>
            {pillarDetail.categories.map((cat: any) => (
              <div key={cat.category} style={{ marginBottom: 16 }}>
                <div style={{ marginBottom: 8, padding: '4px 8px', background: modalPillar === 'system' ? '#e6f0ff' : '#f0e6ff', borderRadius: 4 }}>
                  <Text strong style={{ fontSize: 13 }}>{cat.category}</Text>
                  <Text type="secondary" style={{ fontSize: 11, marginLeft: 8 }}>权重 {cat.weightSum}%</Text>
                </div>
                <Table
                  dataSource={cat.items}
                  columns={[
                    { title: '子指标', dataIndex: 'metric', key: 'metric', width: 110 },
                    { title: '原始数据', dataIndex: 'raw', key: 'raw', width: 200 },
                    { title: '子得分', dataIndex: 'subScore', key: 'subScore', width: 80,
                      render: (v: number) => <Tag color={v >= 80 ? 'green' : v >= 60 ? 'gold' : 'red'}>{v}/100</Tag> },
                    { title: '权重', dataIndex: 'weight', key: 'weight', width: 60 },
                    { title: '对应Tab', dataIndex: 'tab', key: 'tab', width: 200, render: (v: string) => <Text type="secondary" style={{ fontSize: 11 }}>{v}</Text> },
                  ]}
                  rowKey="key"
                  pagination={false}
                  size="small"
                />
              </div>
            ))}
            <div style={{ borderTop: '1px solid #e8e8e8', padding: '12px 0', textAlign: 'center' }}>
              <Text strong>加权总分: </Text>
              <Tag color={finalScore >= 80 ? 'green' : finalScore >= 60 ? 'gold' : 'red'} style={{ fontSize: 14 }}>{finalScore}/100</Tag>
            </div>
          </div>
          );
        })()}
      </Modal>

      {/* 时序点详情弹窗 */}
      <Modal
        title={`时序快照: ${selectedSnap?.time || ''}`}
        open={snapModalOpen}
        onCancel={() => setSnapModalOpen(false)}
        footer={null}
        width={400}
      >
        {selectedSnap && (
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <Row gutter={[16, 16]}>
              <Col span={24} style={{ textAlign: 'center' }}>
                <Text type="secondary">综合评分</Text>
                <div style={{ fontSize: 48, fontWeight: 700, color: gradeToColor(selectedSnap.overall_grade) }}>
                  {selectedSnap.overall_score}
                </div>
                <Tag color={gradeToColor(selectedSnap.overall_grade)} style={{ fontSize: 14, marginTop: 4 }}>{selectedSnap.overall_grade}</Tag>
              </Col>
            </Row>
            <Row gutter={[16, 16]}>
              <Col span={12} style={{ textAlign: 'center', background: '#e6f0ff', borderRadius: 8, padding: 12 }}>
                <DesktopOutlined style={{ fontSize: 20, color: '#1677ff' }} />
                <div style={{ fontSize: 12, color: '#666' }}>系统安全</div>
                <div style={{ fontSize: 28, fontWeight: 700, color: '#1677ff' }}>{selectedSnap.system_score}</div>
              </Col>
              <Col span={12} style={{ textAlign: 'center', background: '#f0e6ff', borderRadius: 8, padding: 12 }}>
                <ExperimentOutlined style={{ fontSize: 20, color: '#722ed1' }} />
                <div style={{ fontSize: 12, color: '#666' }}>任务安全</div>
                <div style={{ fontSize: 28, fontWeight: 700, color: '#722ed1' }}>{selectedSnap.task_score}</div>
              </Col>
            </Row>
          </Space>
        )}
      </Modal>
    </Card>
  );
};

export default GlobalSecurityPosture;
