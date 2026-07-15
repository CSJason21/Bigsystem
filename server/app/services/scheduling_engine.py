"""
算力网络调度决策引擎
====================

这版实现尽量贴近通用调度器的工作方式：
1. Filter: 先做硬约束过滤，剔除不可用、资源不足、安全不过线、预测压力过高的节点。
2. Score: 对可行节点做多目标评分，融合资源感知、需求预测、安全态势、网络质量和公平性。
3. Reserve/Gang: 给出主承载节点、联邦学习参与节点组和资源预留建议。

算法仍保持可解释，不追求复杂黑盒模型；页面和答辩能清楚说明每个分数来自哪里。
"""
from __future__ import annotations

import random
from typing import Any


def _clamp(value: float, low: float = 0, high: float = 100) -> float:
    return max(low, min(high, float(value)))


def _round(value: float, digits: int = 1, low: float = 0, high: float = 100) -> float:
    return round(_clamp(value, low, high), digits)


SCORE_WEIGHTS = {
    "resource_fit": 0.20,
    "pressure": 0.16,
    "prediction": 0.14,
    "security": 0.18,
    "network": 0.10,
    "data_affinity": 0.07,
    "fragmentation": 0.05,
    "fairness": 0.05,
    "task_priority": 0.05,
}

FILTER_POLICY = {
    "min_trust_score": 60,
    "max_predicted_load": 90,
    "max_packet_loss_pct": 2.0,
    "reserve_cpu_ratio": 0.08,
    "reserve_memory_ratio": 0.08,
    "reserve_gpu_count": 0.25,
}


_MOCK_CANDIDATES = [
    {
        "node_id": "dc-guangdong-02",
        "node_name": "广东DC-2",
        "region_id": "prov_guangdong",
        "layer": "dc",
        "cpu_cores": 160,
        "gpu_count": 8,
        "memory_gb": 768,
        "bandwidth_total_gbps": 100,
        "cpu_usage_pct": 28,
        "memory_usage_pct": 42,
        "gpu_usage_pct": 36,
        "trust_score": 96,
        "health_score": 96,
        "predicted_load": 55,
        "latency_ms": 18,
        "jitter_ms": 1.8,
        "packet_loss_pct": 0.08,
        "running_tasks": 3,
        "status": "online",
    },
    {
        "node_id": "dc-shanghai-01",
        "node_name": "上海DC-1",
        "region_id": "prov_shanghai",
        "layer": "dc",
        "cpu_cores": 192,
        "gpu_count": 8,
        "memory_gb": 1024,
        "bandwidth_total_gbps": 100,
        "cpu_usage_pct": 45,
        "memory_usage_pct": 52,
        "gpu_usage_pct": 48,
        "trust_score": 92,
        "health_score": 92,
        "predicted_load": 68,
        "latency_ms": 24,
        "jitter_ms": 2.4,
        "packet_loss_pct": 0.12,
        "running_tasks": 5,
        "status": "online",
    },
    {
        "node_id": "dc-beijing-02",
        "node_name": "北京DC-2",
        "region_id": "prov_beijing",
        "layer": "dc",
        "cpu_cores": 160,
        "gpu_count": 6,
        "memory_gb": 768,
        "bandwidth_total_gbps": 80,
        "cpu_usage_pct": 38,
        "memory_usage_pct": 47,
        "gpu_usage_pct": 51,
        "trust_score": 94,
        "health_score": 94,
        "predicted_load": 60,
        "latency_ms": 21,
        "jitter_ms": 2.1,
        "packet_loss_pct": 0.1,
        "running_tasks": 4,
        "status": "online",
    },
    {
        "node_id": "dc-sichuan-01",
        "node_name": "四川DC-1",
        "region_id": "prov_sichuan",
        "layer": "dc",
        "cpu_cores": 128,
        "gpu_count": 4,
        "memory_gb": 512,
        "bandwidth_total_gbps": 60,
        "cpu_usage_pct": 52,
        "memory_usage_pct": 56,
        "gpu_usage_pct": 63,
        "trust_score": 87,
        "health_score": 88,
        "predicted_load": 72,
        "latency_ms": 33,
        "jitter_ms": 3.2,
        "packet_loss_pct": 0.18,
        "running_tasks": 6,
        "status": "online",
    },
    {
        "node_id": "edge-xian-01",
        "node_name": "西安边缘-1",
        "region_id": "prov_shaanxi",
        "layer": "edge",
        "cpu_cores": 96,
        "gpu_count": 4,
        "memory_gb": 384,
        "bandwidth_total_gbps": 20,
        "cpu_usage_pct": 20,
        "memory_usage_pct": 35,
        "gpu_usage_pct": 28,
        "trust_score": 58,
        "health_score": 65,
        "predicted_load": 45,
        "latency_ms": 42,
        "jitter_ms": 5.6,
        "packet_loss_pct": 0.45,
        "running_tasks": 1,
        "status": "warning",
    },
]


