export interface TaskDemand {
  id: string;
  task: string;
  cpu: number;
  memory: number;
  gpu: number;
  storage: number;
  priority: string;
  status: string;
}

export interface DemandItem {
  id: string;
  task: string;
  cpu: number;
  memory: number;
  gpu: number;
  storage: number;
  priority: string;
  status: string;
  business_source?: string;
  dataset?: string[];
  privacy_epsilon?: number;
  noniid_alpha?: number;
  aggregation?: string;
  model_type?: string;
}

export interface StatItem {
  title: string;
  value: number | string;
}

export interface NodeItem {
  node_name: string;
  node_id: string;
  status: string;
  cpu_percent: number;
  mem_percent: number;
  gpu_percent: number;
  disk_percent: number;
  parent_supercomputing?: string;
}

export interface ResourceUsageItem {
  name: string;
  value: number;
}

export interface TrendSeriesItem {
  name: string;
  data: number[];
  areaStyle?: boolean;
}

export interface TrendData {
  x: string[];
  series: TrendSeriesItem[];
}

export interface MapNodeItem {
  name: string;
  longitude: number;
  latitude: number;
  capacity: number;
  level: string;
}

export type MapPoint = [number, number, number];

export type PriorityLevel = '高' | '中' | '低';

export interface PriorityGroup {
  level: PriorityLevel;
  label: string;
  color: string;
  borderColor: string;
  bgColor: string;
  icon: string;
  items: DemandItem[];
  totalCpu: number;
  totalMemory: number;
  totalGpu: number;
  totalStorage: number;
}

export const PRIORITY_ORDER: PriorityLevel[] = ['高', '中', '低'];

export const PRIORITY_META: Record<PriorityLevel, Omit<PriorityGroup, 'items' | 'totalCpu' | 'totalMemory' | 'totalGpu' | 'totalStorage'>> = {
  高: {
    level: '高',
    label: '高优先级任务',
    color: '#9f1239',
    borderColor: '#fecdd3',
    bgColor: '#fff1f2',
    icon: '🔥',
  },
  中: {
    level: '中',
    label: '中优先级任务',
    color: '#b45309',
    borderColor: '#fde68a',
    bgColor: '#fffbeb',
    icon: '⚡',
  },
  低: {
    level: '低',
    label: '低优先级任务',
    color: '#0369a1',
    borderColor: '#bae6fd',
    bgColor: '#f0f9ff',
    icon: '📋',
  },
};

export type NodeStatus = 'online' | 'warning' | 'offline';

export interface NodeStatusGroup {
  status: NodeStatus;
  label: string;
  color: string;
  borderColor: string;
  bgColor: string;
  icon: string;
  items: NodeItem[];
  avgCpu: number;
  avgMem: number;
  avgGpu: number;
  avgDisk: number;
}

export const NODE_STATUS_ORDER: NodeStatus[] = ['online', 'warning', 'offline'];

export const NODE_STATUS_META: Record<NodeStatus, Omit<NodeStatusGroup, 'items' | 'avgCpu' | 'avgMem' | 'avgGpu' | 'avgDisk'>> = {
  online: {
    status: 'online',
    label: '在线节点',
    color: '#0d7377',
    borderColor: '#99f6e4',
    bgColor: '#f0fdfa',
    icon: '🟢',
  },
  warning: {
    status: 'warning',
    label: '告警节点',
    color: '#b45309',
    borderColor: '#fde68a',
    bgColor: '#fffbeb',
    icon: '🟡',
  },
  offline: {
    status: 'offline',
    label: '离线节点',
    color: '#9f1239',
    borderColor: '#fecdd3',
    bgColor: '#fff1f2',
    icon: '🔴',
  },
};

export type AlertLevel = 'critical' | 'warning';

export interface ResourceAlert {
  id: string;
  nodeId: string;
  nodeName: string;
  metric: string;
  value: number;
  threshold: number;
  level: AlertLevel;
  message: string;
  timestamp: number;
}

export interface AlertThreshold {
  metric: string;
  label: string;
  unit: string;
  warning: number;
  critical: number;
  field: keyof Pick<NodeItem, 'cpu_percent' | 'mem_percent' | 'gpu_percent' | 'disk_percent'>;
}

export const ALERT_THRESHOLDS: AlertThreshold[] = [
  { metric: 'cpu', label: 'CPU 利用率', unit: '%', warning: 60, critical: 80, field: 'cpu_percent' },
  { metric: 'mem', label: '内存利用率', unit: '%', warning: 60, critical: 80, field: 'mem_percent' },
  { metric: 'gpu', label: 'GPU 利用率', unit: '%', warning: 60, critical: 80, field: 'gpu_percent' },
];

export interface DatasetItem {
  id: string;
  name: string;
  modality: string;
  businessTag: string;
  size: string;
  privacyEpsilon: number;
  relationCount: number;
}

export interface DatasetRelation {
  source: string;
  target: string;
  weight: number;
}

