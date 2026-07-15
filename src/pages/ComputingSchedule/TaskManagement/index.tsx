import React, { useMemo, useEffect, useState, useRef, useCallback } from 'react';
import {
  Card, Col, Row, Table, Tag, Spin, DatePicker, Collapse, Badge, Alert, Button,
  Checkbox, Drawer, Modal, Form, Input, Select, Slider, Radio, AutoComplete, Progress, message, Tooltip,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  UnorderedListOutlined,
  PlayCircleOutlined,
  LaptopOutlined,
  DashboardOutlined,
  WarningOutlined,
  CloseCircleOutlined,
  BellOutlined,
  PlusOutlined,
  SearchOutlined,
  DatabaseOutlined,
  LinkOutlined,
  SendOutlined,
  EyeOutlined,
} from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import * as echarts from 'echarts';
import G6, { Graph } from '@antv/g6';
import dayjs from 'dayjs';
import { useNavigate } from 'react-router-dom';
import chinaJson from '@/assets/maps/china.json';
import { useTaskFlowStore } from '@/store/taskFlow';
import { submitToSchedule } from '@/services/api';
import useTaskManagementData from './hooks';
import {
  DemandItem, NodeItem, MapNodeItem, PriorityGroup, NodeStatusGroup, ResourceAlert,
  DatasetItem, DatasetRelation, TaskFormData,
  MOCK_DATASETS, MOCK_RELATIONS, BUSINESS_SOURCES,
} from './types';