def _normalize_node(node: dict[str, Any]) -> dict[str, Any]:
    cpu_usage = _clamp(node.get("cpu_usage_pct", node.get("cpu_pct", 50)))
    memory_usage = _clamp(node.get("memory_usage_pct", node.get("memory_pct", cpu_usage)))
    gpu_usage = _clamp(node.get("gpu_usage_pct", node.get("gpu_pct", cpu_usage)))
    predicted_load = node.get("predicted_load")
    if predicted_load is None:
        recent_cpu = float(node.get("recent_cpu_avg") or cpu_usage)
        predicted_load = cpu_usage + (cpu_usage - recent_cpu) * 0.6 + random.uniform(2, 8)

    trust_score = node.get("trust_score")
    if trust_score is None:
        trust_score = node.get("health_score") or node.get("task_success_rate", 0.9) * 100

    return {
        **node,
        "node_id": str(node.get("node_id")),
        "node_name": node.get("node_name") or node.get("node_id"),
        "region_id": node.get("region_id") or "unknown",
        "layer": node.get("layer") or "dc",
        "status": node.get("status") or "online",
        "cpu_cores": float(node.get("cpu_cores") or 0),
        "gpu_count": float(node.get("gpu_count") or 0),
        "memory_gb": float(node.get("memory_gb") or node.get("memory_total_gb") or 0),
        "bandwidth_total_gbps": float(node.get("bandwidth_total_gbps") or 10),
        "cpu_usage_pct": cpu_usage,
        "memory_usage_pct": memory_usage,
        "gpu_usage_pct": gpu_usage,
        "predicted_load": _clamp(predicted_load),
        "trust_score": _clamp(trust_score),
        "health_score": _clamp(node.get("health_score", trust_score)),
        "latency_ms": float(node.get("latency_ms") or 30),
        "jitter_ms": float(node.get("jitter_ms") or 2),
        "packet_loss_pct": float(node.get("packet_loss_pct") or 0),
        "running_tasks": int(node.get("running_tasks") or 0),
    }


def _available_resources(node: dict[str, Any]) -> dict[str, float]:
    cpu_reserved = node["cpu_cores"] * FILTER_POLICY["reserve_cpu_ratio"]
    mem_reserved = node["memory_gb"] * FILTER_POLICY["reserve_memory_ratio"]
    gpu_reserved = min(node["gpu_count"], FILTER_POLICY["reserve_gpu_count"])
    return {
        "cpu": max(0, node["cpu_cores"] * (1 - node["cpu_usage_pct"] / 100) - cpu_reserved),
        "memory": max(0, node["memory_gb"] * (1 - node["memory_usage_pct"] / 100) - mem_reserved),
        "gpu": max(0, node["gpu_count"] * (1 - node["gpu_usage_pct"] / 100) - gpu_reserved),
    }


