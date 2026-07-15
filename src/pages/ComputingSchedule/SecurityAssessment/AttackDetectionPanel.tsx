import React, { useState, useMemo, useEffect } from 'react';
import { Row, Col, Card, Table, Tag, Typography, Progress, Statistic, Select, Collapse, Tooltip, Radio, Button, Space, Timeline } from 'antd';
import {
  BugOutlined, CheckCircleOutlined, StopOutlined, WarningOutlined, ExperimentOutlined,
  DesktopOutlined, ThunderboltOutlined, NodeIndexOutlined, SafetyOutlined,
  LineChartOutlined, DatabaseOutlined, WifiOutlined, SwapOutlined, RocketOutlined, BarChartOutlined,
} from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import type { RationalTrustData, TaskTrustDetail, TaskNodeScore, BackdoorAttackDetection, TaskSecurity,
  CommunicationOptimization, AccuracyVsCommunicationPoint, CommTimelinePoint,
  AlgorithmStrategyData, SystemAggregation, FairnessMetrics, DistillationRobustness } from './types';

const { Text } = Typography;

interface Props {
  data: RationalTrustData;
  backdoor: BackdoorAttackDetection;
  taskSecurity?: TaskSecurity[];
  commOpt?: CommunicationOptimization;
  commTimeline?: CommTimelinePoint[];
  accuracyVsComm?: AccuracyVsCommunicationPoint[];
  algo?: AlgorithmStrategyData;
  selectedAlgo?: string;
  onAlgoChange?: (v: string) => void;
  convergenceOption?: any;
  systemAgg?: SystemAggregation | null;
  fairness?: FairnessMetrics;
  distillation?: DistillationRobustness;
  /** 从调度中枢跳转时需要聚焦的任务 ID */
  focusedTaskId?: string | null;
}

/** 决策层标签 */
const LayerBadge: React.FC<{ layer: string }> = ({ layer }) => {
  const map: Record<string, string> = { full_trust: 'green', observation: 'blue', isolation: 'orange', rejection: 'red' };
  return <Tag color={map[layer] || 'default'} style={{ fontSize: 9 }}>{layer === 'full_trust' ? '完全信任' : layer === 'observation' ? '观察降权' : layer === 'isolation' ? '隔离审查' : '拒绝阻断'}</Tag>;
};

/** 风险进度条 */
const RiskBar: React.FC<{ value: number; label?: string }> = ({ value, label }) => (
  <Tooltip title={`${label || ''} ${value.toFixed(2)}`}>
    <Progress
      percent={+(value * 100).toFixed(0)}
      size="small"
      strokeColor={value > 0.6 ? '#ff4d4f' : value > 0.3 ? '#faad14' : '#52c41a'}
      format={() => value.toFixed(2)}
      style={{ minWidth: 60 }}
    />
  </Tooltip>
);

/** 5维空间主维度折线图（单节点） */
const NodeMainDimensionCharts: React.FC<{ node: TaskNodeScore; taskIndex: number; rounds: number; attacks: Record<number, { name: string; attackRound: number; switchRound: number }> }> = ({ node, taskIndex, rounds, attacks }) => {
  const atk = attacks[taskIndex] || { name: '', attackRound: 999, switchRound: 999 };
  const attackRound = atk.attackRound;
  const isMal = node.total_anomalies > 10;
  const isSus = node.total_anomalies > 4 && !isMal;
  const ar = isMal ? attackRound : isSus ? attackRound + 5 : 999;

  const chartData = useMemo(() => Array.from({ length: rounds }, (_, i) => {
    const r = i + 1;
    const ap = Math.max(0, Math.min(1, (r - ar) / 6));
    return {
      gradient_quality: isMal && r >= ar ? +(0.85 - ap * 0.60).toFixed(3) : isSus && r >= ar ? +(0.80 - ap * 0.35).toFixed(3) : +(0.85 + Math.random() * 0.1).toFixed(3),
      direction_consistency: isMal && r >= ar ? +(0.82 - ap * 0.55).toFixed(3) : isSus && r >= ar ? +(0.78 - ap * 0.30).toFixed(3) : +(0.80 + Math.random() * 0.1).toFixed(3),
      security_risk: isMal && r >= ar ? +(0.05 + ap * 0.85).toFixed(3) : isSus && r >= ar ? +(0.08 + ap * 0.40).toFixed(3) : +(0.03 + Math.random() * 0.05).toFixed(3),
      privacy_compliance: isMal && r >= ar ? +(0.88 - ap * 0.50).toFixed(3) : isSus && r >= ar ? +(0.85 - ap * 0.25).toFixed(3) : +(0.85 + Math.random() * 0.1).toFixed(3),
      data_diversity: isMal && r >= ar ? +(0.75 - ap * 0.45).toFixed(3) : isSus && r >= ar ? +(0.70 - ap * 0.25).toFixed(3) : +(0.75 + Math.random() * 0.15).toFixed(3),
    };
  }), [rounds, isMal, isSus, ar]);

  const dims = [
    { key: 'gradient_quality', label: '梯度质量', threshold: 0.5, isReverse: true },
    { key: 'direction_consistency', label: '方向一致性', threshold: 0.5, isReverse: true },
    { key: 'security_risk', label: '安全风险', threshold: 0.3, isReverse: false },
    { key: 'privacy_compliance', label: '隐私合规', threshold: 0.5, isReverse: true },
    { key: 'data_diversity', label: '数据多样性', threshold: 0.4, isReverse: true },
  ];
  const lineColor = isMal ? '#ff4d4f' : isSus ? '#faad14' : '#52c41a';

  return (
    <Row gutter={[8, 8]}>
      {dims.map(dim => (
        <Col span={4} key={dim.key}>
          <Card size="small" title={<span style={{ fontSize: 10 }}>{dim.label}</span>} styles={{ body: { padding: '2px 6px' } }}>
            <ReactECharts option={{
              tooltip: { trigger: 'axis' },
              grid: { top: 5, right: 3, bottom: 12, left: 30 },
              xAxis: { type: 'category', data: Array.from({ length: rounds }, (_, i) => `R${i + 1}`), axisLabel: { fontSize: 7, interval: Math.max(1, Math.floor(rounds / 5)) }, show: false },
              yAxis: { type: 'value', min: 0, max: 1.0, axisLabel: { fontSize: 7 }, splitLine: { lineStyle: { type: 'dashed', opacity: 0.2 } } },
              series: [
                { name: node.node_name, type: 'line', smooth: true, data: chartData.map(d => +(d as any)[dim.key]), lineStyle: { width: 2, color: lineColor }, itemStyle: { color: lineColor }, symbol: 'none' },
                { name: '阈值', type: 'line', data: Array.from({ length: rounds }, () => dim.threshold), lineStyle: { type: 'dashed', color: '#ff4d4f', width: 1 }, symbol: 'none', silent: true },
              ],
            }} style={{ height: 60 }} />
          </Card>
        </Col>
      ))}
    </Row>
  );
};

