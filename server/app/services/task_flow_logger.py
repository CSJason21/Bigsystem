"""
任务流转日志服务
==============================

核心功能：
1. 记录每个任务从录入到结束的完整生命周期轨迹
2. 支持查询任务的流转历史（时间线）
3. 支持状态机校验（防止非法状态跳转）

状态机定义：
    pending(待分配) → scheduling(调度中) → scheduled(已分配) → running(运行中) → completed(已完成)
    任何状态都可以 → cancelled(已取消)
    running 可以 → failed(失败)

设计原则：
    - 使用内存存储（演示够用，不依赖额外数据库表）
    - 每次状态变更自动记录日志
    - 日志包含：时间、动作、详情、操作者
"""
import time
from datetime import datetime
from typing import Any

# ============================================================
# 任务状态机定义
# ============================================================

# 合法的状态值
TASK_STATES = {
    "pending": "待分配",        # 任务刚录入，等待提交调度
    "scheduling": "调度中",      # 已提交调度中枢，正在评估
    "scheduled": "已分配",       # 调度完成，已选定节点和算法
    "running": "运行中",         # 任务正在执行
    "completed": "已完成",       # 任务成功结束
    "failed": "失败",            # 任务执行失败
    "cancelled": "已取消",       # 任务被取消
}

# 合法的状态转换（key: 当前状态 → value: 允许转换到的状态列表）
VALID_TRANSITIONS = {
    "pending":    ["scheduling", "cancelled"],
    "scheduling": ["scheduled", "cancelled", "pending"],
    "scheduled":  ["running", "cancelled"],
    "running":    ["completed", "failed"],
    "completed":  [],
    "failed":     [],
    "cancelled":  [],
}


def is_valid_transition(from_state: str, to_state: str) -> bool:
    """检查状态转换是否合法"""
    allowed = VALID_TRANSITIONS.get(from_state, [])
    return to_state in allowed


# ============================================================
# 内存存储（任务流转日志）
# ============================================================

# key: task_id → value: 该任务的流转日志列表
_flow_logs: dict[str, list[dict]] = {}

# key: task_id → value: 当前状态
_task_states: dict[str, str] = {}


def log_flow_event(
    task_id: str,
    action: str,
    detail: str = "",
    operator: str = "system",
    extra: dict | None = None,
) -> dict:
    """
    记录一条任务流转日志

    参数：
        task_id: 任务ID
        action: 动作类型（created/submitted/scheduled/algorithm_decided/started/alert/completed/failed）
        detail: 详情说明
        operator: 操作者（system/运营员/调度中枢）
        extra: 额外数据（如节点ID、算法名、评分等）

    返回：日志记录字典
    """
    now = datetime.now()
    record = {
        "timestamp": now.strftime("%H:%M:%S"),
        "datetime": now.strftime("%Y-%m-%d %H:%M:%S"),
        "task_id": task_id,
        "action": action,
        "detail": detail,
        "operator": operator,
        "extra": extra or {},
    }

    if task_id not in _flow_logs:
        _flow_logs[task_id] = []
    _flow_logs[task_id].append(record)

    return record


def get_task_timeline(task_id: str) -> list[dict]:
    """
    获取任务的完整生命周期时间线

    返回该任务的所有流转日志，按时间正序排列
    """
    return _flow_logs.get(task_id, [])


def get_task_current_state(task_id: str) -> str:
    """获取任务当前状态"""
    return _task_states.get(task_id, "pending")


def set_task_state(task_id: str, new_state: str) -> tuple[bool, str]:
    """
    更新任务状态（带状态机校验）

    返回：(是否成功, 说明消息)
    """
    old_state = get_task_current_state(task_id)

    # 校验状态转换是否合法
    if not is_valid_transition(old_state, new_state):
        return False, f"非法状态转换：{old_state}({TASK_STATES.get(old_state)}) → {new_state}({TASK_STATES.get(new_state)})"

    _task_states[task_id] = new_state
    return True, f"状态更新：{TASK_STATES.get(old_state)} → {TASK_STATES.get(new_state)}"


def init_task(task_id: str, task_name: str = "", params: dict | None = None):
    """
    初始化任务（任务录入时调用）

    记录创建日志 + 设置初始状态为 pending
    """
    if task_id not in _task_states:
        _task_states[task_id] = "pending"

    log_flow_event(
        task_id=task_id,
        action="created",
        detail=f"任务「{task_name or task_id}」已录入",
        operator="运营员",
        extra=params or {},
    )


def get_all_task_timelines() -> dict[str, list[dict]]:
    """获取所有任务的流转日志（调试用）"""
    return _flow_logs


def get_tasks_by_state(state: str | None = None) -> list[dict]:
    """
    获取任务列表，可按状态过滤

    返回：[{task_id, current_state, state_label, log_count, latest_action, latest_time}]
    """
    result = []
    for task_id, logs in _flow_logs.items():
        current_state = get_task_current_state(task_id)
        if state and current_state != state:
            continue
        latest = logs[-1] if logs else {}
        result.append({
            "task_id": task_id,
            "current_state": current_state,
            "state_label": TASK_STATES.get(current_state, current_state),
            "log_count": len(logs),
            "latest_action": latest.get("action", ""),
            "latest_detail": latest.get("detail", ""),
            "latest_time": latest.get("timestamp", ""),
        })
    return result