def _filter_candidate(node: dict[str, Any], task_req: dict[str, Any]) -> tuple[bool, list[str], dict[str, float]]:
    req_cpu = float(task_req.get("cpu") or 8)
    req_gpu = float(task_req.get("gpu") or 0)
    req_memory = float(task_req.get("memory") or 32)
    available = _available_resources(node)
    reasons: list[str] = []
    priority = str(task_req.get("priority") or "").lower()
    max_predicted_load = FILTER_POLICY["max_predicted_load"] + (
        5 if priority in {"urgent", "high", "高"} else -5 if priority in {"low", "低"} else 0
    )

    if node["status"] != "online":
        reasons.append("节点非在线状态")
    if task_req.get("anti_affinity_node_id") and task_req.get("anti_affinity_node_id") == node["node_id"]:
        reasons.append("anti-affinity constraint")
    if task_req.get("strict_region") and task_req.get("affinity_region_id") and task_req.get("affinity_region_id") != node["region_id"]:
        reasons.append("region constraint mismatch")
    if available["cpu"] < req_cpu:
        reasons.append(f"CPU可用{available['cpu']:.1f}核低于需求{req_cpu:.1f}核")
    if available["memory"] < req_memory:
        reasons.append(f"内存可用{available['memory']:.1f}GB低于需求{req_memory:.1f}GB")
    if available["gpu"] < req_gpu:
        reasons.append(f"GPU可用{available['gpu']:.1f}张低于需求{req_gpu:.1f}张")
    if node["trust_score"] < FILTER_POLICY["min_trust_score"]:
        reasons.append(f"可信度{node['trust_score']:.1f}低于安全阈值")
    if node["predicted_load"] > max_predicted_load:
        reasons.append(f"预测负载{node['predicted_load']:.1f}%超过阈值")
    if node["packet_loss_pct"] > FILTER_POLICY["max_packet_loss_pct"]:
        reasons.append(f"丢包率{node['packet_loss_pct']:.2f}%超过阈值")

    return len(reasons) == 0, reasons, available


def _ratio_score(available: float, required: float) -> tuple[float, float]:
    if required <= 0:
        return 88.0, 1.5
    ratio = available / max(required, 0.1)
    if ratio < 1:
        return ratio * 60, ratio
    if ratio <= 1.8:
        return 72 + (ratio - 1) * 28 / 0.8, ratio
    # 资源远超需求时适度扣分，避免小任务占用大节点造成碎片。
    return max(82, 100 - min((ratio - 1.8) * 7, 18)), ratio