/** 子空间折线图（单节点） */
const NodeSubspaceCharts: React.FC<{ node: TaskNodeScore; taskIndex: number; rounds: number; attacks: Record<number, { name: string; attackRound: number; switchRound: number }> }> = ({ node, taskIndex, rounds, attacks }) => {
  const atk = attacks[taskIndex] || { name: '', attackRound: 999, switchRound: 999 };
  const attackRound = atk.attackRound;
  const isMal = node.total_anomalies > 10;
  const isSus = node.total_anomalies > 4 && !isMal;
  const ar = isMal ? attackRound : isSus ? attackRound + 5 : 999;

  const chartData = useMemo(() => Array.from({ length: rounds }, (_, i) => {
    const r = i + 1;
    const ap = Math.max(0, Math.min(1, (r - ar) / 6));
    return {
      sign_flip_rate: isMal && r >= ar ? +(0.05 + ap * 0.45).toFixed(3) : isSus && r >= ar ? +(0.04 + ap * 0.18).toFixed(3) : +(0.02 + Math.random() * 0.04).toFixed(3),
      coord_anomaly_rate: isMal && r >= ar ? +(0.03 + ap * 0.38).toFixed(3) : isSus && r >= ar ? +(0.02 + ap * 0.15).toFixed(3) : +(0.01 + Math.random() * 0.03).toFixed(3),
      sparsity: isMal && r >= ar ? +(0.10 + ap * 0.35).toFixed(3) : +(0.10 + Math.random() * 0.12).toFixed(3),
      nsr: isMal && r >= ar ? +(0.06 + ap * 0.55).toFixed(3) : isSus && r >= ar ? +(0.05 + ap * 0.22).toFixed(3) : +(0.04 + Math.random() * 0.04).toFixed(3),
      coupling_deviation: isMal && r >= ar ? +(0.03 + ap * 0.48).toFixed(3) : isSus && r >= ar ? +(0.02 + ap * 0.22).toFixed(3) : +(0.02 + Math.random() * 0.03).toFixed(3),
    };
  }), [rounds, isMal, isSus, ar]);

  const dims = [
    { key: 'sign_flip_rate', label: '符号翻转率', threshold: 0.15 },
    { key: 'coord_anomaly_rate', label: '坐标异常率', threshold: 0.10 },
    { key: 'sparsity', label: '更新稀疏度', threshold: 0.35 },
    { key: 'nsr', label: '噪声信号比(NSR)', threshold: 0.20 },
    { key: 'coupling_deviation', label: '层间耦合偏差', threshold: 0.15 },
  ];
  const lineColor = isMal ? '#ff4d4f' : isSus ? '#faad14' : '#52c41a';

  return (
    <Row gutter={[8, 8]}>
      {dims.map(dim => (
        <Col span={4} key={dim.key}>
          <Card size="small" title={<span style={{ fontSize: 10 }}>{dim.label}</span>} styles={{ body: { padding: '2px 6px' } }}>
            <ReactECharts option={{
              tooltip: { trigger: 'axis' },
              grid: { top: 5, right: 3, bottom: 12, left: 30 },
              xAxis: { type: 'category', data: Array.from({ length: rounds }, (_, i) => `R${i + 1}`), axisLabel: { fontSize: 7, interval: Math.max(1, Math.floor(rounds / 5)) }, show: false },
              yAxis: { type: 'value', min: 0, max: Math.min(0.7, dim.threshold * 4), axisLabel: { fontSize: 7 }, splitLine: { lineStyle: { type: 'dashed', opacity: 0.2 } } },
              series: [
                { name: node.node_name, type: 'line', smooth: true, data: chartData.map(d => +(d as any)[dim.key]), lineStyle: { width: 2, color: lineColor }, itemStyle: { color: lineColor }, symbol: 'none' },
                { name: '阈值', type: 'line', data: Array.from({ length: rounds }, () => dim.threshold), lineStyle: { type: 'dashed', color: '#ff4d4f', width: 1 }, symbol: 'none', silent: true },
              ],
            }} style={{ height: 60 }} />
          </Card>
        </Col>
      ))}
    </Row>
  );
};

/** 数据安全展开行 */
const DataSafetyRow: React.FC<{ node: TaskNodeScore }> = ({ node }) => {
  const ds = node.data_safety;
  
  // 映射到新的安全含义指标
  const teeRisk = ds.compliance_risk; // 用合规等级模拟 TEE 的风险状态
  const cryptoIntegrityRisk = ds.epsilon_risk; // 用 epsilon_risk 模拟密码校验未通过风险
  const authInterceptsRisk = ds.alpha_risk; // 用 alpha_risk 模拟越权访问异常频率
  
  const teeHint = teeRisk > 0.6 ? '未支持 / 降级' : teeRisk > 0.3 ? 'L1 基础认证' : 'L3 高级沙箱';
  const cryptoHint = cryptoIntegrityRisk > 0.6 ? '校验存在异常' : cryptoIntegrityRisk > 0.3 ? '部分警告' : '100% 完整匹配';
  const authInterceptsCount = Math.floor(authInterceptsRisk * 15);
  const authHint = authInterceptsRisk > 0.6 ? `拦截 ${authInterceptsCount} 次高频越权` : `拦截 ${authInterceptsCount} 次一般越权`;

  return (
    <Row gutter={[8, 8]}>
      <Col span={8}>
        <Card size="small" title={<span style={{ fontSize: 10 }}>可信执行环境系统状态</span>} styles={{ body: { padding: '4px 8px', textAlign: 'center' } }}>
          <Progress type="dashboard" percent={+( (1 - teeRisk) * 100).toFixed(0)} size={60} strokeColor={teeRisk > 0.6 ? '#ff4d4f' : teeRisk > 0.3 ? '#faad14' : '#52c41a'} format={() => (1 - teeRisk).toFixed(2)} />
          <div style={{ fontSize: 10, marginTop: 2 }}><Tag color={teeRisk > 0.6 ? 'red' : teeRisk > 0.3 ? 'orange' : 'green'} style={{ fontSize: 9 }}>{teeHint}</Tag></div>
        </Card>
      </Col>
      <Col span={8}>
        <Card size="small" title={<span style={{ fontSize: 10 }}>本地密箱校验完整度</span>} styles={{ body: { padding: '4px 8px', textAlign: 'center' } }}>
          <Progress type="dashboard" percent={+( (1 - cryptoIntegrityRisk) * 100).toFixed(0)} size={60} strokeColor={cryptoIntegrityRisk > 0.6 ? '#ff4d4f' : cryptoIntegrityRisk > 0.3 ? '#faad14' : '#52c41a'} format={() => (1 - cryptoIntegrityRisk).toFixed(2)} />
          <div style={{ fontSize: 10, marginTop: 2 }}><Tag color={cryptoIntegrityRisk > 0.6 ? 'red' : cryptoIntegrityRisk > 0.3 ? 'orange' : 'green'} style={{ fontSize: 9 }}>{cryptoHint}</Tag></div>
        </Card>
      </Col>
      <Col span={8}>
        <Card size="small" title={<span style={{ fontSize: 10 }}>本地越权文件访问阻断数</span>} styles={{ body: { padding: '4px 8px', textAlign: 'center' } }}>
          <Progress type="dashboard" percent={authInterceptsCount} size={60} strokeColor={authInterceptsRisk > 0.6 ? '#ff4d4f' : authInterceptsRisk > 0.3 ? '#faad14' : '#1677ff'} format={() => authInterceptsCount} />
          <div style={{ fontSize: 10, marginTop: 2 }}><Tag color={authInterceptsRisk > 0.6 ? 'red' : authInterceptsRisk > 0.3 ? 'orange' : 'blue'} style={{ fontSize: 9 }}>{authHint}</Tag></div>
        </Card>
      </Col>
      <Col span={24}>
        <Card size="small" title={<span style={{ fontSize: 10 }}>本地系统精细化安全评分 (端点环境面)</span>} styles={{ body: { padding: '2px 8px' } }}>
          <ReactECharts
            option={{
              tooltip: { trigger: 'item' },
              radar: {
                indicator: [
                  { name: '系统隔离', max: 1 }, { name: '进程可信', max: 1 },
                  { name: '内存防护', max: 1 }, { name: '防侧信道', max: 1 },
                  { name: '落盘加密', max: 1 }, { name: '身份溯源', max: 1 }
                ],
                radius: 40,
                center: ['50%', '50%'],
                name: { textStyle: { fontSize: 9, color: '#666' } }
              },
              series: [{
                type: 'radar',
                data: [
                  {
                    value: [
                      1 - teeRisk, 
                      1 - (ds.correlation_risk * 0.8), 
                      1 - cryptoIntegrityRisk, 
                      1 - (authInterceptsRisk * 0.6), 
                      1 - (teeRisk * Math.random()), 
                      1 - (ds.overall_risk * 0.5)
                    ].map(v => +Math.max(0.1, Math.min(1, v)).toFixed(2)),
                    name: '节点本地安全防御维级',
                    areaStyle: { color: teeRisk > 0.5 ? 'rgba(255, 77, 79, 0.3)' : 'rgba(82, 196, 26, 0.3)' },
                    lineStyle: { width: 1, color: teeRisk > 0.5 ? '#ff4d4f' : '#52c41a' },
                    itemStyle: { color: teeRisk > 0.5 ? '#ff4d4f' : '#52c41a' }
                  }
                ]
              }]
            }}
            style={{ height: 110 }}
          />
        </Card>
      </Col>
      <Col span={24} style={{ fontSize: 10, color: '#888', marginTop: 4 }}>
        端侧综合防篡改及环境风险：<RiskBar value={ds.overall_risk} />
      </Col>
    </Row>
  );
};

