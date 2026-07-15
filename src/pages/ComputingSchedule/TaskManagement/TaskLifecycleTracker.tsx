/**
 * 任务生命周期追踪组件
 *
 * 功能：
 * 1. 展示任务从录入到结束的完整流转时间线
 * 2. 每条记录显示：时间、动作、操作者、详情
 * 3. 支持查看调度决策详情（评分明细）
 *
 * 使用场景：
 * - 在任务列表里点击"查看生命周期"按钮时弹出 Drawer 展示
 * - 答辩时展示"任务怎么流转的"核心证据
 */
import React, { useEffect, useState, useMemo } from 'react';
import { Drawer, Timeline, Tag, Descriptions, Table, Card, Empty, Spin, Badge } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { getTaskTimeline } from '@/services/api';

// 流转日志条目类型
export interface FlowLogItem {
  timestamp: string;
  datetime: string;
  task_id: string;
  action: string;
  detail: string;
  operator: string;
  extra: Record<string, any>;
}

// 动作 → 显示标签配置
const ACTION_META: Record<string, { color: string; label: string; icon: string }> = {
  created:            { color: 'blue',    label: '任务录入',   icon: '📝' },
  submitted:          { color: 'cyan',    label: '提交调度',   icon: '📤' },
  schedule_evaluated: { color: 'gold',    label: '调度评估',   icon: '⚖️' },
  algorithm_decided:  { color: 'purple',  label: '算法决策',   icon: '🧠' },
  scheduled:          { color: 'orange',  label: '节点分配',   icon: '🎯' },
  started:            { color: 'green',   label: '开始执行',   icon: '▶️' },
  security_feedback:  { color: 'magenta', label: '安全评估',   icon: '🛡️' },
  algorithm_switched: { color: 'red',     label: '算法切换',   icon: '🔄' },
  completed:          { color: 'green',   label: '任务完成',   icon: '✅' },
  failed:             { color: 'red',     label: '任务失败',   icon: '❌' },
};

// 调度评分明细表的列定义
const scoreColumns: ColumnsType<any> = [
  {
    title: '排名',
    key: 'rank',
    width: 60,
    render: (_, __, index) => {
      const colors = ['#cf1322', '#d4380d', '#d46b08', '#8c8c8c', '#8c8c8c'];
      return <span style={{ fontWeight: 'bold', color: colors[index] || '#8c8c8c' }}>{index + 1}</span>;
    },
  },
  { title: '节点', dataIndex: 'node_name', key: 'node_name', width: 120 },
  {
    title: '负载得分',
    dataIndex: 'load_score',
    key: 'load_score',
    width: 90,
    render: (v: number) => <span style={{ color: v >= 60 ? '#52c41a' : v >= 40 ? '#faad14' : '#ff4d4f' }}>{v.toFixed(1)}</span>,
  },
  {
    title: '匹配得分',
    dataIndex: 'match_score',
    key: 'match_score',
    width: 90,
    render: (v: number) => <span style={{ color: v >= 60 ? '#52c41a' : v >= 40 ? '#faad14' : '#ff4d4f' }}>{v.toFixed(1)}</span>,
  },
  {
    title: '可信得分',
    dataIndex: 'trust_score_eval',
    key: 'trust_score_eval',
    width: 90,
    render: (v: number) => <span style={{ color: v >= 80 ? '#52c41a' : v >= 60 ? '#faad14' : '#ff4d4f' }}>{v.toFixed(1)}</span>,
  },
  {
    title: '综合评分',
    dataIndex: 'total_score',
    key: 'total_score',
    width: 100,
    render: (v: number, record: any, index: number) => (
      <span>
        {index === 0 && <span style={{ marginRight: 4 }}>★</span>}
        <b style={{ color: index === 0 ? '#cf1322' : '#595959' }}>{v.toFixed(1)}</b>
      </span>
    ),
  },
  {
    title: 'CPU使用率',
    dataIndex: 'cpu_usage_pct',
    key: 'cpu_usage_pct',
    width: 100,
    render: (v: number) => `${v.toFixed(1)}%`,
  },
  {
    title: '可信度',
    dataIndex: 'trust_score',
    key: 'trust_score',
    width: 80,
    render: (v: number) => (
      <Tag color={v >= 80 ? 'green' : v >= 60 ? 'orange' : 'red'}>
        {v >= 80 ? '可信' : v >= 60 ? '观察' : '异常'}
      </Tag>
    ),
  },
];

interface TaskLifecycleTrackerProps {
  open: boolean;
  taskId: string | null;
  onClose: () => void;
}

/**
 * 任务生命周期追踪 Drawer 组件
 *
 * 弹出后调用 GET /tasks/{taskId}/timeline 获取流转记录并展示
 */