def _score_candidate(node: dict[str, Any], task_req: dict[str, Any], available: dict[str, float]) -> dict[str, Any]:
    req_cpu = float(task_req.get("cpu") or 8)
    req_gpu = float(task_req.get("gpu") or 0)
    req_memory = float(task_req.get("memory") or 32)
    affinity_region = task_req.get("affinity_region_id")
    priority = str(task_req.get("priority") or "").lower()

    cpu_score, cpu_ratio = _ratio_score(available["cpu"], req_cpu)
    gpu_score, gpu_ratio = _ratio_score(available["gpu"], req_gpu)
    mem_score, mem_ratio = _ratio_score(available["memory"], req_memory)
    resource_fit = _round(min(cpu_score, gpu_score, mem_score))
    match_ratio = round(min(cpu_ratio, gpu_ratio, mem_ratio) * 100, 1)
    oversize_ratio = max(cpu_ratio, gpu_ratio if req_gpu > 0 else 1, mem_ratio)
    fragmentation = _round(100 - max(oversize_ratio - 2.0, 0) * 12)

    pressure = _round(100 - (node["cpu_usage_pct"] * 0.45 + node["memory_usage_pct"] * 0.30 + node["gpu_usage_pct"] * 0.25))
    prediction = _round(100 - node["predicted_load"])
    security = _round(node["trust_score"] * 0.65 + node["health_score"] * 0.25 - node["packet_loss_pct"] * 8 - node["jitter_ms"] * 1.2)
    network = _round(100 - min(node["latency_ms"], 100) * 0.55 - min(node["packet_loss_pct"], 5) * 8 + min(node["bandwidth_total_gbps"], 100) * 0.12)
    fairness = _round(100 - min(node["running_tasks"], 20) * 4)
    locality = 92.0 if affinity_region and affinity_region == node["region_id"] else 78.0 if node["layer"] == "dc" else 68.0
    priority_score = 96.0 if priority in {"urgent", "high", "高"} else 84.0 if priority in {"medium", "normal", "中"} else 72.0

    risk_penalty = _round(
        max(node["predicted_load"] - 75, 0) * 0.45
        + max(70 - node["trust_score"], 0) * 0.5
        + max(node["latency_ms"] - 50, 0) * 0.25
        + node["packet_loss_pct"] * 3,
        0,
        30,
    )

    total = sum(
        [
            SCORE_WEIGHTS["resource_fit"] * resource_fit,
            SCORE_WEIGHTS["pressure"] * pressure,
            SCORE_WEIGHTS["prediction"] * prediction,
            SCORE_WEIGHTS["security"] * security,
            SCORE_WEIGHTS["network"] * network,
            SCORE_WEIGHTS["data_affinity"] * locality,
            SCORE_WEIGHTS["fragmentation"] * fragmentation,
            SCORE_WEIGHTS["fairness"] * fairness,
            SCORE_WEIGHTS["task_priority"] * priority_score,
        ]
    ) - risk_penalty

    return {
        "node_id": node["node_id"],
        "node_name": node["node_name"],
        "region_id": node["region_id"],
        "layer": node["layer"],
        "status": node["status"],
        "cpu_usage_pct": round(node["cpu_usage_pct"], 1),
        "memory_usage_pct": round(node["memory_usage_pct"], 1),
        "gpu_usage_pct": round(node["gpu_usage_pct"], 1),
        "cpu_cores": node["cpu_cores"],
        "gpu_count": node["gpu_count"],
        "memory_gb": node["memory_gb"],
        "available_cpu": round(available["cpu"], 1),
        "available_gpu": round(available["gpu"], 1),
        "available_memory": round(available["memory"], 1),
        "trust_score": round(node["trust_score"], 1),
        "health_score": round(node["health_score"], 1),
        "predicted_load": round(node["predicted_load"], 1),
        "latency_ms": round(node["latency_ms"], 1),
        "jitter_ms": round(node["jitter_ms"], 2),
        "packet_loss_pct": round(node["packet_loss_pct"], 2),
        "running_tasks": node["running_tasks"],
        "resource_fit_score": resource_fit,
        "pressure_score": pressure,
        "prediction_score": prediction,
        "security_score": security,
        "network_score": network,
        "fairness_score": fairness,
        "locality_score": locality,
        "data_affinity_score": locality,
        "fragmentation_score": fragmentation,
        "priority_score": priority_score,
        "risk_penalty": risk_penalty,
        "match_score": resource_fit,
        "match_ratio": match_ratio,
        "load_score": pressure,
        "trust_score_eval": security,
        "total_score": round(_clamp(total), 1),
        "load_source": "资源感知：ts_node_metric 最新 CPU/内存/GPU",
        "predict_source": "需求预测：近期趋势外推的未来负载压力",
        "trust_source": "量化安全：health_score/可信度/丢包/抖动",
        "network_source": "链路质量：时延、抖动、丢包、带宽",
        "decision": "eligible",
    }


def _build_participant_group(scored: list[dict[str, Any]], task_req: dict[str, Any]) -> list[dict[str, Any]]:
    task_type = str(task_req.get("task_type") or "").lower()
    required_gpu = float(task_req.get("gpu") or 0)
    group_size = 3 if "federated" in task_type or "fed" in task_type or required_gpu >= 2 else 1
    return [
        {
            "node_id": item["node_id"],
            "node_name": item["node_name"],
            "role": "aggregator" if index == 0 else "participant",
            "score": item["total_score"],
            "reserve": {
                "cpu": round(float(task_req.get("cpu") or 8) / max(group_size, 1), 1),
                "memory": round(float(task_req.get("memory") or 32) / max(group_size, 1), 1),
                "gpu": round(float(task_req.get("gpu") or 0) / max(group_size, 1), 1),
            },
        }
        for index, item in enumerate(scored[:group_size])
    ]