/** 网络安全展开行 */
const NetworkSafetyRow: React.FC<{ node: TaskNodeScore }> = ({ node }) => {
  const ns = node.network_safety;
  
  const tlsRisk = ns.latency_risk;
  const replayRisk = ns.packet_loss_risk;
  const spoofingRisk = ns.bandwidth_risk;

  const tlsHint = tlsRisk > 0.6 ? '检测到降级 / 弱加密' : tlsRisk > 0.3 ? '证书待更新' : '强双向 TLS';
  const replayCount = Math.floor(replayRisk * 300);
  const replayHint = replayRisk > 0.6 ? '频繁重放攻击' : replayRisk > 0.3 ? '偶发重放截获' : '正常';
  const spoofingCount = Math.floor(spoofingRisk * 20);
  const spoofingHint = spoofingRisk > 0.4 ? '异常假节点洪泛' : '未见明显伪造身份';

  // 模拟出过去 20 轮的网络攻击清洗图
  const roundLen = 20;
  const timeSeriesData = useMemo(() => Array.from({ length: roundLen }, (_, i) => {
    // 根据当前节点的网络风险生成近期波动曲线
    const anomalySpike = (spoofingRisk > 0.4 && i > roundLen - 5) ? Math.random() * 80 + 20 : 0;
    return {
      replay: Math.floor(Math.random() * (replayRisk * 15)) + (spoofingRisk > 0.4 ? Math.random() * 10 : 0),
      ddos: Math.floor(anomalySpike + Math.random() * (spoofingRisk * 5)),
    };
  }), [replayRisk, spoofingRisk]);

  return (
    <Row gutter={[8, 8]}>
      <Col span={8}>
        <Card size="small" title={<span style={{ fontSize: 10 }}>通信 TLS 会话安全度</span>} styles={{ body: { padding: '4px 8px', textAlign: 'center' } }}>
          <Progress type="dashboard" percent={+( (1 - tlsRisk) * 100).toFixed(0)} size={60} strokeColor={tlsRisk > 0.6 ? '#ff4d4f' : tlsRisk > 0.3 ? '#faad14' : '#52c41a'} format={() => (1 - tlsRisk).toFixed(2)} />
          <div style={{ fontSize: 10, marginTop: 2 }}><Tag color={tlsRisk > 0.6 ? 'red' : tlsRisk > 0.3 ? 'orange' : 'green'} style={{ fontSize: 9 }}>{tlsHint}</Tag></div>
        </Card>
      </Col>
      <Col span={8}>
        <Card size="small" title={<span style={{ fontSize: 10 }}>网络防重放请求丢弃量</span>} styles={{ body: { padding: '4px 8px', textAlign: 'center' } }}>
          <Progress type="dashboard" percent={replayCount} size={60} strokeColor={replayRisk > 0.6 ? '#ff4d4f' : replayRisk > 0.3 ? '#faad14' : '#1677ff'} format={() => replayCount} />
          <div style={{ fontSize: 10, marginTop: 2 }}><Tag color={replayRisk > 0.6 ? 'red' : replayRisk > 0.3 ? 'orange' : 'blue'} style={{ fontSize: 9 }}>{replayHint}</Tag></div>
        </Card>
      </Col>
      <Col span={8}>
        <Card size="small" title={<span style={{ fontSize: 10 }}>伪造假节点屏蔽总数</span>} styles={{ body: { padding: '4px 8px', textAlign: 'center' } }}>
          <Progress type="dashboard" percent={spoofingCount} size={60} strokeColor={spoofingRisk > 0.6 ? '#ff4d4f' : spoofingRisk > 0.3 ? '#faad14' : '#1677ff'} format={() => spoofingCount} />
          <div style={{ fontSize: 10, marginTop: 2 }}><Tag color={spoofingRisk > 0.6 ? 'red' : spoofingRisk > 0.3 ? 'orange' : 'blue'} style={{ fontSize: 9 }}>{spoofingHint}</Tag></div>
        </Card>
      </Col>
      <Col span={24}>
        <Card size="small" title={<span style={{ fontSize: 10 }}>网络边界异常攻击流量清洗时序</span>} styles={{ body: { padding: '2px 8px' } }}>
          <ReactECharts
            option={{
              tooltip: { trigger: 'axis' },
              grid: { top: 5, right: 10, bottom: 18, left: 30 },
              xAxis: { type: 'category', data: Array.from({ length: roundLen }, (_, i) => `R${i + 1}`), axisLabel: { fontSize: 7 } },
              yAxis: { type: 'value', min: 0, axisLabel: { fontSize: 7 }, splitLine: { lineStyle: { type: 'dashed', opacity: 0.2 } } },
              series: [
                { name: '重放拦截数', type: 'line', smooth: true, data: timeSeriesData.map(d => d.replay), lineStyle: { width: 1.5, color: '#faad14' }, itemStyle: { color: '#faad14' }, areaStyle: { opacity: 0.2, color: '#faad14' }, symbol: 'none' },
                { name: '假节点洪泛拦截量', type: 'line', smooth: true, data: timeSeriesData.map(d => d.ddos), lineStyle: { width: 1.5, color: '#ff4d4f' }, itemStyle: { color: '#ff4d4f' }, areaStyle: { opacity: 0.2, color: '#ff4d4f' }, symbol: 'none' },
              ],
            }}
            style={{ height: 110 }}
          />
        </Card>
      </Col>
      <Col span={24} style={{ fontSize: 10, color: '#888', marginTop: 4 }}>
        网络边界传输综合风险：<RiskBar value={ns.overall_risk} />
      </Col>
    </Row>
  );
};

