"""
算力任务需求管理路由（来源：cst 同学）
接口列表：
  GET  /tasks            - 获取任务列表（带过滤）
  POST /tasks            - 创建新任务
  POST /tasks/batch      - 批量创建任务
  GET  /tasks/demands    - 获取算力任务需求分层视图数据
  GET  /tasks/stats      - 获取顶部统计卡片数据
  GET  /tasks/{task_id}  - 获取单个任务详情
  GET  /tasks/prediction/demand - 获取资源需求预测数据
  GET  /tasks/{task_id}/timeline - 获取任务流转生命周期
  GET  /tasks/states     - 获取所有任务的状态概览
"""
from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional
from sqlalchemy import text, create_engine
import random
import time
import uuid

from app.core.config import settings
from app.core.cache import cached, clear_all_cache
from app.services.scheduling_engine import evaluate_candidates, get_mock_candidates
from app.services.scheduling_context import (
    create_resource_lock_for_task,
    get_task_schedule_context,
)
from app.services.task_flow_logger import (
    log_flow_event,
    get_task_timeline,
    set_task_state,
    get_task_current_state,
    init_task,
    get_tasks_by_state,
    TASK_STATES,
)

router = APIRouter()


class TaskCreate(BaseModel):
    """创建任务的请求体"""
    name: str
    type: str = "training"
    priority: str = "normal"
    resource_requirements: Optional[dict] = None
    description: Optional[str] = None


# 内存中的 mock 任务列表（数据库不可用时的兜底数据）
_mock_tasks = [
    {
        "task_id": str(uuid.uuid4()),
        "name": f"FL Training Task {i}",
        "type": random.choice(["training", "inference", "aggregation"]),
        "status": random.choice(["running", "completed", "pending", "failed"]),
        "priority": random.choice(["high", "normal", "low"]),
        "progress": random.randint(0, 100),
        "assigned_node": f"node-{random.randint(1, 12)}",
        "created_at": int(time.time()) - random.randint(0, 86400),
        "duration": random.randint(60, 7200),
    }
    for i in range(1, 11)
]


def _get_computing_network_engine():
    """创建连接 computing_network 数据库的引擎"""
    url = (
        f"postgresql+psycopg://{settings.DB_USER}:{settings.DB_PASSWORD}"
        f"@{settings.DB_HOST}:{settings.DB_PORT}/{settings.DB_NAME}?sslmode=prefer"
    )
    return create_engine(url, connect_args={"connect_timeout": 5, "sslmode": "prefer"})


def _query_db(sql: str, params: dict | None = None):
    """执行 SQL 查询并返回字典列表"""
    engine = _get_computing_network_engine()
    with engine.connect() as conn:
        result = conn.execute(text(sql), params or {})
        return [dict(row._mapping) for row in result.fetchall()]


# 任务状态映射（英文 → 中文）
_STATUS_MAP = {
    "pending": "待分配",
    "scheduled": "已分配",
    "running": "运行中",
    "paused": "运行中",
    "completed": "已完成",
    "failed": "已完成",
}

# 优先级映射（英文 → 中文）
_PRIORITY_MAP = {
    "urgent": "高",
    "high": "高",
    "medium": "中",
    "low": "低",
}


def _fetch_demands_from_db():
    """从数据库查询任务需求数据（关联 fact_task + fact_task_requirement）"""
    rows = _query_db("""
        SELECT
            t.task_id,
            t.name,
            t.status,
            t.priority,
            t.progress,
            t.task_type,
            t.business_type,
            t.submit_time,
            t.start_time,
            t.end_time,
            t.assigned_node_id,
            r.cpu_requested,
            r.memory_requested,
            r.gpu_requested,
            r.gpu_type_requested,
            r.storage_requested,
            r.bandwidth_requested,
            r.estimated_duration_sec
        FROM fact_task t
        JOIN fact_task_requirement r ON t.task_id = r.task_id
        ORDER BY t.submit_time DESC
    """)
    demands = []
    for r in rows:
        demands.append({
            "id": r["task_id"],
            "task": r["name"],
            "cpu": int(float(r["cpu_requested"] or 0)),
            "memory": int(float(r["memory_requested"] or 0)),
            "gpu": float(r["gpu_requested"] or 0),
            "storage": int(float(r["storage_requested"] or 0)),
            "priority": _PRIORITY_MAP.get(r["priority"], "中"),
            "status": _STATUS_MAP.get(r["status"], "待分配"),
        })
    return demands