def evaluate_candidates(candidates: list[dict[str, Any]], task_req: dict[str, Any]) -> dict[str, Any]:
    normalized = [_normalize_node(node) for node in candidates]
    scored: list[dict[str, Any]] = []
    filtered_out: list[dict[str, Any]] = []

    for node in normalized:
        eligible, reasons, available = _filter_candidate(node, task_req)
        if not eligible:
            filtered_out.append({
                "node_id": node["node_id"],
                "node_name": node["node_name"],
                "reasons": reasons,
                "available": {key: round(value, 1) for key, value in available.items()},
                "trust_score": round(node["trust_score"], 1),
                "predicted_load": round(node["predicted_load"], 1),
            })
            continue
        scored.append(_score_candidate(node, task_req, available))

    # 如果硬过滤过严导致没有节点，降级为“解释性打分”，但标注为降级模式。
    degraded = False
    if not scored:
        degraded = True
        for node in normalized:
            _eligible, _reasons, available = _filter_candidate(node, task_req)
            item = _score_candidate(node, task_req, available)
            item["decision"] = "fallback_scored"
            scored.append(item)

    scored.sort(key=lambda item: item["total_score"], reverse=True)
    for index, item in enumerate(scored, start=1):
        item["rank_no"] = index

    selected = scored[0] if scored else None
    participant_group = _build_participant_group(scored, task_req) if selected else []

    decision_basis = ""
    if selected:
        decision_basis = (
            f"采用 Filter-Score-Reserve 调度流程。硬过滤后保留 {len(scored)} 个可行节点，"
            f"剔除 {len(filtered_out)} 个节点。{selected['node_name']} 综合评分 {selected['total_score']}，"
            f"资源匹配 {selected['resource_fit_score']}、当前压力 {selected['pressure_score']}、"
            f"预测余量 {selected['prediction_score']}、安全可信 {selected['security_score']}、"
            f"网络质量 {selected['network_score']}。"
        )
        if participant_group and len(participant_group) > 1:
            decision_basis += f" 联邦任务按 Gang 思路同步推荐 {len(participant_group)} 个参与节点，避免只选择单点。"
        if degraded:
            decision_basis += " 注意：本次硬过滤无完全可行节点，已进入降级评分模式，需要人工确认或扩容。"

    return {
        "algorithm": {
            "name": "PredictiveSecureMultiObjectiveScheduler",
            "version": "v2",
            "mode": "Filter-Score-Reserve + Gang/Binpack/DRF-lite",
        },
        "formula": (
            "总分 = 0.25×资源匹配 + 0.20×当前压力 + 0.15×预测余量 + "
            "0.20×安全可信 + 0.10×网络质量 + 0.05×公平性 + 0.05×区域亲和 - 风险扣分"
        ),
        "weights": SCORE_WEIGHTS,
        "filter_policy": FILTER_POLICY,
        "filter_summary": {
            "input_count": len(candidates),
            "eligible_count": len(scored),
            "filtered_count": len(filtered_out),
            "degraded": degraded,
        },
        "filtered_out": filtered_out,
        "scored_candidates": scored,
        "selected_node": selected,
        "participant_group": participant_group,
        "reservation_plan": participant_group,
        "decision_basis": decision_basis,
        "explain_steps": [
            "Filter：在线状态、资源余量、安全阈值、预测负载、网络丢包硬约束。",
            "Score：融合资源感知、需求预测、量化安全、网络质量、公平性和区域亲和。",
            "Reserve：对推荐节点组生成资源预留建议，后续执行调度时写入分配表。",
        ],
    }


def get_mock_candidates() -> list[dict[str, Any]]:
    result = []
    for node in _MOCK_CANDIDATES:
        n = dict(node)
        n["cpu_usage_pct"] = _clamp(n["cpu_usage_pct"] + random.uniform(-5, 5), 5, 95)
        n["memory_usage_pct"] = _clamp(n["memory_usage_pct"] + random.uniform(-4, 4), 5, 95)
        n["gpu_usage_pct"] = _clamp(n["gpu_usage_pct"] + random.uniform(-6, 6), 5, 98)
        n["predicted_load"] = _clamp(n["predicted_load"] + random.uniform(-3, 3), 10, 95)
        result.append(n)
    return result
