
# 强化联邦学习原型系统与典型应用

> Reinforced Federated Learning Prototype System & Typical Applications

基于强化联邦学习技术构建的原型展示系统，涵盖联邦学习资源管理、算力网络智能调度和电信欺诈识别三大核心模块。

## 📋 项目概述

本系统是一个面向强化联邦学习的可视化原型平台，包含以下三大模块共 **14 个功能页面**：

### 模块一：强化联邦学习原型系统（三层架构）

| 页面 | 功能描述 |
|------|---------|
| **用户控制层** | 算力节点实时资源监控（CPU/内存/磁盘/网络）、历史数据查询、任务与资源模型管理、大模型智能对话、边缘节点感知 |
| **边缘计算控制层** | 客户端节点资源贡献监控、任务资源分配与运行时长追踪、资源分配公平性分析 |
| **云中心控制层** | 客户端个性化管理、实时监控与决策优化、全局资源管理与强化学习调度 |

### 模块二：算力网络智能调度系统

| 页面 | 功能描述 |
|------|---------|
| **多维资源联邦协同感知** | 多维资源描述规范与资源池、算力网络拓扑结构实时感知、任务状态/类型/节点完成统计 |
| **算力任务需求管理** | 算力需求管理视图、算力中心能力视图、节点资源详情、多维资源动态管理 |
| **算力网络协同预测与分配** | 不同周期资源需求预测、强化联邦智能调度分配、节点 CPU/GPU/内存/磁盘监控 |
| **算力资源实时监控** | 网络拓扑结构、系统负载变化曲线、节点负载排序与任务负载情况 |
| **量化安全性评估** | 四维度风险指标设置（数据/算法/网络/系统安全）、安全态势实时评估、大模型安全分析报告生成 |

### 模块三：电信欺诈识别系统

| 页面 | 功能描述 |
|------|---------|
| **诈骗用户识别** | 基于联邦图卷积网络（GCN）的用户识别、通信行为特征建模 |
| **异常行为追踪** | 隐私保护哈希脱敏行为追踪、欺诈标签增量更新、诈骗电话统计分析 |
| **诈骗数据分析** | 一周诈骗前十统计、按城市月度趋势分析、百度地图城市覆盖展示 |
| **诈骗态势分析** | 一周诈骗趋势、诈骗地点词云、各地市欺诈占比分析 |
| **文本数据挖掘** | 欺诈短信领域分布、相似性关系图、欺诈特征散点图 |
| **通信数据挖掘** | 短信发送-接收热力图、身份证-号码线柱图、欺诈识别结果树状图 |

## 🛠 技术栈

### 前端

| 类别 | 技术 | 说明 |
|------|------|------|
| **框架** | React 18 + TypeScript | 前端主框架 |
| **构建工具** | Vite 5 | 开发服务器与构建 |
| **UI 组件库** | Ant Design 5 + ProComponents | 中后台组件 |
| **图表** | ECharts 5 + echarts-for-react | 折线图、柱状图、饼图、仪表盘、雷达图、热力图、散点图、词云等 |
| **网络拓扑** | AntV G6 | 力导向图、网络拓扑可视化 |
| **状态管理** | Zustand | 轻量状态管理 |
| **HTTP 请求** | Axios | API 接口调用 |
| **路由** | React Router v6 | 路由管理 + 懒加载 |

### 后端

| 类别 | 技术 | 说明 |
|------|------|------|
| **框架** | FastAPI | Python 异步 Web 框架，自带 Swagger 文档 |
| **运行时** | Uvicorn | ASGI 高性能服务器 |
| **数据验证** | Pydantic v2 | 请求/响应数据校验与序列化 |
| **ORM** | SQLAlchemy 2.0 | 数据库 ORM（默认 SQLite，可切换 PostgreSQL） |
| **数据库迁移** | Alembic | 数据库版本管理 |
| **认证** | python-jose + passlib | JWT Token 认证 |
| **ML/AI** | NumPy + Pandas + scikit-learn | 数据处理与机器学习（联邦学习、GCN 等） |
| **异步任务** | Celery + Redis | 后台任务队列（可选） |
| **日志** | Loguru | 结构化日志 |
| **测试** | pytest + pytest-asyncio | 单元测试与异步测试 |