# Mock 需求数据（数据库不可用时的兜底）
_MOCK_DEMANDS = [
    {"id": "d1", "task": "联邦训练-图神经网络", "cpu": 16, "memory": 64, "gpu": 4, "storage": 200, "priority": "高", "status": "待分配"},
    {"id": "d2", "task": "异常行为检测-模型评估", "cpu": 12, "memory": 48, "gpu": 2, "storage": 150, "priority": "高", "status": "已完成"},
    {"id": "d3", "task": "大模型微调-通义千问", "cpu": 32, "memory": 128, "gpu": 8, "storage": 500, "priority": "高", "status": "运行中"},
    {"id": "d4", "task": "实时推理-欺诈交易识别", "cpu": 16, "memory": 64, "gpu": 4, "storage": 100, "priority": "高", "status": "已分配"},
    {"id": "d5", "task": "模型推理-欺诈检测", "cpu": 8, "memory": 32, "gpu": 2, "storage": 100, "priority": "中", "status": "已分配"},
    {"id": "d6", "task": "特征工程-用户画像构建", "cpu": 12, "memory": 48, "gpu": 1, "storage": 300, "priority": "中", "status": "运行中"},
    {"id": "d7", "task": "模型聚合-全局参数更新", "cpu": 16, "memory": 64, "gpu": 2, "storage": 80, "priority": "中", "status": "待分配"},
    {"id": "d8", "task": "增量训练-电信反诈模型", "cpu": 8, "memory": 32, "gpu": 2, "storage": 200, "priority": "中", "status": "运行中"},
    {"id": "d9", "task": "数据清洗-通信日志分析", "cpu": 4, "memory": 16, "gpu": 0, "storage": 500, "priority": "低", "status": "运行中"},
    {"id": "d10", "task": "日志归档-历史数据迁移", "cpu": 2, "memory": 8, "gpu": 0, "storage": 1000, "priority": "低", "status": "已完成"},
    {"id": "d11", "task": "数据同步-跨节点副本", "cpu": 4, "memory": 16, "gpu": 0, "storage": 800, "priority": "低", "status": "待分配"},
    {"id": "d12", "task": "模型评估-精度测试", "cpu": 8, "memory": 32, "gpu": 1, "storage": 120, "priority": "中", "status": "已完成"},
]


@router.get("/tasks")
@cached(ttl=30, key_prefix="tasks")
async def get_tasks(
    status: Optional[str] = None,
    task_type: Optional[str] = None,
):
    """获取任务列表，支持按状态和类型过滤"""
    tasks = _mock_tasks
    if status:
        tasks = [t for t in tasks if t["status"] == status]
    if task_type:
        tasks = [t for t in tasks if t["type"] == task_type]
    return {
        "total": len(tasks),
        "tasks": tasks,
        "stats": {
            "running": sum(1 for t in _mock_tasks if t["status"] == "running"),
            "completed": sum(1 for t in _mock_tasks if t["status"] == "completed"),
            "pending": sum(1 for t in _mock_tasks if t["status"] == "pending"),
            "failed": sum(1 for t in _mock_tasks if t["status"] == "failed"),
        },
    }


@router.post("/tasks")
async def create_task(task: TaskCreate):
    """创建新的算力任务（手动录入）"""
    task_id = f"task-{uuid.uuid4().hex[:8]}"
    new_task = {
        "task_id": task_id,
        "name": task.name,
        "type": task.type,
        "status": "pending",
        "priority": task.priority,
        "progress": 0,
        "assigned_node": None,
        "created_at": int(time.time()),
        "duration": 0,
        "description": task.description,
    }
    _mock_tasks.append(new_task)

    # 初始化任务流转日志（记录"任务诞生"）
    init_task(task_id, task.name, {
        "type": task.type,
        "priority": task.priority,
        "entry_method": "手动录入",
    })

    return new_task


