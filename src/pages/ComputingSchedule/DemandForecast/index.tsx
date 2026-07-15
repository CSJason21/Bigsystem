import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Card,
  DatePicker,
  Radio,
  Select,
  Space,
  Tag,
  Typography,
  Alert,
  Button,
  notification,
  theme,
} from 'antd';
import { ArrowRightOutlined, RocketOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import {
  PERSPECTIVES,
  PERSPECTIVE_MAP,
  perspectiveGroupLabels,
} from '../shared/nodeMeta';
import type {
  PerspectiveValue,
  PerspectiveKind,
  PerspectiveProfile,
} from '../shared/nodeMeta';
import type {
  ForecastMetric,
  TimeGranularity,
  TimeMode,
} from '../shared/replay/forecastReplay';
import { useReplayEngine } from '../shared/replay/useReplayEngine';
import { useMultiMetricForecast } from '../shared/replay/useMultiMetricForecast';
import type { ForecastReplayState } from '../shared/replay/types';
import { buildForecastOption, buildFixedForecastOption } from '../shared/options/forecastOption';
import { getPerspectives, getPredictionSchedulingInsights } from '@/services/api/predictionAllocation';
import ForecastPanel from './ForecastPanel';
import { useTaskFlowStore } from '@/store/taskFlow';
import { useNavigate } from 'react-router-dom';
import './index.css';

const { Text } = Typography;

const METRICS: Array<{ key: ForecastMetric; title: string }> = [
  { key: 'cpu', title: 'CPU 利用率' },
  { key: 'gpu', title: 'GPU 利用率' },
  { key: 'memory', title: '内存利用率' },
  { key: 'bandwidth', title: '网络带宽' },
];

const metricUnit = (m: ForecastMetric) => (m === 'bandwidth' ? 'Gbps' : '%');

const DemandForecast: React.FC = () => {
  const { token } = theme.useToken();
  const navigate = useNavigate();
  const { currentTask } = useTaskFlowStore();
  const [perspective, setPerspective] = useState<PerspectiveValue>('global');
  const [granularity, setGranularity] = useState<TimeGranularity>('1h');
  const [timeMode, setTimeMode] = useState<TimeMode>('live');
  const [fixedRange, setFixedRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null);
  const [pressureInsights, setPressureInsights] = useState<any>(null);
  const [dbPerspectives, setDbPerspectives] = useState<PerspectiveProfile[] | null>(null);
  const perspectiveProfiles = dbPerspectives ?? PERSPECTIVES;
  const perspectiveMap = useMemo(
    () => Object.fromEntries(perspectiveProfiles.map((item) => [item.value, item])) as Record<PerspectiveValue, PerspectiveProfile>,
    [perspectiveProfiles],
  );
  const currentPerspective = perspectiveMap[perspective] ?? PERSPECTIVE_MAP[perspective] ?? perspectiveProfiles[0] ?? PERSPECTIVES[0];

  const { virtualTime } = useReplayEngine();

  const dataSourceNotifiedRef = useRef(false);

  /** 数据源连接状态通知：成功弹绿色、失败弹红色，页面生命周期只弹一次 */
  const notifyDataSource = React.useCallback((online: boolean, detail?: string) => {
    if (dataSourceNotifiedRef.current) return;
    dataSourceNotifiedRef.current = true;
    if (online) {
      notification.success({
        message: '数据库已连接',
        description: detail ?? '预测数据来自后端数据库。',
        placement: 'topRight',
        duration: 3,
      });
    } else {
      notification.error({
        message: '数据库连接失败',
        description: detail ?? '后端不可达，已切换为前端演示数据。',
        placement: 'topRight',
        duration: 5,
      });
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    getPerspectives('auto')
      .then((payload) => {
        if (cancelled) return;
        if (payload?.perspectives?.length) {
          setDbPerspectives(payload.perspectives.map((item) => ({
            value: item.value,
            label: item.label,
            kind: item.kind as PerspectiveKind,
            nodeIds: item.nodeIds,
            nodeId: item.node_id ?? undefined,
          })));
          notifyDataSource(true, '预测数据来自后端数据库');
        } else {
          setDbPerspectives(null);
          notifyDataSource(false);
        }
      })
      .catch(() => {
        setDbPerspectives(null);
        notifyDataSource(false);
      });
    return () => {
      cancelled = true;
    };
  }, [notifyDataSource]);

  useEffect(() => {
    let cancelled = false;
    getPredictionSchedulingInsights()
      .then((payload) => {
        if (!cancelled) setPressureInsights(payload);
      })
      .catch(() => {
        if (!cancelled) setPressureInsights(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const forecast = useMultiMetricForecast({
    granularity,
    perspective: currentPerspective,
    timeMode,
    fixedRange,
    viewId: perspective,
    virtualTime,
    warnFallback: () => {},  // hook 内部通知已静默，页面级通知由 notifyDataSource 统一处理
  });

  const buildOption = (m: ForecastMetric, replay: ForecastReplayState) => {
    if (timeMode === 'fixed' && fixedRange) {
      return buildFixedForecastOption(m, fixedRange[0].valueOf(), fixedRange[1].valueOf(), currentPerspective, token);
    }
    return buildForecastOption(replay, token);
  };

  const latest = (replay: ForecastReplayState) => replay.actual[replay.cursor];
  const nextPredicted = (replay: ForecastReplayState) => replay.predicted[Math.min(replay.cursor + 3, replay.predicted.length - 1)];

  const summaryItems = METRICS.map(({ key }) => {
    const replay = forecast[key];
    return {
      key,
      label: key.toUpperCase(),
      current: latest(replay),
      predicted: nextPredicted(replay),
      unit: metricUnit(key),
    };
  });

  const perspectiveSelectOptions = useMemo(() => (
    (['global', 'region', 'province'] as PerspectiveKind[])
      .map((kind) => ({
        label: perspectiveGroupLabels[kind],
        options: perspectiveProfiles
          .filter((item) => item.kind === kind)
          .map((item) => ({ label: item.label, value: item.value })),
      }))
      .filter((group) => group.options.length > 0)
  ), [perspectiveProfiles]);

  return (
    <div className="demand-forecast-page">
      <Card size="small" className="demand-forecast-entry-card">
        <div className="demand-forecast-entry-bar">
          <div className="demand-forecast-entry-bar--orange" />
          <div className="demand-forecast-entry-content">
            <RocketOutlined className="demand-forecast-entry-icon" />
            <div>
              <span>算力需求预测</span>
              <strong>基于历史趋势预测未来负载，为调度决策提供前瞻性压力评估</strong>
            </div>
          </div>
          <Button type="primary" ghost icon={<ArrowRightOutlined />} onClick={() => navigate('/computing/prediction-allocation')}>
            前往调度中枢
          </Button>
        </div>
      </Card>

      {/* 联动提示：如果当前有流转任务，显示预测建议 */}
      {currentTask && currentTask.targetNode && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 12 }}
          message={`预测联动 · 任务「${currentTask.name}」当前绑定至 ${currentTask.targetNode}`}
          description={
            <Space>
              <Text type="secondary">
                基于预测模型，未来 1 小时 {currentTask.targetNode} 的 CPU 负载可能持续上升。
                建议关注该节点的资源余量，必要时可触发任务重定向。
              </Text>
              <Button type="link" size="small" onClick={() => navigate('/computing/security-assessment')}>
                前往安全评估 →
              </Button>
            </Space>
          }
        />
      )}

      {/* 工具栏 */}
      <Card>
        <Space wrap size={[16, 12]} className="demand-forecast-toolbar">
          <div className="demand-forecast-toolbar-block">
            <Text type="secondary">层级视角</Text>
            <Select
              value={perspective}
              style={{ width: 260 }}
              onChange={(value) => setPerspective(value as PerspectiveValue)}
              options={perspectiveSelectOptions}
            />
          </div>
          <div className="demand-forecast-toolbar-block">
            <Text type="secondary">预测视窗</Text>
            <Radio.Group
              value={granularity}
              optionType="button"
              buttonStyle="solid"
              onChange={(event) => setGranularity(event.target.value as TimeGranularity)}
              options={[
                { label: '未来30分钟', value: '30m' },
                { label: '未来1小时', value: '1h' },
                { label: '未来6小时', value: '6h' },
              ]}
            />
          </div>
          <div className="demand-forecast-toolbar-block">
            <Text type="secondary">数据模式</Text>
            <Radio.Group
              value={timeMode}
              optionType="button"
              buttonStyle="solid"
              onChange={(event) => setTimeMode(event.target.value as TimeMode)}
              options={[
                { label: '实时回放', value: 'live' },
                { label: '固定时段', value: 'fixed' },
              ]}
            />
          </div>
          {timeMode === 'fixed' && (
            <div className="demand-forecast-toolbar-block">
              <Text type="secondary">选择时段</Text>
              <DatePicker.RangePicker
                showTime
                value={fixedRange}
                onChange={(dates) => {
                  if (dates && dates[0] && dates[1]) {
                    setFixedRange([dates[0], dates[1]]);
                  } else {
                    setFixedRange(null);
                  }
                }}
                style={{ width: 380 }}
              />
            </div>
          )}
          <Tag color="blue">
            当前虚拟时间：{dayjs(virtualTime).format('YYYY-MM-DD HH:mm:ss')}
          </Tag>
        </Space>
      </Card>

      {pressureInsights && (
        <Card className="demand-forecast-insight-card" styles={{ body: { padding: 0 } }}>
          <div className="demand-forecast-insight-hero">
            <span>预测压力摘要</span>
            <strong>{pressureInsights.recommendedWindow ?? '滚动预测已更新'}</strong>
            <em>用于调度中心避开高压时段和高风险节点</em>
          </div>
          <div className="demand-forecast-insight-grid">
            <div className="demand-forecast-insight-item demand-forecast-insight-item--risk">
              <span>紧张区域</span>
              <strong>{(pressureInsights.tightRegions ?? []).slice(0, 3).map((i: any) => `${i.regionId} ${i.pressure}%`).join('、') || '暂无'}</strong>
            </div>
            <div className="demand-forecast-insight-item">
              <span>紧张资源</span>
              <strong>{(pressureInsights.tightResources ?? []).filter((i: any) => i.level === 'tight').map((i: any) => i.resource).join('、') || '暂无'}</strong>
            </div>
            <div className="demand-forecast-insight-item demand-forecast-insight-item--good">
              <span>富裕区域</span>
              <strong>{(pressureInsights.idleRegions ?? []).slice(0, 3).map((i: any) => i.regionId).join('、') || '暂无'}</strong>
            </div>
            <div className="demand-forecast-insight-item demand-forecast-insight-item--good">
              <span>推荐节点</span>
              <strong>{(pressureInsights.recommendedNodes ?? []).slice(0, 3).map((i: any) => i.nodeName).join('、') || '--'}</strong>
            </div>
            <div className="demand-forecast-insight-item demand-forecast-insight-item--risk">
              <span>不推荐节点</span>
              <strong>{(pressureInsights.notRecommendedNodes ?? []).slice(0, 3).map((i: any) => i.nodeName).join('、') || '暂无'}</strong>
            </div>
          </div>
        </Card>
      )}

      {/* 顶部汇总条：四维度 当前值·预测值 */}
      <Card styles={{ body: { padding: '14px 20px' } }}>
        <div className="demand-forecast-summary">
          {summaryItems.map((item) => (
            <div key={item.key} className="demand-forecast-summary-item">
              <Text type="secondary" className="demand-forecast-summary-label">{item.label}</Text>
              <div className="demand-forecast-summary-values">
                <span className="demand-forecast-summary-current">
                  {item.current}<Text type="secondary" style={{ fontSize: 12 }}>{item.unit}</Text>
                </span>
                <span className="demand-forecast-summary-predicted">
                  → {item.predicted}<Text type="secondary" style={{ fontSize: 12 }}>{item.unit}</Text>
                </span>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* 2x2 四图 */}
      <div className="demand-forecast-grid">
        {METRICS.map(({ key, title }) => (
          <ForecastPanel
            key={key}
            title={title}
            forecastOption={buildOption(key, forecast[key])}
            current={latest(forecast[key])}
            predicted={nextPredicted(forecast[key])}
            unit={metricUnit(key)}
          />
        ))}
      </div>
    </div>
  );
};

export default DemandForecast;