## 📁 项目结构

```
fl-system/
├── index.html                          # 前端入口 HTML
├── package.json                        # 前端依赖管理
├── tsconfig.json                       # TypeScript 配置
├── vite.config.ts                      # Vite 构建配置（路径别名 @/）
│
├── server/                             # ===== 后端（FastAPI）=====
│   ├── requirements.txt                # Python 依赖
│   ├── .env.example                    # 环境变量模板
│   ├── app/
│   │   ├── main.py                     # FastAPI 应用入口
│   │   ├── core/
│   │   │   ├── config.py               # 应用配置（Pydantic Settings）
│   │   │   └── database.py             # 数据库连接与 Session 管理
│   │   ├── api/
│   │   │   └── routes/
│   │   │       ├── resources.py         # 资源监控 API（/api/resources/*）
│   │   │       ├── tasks.py             # 任务管理 API（/api/tasks/*）
│   │   │       ├── fraud.py             # 欺诈识别 API（/api/fraud/*）
│   │   │       └── chat.py              # AI 对话 API（/api/chat/*）
│   │   ├── models/                      # SQLAlchemy 数据模型（待实现）
│   │   ├── schemas/
│   │   │   └── common.py                # Pydantic 数据 Schema
│   │   ├── services/                    # 业务逻辑层（待实现）
│   │   └── utils/                       # 工具函数
│   └── tests/
│       └── test_api.py                  # API 测试用例
│
├── src/                                # ===== 前端（React）=====
│   ├── main.tsx                        # React 入口
│   ├── App.tsx                         # 根组件
│   ├── router.tsx                      # 路由配置（14 个页面懒加载）
│   ├── global.css                      # 全局样式
│   ├── vite-env.d.ts                   # TS 类型声明
│   │
│   ├── layouts/
│   │   └── MainLayout.tsx              # 主布局（侧边栏 + 顶栏 + 内容区）
│   │
│   ├── components/                     # 公共组件
│   │   ├── Charts/                     # 可复用图表组件
│   │   │   ├── GaugeChart.tsx          #   仪表盘
│   │   │   ├── LineChart.tsx           #   折线图
│   │   │   ├── BarChart.tsx            #   柱状图
│   │   │   ├── PieChart.tsx            #   饼图
│   │   │   └── index.ts               #   统一导出
│   │   ├── Chat/
│   │   │   └── ChatAssistant.tsx       # 大模型对话助手组件
│   │   └── TopologyGraph/
│   │       └── index.tsx               # AntV G6 网络拓扑图
│   │
│   ├── pages/                          # 业务页面（三大模块，14 个页面）
│   │   ├── FederatedLearning/          #   模块一：强化联邦学习
│   │   │   ├── UserControl/            #     用户控制层
│   │   │   ├── EdgeControl/            #     边缘计算控制层
│   │   │   └── CloudControl/           #     云中心控制层
│   │   ├── ComputingSchedule/          #   模块二：算力网络智能调度
│   │   │   ├── ResourceSensing/        #     多维资源协同感知
│   │   │   ├── TaskManagement/         #     算力任务需求管理
│   │   │   ├── PredictionAllocation/   #     协同预测与分配
│   │   │   ├── ResourceMonitoring/     #     算力资源实时监控
│   │   │   └── SecurityAssessment/     #     量化安全性评估
│   │   └── FraudDetection/             #   模块三：电信欺诈识别
│   │       ├── UserIdentification/     #     诈骗用户识别
│   │       ├── BehaviorTracking/       #     异常行为追踪
│   │       ├── DataAnalysis/           #     诈骗数据分析
│   │       ├── SituationAnalysis/      #     诈骗态势分析
│   │       ├── TextMining/             #     文本数据挖掘
│   │       └── CommunicationMining/    #     通信数据挖掘
│   │
│   ├── services/
│   │   └── api.ts                      # Axios 接口封装
│   │
│   └── mock/
│       └── data.ts                     # Mock 数据生成工具
│
└── public/                             # 静态资源目录
```