# ============================================================
# 批量录入接口
# ============================================================

class TaskBatchCreate(BaseModel):
    """批量创建任务的请求体"""
    tasks: list[TaskCreate]


@router.post("/tasks/batch")
async def create_tasks_batch(req: TaskBatchCreate):
    """
    批量创建算力任务（批量录入）

    业务场景：周期性任务批量导入（如每月固定的反欺诈训练）
    """
    created = []
    for item in req.tasks:
        task_id = f"task-{uuid.uuid4().hex[:8]}"
        new_task = {
            "task_id": task_id,
            "name": item.name,
            "type": item.type,
            "status": "pending",
            "priority": item.priority,
            "progress": 0,
            "assigned_node": None,
            "created_at": int(time.time()),
            "duration": 0,
            "description": item.description,
        }
        _mock_tasks.append(new_task)

        # 初始化流转日志
        init_task(task_id, item.name, {
            "type": item.type,
            "priority": item.priority,
            "entry_method": "批量录入",
        })
        created.append(new_task)

    return {
        "created_count": len(created),
        "tasks": created,
        "message": f"批量录入完成，共创建 {len(created)} 个任务",
    }


@router.get("/tasks/demands")
@cached(ttl=60, key_prefix="tasks")
async def get_task_demands():
    """获取算力任务需求列表（优先查数据库，失败用 mock）"""
    try:
        return _fetch_demands_from_db()
    except Exception as e:
        print(f"[API] /tasks/demands query failed: {e}")
        return _MOCK_DEMANDS


@router.get("/tasks/stats")
@cached(ttl=60, key_prefix="tasks")
async def get_task_stats():
    """获取任务统计卡片数据"""
    try:
        demands = _fetch_demands_from_db()
    except Exception:
        demands = _MOCK_DEMANDS

    total = len(demands)
    running = len([d for d in demands if d["status"] == "运行中"])
    idle_nodes = len([d for d in demands if d["status"] == "待分配"])
    active_nodes = [d for d in demands if d["status"] in ("运行中", "已分配")]
    if active_nodes:
        avg_usage = round(
            sum(d["cpu"] for d in active_nodes) / len(active_nodes), 1
        )
    else:
        avg_usage = 0
    return [
        {"title": "全网任务总数", "value": total},
        {"title": "运行中任务", "value": running},
        {"title": "空闲节点", "value": idle_nodes},
        {"title": "资源利用率", "value": f"{avg_usage}%"},
    ]


@router.get("/tasks/{task_id}")
@cached(ttl=30, key_prefix="tasks")
async def get_task(task_id: str):
    """获取单个任务详情"""
    for t in _mock_tasks:
        if t["task_id"] == task_id:
            return t
    return {"error": "Task not found"}


@router.get("/tasks/{task_id}/schedule-context")
@cached(ttl=8, key_prefix="task_schedule_context")
async def get_schedule_context(task_id: str):
    """统一调度上下文：任务实例、摘要依据、候选评分、资源预留和生命周期日志。"""
    return get_task_schedule_context(task_id)


@router.get("/tasks/prediction/demand")
@cached(ttl=120, key_prefix="tasks")
async def get_demand_prediction(period: str = "daily"):
    """获取资源需求预测数据"""
    periods_map = {"hourly": 24, "daily": 7, "weekly": 4}
    n = periods_map.get(period, 7)
    return {
        "period": period,
        "predictions": [
            {
                "time_slot": i,
                "cpu_demand": round(random.uniform(40, 90), 1),
                "memory_demand": round(random.uniform(30, 80), 1),
                "gpu_demand": round(random.uniform(20, 70), 1),
            }
            for i in range(n)
        ],
    }


# ============================================================
# 任务流转接口（串联 5 个页面的核心）
# ============================================================


class ScheduleSubmitRequest(BaseModel):
    """提交至调度中枢的请求体"""
    task_id: str
    task_name: str = ""
    task_type: str = "training"
    priority: str = "normal"
    cpu: float = 0
    memory: float = 0
    gpu: float = 0