/** 节点级时间域组件（信任演化 + 变点检测 + Beta分布） */
const NodeTimeDomainCharts: React.FC<{ node: TaskNodeScore; rounds: number }> = ({ node, rounds }) => {
  const isMal = node.layer === 'rejection' || node.total_anomalies > 8;
  const isSus = node.layer === 'isolation' || (node.total_anomalies > 3 && !isMal);
  const attackRound = isMal ? Math.max(3, Math.floor(rounds * 0.3)) : isSus ? Math.max(5, Math.floor(rounds * 0.45)) : 999;

  const nodeChartData = useMemo(() => {
    const targetMu = node.mu;
    const targetVar = node.variance || 0.05;
    return Array.from({ length: rounds }, (_, i) => {
      const r = i + 1;
      const progress = r / rounds;
      if (isMal && r >= attackRound) {
        const decay = Math.min(1, (r - attackRound) / (rounds - attackRound));
        const mu = Math.max(0.05, targetMu + (1 - targetMu) * (1 - decay) * 0.3 - decay * 0.6 + (Math.random() - 0.5) * 0.04);
        return { mu: +mu.toFixed(3), var: +Math.min(0.25, targetVar + decay * 0.18 + Math.random() * 0.02).toFixed(3), cusum: +Math.min(5, (decay * 5 + (Math.random() - 0.5) * 0.3)).toFixed(3) };
      }
      if (isSus && r >= attackRound) {
        const decay = Math.min(1, (r - attackRound) / (rounds - attackRound));
        const mu = Math.max(0.2, targetMu + (1 - targetMu) * (1 - decay) * 0.2 - decay * 0.3 + (Math.random() - 0.5) * 0.04);
        return { mu: +mu.toFixed(3), var: +Math.min(0.18, targetVar + decay * 0.1 + Math.random() * 0.02).toFixed(3), cusum: +Math.min(3, (decay * 2.5 + (Math.random() - 0.5) * 0.3)).toFixed(3) };
      }
      // good node
      const mu = +(targetMu * (0.95 + 0.1 * Math.sin(progress * 8) + (Math.random() - 0.5) * 0.02)).toFixed(3);
      return { mu: Math.min(0.99, mu), var: +(targetVar * 0.6 + Math.random() * 0.01).toFixed(3), cusum: +Math.max(0, (Math.random() - 0.8) * 0.3).toFixed(3) };
    });
  }, [rounds, node.mu, node.variance, isMal, isSus, attackRound]);

  const muData = nodeChartData.map(d => d.mu);
  const varData = nodeChartData.map(d => d.var);
  const cusumData = nodeChartData.map(d => d.cusum);

  // Beta 分布参数
  const alpha = isMal ? Math.max(1.5, node.mu * 8) : isSus ? Math.max(2, node.mu * 10) : Math.max(3, node.mu * 12);
  const beta = isMal ? Math.max(5, (1 - node.mu) * 12) : isSus ? Math.max(3, (1 - node.mu) * 8) : Math.max(1.5, (1 - node.mu) * 4);
  const logBeta = (a: number, b: number) => { let s = 0; for (let j = 0; j < Math.round(a) - 1; j++) s += Math.log(j + 1); for (let j = 0; j < Math.round(b) - 1; j++) s += Math.log(j + 1); for (let j = 0; j < Math.round(a + b) - 2; j++) s -= Math.log(j + 1); return s; };
  const betaDist = Array.from({ length: 50 }, (_, i) => { const x = (i + 0.5) / 50; return [x, Math.min(Math.exp((alpha - 1) * Math.log(x) + (beta - 1) * Math.log(1 - x) - logBeta(Math.round(alpha), Math.round(beta))), 8)]; });

  const lineColor = isMal ? '#ff4d4f' : isSus ? '#faad14' : '#52c41a';
  const tagColor = isMal ? 'red' : isSus ? 'orange' : 'green';
  const tagText = isMal ? '恶意节点' : isSus ? '可疑节点' : '正常节点';

  return (
    <Row gutter={[12, 12]}>
      <Col span={16}>
        <Card size="small" title={<span><LineChartOutlined /> 信任演化 · {node.node_name} <Text type="secondary" style={{ fontSize: 10, fontWeight: 400 }}>当前信任度 {node.mu.toFixed(3)} | 风险系数 {node.algorithm_risk.toFixed(2)}</Text></span>}>
          <ReactECharts
            option={{
              tooltip: { trigger: 'axis', formatter: (ps: any) => ps.map((p: any) => `${p.seriesName}: ${p.value}`).join('<br/>') },
              legend: { data: ['信任度 μ', '不确定度 σ²', '聚合权重'], bottom: 0, textStyle: { fontSize: 9 } },
              grid: { top: 15, right: 10, bottom: 35, left: 50 },
              xAxis: { type: 'category', data: Array.from({ length: rounds }, (_, i) => `R${i + 1}`), name: '训练轮次', axisLabel: { fontSize: 8, interval: Math.max(1, Math.floor(rounds / 12)) } },
              yAxis: [
                { type: 'value', name: '信任度 / 权重', min: 0, max: 1, position: 'left', axisLabel: { fontSize: 8 } },
                { type: 'value', name: '不确定度', position: 'right', splitLine: { show: false }, min: 0, max: 0.3, axisLabel: { fontSize: 8 } },
              ],
              series: [
                { name: '信任度 μ', type: 'line', smooth: true, yAxisIndex: 0, data: muData, lineStyle: { width: 2, color: lineColor }, itemStyle: { color: lineColor }, areaStyle: { opacity: 0.1, color: lineColor }, symbol: 'none' },
                { name: '不确定度 σ²', type: 'line', smooth: true, yAxisIndex: 1, data: varData, lineStyle: { width: 1.5, color: '#faad14', type: 'dashed' }, itemStyle: { color: '#faad14' }, symbol: 'none' },
                { name: '聚合权重', type: 'line', smooth: true, yAxisIndex: 0, data: muData.map((v, i) => +(v * (1 - varData[i] * 3)).toFixed(3)), lineStyle: { width: 1.5, color: '#eb2f96', type: 'dotted' }, itemStyle: { color: '#eb2f96' }, symbol: 'none' },
                ...(isMal ? [{
                  name: '攻击标记', type: 'line', markLine: {
                    silent: true, symbol: 'none', data: [
                      { xAxis: `R${attackRound}`, label: { formatter: `R${attackRound} ⚠️攻击`, fontSize: 9, color: '#ff4d4f' }, lineStyle: { type: 'dashed', color: '#ff4d4f', width: 2 } },
                    ],
                  },
                  data: [], lineStyle: { width: 0 }, symbol: 'none',
                }] : []),
              ],
            }}
            style={{ height: 180 }}
          />
        </Card>
      </Col>
      <Col span={8}>
        <Card size="small" title={<span><LineChartOutlined /> 变点检测 (CUSUM)</span>} extra={<Text style={{ fontSize: 9, color: '#999' }}>阈值 h=2.5</Text>}>
          <ReactECharts option={{
            tooltip: { trigger: 'axis' },
            grid: { top: 15, right: 10, bottom: 20, left: 40 },
            xAxis: { type: 'category', data: Array.from({ length: rounds }, (_, i) => `R${i + 1}`), axisLabel: { fontSize: 7, interval: Math.max(1, Math.floor(rounds / 8)) } },
            yAxis: { type: 'value', name: 'S⁺', min: 0, axisLabel: { fontSize: 8 } },
            series: [
              { name: 'CUSUM S⁺', type: 'line', smooth: true, data: cusumData, lineStyle: { width: 2, color: '#ff4d4f' }, areaStyle: { opacity: 0.15, color: '#ff4d4f' }, itemStyle: { color: '#ff4d4f' }, symbol: 'none' },
              { name: '阻断阈值', type: 'line', data: Array.from({ length: rounds }, () => 2.5), lineStyle: { type: 'dashed', color: '#ff4d4f', width: 1 }, symbol: 'none', silent: true },
            ],
          }} style={{ height: 100 }} />
        </Card>
        <Card size="small" title={<span>信任概率分布 (Beta)</span>} style={{ marginTop: 4 }}>
          <ReactECharts option={{
            grid: { top: 5, right: 10, bottom: 15, left: 35 },
            xAxis: { type: 'value', min: 0, max: 1, axisLabel: { fontSize: 8 }, name: '信任度 μ' },
            yAxis: { type: 'value', show: false },
            series: [{ type: 'line', smooth: true, areaStyle: { opacity: 0.3, color: lineColor }, lineStyle: { color: lineColor }, data: betaDist }],
          }} style={{ height: 60 }} />
          <Row gutter={4} style={{ fontSize: 9 }}>
            <Col span={6} style={{ textAlign: 'center' }}>α={alpha.toFixed(1)}</Col>
            <Col span={6} style={{ textAlign: 'center' }}>β={beta.toFixed(1)}</Col>
            <Col span={6} style={{ textAlign: 'center' }}>μ={node.mu.toFixed(3)}</Col>
            <Col span={6} style={{ textAlign: 'center' }}><Tag color={tagColor} style={{ fontSize: 8 }}>{tagText}</Tag></Col>
          </Row>
        </Card>
      </Col>
    </Row>
  );
};