> 💡 采用 **Monorepo** 结构，前端代码在根目录 `src/`，后端代码在 `server/` 目录。

## 🚀 快速开始

### 环境要求

- **Node.js** >= 18.0.0
- **npm** >= 9.0.0（或 pnpm / yarn）
- **Python** >= 3.10
- **pip**（或 conda）

### 前端启动

```bash
# 克隆仓库
git clone https://github.com/<your-username>/fl-system.git
cd fl-system

# 安装前端依赖
npm install

# 启动前端开发服务器
npm run dev
```

前端默认运行在 `http://localhost:3000`。

### 后端启动

```bash
# 进入后端目录
cd server

# 创建虚拟环境（推荐）
python -m venv venv
source venv/bin/activate   # macOS/Linux
# venv\Scripts\activate    # Windows

# 安装 Python 依赖
pip install -r requirements.txt

# 复制环境变量模板并按需修改
cp .env.example .env

# 启动后端开发服务器
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

后端默认运行在 `http://localhost:8000`。

**API 文档**（自动生成）：
- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`

### 前后端联调

前端 Vite 已配置代理，开发时 `/api/*` 请求会自动转发到后端 `http://localhost:8000`。前后端分别启动后即可联调。

### 构建生产版本

```bash
# 前端构建
npm run build        # 输出到 dist/

# 后端无需构建，直接部署
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

### 运行测试

```bash
# 后端测试
cd server
pytest tests/ -v
```

## 📌 当前进度

- [x] 项目框架搭建（Vite + React + TS）
- [x] 路由配置与侧边栏导航
- [x] 公共组件封装（Charts / Chat / TopologyGraph）
- [x] 14 个页面基础布局与 Mock 数据展示
- [x] 后端框架搭建（FastAPI + SQLAlchemy）
- [x] 后端 Mock API 端点（Resources / Tasks / Fraud / Chat）
- [x] 后端测试用例
- [ ] 对接后端 API（替换前端 Mock 数据）
- [ ] 数据库模型实现（SQLAlchemy Models）
- [ ] 联邦学习训练 & 聚合逻辑
- [ ] 大模型对话组件接入真实 API（SSE 流式响应）
- [ ] 百度地图 API 接入（电信诈骗城市覆盖地图）
- [ ] ECharts 中国地图注册与展示
- [ ] 响应式布局优化
- [ ] 权限控制与用户登录

## 🤝 协作开发指南

### 分支规范

```
main        ← 稳定版本
develop     ← 开发主分支
feature/*   ← 功能分支（如 feature/fraud-api）
fix/*       ← 修复分支
```

### 开发约定

1. **页面开发**：每个页面独立文件夹，位于 `src/pages/<模块>/<页面名>/index.tsx`
2. **公共组件**：放在 `src/components/` 下，确保可复用
3. **前端 API 接口**：统一在 `src/services/api.ts` 中定义
4. **后端 API 路由**：按模块拆分在 `server/app/api/routes/` 下
5. **路径别名**：使用 `@/` 代替 `src/`（已配置）
6. **Mock 数据**：开发阶段使用 `src/mock/data.ts`（前端）或后端 Mock 端点

### 图表使用

项目封装了 4 种可复用图表组件，位于 `src/components/Charts/`：

```tsx
import { GaugeChart, LineChart, BarChart, PieChart } from '@/components/Charts';

// 折线图示例
<LineChart
  xData={['10:00', '11:00', '12:00']}
  series={[{ name: 'CPU', data: [60, 72, 68], color: '#1677ff', areaStyle: true }]}
  height={300}
/>
```

对于更复杂的图表（热力图、雷达图、关系图、树状图等），直接使用 `echarts-for-react`：

```tsx
import ReactECharts from 'echarts-for-react';
<ReactECharts option={yourOption} style={{ height: 350 }} />
```

## 📄 License

MIT