@router.post("/tasks/flow/submit-schedule")
async def submit_to_schedule(req: ScheduleSubmitRequest):
    """
    流转接口①：任务管理页 → 提交至调度中枢
    将任务状态更新为 scheduling，对候选节点进行综合评分，返回评分明细。

    改进点：采用 Filter-Score-Reserve 流程，不再只按 CPU 或单一综合分排序。
    """
    # 更新任务状态：pending → scheduling
    ok, msg = set_task_state(req.task_id, "scheduling")
    if not ok:
        # 状态转换不合法时也允许继续（容错），但记录警告
        print(f"[Flow] 状态转换警告: {msg}")

    # 尝试更新数据库中的任务状态
    try:
        engine = _get_computing_network_engine()
        with engine.begin() as conn:
            conn.execute(text(
                "UPDATE fact_task SET status = 'scheduling' WHERE task_id = :tid"
            ), {"tid": req.task_id})
    except Exception as e:
        print(f"[Flow] update task status failed: {e}")

    # 记录流转日志：任务已提交至调度中枢
    log_flow_event(
        task_id=req.task_id,
        action="submitted",
        detail=f"任务「{req.task_name or req.task_id}」已提交至调度中枢，开始评估候选节点",
        operator="运营员",
        extra={"cpu": req.cpu, "memory": req.memory, "gpu": req.gpu, "priority": req.priority},
    )

    # ---- 获取候选节点（从数据库或 mock）----
    candidates = []
    try:
        engine = _get_computing_network_engine()
        with engine.connect() as conn:
            rows = conn.execute(text("""
                SELECT
                       n.node_id,
                       n.node_name,
                       n.region_id,
                       n.layer,
                       n.status,
                       n.cpu_cores,
                       n.gpu_count,
                       n.memory_total_gb,
                       COALESCE(n.bandwidth_total_gbps, n.network_bandwidth_mbps / 1000.0, 10) AS bandwidth_total_gbps,
                       COALESCE(n.running_tasks, 0) AS running_tasks,
                       COALESCE(n.health_score, m.health_score, n.task_success_rate * 100, 85) AS trust_score,
                       COALESCE(m.cpu_usage_pct, 0) AS cpu_pct,
                       COALESCE(m.memory_usage_pct, m.cpu_usage_pct, 0) AS memory_pct,
                       COALESCE(m.gpu_usage_pct, m.cpu_usage_pct, 0) AS gpu_pct,
                       COALESCE(m.latency_ms, n.avg_response_time, 30) AS latency_ms,
                       COALESCE(m.jitter_ms, 2) AS jitter_ms,
                       COALESCE(m.packet_loss_pct, 0) AS packet_loss_pct,
                       COALESCE(recent.avg_cpu, m.cpu_usage_pct, 0) AS recent_cpu_avg
                FROM dim_compute_node n
                LEFT JOIN LATERAL (
                    SELECT *
                    FROM ts_node_metric
                    WHERE node_id = n.node_id ORDER BY metric_time DESC LIMIT 1
                ) m ON TRUE
                LEFT JOIN LATERAL (
                    SELECT AVG(cpu_usage_pct) AS avg_cpu
                    FROM ts_node_metric
                    WHERE node_id = n.node_id AND metric_time >= NOW() - INTERVAL '30 minutes'
                ) recent ON TRUE
                ORDER BY
                    CASE WHEN n.status = 'online' THEN 0 ELSE 1 END,
                    COALESCE(m.cpu_usage_pct, 50) ASC
                LIMIT 20
            """)).fetchall()
            for r in rows:
                candidates.append({
                    "node_id": r[0],
                    "node_name": r[1],
                    "region_id": r[2],
                    "layer": r[3],
                    "status": r[4],
                    "cpu_cores": r[5],
                    "gpu_count": r[6],
                    "memory_gb": r[7],
                    "bandwidth_total_gbps": r[8],
                    "running_tasks": r[9],
                    "trust_score": float(r[10] or 85),
                    "health_score": float(r[10] or 85),
                    "cpu_usage_pct": float(r[11] or 0),
                    "memory_usage_pct": float(r[12] or 0),
                    "gpu_usage_pct": float(r[13] or 0),
                    "latency_ms": float(r[14] or 30),
                    "jitter_ms": float(r[15] or 2),
                    "packet_loss_pct": float(r[16] or 0),
                    "recent_cpu_avg": float(r[17] or r[11] or 0),
                })
    except Exception as e:
        print(f"[Flow] query candidates failed: {e}")
        # mock 兜底（包含可信度和预测负载）
        candidates = get_mock_candidates()

    # ---- 调度综合评分（核心改进）----
    task_req = {
        "cpu": req.cpu,
        "gpu": req.gpu,
        "memory": req.memory,
        "task_type": req.task_type,
        "priority": req.priority,
    }
    evaluation = evaluate_candidates(candidates, task_req)

    # 尽量将候选评分写回 DB，供调度中心上下文接口复用；表不存在时不影响主流程。
    try:
        engine = _get_computing_network_engine()
        with engine.begin() as conn:
            exists = conn.execute(text("""
                SELECT EXISTS (
                    SELECT 1 FROM information_schema.tables
                    WHERE table_name = 'fact_task_candidate_score'
                )
            """)).scalar()
            if exists:
                conn.execute(text("DELETE FROM fact_task_candidate_score WHERE task_id = :tid"), {"tid": req.task_id})
                for item in evaluation.get("scored_candidates", [])[:8]:
                    conn.execute(text("""
                        INSERT INTO fact_task_candidate_score (
                            task_id, candidate_node_id, score_total, score_resource_fit,
                            score_latency, score_bandwidth, score_balance, score_risk,
                            rank_no, source_type
                        )
                        VALUES (
                            :task_id, :node_id, :total, :resource, :latency,
                            :bandwidth, :balance, :risk, :rank_no, 'scheduler_v2'
                        )
                    """), {
                        "task_id": req.task_id,
                        "node_id": item["node_id"],
                        "total": item["total_score"],
                        "resource": item["resource_fit_score"],
                        "latency": item["network_score"],
                        "bandwidth": item["network_score"],
                        "balance": item["pressure_score"],
                        "risk": item["risk_penalty"],
                        "rank_no": item.get("rank_no", 0),
                    })
    except Exception as e:
        print(f"[Flow] persist candidate scores failed: {e}")

    # 记录调度评估日志
    if evaluation["selected_node"]:
        sel = evaluation["selected_node"]
        log_flow_event(
            task_id=req.task_id,
            action="schedule_evaluated",
            detail=f"调度评估完成，推荐节点：{sel['node_name']}（综合评分 {sel['total_score']}，算法 {evaluation['algorithm']['mode']}）",
            operator="调度中枢",
            extra={
                "selected_node_id": sel["node_id"],
                "total_score": sel["total_score"],
                "load_score": sel["load_score"],
                "match_score": sel["match_score"],
                "trust_score": sel["trust_score_eval"],
                "prediction_score": sel.get("prediction_score"),
                "network_score": sel.get("network_score"),
                "risk_penalty": sel.get("risk_penalty"),
                "participant_group": evaluation.get("participant_group", []),
                "decision_basis": evaluation["decision_basis"],
            },
        )

    clear_all_cache()
    return {
        "task_id": req.task_id,
        "status": "scheduling",
        "candidates": candidates,
        # 评分明细（答辩时展示的核心数据）
        "evaluation": evaluation,
        "message": f"任务 {req.task_name or req.task_id} 已提交至调度中枢，"
                   f"推荐节点：{evaluation['selected_node']['node_name'] if evaluation['selected_node'] else '无'}",
    }