/** 任务级检测面板 */
const TaskDetailPanel: React.FC<{ task: TaskTrustDetail; taskIndex: number; taskSecurity?: TaskSecurity[];
  commOpt?: CommunicationOptimization; commTimeline?: CommTimelinePoint[]; accuracyVsComm?: AccuracyVsCommunicationPoint[];
  algo?: AlgorithmStrategyData; selectedAlgo?: string; onAlgoChange?: (v: string) => void;
  convergenceOption?: any; systemAgg?: SystemAggregation | null;
  fairness?: FairnessMetrics; distillation?: DistillationRobustness;
}> = ({ task, taskIndex, taskSecurity, commOpt, commTimeline, accuracyVsComm,
  algo, selectedAlgo, onAlgoChange, convergenceOption, systemAgg, fairness, distillation }) => {
  const [showCharts, setShowCharts] = useState(false);
  const attacks: Record<number, { name: string; attackRound: number; switchRound: number }> = {
    0: { name: '梯度反转', attackRound: 12, switchRound: 18 },
    2: { name: '标签翻转', attackRound: 5, switchRound: 8 },
    3: { name: '高斯噪声', attackRound: 10, switchRound: 15 },
    6: { name: '梯度反转', attackRound: 7, switchRound: 10 },
  };
  const atk = attacks[taskIndex] || { name: '', attackRound: 999, switchRound: 999 };
  const isAttacked = task.system.attacked;
  const rounds = Math.min(task.system.total_rounds, 50);

  // 根据 taskIndex 匹配 taskSecurity 中的 noniid_alpha 和 privacy_epsilon
  const taskSecInfo = taskSecurity && taskSecurity[taskIndex] ? taskSecurity[taskIndex] : null;

  const nodeColumns = [
    { title: '节点', dataIndex: 'node_name', key: 'node', width: 100, fixed: 'left' as const,
      render: (v: string, r: TaskNodeScore) => <Text strong style={{ fontSize: 11, color: r.layer === 'rejection' ? '#ff4d4f' : r.layer === 'isolation' ? '#faad14' : undefined }}>{v}</Text> },
    { title: '算法安全评估', key: 'algo', width: 90, sorter: (a: TaskNodeScore, b: TaskNodeScore) => b.algorithm_risk - a.algorithm_risk,
      render: (_: any, r: TaskNodeScore) => <RiskBar value={r.algorithm_risk} /> },
    { title: '数据安全评估', key: 'data', width: 85, sorter: (a: TaskNodeScore, b: TaskNodeScore) => b.data_safety.overall_risk - a.data_safety.overall_risk,
      render: (_: any, r: TaskNodeScore) => <RiskBar value={r.data_safety.overall_risk} /> },
    { title: '网络安全评估', key: 'net', width: 85, sorter: (a: TaskNodeScore, b: TaskNodeScore) => b.network_safety.overall_risk - a.network_safety.overall_risk,
      render: (_: any, r: TaskNodeScore) => <RiskBar value={r.network_safety.overall_risk} /> },
    { title: '信任度', dataIndex: 'mu', key: 'mu', width: 48, sorter: (a: TaskNodeScore, b: TaskNodeScore) => a.mu - b.mu,
      render: (v: number) => <Tag color={v >= 0.75 ? 'green' : v >= 0.5 ? 'blue' : v >= 0.35 ? 'orange' : 'red'} style={{ fontSize: 9, margin: 0, padding: '0 3px' }}>{v.toFixed(2)}</Tag> },
    { title: '决策', dataIndex: 'layer', key: 'layer', width: 56, render: (_: string, r: TaskNodeScore) => <LayerBadge layer={r.layer} /> },
    { title: '聚合权重', dataIndex: 'weight', key: 'weight', width: 55, sorter: (a: TaskNodeScore, b: TaskNodeScore) => b.weight - a.weight,
      render: (v: number) => <Progress percent={+(v * 100).toFixed(0)} size="small" strokeColor={v >= 0.15 ? '#52c41a' : v > 0 ? '#faad14' : '#ff4d4f'} format={() => v.toFixed(2)} style={{ minWidth: 35 }} /> },
  ];

  const chartData = useMemo(() => {
    const gen = (r: number) => {
      if (!isAttacked) {
        return {
          maliciousMu: Array.from({ length: rounds }, (_, i) => +(0.85 + Math.sin(i * 0.15) * 0.04).toFixed(3)),
          suspiciousMu: Array.from({ length: rounds }, (_, i) => +(0.78 + Math.sin(i * 0.1) * 0.06).toFixed(3)),
          goodMu: Array.from({ length: rounds }, (_, i) => +(0.90 + Math.sin(i * 0.08) * 0.03).toFixed(3)),
          weight: Array.from({ length: rounds }, (_, i) => +(0.85 + Math.sin(i * 0.08) * 0.05).toFixed(3)),
          variance: Array.from({ length: rounds }, (_, i) => +(0.02 + Math.random() * 0.01).toFixed(3)),
          cusum: Array.from({ length: rounds }, () => 0),
        };
      }
      const ar = atk.attackRound;
      return {
        maliciousMu: Array.from({ length: rounds }, (_, i) => i < ar - 2 ? +(0.82 + i * 0.008).toFixed(3) : +Math.max(0.05, (0.80 - (i - ar + 2) * 0.045)).toFixed(3)),
        suspiciousMu: Array.from({ length: rounds }, (_, i) => i < ar + 3 ? +(0.75 + Math.sin(i * 0.08) * 0.05).toFixed(3) : +Math.max(0.30, (0.75 - (i - ar - 3) * 0.025)).toFixed(3)),
        goodMu: Array.from({ length: rounds }, (_, i) => +(0.90 + Math.sin(i * 0.08) * 0.03).toFixed(3)),
        weight: Array.from({ length: rounds }, (_, i) => i < ar - 2 ? +(0.78 + i * 0.008).toFixed(3) : +Math.max(0, (0.75 - (i - ar + 2) * 0.055)).toFixed(3)),
        variance: Array.from({ length: rounds }, (_, i) => i < ar ? +(0.02 + Math.random() * 0.008).toFixed(3) : +Math.min(0.25, (0.02 + (i - ar) * 0.018)).toFixed(3)),
        cusum: Array.from({ length: rounds }, (_, i) => i < ar ? 0 : +Math.min(5, ((i - ar) * 0.4)).toFixed(3)),
      };
    };
    return gen(rounds);
  }, [rounds, isAttacked, atk.attackRound]);

  return (
    <div>
      <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
        <Col span={3}><Statistic title="参与节点" value={`${task.nodes.length}个`} valueStyle={{ fontSize: 14 }} /></Col>
        <Col span={3}><Statistic title="轮次" value={`${task.system.current_round}/${task.system.total_rounds}`} valueStyle={{ fontSize: 14 }} /></Col>
        <Col span={3}><Statistic title="平均信任度" value={task.system.avg_mu} valueStyle={{ color: task.system.avg_mu >= 0.75 ? '#52c41a' : '#faad14', fontSize: 14 }} /></Col>
        <Col span={3}><Statistic title="异常率" value={`${(task.system.avg_anomaly_rate * 100).toFixed(0)}%`} valueStyle={{ color: task.system.avg_anomaly_rate > 0.3 ? '#ff4d4f' : '#faad14', fontSize: 14 }} /></Col>
        <Col span={3}>
          {taskSecInfo ? (
            <Statistic title="Non-IID α" value={taskSecInfo.noniid_alpha} valueStyle={{ color: taskSecInfo.noniid_alpha >= 0.5 ? '#52c41a' : '#faad14', fontSize: 14 }} suffix={taskSecInfo.noniid_alpha >= 0.5 ? '低偏斜' : '高偏斜'} />
          ) : (
            <Statistic title="Non-IID α" value="-" valueStyle={{ fontSize: 14 }} />
          )}
        </Col>
        <Col span={3}>
          {taskSecInfo ? (
            <Statistic title="隐私 ε" value={taskSecInfo.privacy_epsilon} valueStyle={{ color: taskSecInfo.privacy_epsilon < 2 ? '#52c41a' : taskSecInfo.privacy_epsilon < 3 ? '#faad14' : '#ff4d4f', fontSize: 14 }} suffix={taskSecInfo.privacy_epsilon < 2 ? '安全' : taskSecInfo.privacy_epsilon < 3 ? '中等' : '高风险'} />
          ) : (
            <Statistic title="隐私 ε" value="-" valueStyle={{ fontSize: 14 }} />
          )}
        </Col>
        <Col span={3}>
          {(() => {
            const ar = task.system.avg_anomaly_rate;
            const riskLabel = ar >= 0.6 ? '高危' : ar >= 0.3 ? '中危' : '低危';
            const riskColor = ar >= 0.6 ? '#ff4d4f' : ar >= 0.3 ? '#faad14' : '#52c41a';
            return <Statistic title="风险等级" value={`${riskLabel}`} valueStyle={{ color: riskColor, fontSize: 14 }} prefix={<SafetyOutlined />} />;
          })()}
        </Col>
        <Col span={3}>
          <Tag color="blue" style={{ cursor: 'pointer' }} onClick={() => setShowCharts(!showCharts)}>
            {showCharts ? '收起' : '时间域'}
          </Tag>
        </Col>
      </Row>

      {isAttacked && (
        <div style={{ padding: '4px 12px', background: '#fff2f0', border: '1px solid #ffccc7', borderRadius: 4, marginBottom: 8, fontSize: 12 }}>
          <WarningOutlined style={{ color: '#ff4d4f', marginRight: 6 }} />
          安全态势告警：检测到高风险异常行为（异常率 {task.system.avg_anomaly_rate.toFixed(2)}），聚合策略已切换至 Bulyan，恶意节点被阻断。
        </div>
      )}

      <Table
        dataSource={task.nodes}
        rowKey="node_id"
        size="small"
        pagination={false}
        columns={nodeColumns}
        scroll={{ x: 700 }}
        expandable={{
          expandedRowRender: (record: TaskNodeScore) => (
            <div style={{ padding: '8px', background: '#fafafa' }}>
              <Collapse size="small" defaultActiveKey={['algo']} items={[
                {
                  key: 'algo',
                  label: <span style={{ fontSize: 11 }}><ExperimentOutlined /> 算法安全</span>,
                  children: (
                    <div>
                      <div style={{ marginBottom: 8, padding: '4px 8px', background: '#f5f5f5', borderRadius: 4, fontSize: 10, color: '#666' }}>
                        <SafetyOutlined /> <Text strong style={{ fontSize: 10 }}>5 维空间域指标时序</Text> — 梯度质量 · 方向一致性 · 安全风险 · 隐私合规 · 数据多样性
                      </div>
                      <NodeMainDimensionCharts node={record} taskIndex={taskIndex} rounds={rounds} attacks={attacks} />
                      <div style={{ margin: '12px 0 8px', padding: '4px 8px', background: '#f5f5f5', borderRadius: 4, fontSize: 10, color: '#666' }}>
                        <ExperimentOutlined /> <Text strong style={{ fontSize: 10 }}>安全风险子空间诊断时序</Text> — 符号翻转率 · 坐标异常率 · 更新稀疏度 · NSR · 层间耦合偏差
                      </div>
                      <NodeSubspaceCharts node={record} taskIndex={taskIndex} rounds={rounds} attacks={attacks} />
                      <div style={{ margin: '12px 0 8px', padding: '4px 8px', background: '#f5f5f5', borderRadius: 4, fontSize: 10, color: '#666' }}>
                        <LineChartOutlined /> <Text strong style={{ fontSize: 10 }}>时间域信任演化</Text> — 信任度 μ · 不确定度 σ² · CUSUM 变点检测 · Beta 概率分布
                      </div>
                      <NodeTimeDomainCharts node={record} rounds={rounds} />
                    </div>
                  ),
                },
                {
                  key: 'data',
                  label: <span style={{ fontSize: 11 }}><DatabaseOutlined /> 数据安全</span>,
                  children: <DataSafetyRow node={record} />,
                },
                {
                  key: 'net',
                  label: <span style={{ fontSize: 11 }}><WifiOutlined /> 网络安全</span>,
                  children: <NetworkSafetyRow node={record} />,
                },
              ]} />
            </div>
          ),
          rowExpandable: () => true,
        }}
      />

      {/* By 任务级详情：任务通信 + 攻击检测与策略决策中心（与节点表格平级） */}
      <Collapse size="small" style={{ marginTop: 12 }} items={[
        {
          key: 'comm',
          label: <span style={{ fontSize: 12 }}><SwapOutlined /> 任务通信 <Text type="secondary" style={{ fontSize: 10, fontWeight: 400 }}>优化前后对比 · 所属节点链路</Text></span>,
          children: commOpt && commTimeline ? (
            <div>
              <Row gutter={[16, 12]}>
                <Col span={4}><Statistic title="当前策略" value={commOpt.strategy} valueStyle={{ fontSize: 14 }} /></Col>
                <Col span={4}><Statistic title="单轮基线" value={`${commOpt.baseline_gb_per_round} GB/轮`} valueStyle={{ fontSize: 14 }} /></Col>
                <Col span={4}><Statistic title="优化后" value={`${commOpt.optimized_gb_per_round} GB/轮`} valueStyle={{ fontSize: 14, color: '#52c41a' }} /></Col>
                <Col span={4}><Statistic title="单轮节省" value={`${commOpt.saving_pct}%`} valueStyle={{ fontSize: 14, color: '#1677ff' }} /></Col>
                <Col span={4}><Statistic title="月总开销" value={`${commOpt.monthly_total_tb} TB`} valueStyle={{ fontSize: 14 }} /></Col>
                <Col span={4}><Statistic title="月节省" value={`${commOpt.monthly_saving_pct}%`} suffix={`(${commOpt.monthly_baseline_tb}TB)`} valueStyle={{ color: '#52c41a' }} /></Col>
              </Row>
              <ReactECharts option={{
                tooltip: { trigger: 'axis' }, legend: { data: ['原始基线(无优化)', '优化后(Top-K+Int8)'] },
                xAxis: { type: 'category', data: commTimeline.map(p => `第${p.round}轮`), name: '训练轮次' },
                yAxis: { type: 'value', name: '通信开销 (GB/轮)', min: 0, max: 10 },
                series: [
                  { name: '原始基线(无优化)', type: 'line', data: commTimeline.map(p => p.baseline_gb), lineStyle: { color: '#ff4d4f', type: 'dashed' } },
                  { name: '优化后(Top-K+Int8)', type: 'line', data: commTimeline.map(p => p.optimized_gb), areaStyle: { opacity: 0.15, color: '#52c41a' }, lineStyle: { color: '#52c41a' } },
                ],
              }} style={{ height: 200 }} />
            </div>
          ) : <Text type="secondary">暂无通信数据</Text>,
        },
        {
          key: 'decision',
          label: <span style={{ fontSize: 12 }}><RocketOutlined /> 攻击检测与策略决策中心 <Text type="secondary" style={{ fontSize: 10, fontWeight: 400 }}>检测攻击 → 自动切换算法 → 训练恢复 · 全流程闭环</Text></span>,
          children: algo && systemAgg && convergenceOption ? (
            <div>
              <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
                <Col span={6}>
                  <Card size="small" title="RL 推荐策略" styles={{ body: { padding: '12px 16px' } }}>
                    <Text type="secondary">当前最优聚合算法</Text>
                    <div style={{ fontSize: 32, fontWeight: 700, color: '#1677ff', lineHeight: 1.3 }}>Bulyan</div>
                    <div style={{ marginTop: 8 }}>
                      <Text type="secondary" style={{ fontSize: 11 }}>对比：</Text>
                      <Radio.Group value={selectedAlgo} onChange={(e) => onAlgoChange?.(e.target.value)} size="small" style={{ marginTop: 4 }}>
                        {algo.aggregation_options.map((opt) => (<Radio.Button key={opt} value={opt}>{opt}</Radio.Button>))}
                      </Radio.Group>
                    </div>
                  </Card>
                  <div style={{ marginTop: 8 }}>
                    <Card size="small" styles={{ body: { padding: '12px 16px' } }}>
                      <Text type="secondary">攻击类型</Text>
                      <div style={{ marginTop: 4 }}>
                        {systemAgg && systemAgg.distinct_attacks.length > 0
                          ? systemAgg.distinct_attacks.map((at: string) => <Tag color="red" key={at} style={{ fontSize: 14, padding: '4px 10px', margin: '2px' }}>{at}</Tag>)
                          : <Tag color="green">无攻击</Tag>}
                      </div>
                      <Text type="secondary" style={{ fontSize: 11 }}>跨 {systemAgg?.task_count || 0} 个任务</Text>
                      <div style={{ marginTop: 8 }}><Text type="secondary">恶意节点比例</Text><div style={{ fontSize: 24, fontWeight: 700, color: '#ff4d4f' }}>{systemAgg ? `${(systemAgg.max_malicious_ratio * 100).toFixed(0)}%` : '-'}</div></div>
                    </Card>
                  </div>
                </Col>
                <Col span={18}>
                  <Card size="small" title={<Space><LineChartOutlined /><span>训练监控曲线</span><Tag color="orange">R12 异常</Tag><Tag color="red">R15 攻击</Tag><Tag color="green">R18 切换Bulyan</Tag></Space>}>
                    <ReactECharts option={{
                      tooltip: { trigger: 'axis' }, legend: { data: ['Global Acc', 'Global Loss'], bottom: 0 },
                      grid: { top: 20, right: 60, bottom: 50, left: 50 },
                      xAxis: { type: 'category', data: Array.from({ length: 50 }, (_, i) => `${i + 1}`), name: '训练轮次' },
                      yAxis: [
                        { type: 'value', name: 'Accuracy', min: 0, max: 1, position: 'left', axisLabel: { formatter: (v: number) => `${(v * 100).toFixed(0)}%` } },
                        { type: 'value', name: 'Loss', min: 0, max: 3, position: 'right' },
                      ],
                      series: [
                        { name: 'Global Acc', type: 'line', smooth: true, yAxisIndex: 0,
                          data: Array.from({ length: 50 }, (_, i) => parseFloat((0.35 + 0.55 * (1 - Math.exp(-0.08 * (i + 1)))).toFixed(3))),
                          lineStyle: { width: 2.5, color: '#1677ff' },
                          markArea: { silent: true, data: [[{ xAxis: 12, label: { show: false } }, { xAxis: 18, label: { formatter: '攻击区间', fontSize: 10, color: '#ff4d4f', fontWeight: 'bold' }, itemStyle: { color: 'rgba(255,77,79,0.08)' } }]] },
                          markLine: { silent: true, symbol: 'none', data: [
                            { xAxis: 12, label: { formatter: 'R12 ⚠️异常', fontSize: 10 }, lineStyle: { type: 'dashed', color: '#faad14' } },
                            { xAxis: 15, label: { formatter: 'R15 🔴攻击', fontSize: 10 }, lineStyle: { type: 'dashed', color: '#ff4d4f' } },
                            { xAxis: 18, label: { formatter: 'R18 🛡️切换Bulyan', fontSize: 10 }, lineStyle: { type: 'dashed', color: '#52c41a' } },
                          ]},
                        },
                        { name: 'Global Loss', type: 'line', smooth: true, yAxisIndex: 1,
                          data: Array.from({ length: 50 }, (_, i) => parseFloat((2.5 * Math.exp(-0.065 * (i + 1)) + 0.15).toFixed(3))),
                          lineStyle: { width: 2, color: '#ff4d4f', type: 'dashed' } },
                      ],
                    }} style={{ height: 220 }} />
                  </Card>
                </Col>
              </Row>
              <Row gutter={[16, 16]}>
                <Col span={14}>
                  <Card size="small" title="4 种聚合算法收敛对比（投毒攻击场景）">
                    <ReactECharts option={convergenceOption} style={{ height: 240 }} />
                  </Card>
                </Col>
                <Col span={10}>
                  <Card size="small" title="RL 跨任务决策日志" styles={{ body: { padding: '8px 16px', maxHeight: 276, overflowY: 'auto' } }}>
                    <Timeline items={algo.decision_logs.map((log) => ({ children: <span style={{ fontSize: 12 }}>{log.time} {log.event}</span> }))} />
                  </Card>
                </Col>
              </Row>
              {fairness && distillation && (
                <div style={{ textAlign: 'center', marginTop: 12 }}>
                  <Button icon={<BarChartOutlined />} onClick={() => {}}>查看聚合指标与公平性</Button>
                </div>
              )}
            </div>
          ) : <Text type="secondary">暂无策略决策数据</Text>,
        },
      ]} />

      {showCharts && (
        <div style={{ marginTop: 8 }}>
          <Row gutter={[12, 12]}>
            <Col span={16}>
              <Card size="small" title={<span><ExperimentOutlined /> 信任演化 · 算法安全 {isAttacked ? `(${atk.name}攻击分析)` : '(正常收敛)'} <Text type="secondary" style={{ fontSize: 10, fontWeight: 400 }}>纵轴: 信任度/聚合权重 | 绿=正常 黄=可疑 红=恶意 粉虚=权重骤降</Text></span>}>
                <ReactECharts
                  option={{
                    tooltip: { trigger: 'axis', formatter: (ps: any) => ps.map((p: any) => `${p.seriesName}: ${p.value}`).join('<br/>') },
                    legend: { data: ['正常节点信任度', '可疑节点信任度', '恶意节点信任度', '恶意节点权重', '不确定度'], bottom: 0, textStyle: { fontSize: 9 } },
                    grid: { top: 20, right: 60, bottom: 40, left: 50 },
                    xAxis: { type: 'category', data: Array.from({ length: rounds }, (_, i) => `R${i + 1}`), name: '训练轮次', axisLabel: { fontSize: 8, interval: Math.max(1, Math.floor(rounds / 12)) } },
                    yAxis: [
                      { type: 'value', name: '信任度 / 权重', min: 0, max: 1, position: 'left' },
                      { type: 'value', name: '不确定度', position: 'right', splitLine: { show: false }, min: 0, max: 0.3 },
                    ],
                    series: [
                      { name: '正常节点信任度', type: 'line', smooth: true, yAxisIndex: 0, data: chartData.goodMu, lineStyle: { width: 1.5, color: '#52c41a' }, itemStyle: { color: '#52c41a' }, symbol: 'none' },
                      { name: '可疑节点信任度', type: 'line', smooth: true, yAxisIndex: 0, data: chartData.suspiciousMu, lineStyle: { width: 1.5, color: '#faad14' }, itemStyle: { color: '#faad14' }, symbol: 'none' },
                      { name: '恶意节点信任度', type: 'line', smooth: true, yAxisIndex: 0, data: chartData.maliciousMu, lineStyle: { width: 2.5, color: '#ff4d4f' }, itemStyle: { color: '#ff4d4f' },
                        ...(isAttacked ? {
                          markLine: { silent: true, symbol: 'none', data: [
                            { xAxis: `R${atk.attackRound}`, label: { formatter: `R${atk.attackRound} ⚠️攻击`, fontSize: 9, color: '#ff4d4f' }, lineStyle: { type: 'dashed', color: '#ff4d4f', width: 2 } },
                            { xAxis: `R${atk.switchRound}`, label: { formatter: `R${atk.switchRound} 🛡️防御`, fontSize: 9, color: '#52c41a' }, lineStyle: { type: 'dashed', color: '#52c41a', width: 2 } },
                          ]},
                        } : {}),
                      },
                      { name: '恶意节点权重', type: 'line', smooth: true, yAxisIndex: 0, data: chartData.weight, lineStyle: { width: 1.5, color: '#eb2f96', type: 'dashed' }, itemStyle: { color: '#eb2f96' }, symbol: 'none' },
                      { name: '不确定度', type: 'line', smooth: true, yAxisIndex: 1, data: chartData.variance, lineStyle: { width: 1.5, color: '#faad14' }, itemStyle: { color: '#faad14' }, symbol: 'none' },
                    ],
                  }}
                  style={{ height: 250 }}
                />
              </Card>
            </Col>
            <Col span={8}>
              <Card size="small" title={<span><LineChartOutlined /> 变点检测</span>} extra={<Text style={{ fontSize: 9, color: '#999' }}>超阈值 h=2.5 触发阻断</Text>}>
                <ReactECharts option={{
                  tooltip: { trigger: 'axis' },
                  grid: { top: 15, right: 10, bottom: 25, left: 40 },
                  xAxis: { type: 'category', data: Array.from({ length: rounds }, (_, i) => `R${i + 1}`), axisLabel: { fontSize: 8, interval: Math.max(1, Math.floor(rounds / 10)) } },
                  yAxis: { type: 'value', name: '变点统计量 S⁺', min: 0 },
                  series: [{ name: '变点统计量', type: 'line', smooth: true, data: chartData.cusum, lineStyle: { width: 2, color: '#ff4d4f' }, itemStyle: { color: '#ff4d4f' }, areaStyle: { opacity: 0.15, color: '#ff4d4f' }, markLine: { silent: true, symbol: 'none', data: [{ yAxis: 2.5, label: { formatter: '阻断阈值 h=2.5', fontSize: 9, color: '#ff4d4f' }, lineStyle: { type: 'dashed', color: '#ff4d4f' } }] } }],
                }} style={{ height: 140 }} />
              </Card>
              <Card size="small" title="信任概率分布" extra={<Text style={{ fontSize: 9, color: '#999' }}>恶意节点当前</Text>} style={{ marginTop: 8 }}>
                <ReactECharts option={{
                  grid: { top: 5, right: 10, bottom: 18, left: 35 },
                  xAxis: { type: 'value', min: 0, max: 1, axisLabel: { fontSize: 8 }, name: '信任度' },
                  yAxis: { type: 'value', show: false },
                  series: [{
                    type: 'line', smooth: true, areaStyle: { opacity: 0.3, color: '#ff4d4f' }, lineStyle: { color: '#ff4d4f' },
                    data: (() => {
                      const a = isAttacked ? 2.2 : 8.5, b = isAttacked ? 6.8 : 1.5;
                      const logBeta = (aa: number, bb: number) => { let s = 0; for (let j = 0; j < aa - 1; j++) s += Math.log(j + 1); for (let j = 0; j < bb - 1; j++) s += Math.log(j + 1); for (let j = 0; j < aa + bb - 2; j++) s -= Math.log(j + 1); return s; };
                      return Array.from({ length: 50 }, (_, i) => { const x = (i + 0.5) / 50; return [x, Math.min(Math.exp((a - 1) * Math.log(x) + (b - 1) * Math.log(1 - x) - logBeta(Math.round(a), Math.round(b))), 8)]; });
                    })(),
                  }],
                }} style={{ height: 70 }} />
                <Row gutter={4} style={{ fontSize: 10 }}>
                  <Col span={6} style={{ textAlign: 'center' }}>α(正向)<br/><Text strong>{isAttacked ? '2.2' : '9.5'}</Text></Col>
                  <Col span={6} style={{ textAlign: 'center' }}>β(负向)<br/><Text strong>{isAttacked ? '6.8' : '1.5'}</Text></Col>
                  <Col span={6} style={{ textAlign: 'center' }}>信任度<br/><Text strong>{isAttacked ? '0.24' : '0.86'}</Text></Col>
                  <Col span={6} style={{ textAlign: 'center' }}>{isAttacked ? <Tag color="red" style={{ fontSize: 9 }}>不可信</Tag> : <Tag color="green" style={{ fontSize: 9 }}>可信</Tag>}</Col>
                </Row>
              </Card>
            </Col>
          </Row>
        </div>
      )}
    </div>
  );
};

