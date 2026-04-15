from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional
import random
import time
import uuid

router = APIRouter()


class TaskCreate(BaseModel):
    """Schema for creating a new task."""
    name: str
    type: str = "training"
    priority: str = "normal"
    resource_requirements: Optional[dict] = None
    description: Optional[str] = None


# In-memory mock task store
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


@router.get("/tasks")
async def get_tasks(
    status: Optional[str] = None,
    task_type: Optional[str] = None,
):
    """Get all tasks with optional filtering."""
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
    """Create a new computing task."""
    new_task = {
        "task_id": str(uuid.uuid4()),
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
    return new_task


@router.get("/tasks/{task_id}")
async def get_task(task_id: str):
    """Get details of a specific task."""
    for t in _mock_tasks:
        if t["task_id"] == task_id:
            return t
    return {"error": "Task not found"}


@router.get("/tasks/prediction/demand")
async def get_demand_prediction(period: str = "daily"):
    """Get resource demand prediction data."""
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