export interface TaskFormData {
  task_id: string;
  task_name: string;
  type: string;
  business_source: string;
  dataset: string[];
  model_type: string;
  priority: string;
  noniid_alpha: number;
  privacy_epsilon: number;
  aggregation: string;
}

export const SUPERCOMPUTING_MAP: Record<string, string> = {
  'beijing': 'supercomputing-beijing-01',
  'shanghai': 'supercomputing-shanghai-01',
  'guangzhou': 'supercomputing-guangzhou-01',
  'shenzhen': 'supercomputing-shenzhen-01',
  'hangzhou': 'supercomputing-hangzhou-01',
  'chengdu': 'supercomputing-chengdu-01',
  'wuhan': 'supercomputing-wuhan-01',
  'nanjing': 'supercomputing-nanjing-01',
  'chongqing': 'supercomputing-chongqing-01',
  'xian': 'supercomputing-xian-01',
  'changsha': 'supercomputing-changsha-01',
  'zhengzhou': 'supercomputing-zhengzhou-01',
  'jinan': 'supercomputing-jinan-01',
  'tianjin': 'supercomputing-tianjin-01',
  'shenyang': 'supercomputing-shenyang-01',
  'dalian': 'supercomputing-dalian-01',
  'qingdao': 'supercomputing-qingdao-01',
  'hefei': 'supercomputing-hefei-01',
  'fuzhou': 'supercomputing-fuzhou-01',
  'kunming': 'supercomputing-kunming-01',
  'guiyang': 'supercomputing-guiyang-01',
  'nanning': 'supercomputing-nanning-01',
  'harbin': 'supercomputing-harbin-01',
  'changchun': 'supercomputing-changchun-01',
  'shijiazhuang': 'supercomputing-shijiazhuang-01',
  'lhasa': 'supercomputing-lhasa-01',
};