/** 攻击检测主面板 */
const AttackDetectionPanel: React.FC<Props> = ({ data, backdoor, taskSecurity, commOpt, commTimeline, accuracyVsComm,
  algo, selectedAlgo, onAlgoChange, convergenceOption, systemAgg, fairness, distillation }) => {
  const [selectedTaskId, setSelectedTaskId] = useState(data.task_trust_details[0]?.task_id || '');
  const selectedTask = useMemo(() => data.task_trust_details.find(t => t.task_id === selectedTaskId), [data.task_trust_details, selectedTaskId]);
  const selectedIdx = useMemo(() => data.task_trust_details.findIndex(t => t.task_id === selectedTaskId), [data.task_trust_details, selectedTaskId]);

  const nodeRiskData = useMemo(() => {
    const aggregated: Record<string, { totalRisk: number; mu: number; layer: string }> = {};
    data.task_trust_details.forEach(t => {
      t.nodes.forEach(n => {
        if (!aggregated[n.node_id]) {
          const dec = data.decisions.find(d => d.node_id === n.node_id);
          aggregated[n.node_id] = { totalRisk: 0, mu: dec?.mu || 0.5, layer: dec?.layer || 'observation' };
        }
        aggregated[n.node_id].totalRisk += n.algorithm_risk > 0.3 ? 1 : 0;
      });
    });
    const maxRisk = Math.max(...Object.values(aggregated).map(x => x.totalRisk), 1);
    return Object.entries(aggregated).map(([node_id, v]) => {
      const node = data.spatial.find(s => s.node_id === node_id);
      const dec = data.decisions.find(d => d.node_id === node_id);
      const riskCoeff = +(v.totalRisk / maxRisk * (1 - v.mu)).toFixed(3);
      return {
        node_id, node_name: node?.node_name || node_id, risk_coefficient: riskCoeff,
        total_anomalies: v.totalRisk, mu: v.mu, layer: v.layer,
        layer_label: dec?.layer_label || '', layer_color: dec?.layer_color || '#1677ff',
        exclusion_hint: riskCoeff > 0.5 ? `${Math.round(riskCoeff * 10)}次阻断` : `${v.totalRisk}次告警`,
      };
    }).sort((a, b) => b.risk_coefficient - a.risk_coefficient);
  }, [data]);

  const chartOption = {
    tooltip: { trigger: 'axis' as const, axisPointer: { type: 'shadow' as const }, formatter: (ps: any) => `${ps[0].name}<br/>风险系数: ${ps[0].value}<br/>告警次数: ${nodeRiskData[ps[0].dataIndex].total_anomalies}<br/>信任度: ${nodeRiskData[ps[0].dataIndex].mu}<br/>决策: ${nodeRiskData[ps[0].dataIndex].layer_label}` },
    grid: { left: '3%', right: '10%', bottom: '3%', top: '3%', containLabel: true },
    xAxis: { type: 'value' as const, name: '风险系数', max: 1, min: 0, axisLabel: { fontSize: 10 } },
    yAxis: { type: 'category' as const, data: nodeRiskData.map(n => n.node_name).reverse(), axisLabel: { fontSize: 10 } },
    series: [{
      type: 'bar' as const,
      data: nodeRiskData.map(n => ({ value: n.risk_coefficient, itemStyle: { color: n.layer_color, borderRadius: [0, 4, 4, 0] } })).reverse(),
      label: { show: true, position: 'right' as const, formatter: (p: any) => nodeRiskData[p.dataIndex].exclusion_hint, fontSize: 10 },
    }],
  };

  return (
    <Card
      title={<span><BugOutlined style={{ color: '#cf1322' }} /> 安全性评估 <Text type="secondary" style={{ fontSize: 12 }}>算法安全+数据安全+网络安全 · 时空双域评估</Text></span>}
      extra={<Text type="secondary">第 {backdoor.current_round} 轮 · 变点阈值 h=2.5</Text>}
      style={{ borderLeft: '4px solid #cf1322' }}
    >
      <Row gutter={[8, 8]} style={{ marginBottom: 12 }}>
        <Col span={3}><Card size="small"><Statistic title="总节点" value={data.system.total_nodes} prefix={<DesktopOutlined />} valueStyle={{ fontSize: 14 }} /></Card></Col>
        <Col span={3}><Card size="small"><Statistic title="完全信任" value={data.system.full_trust_count} valueStyle={{ color: '#52c41a', fontSize: 14 }} prefix={<CheckCircleOutlined />} /></Card></Col>
        <Col span={3}><Card size="small"><Statistic title="观察降权" value={data.system.observation_count} valueStyle={{ color: '#1677ff', fontSize: 14 }} prefix={<ExperimentOutlined />} /></Card></Col>
        <Col span={3}><Card size="small"><Statistic title="隔离审查" value={data.system.isolation_count} valueStyle={{ color: '#faad14', fontSize: 14 }} prefix={<WarningOutlined />} /></Card></Col>
        <Col span={3}><Card size="small"><Statistic title="拒绝阻断" value={data.system.rejection_count} valueStyle={{ color: '#ff4d4f', fontSize: 14 }} prefix={<StopOutlined />} /></Card></Col>
        <Col span={3}><Card size="small"><Statistic title="平均信任度" value={data.system.avg_trust_mu} valueStyle={{ fontSize: 14 }} /></Card></Col>
        <Col span={3}><Card size="small"><Statistic title="平均不确定度" value={data.system.avg_trust_variance} valueStyle={{ fontSize: 14 }} /></Card></Col>
        <Col span={3}><Card size="small"><Statistic title="变点告警数" value={data.system.active_cusum_alerts} valueStyle={{ color: data.system.active_cusum_alerts > 0 ? '#ff4d4f' : '#52c41a', fontSize: 14 }} /></Card></Col>
      </Row>

      <Collapse defaultActiveKey={['node']} size="small"
        items={[
          {
            key: 'node',
            label: <span><NodeIndexOutlined /> 全局节点信任排名</span>,
            children: (
              <div>
                <div style={{ marginBottom: 8 }}>
                  <Text type="secondary" style={{ fontSize: 11 }}>风险系数 = 各任务告警累计 × (1-信任度) · 颜色=决策层</Text>
                </div>
                <ReactECharts option={chartOption} style={{ height: Math.max(200, nodeRiskData.length * 35) }} />
              </div>
            ),
          },
          {
            key: 'task',
            label: <span><ThunderboltOutlined /> By 任务检测详情</span>,
            children: (
              <div>
                <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>选择任务：</span>
                  <Select size="small" style={{ width: 260 }} value={selectedTaskId} onChange={setSelectedTaskId}
                    options={data.task_trust_details.map(t => ({ value: t.task_id, label: `${t.task_name} (${t.task_id.slice(-5)})` }))} />
                  {(() => {
                    const ar = selectedTask?.system.avg_anomaly_rate ?? 0;
                    const riskLabel = ar >= 0.6 ? '高危' : ar >= 0.3 ? '中危' : '低危';
                    const riskColor = ar >= 0.6 ? 'red' : ar >= 0.3 ? 'orange' : 'green';
                    return <Tag color={riskColor}>风险等级: {riskLabel} · 异常率 {ar.toFixed(2)}</Tag>;
                  })()}
                </div>
                {selectedTask && <TaskDetailPanel task={selectedTask} taskIndex={selectedIdx} taskSecurity={taskSecurity}
                  commOpt={commOpt} commTimeline={commTimeline} accuracyVsComm={accuracyVsComm}
                  algo={algo} selectedAlgo={selectedAlgo} onAlgoChange={onAlgoChange}
                  convergenceOption={convergenceOption} systemAgg={systemAgg}
                  fairness={fairness} distillation={distillation}
                />}
              </div>
            ),
          },
        ]}
      />
    </Card>
  );
};

export default AttackDetectionPanel;