class ScheduleExecuteRequest(BaseModel):
    """执行调度的请求体"""
    task_id: str
    target_node_id: str
    algorithm: str = "Bulyan"


@router.post("/tasks/flow/execute-schedule")
async def execute_schedule(req: ScheduleExecuteRequest):
    """
    流转接口②：调度中枢 → 执行调度
    写入分配记录 + 更新任务状态为 running + 记录算法决策。

    改进点：同步记录流转日志，状态机推进 scheduling → scheduled → running
    """
    # 状态机推进：scheduling → scheduled
    ok1, msg1 = set_task_state(req.task_id, "scheduled")
    print(f"[Flow] {msg1}")

    # 更新数据库
    try:
        engine = _get_computing_network_engine()
        with engine.begin() as conn:
            conn.execute(text(
                "UPDATE fact_task SET status = 'running', assigned_node_id = :node WHERE task_id = :tid"
            ), {"tid": req.task_id, "node": req.target_node_id})
            req_row = conn.execute(text("""
                SELECT
                    COALESCE(cpu_requested, required_cpu_cores, 0) AS cpu,
                    COALESCE(memory_requested, required_memory_gb, 0) AS memory,
                    COALESCE(gpu_requested, required_gpu_count, 0) AS gpu,
                    COALESCE(bandwidth_requested, required_bandwidth_gbps, 0) AS bandwidth,
                    COALESCE(storage_requested, required_disk_gb, 0) AS storage
                FROM fact_task_requirement
                WHERE task_id = :tid
                LIMIT 1
            """), {"tid": req.task_id}).fetchone()
            if req_row:
                conn.execute(text("""
                    INSERT INTO fact_task_assignment (
                        task_id, target_node_id, match_score, cpu_allocated,
                        memory_allocated, gpu_allocated, bandwidth_allocated,
                        storage_allocated, assignment_status, assigned_at
                    )
                    VALUES (
                        :tid, :node, 100, :cpu, :memory, :gpu, :bandwidth,
                        :storage, 'running', NOW()
                    )
                """), {
                    "tid": req.task_id,
                    "node": req.target_node_id,
                    "cpu": float(req_row[0] or 0),
                    "memory": float(req_row[1] or 0),
                    "gpu": float(req_row[2] or 0),
                    "bandwidth": float(req_row[3] or 0),
                    "storage": float(req_row[4] or 0),
                })
    except Exception as e:
        print(f"[Flow] execute schedule failed: {e}")

    try:
        create_resource_lock_for_task(req.task_id, req.target_node_id)
    except Exception as e:
        print(f"[Flow] create resource lock failed: {e}")

    # 记录流转日志：算法决策
    log_flow_event(
        task_id=req.task_id,
        action="algorithm_decided",
        detail=f"算法决策：使用 {req.algorithm} 聚合算法",
        operator="算法决策中心",
        extra={"algorithm": req.algorithm},
    )

    # 记录流转日志：节点分配
    log_flow_event(
        task_id=req.task_id,
        action="scheduled",
        detail=f"任务已分配到节点 {req.target_node_id}，算法：{req.algorithm}",
        operator="调度中枢",
        extra={
            "target_node": req.target_node_id,
            "algorithm": req.algorithm,
        },
    )

    # 状态机推进：scheduled → running
    ok2, msg2 = set_task_state(req.task_id, "running")
    print(f"[Flow] {msg2}")

    # 记录流转日志：开始执行
    log_flow_event(
        task_id=req.task_id,
        action="started",
        detail=f"任务已在 {req.target_node_id} 上开始执行",
        operator="资源池管控",
        extra={"target_node": req.target_node_id},
    )

    clear_all_cache()
    return {
        "task_id": req.task_id,
        "status": "running",
        "target_node": req.target_node_id,
        "algorithm": req.algorithm,
        "message": f"任务已绑定至 {req.target_node_id}，使用 {req.algorithm} 聚合算法，状态更新为运行中。",
    }