const TaskManagement: React.FC = () => {
  const navigate = useNavigate();
  const { setCurrentTask } = useTaskFlowStore();
  const {
    loading, demands, nodes, stats, usage, trend, mapData,
    priorityGroups, nodeStatusGroups, alerts, predictDates, predictTrend, predictLoading, fetchPredictTrend,
  } = useTaskManagementData();

  const [selectedMapNode, setSelectedMapNode] = useState<MapNodeItem | null>(null);
  const [alertPanelVisible, setAlertPanelVisible] = useState(false);
  const [showActiveOnly, setShowActiveOnly] = useState(false);
  const [taskModalVisible, setTaskModalVisible] = useState(false);
  const [datasetList, setDatasetList] = useState<DatasetItem[]>(MOCK_DATASETS);
  const [importModalVisible, setImportModalVisible] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importing, setImporting] = useState(false);
  const [businessFilter, setBusinessFilter] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<string>('layered');
  const relationGraphRef = useRef<HTMLDivElement>(null);
  const graphInstanceRef = useRef<Graph | null>(null);
  const [taskForm] = Form.useForm();
  const [formValues, setFormValues] = useState<Record<string, any>>({
    priority: '中', noniid_alpha: 0.5, privacy_epsilon: 2.0, aggregation: 'auto',
    cpu_cores: 16, gpu_count: 4, memory_gb: 64, model_type: undefined, dataset: [],
  });

  useEffect(() => {
    echarts.registerMap('china', chinaJson as any);
  }, []);

  // 根据模态获取节点颜色
  const getNodeColor = (modality: string) => {
    const colorMap: Record<string, string> = {
      '结构化': '#1565c0',
      '多模态': '#475569',
      '文本': '#0891b2',
      '时序': '#0d7377',
      '图数据': '#b45309',
      '图像': '#0e7490',
      '音频': '#9f1239',
      '视频': '#1e3a5f',
      '生物': '#7c2d12',
    };
    return colorMap[modality] || '#1565c0';
  };

  // 基于业务标签计算两个数据集之间的关联度
  const calcRelationWeight = (ds1: DatasetItem, ds2: DatasetItem): number => {
    const tags1 = new Set(ds1.businessTag.split('/').map((t) => t.trim()));
    const tags2 = new Set(ds2.businessTag.split('/').map((t) => t.trim()));
    const shared = [...tags1].filter((t) => tags2.has(t)).length;
    if (shared > 0) return Math.min(0.5 + shared * 0.2, 0.99);
    if (ds1.modality === ds2.modality) return 0.35;
    return 0.15 + Math.random() * 0.15;
  };

  // 从数据集列表构建图节点
  const buildGraphNodes = (datasets: DatasetItem[]) =>
    datasets.slice(0, 15).map((ds) => {
      const color = getNodeColor(ds.modality);
      return {
        id: ds.id,
        label: ds.name.length > 6 ? ds.name.slice(0, 6) + '..' : ds.name,
        type: 'circle' as const,
        size: 36 + ds.relationCount * 4,
        style: {
          fill: color,
          stroke: color,
          lineWidth: 2,
          shadowColor: color,
          shadowBlur: 12,
          cursor: 'pointer',
        },
        labelCfg: {
          style: { fill: '#fff', fontSize: 10, fontWeight: 500 },
          position: 'center' as const,
        },
        // 保存原始数据用于 tooltip
        rawName: ds.name,
        rawModality: ds.modality,
        rawTag: ds.businessTag,
        rawEpsilon: ds.privacyEpsilon,
      };
    });

  // 从数据集列表构建图边
  const buildGraphEdges = (datasets: DatasetItem[], relations: DatasetRelation[]) => {
    const list = datasets.slice(0, 15);
    const edgeSet = new Map<string, { source: string; target: string; weight: number }>();
    // 1) 先加入预定义关联
    const predefined = new Map<string, number>();
    relations.forEach((r) => {
      const key = [r.source, r.target].sort().join('-');
      predefined.set(key, r.weight);
    });
    // 2) 对所有数据对计算关联度：预定义的直接用，未定义的用算法计算
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const key = [list[i].id, list[j].id].sort().join('-');
        if (predefined.has(key)) {
          edgeSet.set(key, { source: list[i].id, target: list[j].id, weight: predefined.get(key)! });
        } else {
          const w = calcRelationWeight(list[i], list[j]);
          if (w >= 0.5) {
            edgeSet.set(key, { source: list[i].id, target: list[j].id, weight: w });
          }
        }
      }
    }
    return [...edgeSet.values()].map((e) => {
      const color = e.weight >= 0.7 ? '#1565c0' : e.weight >= 0.4 ? '#7dd3fc' : '#cbd5e1';
      return {
        source: e.source,
        target: e.target,
        label: `${e.weight.toFixed(2)}`,
        style: {
          stroke: color,
          lineWidth: Math.max(e.weight * 4, 1),
          opacity: 0.5 + e.weight * 0.4,
          endArrow: false,
        },
        labelCfg: {
          style: { fill: '#8c8c8c', fontSize: 9, background: { fill: '#fff', padding: [1, 2, 1, 2], radius: 2 } },
          refY: 5,
        },
      };
    });
  };

  // 初始化/刷新力导向图
  useEffect(() => {
    if (!relationGraphRef.current) return;
    // 如果图已存在，销毁重建
    if (graphInstanceRef.current) {
      graphInstanceRef.current.destroy();
      graphInstanceRef.current = null;
    }
    const container = relationGraphRef.current;
    const width = container.offsetWidth || 800;
    const height = 400;

    const graphNodes = buildGraphNodes(datasetList);
    const graphEdges = buildGraphEdges(datasetList, MOCK_RELATIONS);

    const graph = new G6.Graph({
      container,
      width,
      height,
      fitView: true,
      fitViewPadding: 30,
      animate: true,
      defaultNode: {
        type: 'circle',
        size: 40,
        style: { fill: '#1565c0', stroke: '#0d47a1', lineWidth: 2, shadowBlur: 10, shadowColor: 'rgba(21,101,192,0.3)' },
        labelCfg: { style: { fill: '#fff', fontSize: 10 }, position: 'center' },
      },
      defaultEdge: {
        type: 'quadratic',
        style: { stroke: '#0891b2', opacity: 0.6, lineWidth: 1.5 },
        labelCfg: { style: { fill: '#64748b', fontSize: 9 }, refY: 5 },
      },
      layout: {
        type: 'force',
        preventOverlap: true,
        nodeSize: 50,
        linkDistance: (d: any) => 220 - (d.label ? parseFloat(d.label) * 120 : 100),
        nodeStrength: -120,
        edgeStrength: 0.08,
        collideStrength: 0.8,
        alphaDecay: 0.04,
      },
      modes: { default: ['drag-canvas', 'zoom-canvas', 'drag-node'] },
    });

    // 节点 hover tooltip
    const tooltip = new G6.Tooltip({
      offsetX: 10,
      offsetY: 10,
      itemTypes: ['node'],
      getContent: (e: any) => {
        const model = e?.item?.getModel();
        if (!model) return '';
        return `<div style="padding:8px 12px;font-size:12px;line-height:1.8;">
          <div style="font-weight:600;font-size:13px;margin-bottom:2px;">${model.rawName || model.label}</div>
          <div>模态：<span style="color:#1565c0">${model.rawModality || '-'}</span></div>
          <div>标签：${model.rawTag || '-'}</div>
          <div>隐私：ε=${model.rawEpsilon ?? '-'}</div>
        </div>`;
      },
    });
    graph.addPlugin(tooltip);

    graph.data({ nodes: graphNodes, edges: graphEdges });
    graph.render();
    graphInstanceRef.current = graph;

    // 窗口 resize 自适应
    const resizeObserver = new ResizeObserver(() => {
      if (graphInstanceRef.current && container.offsetWidth && container.offsetHeight) {
        graph.changeSize(container.offsetWidth, container.offsetHeight);
      }
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      graph.destroy();
      graphInstanceRef.current = null;
    };
  }, [datasetList]);

  const handleImportDataset = () => {
    setImportModalVisible(true);
    setImportProgress(0);
    setImporting(true);
    let progress = 0;
    const timer = setInterval(() => {
      progress += Math.random() * 20;
      if (progress >= 100) {
        progress = 100;
        clearInterval(timer);
        setImporting(false);
        const newId = `ds-new-${Date.now()}`;
        const modalities = ['结构化', '多模态', '文本', '时序', '图像', '音频', '视频'];
        const tags = ['风控', '反欺诈', 'CTR', '精准营销', '安全', 'IOT', '客服', '征信', '广告'];
        const pickedModality = modalities[Math.floor(Math.random() * modalities.length)];
        const pickedTag = tags[Math.floor(Math.random() * tags.length)];
        const pickedSize = Math.floor(Math.random() * 80 + 2);
        const pickedEpsilon = +(Math.random() * 4 + 0.5).toFixed(1);
        // 计算与现有数据集的关联数
        setDatasetList((prev) => {
          const newDs: DatasetItem = {
            id: newId,
            name: `新接入数据集-${prev.length + 1}`,
            modality: pickedModality,
            businessTag: pickedTag,
            size: `${pickedSize}GB`,
            privacyEpsilon: pickedEpsilon,
            relationCount: Math.min(prev.length, Math.floor(Math.random() * 4 + 1)),
          };
          return [...prev, newDs];
        });
        message.success('数据集接入成功！关联分析图已实时更新');
      }
      setImportProgress(Math.min(Math.floor(progress), 100));
    }, 300);
  };

  const handleTaskSubmit = () => {
    taskForm.validateFields().then(async (values) => {
      const taskId = values.task_id || `task-fedtrain-${Math.floor(Math.random() * 90000 + 10000)}`;
      const newTask: DemandItem = {
        id: taskId,
        task: values.task_name || taskId,
        cpu: values.cpu_cores || 16,
        memory: values.memory_gb || 64,
        gpu: values.gpu_count ?? 4,
        storage: 128,
        priority: values.priority || '中',
        status: '待分配',
        business_source: values.business_source,
        dataset: values.dataset,
        privacy_epsilon: values.privacy_epsilon,
        noniid_alpha: values.noniid_alpha,
        aggregation: values.aggregation,
        model_type: values.model_type,
      };
      setCurrentTask({
        id: taskId,
        name: newTask.task,
        type: newTask.model_type || 'FederatedLearning',
        priority: newTask.priority,
        cpu: newTask.cpu,
        memory: newTask.memory,
        gpu: newTask.gpu,
        stage: 'submitted',
      });
      try {
        await submitToSchedule({
          task_id: taskId,
          task_name: newTask.task,
          task_type: newTask.model_type || 'FederatedLearning',
          priority: newTask.priority,
          cpu: newTask.cpu,
          memory: newTask.memory,
          gpu: newTask.gpu,
        });
      } catch (error) {
        console.warn('submitToSchedule failed:', error);
        message.warning('任务已在前端流转，后端调度提交暂未成功');
      }
      console.log('提交至调度中枢:', { ...newTask, task_id: taskId });
      message.success('任务已提交至调度中枢！');
      setTaskModalVisible(false);
      taskForm.resetFields();
    });
  };

  const privacyTag = (epsilon: number) => {
    if (epsilon < 2) return <Tag color="green">ε={epsilon} 安全</Tag>;
    if (epsilon < 3) return <Tag color="gold">ε={epsilon} 中等</Tag>;
    return <Tag color="red">ε={epsilon} 高风险</Tag>;
  };

  const filteredPriorityGroups = useMemo(() => {
    if (businessFilter === 'all') return priorityGroups;
    return priorityGroups.map((g) => ({
      ...g,
      items: g.items.filter((d) => !(d as any).business_source || (d as any).business_source === businessFilter),
    }));
  }, [priorityGroups, businessFilter]);

  const searchOptions = useMemo(() => {
    return datasetList
      .map((ds) => ({
        value: ds.name,
        label: (
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>{ds.name}</span>
            <span style={{ color: '#999' }}>{ds.businessTag} | {ds.modality}</span>
          </div>
        ),
      }))
      .concat(
        datasetList.flatMap((ds) =>
          ds.businessTag.split('/').map((tag) => ({ value: tag.trim(), label: <span>标签: {tag.trim()}</span> }))
        )
      );
  }, [datasetList]);

  const datasetColumns: ColumnsType<DatasetItem> = [
    { title: '名称', dataIndex: 'name', key: 'name', width: 150, render: (t: string) => <span style={{ fontWeight: 500 }}>{t}</span> },
    { title: '模态', dataIndex: 'modality', key: 'modality', width: 80, render: (t: string) => <Tag>{t}</Tag> },
    { title: '业务标签', dataIndex: 'businessTag', key: 'businessTag', width: 90 },
    { title: '大小', dataIndex: 'size', key: 'size', width: 70 },
    {
      title: '隐私评分', dataIndex: 'privacyEpsilon', key: 'privacyEpsilon', width: 120,
      render: (v: number) => privacyTag(v),
    },
    { title: '关联数', dataIndex: 'relationCount', key: 'relationCount', width: 70, render: (v: number) => <Badge count={v} style={{ backgroundColor: '#1565c0' }} overflowCount={99} /> },
    {
      title: '操作', key: 'action', width: 100,
      render: (_: any, record: DatasetItem) => (
        <Button type="link" size="small" onClick={() => message.info(`调度训练: ${record.name}`)}>调度训练</Button>
      ),
    },
  ];

  const layeredColumns: ColumnsType<DemandItem> = [
    { title: '任务名称', dataIndex: 'task', key: 'task' },
    { title: 'CPU(核)', dataIndex: 'cpu', key: 'cpu', render: (v: number) => v.toFixed(2) },
    { title: '内存(GB)', dataIndex: 'memory', key: 'memory', render: (v: number) => v.toFixed(2) },
    { title: 'GPU(张)', dataIndex: 'gpu', key: 'gpu', render: (v: number) => v.toFixed(2) },
    { title: '存储(GB)', dataIndex: 'storage', key: 'storage', render: (v: number) => v.toFixed(2) },
    {
      title: '状态', dataIndex: 'status', key: 'status',
      render: (status: string) => {
        const colorMap: Record<string, string> = { 待分配: 'orange', 已分配: 'blue', 运行中: 'green', 已完成: 'default' };
        return <Tag color={colorMap[status] || 'default'}>{status}</Tag>;
      },
    },
    {
      title: '操作', key: 'action', width: 120,
      render: (_: any, record: DemandItem) => (
        <Tooltip title="跳转至调度中枢查看执行详情">
          <Button
            type="link"
            size="small"
            icon={<EyeOutlined />}
            onClick={() => navigate(`/computing/prediction-allocation?taskId=${encodeURIComponent(record.id)}`)}
          >
            查看分配详情
          </Button>
        </Tooltip>
      ),
    },
  ];

  const alertColumns: ColumnsType<ResourceAlert> = [
    {
      title: '级别', dataIndex: 'level', key: 'level', width: 80,
      render: (level: string) => level === 'critical'
        ? <Tag color="red" icon={<CloseCircleOutlined />}>严重</Tag>
        : <Tag color="orange" icon={<WarningOutlined />}>警告</Tag>,
    },
    { title: '节点', dataIndex: 'nodeName', key: 'nodeName' },
    { title: '指标', dataIndex: 'metric', key: 'metric' },
    { title: '当前值', dataIndex: 'value', key: 'value', render: (value: number) => <span style={{ fontWeight: 600 }}>{value}%</span> },
    { title: '阈值', dataIndex: 'threshold', key: 'threshold', render: (value: number) => <span>{value}%</span> },
    { title: '告警信息', dataIndex: 'message', key: 'message', ellipsis: true },
  ];

  const nodeLayeredColumns: ColumnsType<NodeItem> = [
    { title: '节点名称', dataIndex: 'node_name', key: 'node_name', width: 160 },
    { title: '节点ID', dataIndex: 'node_id', key: 'node_id', width: 180 },
    {
      title: '父超算', dataIndex: 'parent_supercomputing', key: 'parent_supercomputing', width: 200,
      render: (v: string) => v ? <Tag color="blue">{v}</Tag> : <Tag>-</Tag>,
    },
    {
      title: 'CPU', dataIndex: 'cpu_percent', key: 'cpu_percent', width: 80,
      render: (v: number) => <Tag color={v > 80 ? 'red' : v > 60 ? 'orange' : 'green'}>{v}%</Tag>,
    },
    {
      title: '内存', dataIndex: 'mem_percent', key: 'mem_percent', width: 80,
      render: (v: number) => <Tag color={v > 80 ? 'red' : v > 60 ? 'orange' : 'green'}>{v}%</Tag>,
    },
    {
      title: 'GPU', dataIndex: 'gpu_percent', key: 'gpu_percent', width: 80,
      render: (v: number) => <Tag color={v > 80 ? 'red' : v > 60 ? 'orange' : 'green'}>{v}%</Tag>,
    },
    {
      title: '磁盘', dataIndex: 'disk_percent', key: 'disk_percent', width: 80,
      render: (v: number) => <Tag color={v > 80 ? 'red' : v > 60 ? 'orange' : 'green'}>{v}%</Tag>,
    },
  ];

  const usageOption = useMemo(() => {
    const colors = ['#1565c0', '#0891b2', '#0d7377', '#b45309'];
    const total = usage.reduce((s, u) => s + u.value, 0) || 1;
    return {
      tooltip: {
        trigger: 'item',
        backgroundColor: 'rgba(10, 25, 50, 0.92)',
        borderColor: '#2f7bff',
        borderWidth: 1,
        textStyle: { color: '#fff' },
        formatter: (params: any) => `<strong>${params.name}</strong><br/>占比：${params.percent}%<br/>值：${params.value}`,
      },
      legend: { bottom: 0, textStyle: { color: '#000', fontSize: 12 }, itemWidth: 14, itemHeight: 8 },
      graphic: usage.length
        ? [
            { type: 'text', left: 'center', top: '38%', style: { text: total.toFixed(1), fontSize: 22, fontWeight: 'bold', fill: '#333', textAlign: 'center' } },
            { type: 'text', left: 'center', top: '50%', style: { text: '资源总量', fontSize: 12, fill: '#999', textAlign: 'center' } },
          ]
        : [],
      series: [{
        name: '资源占比', type: 'pie', radius: ['45%', '72%'], center: ['50%', '45%'], avoidLabelOverlap: true,
        itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 2 },
        label: { show: true, formatter: '{b}\n{d}%', fontSize: 12, color: '#333' },
        emphasis: { label: { show: true, fontSize: 14, fontWeight: 'bold' }, itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.2)' } },
        data: usage.map((u, i) => ({ name: u.name, value: u.value, itemStyle: { color: colors[i % colors.length] } })),
      }],
    };
  }, [usage]);

  const [predictSelectedDate, setPredictSelectedDate] = useState<string | null>(null);

  const predictActiveDate = useMemo(() => {
    if (predictSelectedDate) return predictSelectedDate;
    // 默认显示今天的日期，不再依赖predictDates列表
    const today = new Date().toISOString().slice(0, 10);
    return today;
  }, [predictSelectedDate]);

  const predictTrendOption = useMemo(() => {
    if (!predictTrend || !predictTrend.x?.length) {
      return {
        backgroundColor: 'transparent', tooltip: { trigger: 'axis' },
        legend: { top: 8, right: 10, textStyle: { color: '#000', fontSize: 12 } },
        grid: { top: 50, left: 55, right: 20, bottom: 40 },
        xAxis: { type: 'category', data: [], boundaryGap: false },
        yAxis: { type: 'value', name: '%', min: 0, max: 100 },
        series: [],
      };
    }
    const colors = ['#1565c0', '#0891b2', '#b45309'];
    const currentTimeIndex = predictTrend.currentTimeIndex ?? -1;
    const isToday = currentTimeIndex >= 0;
    const markLineData = isToday && currentTimeIndex < predictTrend.x.length
      ? [{ xAxis: predictTrend.x[currentTimeIndex], label: { formatter: '当前', color: '#ff4d4f', fontSize: 11, fontWeight: 'bold' }, lineStyle: { color: '#ff4d4f', width: 2, type: 'solid' } }]
      : [];
    const allSeries: any[] = [];
    const legendData: string[] = [];

    predictTrend.series.forEach((item: any, idx: number) => {
      const color = colors[idx] || '#5470c6';
      const fullData = item.data;
      if (isToday && currentTimeIndex < fullData.length - 1) {
        const solidName = item.name;
        const dashedName = `${item.name}`;
        const solidData = fullData.map((v: any, i: number) => i <= currentTimeIndex ? v : null);
        const dashedData = fullData.map((v: any, i: number) => i >= currentTimeIndex ? v : null);
        allSeries.push({
          name: solidName, type: 'line', smooth: true, symbol: 'circle', symbolSize: 5, showSymbol: true, connectNulls: false,
          lineStyle: { width: 2, color, type: 'solid' }, itemStyle: { color }, areaStyle: { opacity: 0.08 }, emphasis: { focus: 'series' },
          data: solidData, markLine: idx === 0 ? { silent: true, symbol: 'none', data: markLineData } : undefined,
        });
        allSeries.push({
          name: dashedName, type: 'line', smooth: true, symbol: 'circle', symbolSize: 4, showSymbol: true, connectNulls: false,
          lineStyle: { width: 2, color, type: 'dashed' }, itemStyle: { color }, emphasis: { focus: 'series' }, data: dashedData,
        });
        legendData.push(solidName, dashedName);
      } else {
        allSeries.push({
          name: item.name, type: 'line', smooth: true, symbol: 'circle', symbolSize: 5, showSymbol: true,
          lineStyle: { width: 2, color, type: 'solid' }, itemStyle: { color }, areaStyle: { opacity: 0.08 }, emphasis: { focus: 'series' },
          data: fullData,
        });
        legendData.push(item.name);
      }
    });

    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis', backgroundColor: 'rgba(10, 25, 50, 0.92)', borderColor: '#2f7bff', borderWidth: 1, textStyle: { color: '#fff' },
        formatter: (params: any[]) => {
          if (!params || !params.length) return '';
          const time = params[0].axisValue;
          let html = `<div style="font-weight:600;margin-bottom:4px">${time}</div>`;
          const seen = new Map<string, any>();
          params.forEach((p: any) => {
            const baseName = p.seriesName.replace('（预测）', '');
            if (p.value != null && (!seen.has(baseName) || !p.seriesName.includes('预测'))) seen.set(baseName, p);
          });
          seen.forEach((p: any) => {
            html += `<div style="display:flex;align-items:center;gap:6px"><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${p.color}"></span><span>${p.seriesName}：${p.value}%</span></div>`;
          });
          return html;
        },
      },
      legend: { top: 8, right: 10, textStyle: { color: '#000', fontSize: 12 }, itemWidth: 14, itemHeight: 8, data: legendData },
      grid: { top: 50, left: 55, right: 20, bottom: 40 },
      xAxis: { type: 'category', boundaryGap: false, data: predictTrend.x, axisLine: { lineStyle: { color: 'rgba(120,180,255,0.35)' } }, axisLabel: { color: '#000', fontSize: 11, interval: 1 }, splitLine: { show: false } },
      yAxis: { type: 'value', name: '%', min: 0, max: 100, axisLine: { show: false }, axisLabel: { color: '#000', fontSize: 12 }, splitLine: { lineStyle: { color: 'rgba(120,180,255,0.12)', type: 'dashed' } } },
      series: allSeries,
    };
  }, [predictTrend]);

  const mapOption = useMemo(() => {
    const scatterData = mapData.map((item) => ({
      name: item.name, value: [item.longitude, item.latitude, item.capacity], raw: item,
    }));
    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'item',
        formatter: (params: any) => {
          const raw = params?.data?.raw;
          if (!raw) return params.name || '';
          return `<div style="padding:6px 8px;"><div><strong>${raw.name}</strong></div><div>经度：${raw.longitude}</div><div>纬度：${raw.latitude}</div><div>算力值：${raw.capacity}</div><div>等级：${raw.level}</div></div>`;
        },
      },
      geo: {
        map: 'china', roam: true, zoom: 1.1,
        label: { show: false, color: '#b7dfff' },
        itemStyle: { areaColor: '#0b4f7a', borderColor: '#3ba0ff', borderWidth: 1, shadowColor: 'rgba(0, 174, 255, 0.35)', shadowBlur: 10 },
        emphasis: { label: { show: false }, itemStyle: { areaColor: '#166d9c' } },
      },
      series: [{
        name: '算力节点', type: 'scatter', coordinateSystem: 'geo', data: scatterData,
        symbolSize: (val: number[]) => Math.max((val[2] || 0) / 18, 8),
        label: { show: true, formatter: '{b}', position: 'right', color: '#ffffff', fontSize: 12 },
        itemStyle: { color: '#ffd84d', shadowBlur: 18, shadowColor: 'rgba(255, 216, 77, 0.8)' },
        emphasis: { label: { show: true, color: '#fff', fontWeight: 'bold' }, itemStyle: { color: '#ffe680' } },
      }],
    };
  }, [mapData]);

  const mapEvents = {
    click: (params: any) => {
      const raw = params?.data?.raw;
      if (raw) setSelectedMapNode(raw);
    },
  };

  const datasetStatsCards = useMemo(() => {
    const total = datasetList.length;
    const structured = datasetList.filter((d) => d.modality === '结构化').length;
    const multimodal = total - structured;
    const totalSizeBytes = datasetList.reduce((sum, d) => {
      const sizeStr = d.size.toLowerCase();
      const num = parseFloat(sizeStr);
      if (sizeStr.includes('tb')) return sum + num * 1024;
      if (sizeStr.includes('mb')) return sum + num / 1024;
      return sum + num; // GB
    }, 0);
    const totalSizeTB = totalSizeBytes >= 1024
      ? (totalSizeBytes / 1024).toFixed(1)
      : totalSizeBytes < 1
        ? (totalSizeBytes * 1024).toFixed(0) + ' GB'
        : totalSizeBytes.toFixed(1) + ' GB';
    const totalSizeDisplay = totalSizeBytes >= 1024
      ? `${(totalSizeBytes / 1024).toFixed(1)} TB`
      : `${totalSizeBytes.toFixed(1)} GB`;
    return { total, multimodal, structured, totalSize: totalSizeBytes >= 1024 ? (totalSizeBytes / 1024).toFixed(1) : totalSizeBytes.toFixed(1), totalSizeUnit: totalSizeBytes >= 1024 ? 'TB' : 'GB' };
  }, [datasetList]);

  const estimatedTrainingHours = useMemo(() => {
    const modelType = formValues.model_type;
    const datasets: string[] = formValues.dataset || [];
    if (!modelType || datasets.length === 0) return null;

    const cpu = formValues.cpu_cores || 16;
    const gpu = formValues.gpu_count ?? 4;
    const mem = formValues.memory_gb || 64;
    const noniid = formValues.noniid_alpha || 0.5;
    const epsilon = formValues.privacy_epsilon || 2.0;
    const aggregation = formValues.aggregation || 'auto';

    const modelComplexity: Record<string, number> = { GNN: 1.8, LSTM: 1.3, Transformer: 2.5, CNN: 1.0 };
    const complexity = modelComplexity[modelType] || 1.0;

    const totalDataGB = datasets.reduce((sum: number, id: string) => {
      const ds = MOCK_DATASETS.find((d) => d.id === id);
      return sum + (ds ? parseFloat(ds.size) : 0);
    }, 0);

    let baseHours = (totalDataGB * complexity) / 10;
    baseHours *= (1 + (1 - noniid) * 0.8);
    baseHours *= (1 + epsilon * 0.05);

    const computePower = (cpu / 16) * (gpu > 0 ? gpu / 4 : 0.5) * (mem / 64);
    const hours = Math.max(0.5, baseHours / Math.max(computePower, 0.1));

    if (aggregation === 'Bulyan') return (hours * 1.3).toFixed(1);
    if (aggregation === 'FedAvg') return (hours * 1.1).toFixed(1);
    return hours.toFixed(1);
  }, [formValues]);

  return (
    <div style={{ padding: 24, direction: 'ltr' }}>
      <Spin spinning={loading && demands.length === 0 && nodes.length === 0}>
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 4, height: 22, background: 'linear-gradient(180deg, #1565c0 0%, #0891b2 100%)', borderRadius: 2 }} />
                <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#0f2c4d', letterSpacing: 0.5 }}>算力任务运营调度平台</h2>
              </div>
              <span style={{ fontSize: 12, color: '#64748b', marginLeft: 14, fontFamily: 'Roboto Mono, Courier New, monospace' }}>@中移动算网运营管理 · 任务运营调度员</span>
            </div>
            <Button type="primary" icon={<PlusOutlined />} size="large" onClick={() => setTaskModalVisible(true)} style={{ background: 'linear-gradient(135deg, #1565c0 0%, #0d47a1 100%)', borderColor: '#0d47a1' }}>
              + 录入算力任务需求
            </Button>
          </div>
        </div>

        <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
          <Col span={6}>
            <Card variant="borderless" style={{ background: 'linear-gradient(135deg, #0f2c4d 0%, #1a4a7a 100%)', borderRadius: 12, borderTop: '3px solid #0891b2' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, marginBottom: 8, letterSpacing: 0.5 }}>全网任务总数</div>
                  <div style={{ color: '#fff', fontSize: 32, fontWeight: 700, fontFamily: 'Roboto Mono, Courier New, monospace' }}>{stats.find(s => s.title === '全网任务总数')?.value ?? 0}</div>
                </div>
                <UnorderedListOutlined style={{ fontSize: 40, color: 'rgba(8,145,178,0.4)' }} />
              </div>
            </Card>
          </Col>
          <Col span={6}>
            <Card variant="borderless" style={{ background: 'linear-gradient(135deg, #0d47a1 0%, #1565c0 100%)', borderRadius: 12, borderTop: '3px solid #26c6da' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, marginBottom: 8, letterSpacing: 0.5 }}>运行中</div>
                  <div style={{ color: '#fff', fontSize: 32, fontWeight: 700, fontFamily: 'Roboto Mono, Courier New, monospace' }}>{stats.find(s => s.title === '运行中')?.value ?? 0}</div>
                </div>
                <PlayCircleOutlined style={{ fontSize: 40, color: 'rgba(38,198,218,0.4)' }} />
              </div>
            </Card>
          </Col>
          <Col span={6}>
            <Card variant="borderless" style={{ background: 'linear-gradient(135deg, #006d5c 0%, #004d40 100%)', borderRadius: 12, borderTop: '3px solid #4db6ac' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, marginBottom: 8, letterSpacing: 0.5 }}>全网空闲算力</div>
                  <div style={{ color: '#fff', fontSize: 28, fontWeight: 700, fontFamily: 'Roboto Mono, Courier New, monospace' }}>{stats.find(s => s.title === '全网空闲算力')?.value ?? '0 节点'}</div>
                </div>
                <LaptopOutlined style={{ fontSize: 40, color: 'rgba(77,182,172,0.4)' }} />
              </div>
            </Card>
          </Col>
          <Col span={6}>
            <Card variant="borderless" style={{ background: 'linear-gradient(135deg, #b45309 0%, #92400e 100%)', borderRadius: 12, borderTop: '3px solid #fbbf24' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, marginBottom: 8, letterSpacing: 0.5 }}>全网资源利用率</div>
                  <div style={{ color: '#fff', fontSize: 32, fontWeight: 700, fontFamily: 'Roboto Mono, Courier New, monospace' }}>{stats.find(s => s.title === '全网资源利用率')?.value ?? '0%'}</div>
                </div>
                <DashboardOutlined style={{ fontSize: 40, color: 'rgba(251,191,36,0.4)' }} />
              </div>
            </Card>
          </Col>
        </Row>

        {alerts.length > 0 && (
          <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
            <Col span={24}>
              {alerts.some(a => a.level === 'critical') ? (
                <Alert
                  message={
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span>检测到 <strong>{alerts.filter(a => a.level === 'critical').length}</strong> 个严重告警，请立即处理！（警告 {alerts.filter(a => a.level === 'warning').length} 条）</span>
                      <Button type="primary" danger size="small" onClick={() => setAlertPanelVisible(true)}>点击查看</Button>
                    </div>
                  }
                  type="error" showIcon icon={<CloseCircleOutlined />}
                />
              ) : (
                <Alert
                  message={
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span>检测到 {alerts.filter(a => a.level === 'warning').length} 个资源警告</span>
                      <Button type="default" size="small" onClick={() => setAlertPanelVisible(true)}>点击查看</Button>
                    </div>
                  }
                  type="warning" showIcon icon={<WarningOutlined />}
                />
              )}
            </Col>
          </Row>
        )}

        <Drawer
          title={
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <BellOutlined style={{ color: alerts.some(a => a.level === 'critical') ? '#cf1322' : '#d46b08' }} />
              <span>资源告警详情</span>
              <Badge count={alerts.filter(a => a.level === 'critical').length} style={{ backgroundColor: '#cf1322' }} overflowCount={9999} />
              <Badge count={alerts.filter(a => a.level === 'warning').length} style={{ backgroundColor: '#d46b08' }} overflowCount={9999} />
            </div>
          }
          placement="right" width={720} open={alertPanelVisible} onClose={() => setAlertPanelVisible(false)}
        >
          <Table rowKey="id" columns={alertColumns} dataSource={alerts} pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (total) => `共 ${total} 条告警` }} size="small" />
        </Drawer>

        {/* 算力中心能力视图&全国算力节点分布 */}
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col span={12}>
            <Card
              title={<span style={{ fontWeight: 600 }}>算力中心能力视图</span>}
              variant="borderless"
              style={{ borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}
            >
              <ReactECharts option={usageOption} style={{ height: 360 }} />
            </Card>
          </Col>
          <Col span={12}>
            <Card
              title={<span style={{ fontWeight: 600 }}>全国算力节点分布</span>}
              variant="borderless"
              style={{ borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}
            >
              <ReactECharts option={mapOption} style={{ height: 360 }} />
            </Card>
          </Col>
        </Row>

        {/* 卡片式Tab切换区域 */}
        <div style={{
          background: 'linear-gradient(180deg, #eef2f7 0%, #f8fafc 50%, #ffffff 100%)',
          borderRadius: 16,
          padding: 20,
          border: '1px solid #dbe3ec',
        }}>
          {/* 卡片标题行 */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {[
              { key: 'layered', label: '算力任务需求分层视图', icon: <UnorderedListOutlined />, color: '#1565c0' },
              { key: 'nodes', label: '全网算力节点资源详情', icon: <LaptopOutlined />, color: '#0d7377' },
              { key: 'trend', label: '全网多维资源使用趋势', icon: <DashboardOutlined />, color: '#b45309' },
              { key: 'dataset', label: '算力网络数据资产管理', icon: <DatabaseOutlined />, color: '#475569' },
            ].map((tab) => {
              const isActive = activeTab === tab.key;
              return (
                <Card
                  key={tab.key}
                  hoverable
                  size="small"
                  style={{
                    flex: '1 1 0',
                    minWidth: 160,
                    cursor: 'pointer',
                    textAlign: 'center',
                    borderRadius: 10,
                    border: isActive ? 'none' : '1px solid #dbe3ec',
                    transition: 'all 0.3s ease',
                    background: isActive
                      ? `linear-gradient(135deg, ${tab.color} 0%, ${tab.color}dd 100%)`
                      : '#fff',
                    boxShadow: isActive
                      ? `0 4px 16px ${tab.color}40`
                      : '0 1px 4px rgba(15,44,77,0.08)',
                    transform: isActive ? 'translateY(-2px)' : 'none',
                  }}
                  onClick={() => setActiveTab(tab.key)}
                  bodyStyle={{ padding: '12px 8px' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    <span style={{
                      fontSize: 18,
                      color: isActive ? '#fff' : tab.color,
                      transition: 'color 0.3s',
                    }}>{tab.icon}</span>
                    <span style={{
                      fontWeight: 600,
                      fontSize: 13,
                      color: isActive ? '#fff' : '#333',
                      whiteSpace: 'nowrap',
                      transition: 'color 0.3s',
                    }}>{tab.label}</span>
                  </div>
                </Card>
              );
            })}
          </div>

          {/* 内容区域 - 根据activeTab显示对应内容 */}
          <div style={{ marginTop: 16 }}>
            {activeTab === 'layered' && (
              <Card
                title={<span style={{ fontWeight: 600 }}>算力任务需求分层视图</span>}
                variant="borderless"
                style={{ borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}
                extra={
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ color: '#999', fontSize: 12 }}>按业务方筛选：</span>
                    <Select
                      value={businessFilter}
                      onChange={setBusinessFilter}
                      style={{ width: 160 }}
                      size="small"
                      options={[
                        { value: 'all', label: '全部' },
                        ...BUSINESS_SOURCES.map((s) => ({ value: s, label: s })),
                      ]}
                    />
                  </div>
                }
              >
                <Collapse
                  defaultActiveKey={filteredPriorityGroups.map((g) => g.level)}
                  expandIconPosition="start"
                  items={filteredPriorityGroups.map((group: PriorityGroup) => ({
                    key: group.level,
                    label: (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span style={{ fontSize: 16 }}>{group.icon}</span>
                        <span style={{ fontWeight: 600, color: group.color, fontSize: 15 }}>{group.label}</span>
                        <Badge count={group.items.length} style={{ backgroundColor: group.color }} overflowCount={9999} />
                        <span style={{ color: '#999', fontSize: 12, marginLeft: 8 }}>
                          CPU {group.totalCpu.toFixed(2)} 核 | 内存 {group.totalMemory.toFixed(2)} GB | GPU {group.totalGpu.toFixed(2)} 张 | 存储 {group.totalStorage.toFixed(2)} GB
                        </span>
                      </div>
                    ),
                    children: (
                      <Table
                        rowKey="id"
                        columns={layeredColumns}
                        dataSource={group.items}
                        pagination={{ pageSize: 5, size: 'small', showSizeChanger: false, showTotal: (total) => `共 ${total} 条` }}
                        size="small"
                        style={{ borderLeft: `3px solid ${group.color}`, borderRadius: 4 }}
                      />
                    ),
                    style: { marginBottom: 8, borderColor: group.borderColor, backgroundColor: group.bgColor, borderRadius: 8 },
                  }))}
                />
              </Card>
            )}

            {activeTab === 'nodes' && (
              <Card
                title={<span style={{ fontWeight: 600 }}>全网算力节点资源详情</span>}
                variant="borderless"
                style={{ borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}
                extra={
                  <Checkbox checked={showActiveOnly} onChange={(e) => setShowActiveOnly(e.target.checked)}>
                    只看活跃节点（CPU或GPU &gt; 0%）
                  </Checkbox>
                }
              >
                <Collapse
                  defaultActiveKey={nodeStatusGroups.map((g) => g.status)}
                  expandIconPosition="start"
                  items={nodeStatusGroups.map((group: NodeStatusGroup) => {
                    const filteredItems = showActiveOnly
                      ? group.items.filter((n) => n.cpu_percent > 0 || n.gpu_percent > 0)
                      : group.items;
                    return {
                      key: group.status,
                      label: (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <span style={{ fontSize: 16 }}>{group.icon}</span>
                          <span style={{ fontWeight: 600, color: group.color, fontSize: 15 }}>{group.label}</span>
                          <Badge count={filteredItems.length} style={{ backgroundColor: group.color }} overflowCount={9999} />
                          <span style={{ color: '#999', fontSize: 12, marginLeft: 8 }}>
                            平均 CPU {group.avgCpu}% | 平均内存 {group.avgMem}% | 平均 GPU {group.avgGpu}% | 平均磁盘 {group.avgDisk}%
                          </span>
                        </div>
                      ),
                      children: (
                        <Table
                          rowKey="node_id"
                          columns={nodeLayeredColumns}
                          dataSource={filteredItems}
                          pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (total) => `共 ${total} 条` }}
                          size="small"
                          scroll={{ y: 400, x: 900 }}
                          virtual
                          style={{ borderLeft: `3px solid ${group.color}`, borderRadius: 4 }}
                        />
                      ),
                      style: { marginBottom: 8, borderColor: group.borderColor, backgroundColor: group.bgColor, borderRadius: 8 },
                    };
                  })}
                />
              </Card>
            )}

            {activeTab === 'trend' && (
              <Card
                title={
                  <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontWeight: 600 }}>全网多维资源使用趋势</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      {/* 日期快速切换按钮 */}
                      <div style={{ display: 'flex', gap: 6 }}>
                        {(() => {
                          const todayDate = new Date();
                          const today = todayDate.toISOString().slice(0, 10);
                          const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
                          const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);
                          const quickDates = [
                            { date: today, label: '今天', isToday: true },
                            { date: yesterday, label: '昨天', isToday: false },
                            { date: twoDaysAgo, label: '前天', isToday: false },
                          ];
                          return quickDates.map(({ date, label, isToday }) => {
                            const isActive = predictActiveDate === date;
                            // 不再依赖predictDates.includes，直接允许点击过去7天内的日期
                            return (
                              <Button
                                key={date}
                                size="small"
                                type={isActive ? 'primary' : 'default'}
                                onClick={() => {
                                  setPredictSelectedDate(date);
                                  fetchPredictTrend(date);
                                }}
                                style={{ fontSize: 12 }}
                              >
                                {label}
                                {isToday && (
                                  <Badge
                                    status="processing"
                                    style={{ marginLeft: 4 }}
                                    title="实时预测中"
                                  />
                                )}
                              </Button>
                            );
                          });
                        })()}
                      </div>
                      {/* 当前查看日期和DatePicker */}
                      {predictActiveDate && (
                        <Tag color="blue" style={{ fontSize: 12 }}>
                          当前查看：{predictActiveDate}
                          {predictActiveDate === new Date().toISOString().slice(0, 10) && (
                            <Badge status="processing" style={{ marginLeft: 4 }} title="实时预测中" />
                          )}
                        </Tag>
                      )}
                      <DatePicker
                        value={predictActiveDate ? dayjs(predictActiveDate, 'YYYY-MM-DD') : null}
                        onChange={(_date, dateString) => {
                          const d = typeof dateString === 'string' ? dateString : dateString[0];
                          if (d) {
                            setPredictSelectedDate(d);
                            fetchPredictTrend(d);
                          }
                        }}
                        disabledDate={(current) => {
                          if (!current) return true;
                          // 允许选择过去7天内的所有日期（即使不在predictDates列表中，也可以尝试请求）
                          const today = new Date();
                          const sevenDaysAgo = new Date(today.getTime() - 7 * 86400000);
                          return current.isAfter(today, 'day') || current.isBefore(sevenDaysAgo, 'day');
                        }}
                        allowClear={false}
                        size="small"
                        style={{ width: 160 }}
                        placeholder="选择日期查询"
                      />
                    </div>
                  </span>
                }
                variant="borderless"
                style={{ borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}
              >
                <Spin spinning={predictLoading} tip="加载数据中...">
                  <ReactECharts option={predictTrendOption} style={{ height: 420 }} notMerge={true} />
                </Spin>
                <div style={{ marginTop: 8, display: 'flex', justifyContent: 'center', gap: 24, fontSize: 12, color: '#999', flexWrap: 'wrap' }}>
                  <span><span style={{ display: 'inline-block', width: 24, height: 2, backgroundColor: '#1565c0', verticalAlign: 'middle', marginRight: 4 }} />CPU 利用率</span>
                  <span><span style={{ display: 'inline-block', width: 24, height: 2, backgroundColor: '#0891b2', verticalAlign: 'middle', marginRight: 4 }} />内存利用率</span>
                  <span><span style={{ display: 'inline-block', width: 24, height: 2, backgroundColor: '#b45309', verticalAlign: 'middle', marginRight: 4 }} />GPU 利用率</span>
                  <span><span style={{ display: 'inline-block', width: 24, height: 2, backgroundColor: '#999', verticalAlign: 'middle', marginRight: 4 }} />实线 = 已发生</span>
                  <span><span style={{ display: 'inline-block', width: 24, height: 2, borderTop: '2px dashed #999', verticalAlign: 'middle', marginRight: 4 }} />虚线 = 预测</span>
                  {predictActiveDate === new Date().toISOString().slice(0, 10) && (
                    <>
                      <span><span style={{ display: 'inline-block', width: 2, height: 12, backgroundColor: '#ff4d4f', verticalAlign: 'middle', marginRight: 4 }} />当前时间</span>
                      <span><Badge status="processing" /> 实时刷新（每10秒刷新）</span>
                    </>
                  )}
                </div>
              </Card>
            )}

            {activeTab === 'dataset' && (
              <Card
                title={
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <DatabaseOutlined style={{ color: '#475569' }} />
                    <span style={{ fontWeight: 600 }}>算力网络数据资产管理</span>
                  </span>
                }
                variant="borderless"
                style={{ borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}
              >
                <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
                  <Col span={6}>
                    <Card size="small" variant="borderless" style={{ background: '#eef2f7', borderRadius: 8, textAlign: 'center', borderLeft: '3px solid #1565c0' }}>
                      <div style={{ color: '#64748b', fontSize: 12 }}>接入数据集</div>
                      <div style={{ color: '#1565c0', fontSize: 28, fontWeight: 700, fontFamily: 'Roboto Mono, Courier New, monospace' }}>{datasetStatsCards.total}</div>
                    </Card>
                  </Col>
                  <Col span={6}>
                    <Card size="small" variant="borderless" style={{ background: '#fef3e2', borderRadius: 8, textAlign: 'center', borderLeft: '3px solid #b45309' }}>
                      <div style={{ color: '#64748b', fontSize: 12 }}>多模态</div>
                      <div style={{ color: '#b45309', fontSize: 28, fontWeight: 700, fontFamily: 'Roboto Mono, Courier New, monospace' }}>{datasetStatsCards.multimodal}</div>
                    </Card>
                  </Col>
                  <Col span={6}>
                    <Card size="small" variant="borderless" style={{ background: '#e6f4f1', borderRadius: 8, textAlign: 'center', borderLeft: '3px solid #0d7377' }}>
                      <div style={{ color: '#64748b', fontSize: 12 }}>结构化</div>
                      <div style={{ color: '#0d7377', fontSize: 28, fontWeight: 700, fontFamily: 'Roboto Mono, Courier New, monospace' }}>{datasetStatsCards.structured}</div>
                    </Card>
                  </Col>
                  <Col span={6}>
                    <Card size="small" variant="borderless" style={{ background: '#e8f0fa', borderRadius: 8, textAlign: 'center', borderLeft: '3px solid #0d47a1' }}>
                      <div style={{ color: '#64748b', fontSize: 12 }}>总容量</div>
                      <div style={{ color: '#0d47a1', fontSize: 28, fontWeight: 700, fontFamily: 'Roboto Mono, Courier New, monospace' }}>{datasetStatsCards.totalSize} {datasetStatsCards.totalSizeUnit}</div>
                    </Card>
                  </Col>
                </Row>

                <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
                  <Button icon={<PlusOutlined />} onClick={handleImportDataset}>接入新数据集</Button>
                  <AutoComplete
                    style={{ flex: 1 }}
                    options={searchOptions}
                    placeholder="全息索引检索 - 搜索数据集名称或标签..."
                    filterOption={(input, option) => (option?.value as string)?.toLowerCase().includes(input.toLowerCase())}
                    suffixIcon={<SearchOutlined />}
                  />
                </div>

                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontWeight: 600, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <LinkOutlined /> 数据集关联分析图（力导向图，边权 = 相关度）
                  </div>
                  <div
                    ref={relationGraphRef}
                    style={{ width: '100%', height: 400, border: '1px solid #dbe3ec', borderRadius: 12, background: 'linear-gradient(135deg, #f1f5f9 0%, #f8fafc 50%, #eef2f7 100%)', overflow: 'hidden' }}
                  />
                  <div style={{ display: 'flex', gap: 16, marginTop: 8, flexWrap: 'wrap' }}>
                    {Object.entries({ '结构化': '#1565c0', '多模态': '#475569', '文本': '#0891b2', '时序': '#0d7377', '图像': '#0e7490', '音频': '#9f1239', '视频': '#1e3a5f', '图数据': '#b45309', '生物': '#7c2d12' }).map(([name, color]) => (
                      <span key={name} style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: color }} /> {name}
                      </span>
                    ))}
                    <span style={{ fontSize: 11, color: '#999' }}>节点大小 = 关联数，连线粗细 = 相关度</span>
                  </div>
                </div>

                <div>
                  <div style={{ fontWeight: 600, marginBottom: 8 }}>数据集列表</div>
                  <Table
                    rowKey="id"
                    columns={datasetColumns}
                    dataSource={datasetList}
                    pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (total) => `共 ${total} 个数据集` }}
                    size="small"
                    scroll={{ y: 400 }}
                  />
                </div>
              </Card>
            )}
          </div>
        </div>
      </Spin>

      {/* 录入算力任务需求弹窗 */}
      <Modal
        title="录入算力任务需求"
        open={taskModalVisible}
        onCancel={() => { setTaskModalVisible(false); taskForm.resetFields(); }}
        width={640}
        footer={[
          <Button key="cancel" onClick={() => { setTaskModalVisible(false); taskForm.resetFields(); }}>取消</Button>,
          <Button key="submit" type="primary" icon={<SendOutlined />} onClick={handleTaskSubmit}>提交至调度中枢</Button>,
        ]}
      >
        <Form form={taskForm} layout="vertical" onValuesChange={(_, all) => setFormValues(all)} initialValues={{ priority: '中', noniid_alpha: 0.5, privacy_epsilon: 2.0, aggregation: 'auto', cpu_cores: 16, gpu_count: 4, memory_gb: 64 }}>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="任务编号" name="task_id">
                <Input placeholder={`task-fedtrain-${Math.floor(Math.random() * 90000 + 10000)}`} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="业务标签" name="task_name">
                <Select placeholder="联邦训练-图神经网络" options={[
                  { value: '联邦训练-图神经网络', label: '联邦训练-图神经网络' },
                  { value: '联邦训练-LSTM', label: '联邦训练-LSTM' },
                  { value: '联邦训练-Transformer', label: '联邦训练-Transformer' },
                  { value: '联合推理-风控模型', label: '联合推理-风控模型' },
                  { value: '数据融合-反欺诈', label: '数据融合-反欺诈' },
                ]} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="发起业务方" name="business_source" rules={[{ required: true, message: '请选择业务方' }]}>
                <Select placeholder="反欺诈中心" options={BUSINESS_SOURCES.map((s) => ({ value: s, label: s }))} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="模型类型" name="model_type">
                <Select placeholder="GNN" options={[
                  { value: 'GNN', label: 'GNN' },
                  { value: 'LSTM', label: 'LSTM' },
                  { value: 'Transformer', label: 'Transformer' },
                  { value: 'CNN', label: 'CNN' },
                ]} />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item label="数据集选择（勾选后自动计算关联度）" name="dataset">
            <Checkbox.Group>
              <Row style={{ maxHeight: 240, overflowY: 'auto', border: '1px solid #f0f0f0', borderRadius: 6, padding: '8px 12px' }}>
                {MOCK_DATASETS.map((ds) => {
                  const checked = (formValues.dataset || []).includes(ds.id);
                  let relevanceLabel: React.ReactNode = null;
                  if (checked) {
                    const taskName = formValues.task_name || '';
                    const modelType = formValues.model_type || '';
                    const bizSource = formValues.business_source || '';
                    let score = 0;
                    if (ds.businessTag && taskName && taskName.includes(ds.businessTag)) score += 0.3;
                    if (ds.businessTag && bizSource && bizSource.includes(ds.businessTag)) score += 0.25;
                    if (ds.modality === '结构化') score += 0.15;
                    if (modelType === 'GNN' && ds.modality === '图数据') score += 0.25;
                    if (modelType === 'LSTM' && ds.modality === '时序') score += 0.25;
                    if (modelType === 'Transformer' && (ds.modality === '文本' || ds.modality === '多模态')) score += 0.2;
                    if (modelType === 'CNN' && (ds.modality === '图像' || ds.modality === '视频')) score += 0.25;
                    if (bizSource === '反欺诈中心' && (ds.businessTag === '反欺诈' || ds.businessTag === '风控')) score += 0.2;
                    if (bizSource === '风控中心' && (ds.businessTag === '风控' || ds.businessTag === '征信')) score += 0.2;
                    if (bizSource === '精准营销中心' && (ds.businessTag === 'CTR' || ds.businessTag === '精准营销')) score += 0.2;
                    if (bizSource === '安全运营中心' && ds.businessTag === '安全') score += 0.2;
                    if (bizSource === '用户画像中心' && (ds.businessTag === '精准营销' || ds.id === 'ds-user-profile')) score += 0.2;
                    // deterministic jitter based on dataset id hash
                    const hash = ds.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
                    score += (hash % 8) / 100;
                    const relevance = Math.min(+(score).toFixed(2), 0.99);
                    const color = relevance >= 0.6 ? '#1565c0' : relevance >= 0.3 ? '#b45309' : '#94a3b8';
                    relevanceLabel = <span style={{ color, fontSize: 11, marginLeft: 4 }}>(关联度 {relevance})</span>;
                  }
                  return (
                    <Col span={8} key={ds.id} style={{ marginBottom: 4 }}>
                      <Checkbox value={ds.id}>
                        {ds.name} <Tag style={{ marginLeft: 2 }}>{ds.modality}</Tag>
                        {relevanceLabel}
                      </Checkbox>
                    </Col>
                  );
                })}
              </Row>
            </Checkbox.Group>
          </Form.Item>

          <Form.Item label="优先级" name="priority">
            <Radio.Group>
              <Radio value="高">高</Radio>
              <Radio value="中">中</Radio>
              <Radio value="低">低</Radio>
            </Radio.Group>
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label={`非 IID 程度 (α): ${taskForm.getFieldValue('noniid_alpha') || 0.5}`} name="noniid_alpha">
                <Slider min={0.1} max={1.0} step={0.1} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label={`隐私预算 ε: ${taskForm.getFieldValue('privacy_epsilon') || 2.0}`} name="privacy_epsilon">
                <Slider min={0.5} max={10} step={0.5} />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item label="期望聚合算法" name="aggregation">
            <Radio.Group>
              <Radio value="auto">系统智能选择</Radio>
              <Radio value="FedAvg">FedAvg</Radio>
              <Radio value="Bulyan">Bulyan</Radio>
            </Radio.Group>
          </Form.Item>

          <div style={{ background: '#eef2f7', padding: 16, borderRadius: 8, marginBottom: 8, borderLeft: '3px solid #1565c0' }}>
            <div style={{ fontWeight: 600, marginBottom: 12, fontSize: 14 }}>算力申请额度</div>
            <Row gutter={16}>
              <Col span={8}>
                <Form.Item label="CPU（核）" name="cpu_cores" style={{ marginBottom: 8 }}>
                  <Select options={[
                    { value: 4, label: '4 核' },
                    { value: 8, label: '8 核' },
                    { value: 16, label: '16 核' },
                    { value: 32, label: '32 核' },
                    { value: 64, label: '64 核' },
                    { value: 128, label: '128 核' },
                  ]} />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item label="GPU（张）" name="gpu_count" style={{ marginBottom: 8 }}>
                  <Select options={[
                    { value: 0, label: '无 GPU' },
                    { value: 1, label: '1 张' },
                    { value: 2, label: '2 张' },
                    { value: 4, label: '4 张' },
                    { value: 8, label: '8 张' },
                    { value: 16, label: '16 张' },
                  ]} />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item label="内存（GB）" name="memory_gb" style={{ marginBottom: 8 }}>
                  <Select options={[
                    { value: 8, label: '8 GB' },
                    { value: 16, label: '16 GB' },
                    { value: 32, label: '32 GB' },
                    { value: 64, label: '64 GB' },
                    { value: 128, label: '128 GB' },
                    { value: 256, label: '256 GB' },
                    { value: 512, label: '512 GB' },
                  ]} />
                </Form.Item>
              </Col>
            </Row>
            <div style={{ fontWeight: 600, marginBottom: 4, fontSize: 14 }}>
              预估训练时长
            </div>
            <div style={{
              padding: '8px 12px', background: '#fff', borderRadius: 6, border: '1px solid #d9d9d9',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              {estimatedTrainingHours ? (
                <span style={{ fontSize: 20, fontWeight: 700, color: '#1565c0' }}>
                  {estimatedTrainingHours} 小时
                </span>
              ) : (
                <span style={{ fontSize: 14, color: '#999' }}>
                  请先选择模型类型和数据集，系统将综合估算训练时长
                </span>
              )}
              {estimatedTrainingHours && (
                <span style={{ fontSize: 11, color: '#999' }}>
                  基于模型复杂度、数据量、算力额度、非IID程度、隐私预算综合估算
                </span>
              )}
            </div>
          </div>
        </Form>
      </Modal>

      {/* 接入新数据集弹窗 */}
      <Modal
        title="接入新数据集"
        open={importModalVisible}
        onCancel={() => { if (!importing) setImportModalVisible(false); }}
        footer={null}
        width={400}
      >
        <div style={{ textAlign: 'center', padding: '24px 0' }}>
          <Progress type="circle" percent={importProgress} status={importing ? 'active' : importProgress >= 100 ? 'success' : 'normal'} />
          <div style={{ marginTop: 16, color: '#666' }}>
            {importing ? '正在接入数据集...' : '数据集接入完成！'}
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default TaskManagement;