const TaskLifecycleTracker: React.FC<TaskLifecycleTrackerProps> = ({ open, taskId, onClose }) => {
  const [loading, setLoading] = useState(false);
  const [timeline, setTimeline] = useState<FlowLogItem[]>([]);
  const [currentState, setCurrentState] = useState<string>('');
  const [stateLabel, setStateLabel] = useState<string>('');
  const [evaluation, setEvaluation] = useState<any>(null);

  // 拉取时间线数据
  useEffect(() => {
    if (!open || !taskId) return;

    const fetchData = async () => {
      setLoading(true);
      try {
        const res: any = await getTaskTimeline(taskId);
        setTimeline(res?.timeline || []);
        setCurrentState(res?.current_state || '');
        setStateLabel(res?.state_label || '');

        // 从调度评估日志里提取评分明细
        const evalLog = (res?.timeline || []).find(
          (t: FlowLogItem) => t.action === 'schedule_evaluated'
        );
        if (evalLog?.extra) {
          setEvaluation(evalLog.extra);
        } else {
          setEvaluation(null);
        }
      } catch (err) {
        console.error('获取任务时间线失败:', err);
        setTimeline([]);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [open, taskId]);

  // 状态徽标颜色
  const stateColor = useMemo(() => {
    const map: Record<string, string> = {
      pending: 'default',
      scheduling: 'processing',
      scheduled: 'warning',
      running: 'processing',
      completed: 'success',
      failed: 'error',
      cancelled: 'default',
    };
    return map[currentState] || 'default';
  }, [currentState]);

  return (
    <Drawer
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span>任务生命周期追踪</span>
          {taskId && <Tag color="blue">{taskId}</Tag>}
          {stateLabel && <Badge status={stateColor as any} text={stateLabel} />}
        </div>
      }
      open={open}
      onClose={onClose}
      width={720}
    >
      <Spin spinning={loading}>
        {/* 时间线 */}
        <Card title="流转时间线" size="small" style={{ marginBottom: 16 }}>
          {timeline.length === 0 ? (
            <Empty description="暂无流转记录" />
          ) : (
            <Timeline
              items={timeline.map((log) => {
                const meta = ACTION_META[log.action] || {
                  color: 'gray',
                  label: log.action,
                  icon: '📋',
                };
                return {
                  color: meta.color as any,
                  children: (
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 14 }}>
                          {meta.icon} <strong>{meta.label}</strong>
                        </span>
                        <Tag>{log.timestamp}</Tag>
                        <Tag color="blue">{log.operator}</Tag>
                      </div>
                      <div style={{ color: '#595959', marginTop: 4 }}>{log.detail}</div>
                    </div>
                  ),
                };
              })}
            />
          )}
        </Card>

        {/* 调度决策详情 */}
        {evaluation?.selected_node_id && (
          <Card title="调度决策详情" size="small" style={{ marginBottom: 16 }}>
            <Descriptions column={2} size="small" bordered>
              <Descriptions.Item label="推荐节点">
                <Tag color="gold">{evaluation.selected_node_id}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="综合评分">
                <span style={{ fontSize: 18, fontWeight: 'bold', color: '#cf1322' }}>
                  {evaluation.total_score}
                </span>
              </Descriptions.Item>
              <Descriptions.Item label="负载得分">{evaluation.load_score}</Descriptions.Item>
              <Descriptions.Item label="匹配得分">{evaluation.match_score}</Descriptions.Item>
              <Descriptions.Item label="可信得分">{evaluation.trust_score}</Descriptions.Item>
              <Descriptions.Item label="决策依据" span={2}>
                {evaluation.decision_basis}
              </Descriptions.Item>
            </Descriptions>
          </Card>
        )}

        {/* 状态机说明 */}
        <Card title="状态机说明" size="small">
          <div style={{ color: '#595959', fontSize: 13, lineHeight: 1.8 }}>
            <div>
              <strong>完整状态链：</strong>
            </div>
            <div style={{ marginTop: 4 }}>
              <Tag>待分配</Tag> → <Tag color="processing">调度中</Tag> →{' '}
              <Tag color="warning">已分配</Tag> → <Tag color="processing">运行中</Tag> →{' '}
              <Tag color="success">已完成</Tag>
            </div>
            <div style={{ marginTop: 8, color: '#8c8c8c' }}>
              任何阶段都可转为 <Tag color="default">已取消</Tag>；运行中可转为{' '}
              <Tag color="error">失败</Tag>
            </div>
          </div>
        </Card>
      </Spin>
    </Drawer>
  );
};

export default TaskLifecycleTracker;