class SecurityFeedbackRequest(BaseModel):
    """安全反馈的请求体"""
    task_id: str
    algorithm: str = "Bulyan"
    malicious_ratio: float = 35
    security_score: float = 0


@router.post("/tasks/flow/security-feedback")
async def security_feedback(req: SecurityFeedbackRequest):
    """
    流转接口③：安全评估 → 反馈评分
    根据算法决策引擎计算安全评分，反馈给调度中枢。

    改进点：记录安全评估日志 + 算法切换日志
    """
    from app.services.algorithm_decision_engine import (
        calculate_algorithm_security_score,
        recommend_algorithm,
    )

    # 计算当前算法的安全评分
    algo_score = calculate_algorithm_security_score(req.algorithm, req.malicious_ratio)

    # 如果安全评分低，推荐更好的算法
    recommended, reason = recommend_algorithm(req.malicious_ratio, algo_score)

    # 记录安全评估日志
    log_flow_event(
        task_id=req.task_id,
        action="security_feedback",
        detail=f"安全评估：算法 {req.algorithm} 评分 {algo_score}，推荐 {recommended}（评分 {calculate_algorithm_security_score(recommended, req.malicious_ratio)}）",
        operator="安全评估",
        extra={
            "current_algorithm": req.algorithm,
            "current_score": algo_score,
            "recommended_algorithm": recommended,
            "malicious_ratio": req.malicious_ratio,
            "need_upgrade": recommended != req.algorithm,
        },
    )

    # 如果需要算法切换，额外记录切换日志
    if recommended != req.algorithm:
        log_flow_event(
            task_id=req.task_id,
            action="algorithm_switched",
            detail=f"算法切换：{req.algorithm}（评分{algo_score}）→ {recommended}（评分{calculate_algorithm_security_score(recommended, req.malicious_ratio)}），原因：{reason}",
            operator="RL决策引擎",
            extra={"from": req.algorithm, "to": recommended},
        )

    return {
        "task_id": req.task_id,
        "current_algorithm": req.algorithm,
        "current_score": algo_score,
        "recommended_algorithm": recommended,
        "recommended_score": calculate_algorithm_security_score(recommended, req.malicious_ratio),
        "malicious_ratio": req.malicious_ratio,
        "need_upgrade": recommended != req.algorithm,
        "message": reason,
    }