export const MOCK_DATASETS: DatasetItem[] = [
  { id: 'ds-user-behavior', name: '用户行为日志', modality: '结构化', businessTag: 'CTR', size: '12GB', privacyEpsilon: 2.1, relationCount: 7 },
  { id: 'ds-transaction', name: '交易记录', modality: '结构化', businessTag: '风控', size: '8GB', privacyEpsilon: 1.5, relationCount: 5 },
  { id: 'ds-device-fingerprint', name: '设备指纹', modality: '多模态', businessTag: 'IOT', size: '30GB', privacyEpsilon: 3.0, relationCount: 3 },
  { id: 'ds-network-traffic', name: '网络流量', modality: '结构化', businessTag: '安全', size: '25GB', privacyEpsilon: 2.8, relationCount: 4 },
  { id: 'ds-user-profile', name: '用户画像', modality: '结构化', businessTag: '精准营销', size: '18GB', privacyEpsilon: 1.8, relationCount: 6 },
  { id: 'ds-call-record', name: '通话记录', modality: '结构化', businessTag: '反欺诈', size: '15GB', privacyEpsilon: 2.5, relationCount: 4 },
  { id: 'ds-sms-content', name: '短信内容', modality: '文本', businessTag: '反欺诈', size: '6GB', privacyEpsilon: 3.2, relationCount: 3 },
  { id: 'ds-location-trace', name: '位置轨迹', modality: '时序', businessTag: '风控', size: '22GB', privacyEpsilon: 2.0, relationCount: 5 },
  { id: 'ds-app-usage', name: 'APP使用记录', modality: '结构化', businessTag: 'CTR', size: '10GB', privacyEpsilon: 1.2, relationCount: 4 },
  { id: 'ds-payment', name: '支付流水', modality: '结构化', businessTag: '风控', size: '14GB', privacyEpsilon: 1.0, relationCount: 6 },
  { id: 'ds-credit-score', name: '信用评分', modality: '结构化', businessTag: '征信', size: '8GB', privacyEpsilon: 0.8, relationCount: 3 },
  { id: 'ds-social-graph', name: '社交关系图', modality: '图数据', businessTag: '反欺诈', size: '35GB', privacyEpsilon: 3.5, relationCount: 2 },
  { id: 'ds-image-ocr', name: '证件OCR图像', modality: '图像', businessTag: 'KYC', size: '20GB', privacyEpsilon: 4.0, relationCount: 2 },
  { id: 'ds-voice-record', name: '语音录音', modality: '音频', businessTag: '客服', size: '40GB', privacyEpsilon: 3.8, relationCount: 1 },
  { id: 'ds-video-surveillance', name: '监控视频', modality: '视频', businessTag: '安防', size: '120GB', privacyEpsilon: 4.5, relationCount: 1 },
  { id: 'ds-sensor-data', name: '传感器数据', modality: '时序', businessTag: 'IOT', size: '28GB', privacyEpsilon: 2.2, relationCount: 3 },
  { id: 'ds-email-content', name: '邮件内容', modality: '文本', businessTag: '安全', size: '5GB', privacyEpsilon: 3.0, relationCount: 2 },
  { id: 'ds-web-click', name: '网页点击流', modality: '结构化', businessTag: 'CTR', size: '16GB', privacyEpsilon: 1.5, relationCount: 5 },
  { id: 'ds-log-audit', name: '日志审计', modality: '结构化', businessTag: '安全', size: '45GB', privacyEpsilon: 2.0, relationCount: 4 },
  { id: 'ds-medical-record', name: '医疗记录', modality: '结构化', businessTag: '健康', size: '30GB', privacyEpsilon: 0.5, relationCount: 2 },
  { id: 'ds-insurance-claim', name: '保险理赔', modality: '结构化', businessTag: '保险', size: '12GB', privacyEpsilon: 1.8, relationCount: 3 },
  { id: 'ds-ecommerce-order', name: '电商订单', modality: '结构化', businessTag: '精准营销', size: '20GB', privacyEpsilon: 1.3, relationCount: 4 },
  { id: 'ds-logistics', name: '物流数据', modality: '结构化', businessTag: '供应链', size: '18GB', privacyEpsilon: 2.0, relationCount: 3 },
  { id: 'ds-energy-consumption', name: '能耗数据', modality: '时序', businessTag: '能源', size: '25GB', privacyEpsilon: 1.0, relationCount: 2 },
  { id: 'ds-weather', name: '气象数据', modality: '时序', businessTag: '公共服务', size: '50GB', privacyEpsilon: 0.3, relationCount: 1 },
  { id: 'ds-traffic-flow', name: '交通流量', modality: '时序', businessTag: '智慧城市', size: '35GB', privacyEpsilon: 1.5, relationCount: 3 },
  { id: 'ds-genomic', name: '基因数据', modality: '生物', businessTag: '健康', size: '80GB', privacyEpsilon: 5.0, relationCount: 1 },
  { id: 'ds-satellite', name: '卫星遥感', modality: '图像', businessTag: '测绘', size: '200GB', privacyEpsilon: 0.2, relationCount: 1 },
  { id: 'ds-industrial-iot', name: '工业物联网', modality: '多模态', businessTag: '制造', size: '60GB', privacyEpsilon: 2.5, relationCount: 2 },
  { id: 'ds-financial-report', name: '财务报表', modality: '结构化', businessTag: '金融', size: '4GB', privacyEpsilon: 1.0, relationCount: 3 },
  { id: 'ds-employee-record', name: '员工档案', modality: '结构化', businessTag: 'HR', size: '2GB', privacyEpsilon: 0.8, relationCount: 2 },
  { id: 'ds-legal-case', name: '法律案例', modality: '文本', businessTag: '司法', size: '15GB', privacyEpsilon: 0.5, relationCount: 1 },
  { id: 'ds-edu-record', name: '学籍数据', modality: '结构化', businessTag: '教育', size: '8GB', privacyEpsilon: 1.2, relationCount: 2 },
  { id: 'ds-real-estate', name: '房产交易', modality: '结构化', businessTag: '房产', size: '10GB', privacyEpsilon: 1.5, relationCount: 3 },
  { id: 'ds-telecom-bill', name: '电信账单', modality: '结构化', businessTag: '通信', size: '12GB', privacyEpsilon: 2.0, relationCount: 4 },
  { id: 'ds-coupon-usage', name: '优惠券使用', modality: '结构化', businessTag: '精准营销', size: '6GB', privacyEpsilon: 1.0, relationCount: 3 },
  { id: 'ds-feedback', name: '用户反馈', modality: '文本', businessTag: '客服', size: '3GB', privacyEpsilon: 2.5, relationCount: 2 },
  { id: 'ds-ad-impression', name: '广告曝光', modality: '结构化', businessTag: '广告', size: '25GB', privacyEpsilon: 1.8, relationCount: 5 },
];

export const MOCK_RELATIONS: DatasetRelation[] = [
  { source: 'ds-user-behavior', target: 'ds-transaction', weight: 0.87 },
  { source: 'ds-user-behavior', target: 'ds-network-traffic', weight: 0.62 },
  { source: 'ds-transaction', target: 'ds-network-traffic', weight: 0.79 },
  { source: 'ds-device-fingerprint', target: 'ds-user-profile', weight: 0.55 },
  { source: 'ds-call-record', target: 'ds-sms-content', weight: 0.71 },
  { source: 'ds-user-behavior', target: 'ds-app-usage', weight: 0.83 },
  { source: 'ds-payment', target: 'ds-credit-score', weight: 0.68 },
  { source: 'ds-location-trace', target: 'ds-user-behavior', weight: 0.59 },
  { source: 'ds-ecommerce-order', target: 'ds-user-behavior', weight: 0.74 },
  { source: 'ds-web-click', target: 'ds-ad-impression', weight: 0.81 },
  { source: 'ds-social-graph', target: 'ds-call-record', weight: 0.66 },
  { source: 'ds-user-profile', target: 'ds-ecommerce-order', weight: 0.72 },
];

export const BUSINESS_SOURCES = [
  '反欺诈中心',
  '风控中心',
  '用户画像中心',
  '精准营销中心',
  '安全运营中心',
  '客服中心',
  '征信中心',
  '供应链中心',
];