# ============================================================
# 任务生命周期与状态查询接口
# ============================================================

@router.get("/tasks/{task_id}/timeline")
async def get_task_lifecycle_timeline(task_id: str):
    """
    获取任务的完整生命周期时间线

    返回该任务从录入到当前的所有流转日志，按时间正序排列。
    答辩时展示"任务怎么流转的"的核心数据。
    """
    timeline = get_task_timeline(task_id)
    current_state = get_task_current_state(task_id)

    return {
        "task_id": task_id,
        "current_state": current_state,
        "state_label": TASK_STATES.get(current_state, current_state),
        "timeline": timeline,
        "total_events": len(timeline),
    }


@router.get("/tasks/states/overview")
async def get_tasks_state_overview():
    """
    获取所有任务的状态概览

    返回各状态的任务数量统计 + 每个任务的最新动态。
    """
    tasks = get_tasks_by_state()

    # 按状态统计
    state_counts = {}
    for state_info in TASK_STATES:
        count = sum(1 for t in tasks if t["current_state"] == state_info)
        state_counts[state_info] = {
            "label": TASK_STATES[state_info],
            "count": count,
        }

    return {
        "state_machine": {
            "定义": "pending → scheduling → scheduled → running → completed/failed",
            "说明": {
                "pending": "任务已录入，待提交调度",
                "scheduling": "调度中枢评估中",
                "scheduled": "已选定节点和算法",
                "running": "任务执行中",
                "completed": "任务成功完成",
                "failed": "任务执行失败",
                "cancelled": "任务已取消",
            },
        },
        "state_counts": state_counts,
        "tasks": tasks,
    }


@router.post("/tasks/{task_id}/complete")
async def complete_task(task_id: str):
    """
    手动标记任务完成（演示用：模拟训练跑完）

    状态机推进：running → completed
    """
    ok, msg = set_task_state(task_id, "completed")
    if ok:
        log_flow_event(
            task_id=task_id,
            action="completed",
            detail="任务训练完成，最终精度 89%，50/50 轮",
            operator="训练监控",
            extra={"final_accuracy": 89, "total_rounds": 50},
        )
    return {"task_id": task_id, "success": ok, "message": msg}
