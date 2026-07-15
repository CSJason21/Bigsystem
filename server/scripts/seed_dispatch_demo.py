from __future__ import annotations

import math
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Iterable

from dotenv import load_dotenv
from sqlalchemy import create_engine, text


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
load_dotenv(ROOT / ".env")

from app.core.config import settings  # noqa: E402


SOURCE = "dispatch_demo"
TASK_ID = "task-fedtrain-99943"
TARGET_NODE_ID = "dc-guangdong-02"

HUBS = [
    ("hub_jingjinji", "京津冀枢纽", "华北调度枢纽", 1),
    ("hub_yangtze_delta", "长三角枢纽", "华东调度枢纽", 2),
    ("hub_greater_bay", "粤港澳枢纽", "华南调度枢纽", 3),
    ("hub_chengyu", "成渝枢纽", "西部调度枢纽", 4),
]

REGION_CENTERS = [
    ("region_tianjin", "天津区域中心", "hub_jingjinji", 11),
    ("region_hohhot", "呼和浩特区域中心", "hub_jingjinji", 12),
    ("region_harbin", "哈尔滨区域中心", "hub_jingjinji", 13),
    ("region_qingdao", "青岛区域中心", "hub_yangtze_delta", 21),
    ("region_wuhan", "武汉区域中心", "hub_yangtze_delta", 22),
    ("region_gui_an", "贵安区域中心", "hub_greater_bay", 31),
    ("region_zhongwei", "中卫区域中心", "hub_chengyu", 41),
    ("region_xian", "西安区域中心", "hub_chengyu", 42),
]

PROVINCES = [
    ("prov_beijing", "北京", "region_tianjin"),
    ("prov_tianjin", "天津", "region_tianjin"),
    ("prov_hebei", "河北", "region_tianjin"),
    ("prov_shanxi", "山西", "region_hohhot"),
    ("prov_neimenggu", "内蒙古", "region_hohhot"),
    ("prov_ningxia", "宁夏", "region_hohhot"),
    ("prov_liaoning", "辽宁", "region_harbin"),
    ("prov_jilin", "吉林", "region_harbin"),
    ("prov_heilongjiang", "黑龙江", "region_harbin"),
    ("prov_shandong", "山东", "region_qingdao"),
    ("prov_jiangsu", "江苏", "region_qingdao"),
    ("prov_shanghai", "上海", "region_qingdao"),
    ("prov_zhejiang", "浙江", "region_qingdao"),
    ("prov_fujian", "福建", "region_qingdao"),
    ("prov_anhui", "安徽", "region_wuhan"),
    ("prov_jiangxi", "江西", "region_wuhan"),
    ("prov_henan", "河南", "region_wuhan"),
    ("prov_hubei", "湖北", "region_wuhan"),
    ("prov_hunan", "湖南", "region_wuhan"),
    ("prov_guangdong", "广东", "region_gui_an"),
    ("prov_guangxi", "广西", "region_gui_an"),
    ("prov_hainan", "海南", "region_gui_an"),
    ("prov_guizhou", "贵州", "region_gui_an"),
    ("prov_yunnan", "云南", "region_gui_an"),
    ("prov_gansu", "甘肃", "region_zhongwei"),
    ("prov_qinghai", "青海", "region_zhongwei"),
    ("prov_xinjiang", "新疆", "region_zhongwei"),
    ("prov_xizang", "西藏", "region_zhongwei"),
    ("prov_shaanxi", "陕西", "region_xian"),
    ("prov_sichuan", "四川", "region_xian"),
    ("prov_chongqing", "重庆", "region_xian"),
]

LEGACY_REGION_CENTERS = [
    "region_north_01",
    "region_north_02",
    "region_east_01",
    "region_east_02",
    "region_south_01",
    "region_central_01",
    "region_west_01",
    "region_west_02",
]

CITY_DCS = {
    "prov_beijing": ["朝阳 DC", "亦庄 DC", "昌平 DC", "房山 DC"],
    "prov_tianjin": ["滨海 DC", "武清 DC", "西青 DC"],
    "prov_hebei": ["石家庄 DC", "廊坊 DC", "张家口 DC"],
    "prov_shanxi": ["太原 DC", "大同 DC"],
    "prov_neimenggu": ["呼和浩特 DC", "鄂尔多斯 DC"],
    "prov_ningxia": ["银川 DC", "中卫 DC"],
    "prov_liaoning": ["沈阳 DC", "大连 DC"],
    "prov_jilin": ["长春 DC", "吉林 DC"],
    "prov_heilongjiang": ["哈尔滨 DC", "大庆 DC"],
    "prov_shandong": ["青岛 DC", "济南 DC", "烟台 DC"],
    "prov_jiangsu": ["南京 DC", "苏州 DC", "无锡 DC"],
    "prov_shanghai": ["浦东 DC", "临港 DC", "松江 DC", "嘉定 DC"],
    "prov_zhejiang": ["杭州 DC", "宁波 DC", "嘉兴 DC"],
    "prov_fujian": ["福州 DC", "厦门 DC"],
    "prov_anhui": ["合肥 DC", "芜湖 DC"],
    "prov_jiangxi": ["南昌 DC", "赣州 DC"],
    "prov_henan": ["郑州 DC", "洛阳 DC", "许昌 DC"],
    "prov_hubei": ["武汉 DC", "襄阳 DC", "宜昌 DC"],
    "prov_hunan": ["长沙 DC", "株洲 DC", "衡阳 DC"],
    "prov_guangdong": ["广州 DC", "深圳 DC", "佛山 DC", "东莞 DC"],
    "prov_guangxi": ["南宁 DC", "柳州 DC"],
    "prov_hainan": ["海口 DC"],
    "prov_guizhou": ["贵安 DC", "贵阳 DC", "遵义 DC"],
    "prov_yunnan": ["昆明 DC", "大理 DC"],
    "prov_gansu": ["兰州 DC", "庆阳 DC"],
    "prov_qinghai": ["西宁 DC"],
    "prov_xinjiang": ["乌鲁木齐 DC", "克拉玛依 DC"],
    "prov_xizang": ["拉萨 DC"],
    "prov_shaanxi": ["西安 DC", "榆林 DC", "咸阳 DC"],
    "prov_sichuan": ["成都 DC", "绵阳 DC", "宜宾 DC"],
    "prov_chongqing": ["两江 DC", "西永 DC", "永川 DC"],
}


def province_slug(province_id: str) -> str:
    return province_id.removeprefix("prov_").replace("_", "-")


def city_id_for(province_id: str, dc_index: int) -> str:
    return f"city-{province_slug(province_id)}-{dc_index:02d}"


def dc_id_for(province_id: str, dc_index: int) -> str:
    return f"dc-{province_slug(province_id)}-{dc_index:02d}"


def city_name_from_dc(dc_name: str) -> str:
    return dc_name.removesuffix(" DC")


def dc_names_for(province_id: str) -> list[str]:
    return CITY_DCS.get(province_id, [f"{province_id} DC-01"])


def demo_dc_ids() -> list[str]:
    ids: list[str] = []
    for province_id, _province_name, _region_id in PROVINCES:
        ids.extend(dc_id_for(province_id, dc_index) for dc_index in range(1, len(dc_names_for(province_id)) + 1))
    return ids


def demo_city_region_ids() -> list[str]:
    ids: list[str] = []
    for province_id, _province_name, _region_id in PROVINCES:
        ids.extend(city_id_for(province_id, dc_index) for dc_index in range(1, len(dc_names_for(province_id)) + 1))
    return ids


def demo_region_ids() -> list[str]:
    return (
        ["china"]
        + [hub[0] for hub in HUBS]
        + [region[0] for region in REGION_CENTERS]
        + [province[0] for province in PROVINCES]
        + demo_city_region_ids()
        + LEGACY_REGION_CENTERS
    )


def demo_view_ids() -> list[str]:
    legacy_hub_views = [hub[0] for hub in HUBS]
    return ["global", "node"] + [region[0] for region in REGION_CENTERS] + [province[0] for province in PROVINCES] + legacy_hub_views


def demo_vertex_ids() -> list[str]:
    return (
        ["national-center"]
        + [hub[0] for hub in HUBS]
        + [region[0] for region in REGION_CENTERS]
        + LEGACY_REGION_CENTERS
        + [province[0] for province in PROVINCES]
        + demo_dc_ids()
    )


def clamp(value: float, minimum: float, maximum: float) -> float:
    return min(maximum, max(minimum, value))


def execute_many(conn, sql: str, rows: Iterable[dict]) -> None:
    for row in rows:
        conn.execute(text(sql), row)


def ensure_schema(conn) -> None:
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS dim_topology_view_vertex (
          id BIGSERIAL PRIMARY KEY,
          view_id VARCHAR(50) NOT NULL REFERENCES dim_topology_view(view_id),
          vertex_id VARCHAR(50) NOT NULL REFERENCES dim_topology_vertex(vertex_id),
          display_order INT DEFAULT 0,
          is_visible BOOLEAN DEFAULT TRUE,
          UNIQUE(view_id, vertex_id)
        )
    """))
    conn.execute(text("ALTER TABLE dim_topology_view ADD COLUMN IF NOT EXISTS node_id VARCHAR(50)"))
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS fact_task_candidate_score (
          score_id BIGSERIAL PRIMARY KEY,
          task_id VARCHAR(64) NOT NULL,
          candidate_node_id VARCHAR(50) NOT NULL,
          score_total DOUBLE PRECISION,
          score_resource_fit DOUBLE PRECISION,
          score_latency DOUBLE PRECISION,
          score_bandwidth DOUBLE PRECISION,
          score_balance DOUBLE PRECISION,
          score_risk DOUBLE PRECISION,
          score_time TIMESTAMPTZ DEFAULT NOW(),
          rank_no INT,
          source_type VARCHAR(30) DEFAULT 'dispatch_demo'
        )
    """))
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS fact_security_overview_snapshot (
          snapshot_id BIGSERIAL PRIMARY KEY,
          view_id VARCHAR(50),
          snapshot_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          grade VARCHAR(10),
          data_score DOUBLE PRECISION,
          algorithm_score DOUBLE PRECISION,
          network_score DOUBLE PRECISION,
          system_score DOUBLE PRECISION,
          ds_confidence DOUBLE PRECISION,
          pc1_ratio DOUBLE PRECISION,
          pc1_driver VARCHAR(100),
          pc2_ratio DOUBLE PRECISION,
          pc2_driver VARCHAR(100),
          explanation TEXT,
          source_type VARCHAR(30) DEFAULT 'dispatch_demo'
        )
    """))
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS fact_strategy_eval_run (
          eval_run_id BIGSERIAL PRIMARY KEY,
          task_id VARCHAR(64),
          strategy_name VARCHAR(80),
          attack_type VARCHAR(50),
          malicious_ratio DOUBLE PRECISION,
          selected_algorithm VARCHAR(50),
          decision_mode VARCHAR(30),
          reason TEXT,
          run_time TIMESTAMPTZ DEFAULT NOW(),
          source_type VARCHAR(30) DEFAULT 'dispatch_demo'
        )
    """))
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS fact_strategy_eval_metric (
          metric_id BIGSERIAL PRIMARY KEY,
          eval_run_id BIGINT REFERENCES fact_strategy_eval_run(eval_run_id) ON DELETE CASCADE,
          algorithm_name VARCHAR(50),
          round_no INT,
          accuracy DOUBLE PRECISION,
          loss_value DOUBLE PRECISION,
          metric_role VARCHAR(30) DEFAULT 'accuracy'
        )
    """))


def cleanup(conn) -> None:
    view_ids = demo_view_ids()
    region_ids = demo_region_ids()
    seed_dc_ids = demo_dc_ids()
    existing_dc_rows = conn.execute(
        text("""
            SELECT node_id
            FROM dim_compute_node
            WHERE source_type = :source OR node_id = ANY(:node_ids)
        """),
        {"source": SOURCE, "node_ids": seed_dc_ids},
    ).mappings().all()
    dc_ids = sorted({*seed_dc_ids, *(str(row["node_id"]) for row in existing_dc_rows if row.get("node_id"))})
    vertex_ids = sorted({*demo_vertex_ids(), *dc_ids})

    conn.execute(text("DELETE FROM fact_strategy_eval_metric WHERE eval_run_id IN (SELECT eval_run_id FROM fact_strategy_eval_run WHERE task_id = :task_id)"), {"task_id": TASK_ID})
    conn.execute(text("DELETE FROM fact_strategy_eval_run WHERE task_id = :task_id"), {"task_id": TASK_ID})
    conn.execute(text("DELETE FROM fact_security_overview_snapshot WHERE view_id = 'global'"))
    conn.execute(text("DELETE FROM fact_schedule_log WHERE task_id = :task_id"), {"task_id": TASK_ID})
    conn.execute(text("DELETE FROM fact_task_candidate_score WHERE task_id = :task_id"), {"task_id": TASK_ID})
    conn.execute(text("DELETE FROM fact_task_assignment WHERE task_id = :task_id"), {"task_id": TASK_ID})
    conn.execute(text("DELETE FROM fact_task_requirement WHERE task_id = :task_id"), {"task_id": TASK_ID})
    conn.execute(text("DELETE FROM fact_federated_task WHERE task_id = :task_id"), {"task_id": TASK_ID})
    conn.execute(text("DELETE FROM fact_task WHERE task_id = :task_id"), {"task_id": TASK_ID})
    conn.execute(text("DELETE FROM fact_alert_record WHERE node_id = ANY(:node_ids)"), {"node_ids": dc_ids})
    conn.execute(text("DELETE FROM fact_topology_runtime_state WHERE vertex_id = ANY(:vertex_ids)"), {"vertex_ids": vertex_ids})
    conn.execute(text("DELETE FROM ts_node_metric WHERE node_id = ANY(:node_ids)"), {"node_ids": dc_ids})
    for table in ["dim_topology_view_vertex", "dim_topology_layout"]:
        conn.execute(text("""
            DELETE FROM %s
            WHERE view_id = ANY(:view_ids)
        """ % table), {"view_ids": view_ids})
    conn.execute(text("DELETE FROM dim_topology_edge WHERE source_vertex_id = ANY(:vertex_ids) OR target_vertex_id = ANY(:vertex_ids)"), {"vertex_ids": vertex_ids})
    conn.execute(text("DELETE FROM dim_topology_vertex WHERE vertex_id = ANY(:vertex_ids)"), {"vertex_ids": vertex_ids})
    conn.execute(text("DELETE FROM dim_compute_node WHERE node_id = ANY(:node_ids)"), {"node_ids": dc_ids})
    conn.execute(text("DELETE FROM dim_topology_view WHERE view_id = ANY(:view_ids)"), {"view_ids": view_ids})
    conn.execute(text("DELETE FROM dim_region WHERE region_id = ANY(:region_ids)"), {"region_ids": region_ids})


def upsert_region(conn, region_id: str, name: str, level: str, parent_id: str | None, order: int) -> None:
    conn.execute(text("""
        INSERT INTO dim_region (region_id, region_name, region_level, parent_region_id, display_order, is_active)
        VALUES (:id, :name, :level, :parent, :display_order, TRUE)
        ON CONFLICT (region_id) DO UPDATE SET
          region_name = EXCLUDED.region_name,
          region_level = EXCLUDED.region_level,
          parent_region_id = EXCLUDED.parent_region_id,
          display_order = EXCLUDED.display_order,
          is_active = TRUE,
          updated_at = NOW()
    """), {"id": region_id, "name": name, "level": level, "parent": parent_id, "display_order": order})


def upsert_vertex(conn, vertex_id: str, vertex_type: str, role: str, name: str, subtitle: str, region_id: str | None, compute_node_id: str | None = None, schedulable: bool = False) -> None:
    conn.execute(text("""
        INSERT INTO dim_topology_vertex (
          vertex_id, vertex_type, vertex_role, vertex_name, subtitle, region_id,
          compute_node_id, status, is_physical, is_schedulable
        )
        VALUES (:id, :type, :role, :name, :subtitle, :region, :node_id, 'online', :physical, :schedulable)
        ON CONFLICT (vertex_id) DO UPDATE SET
          vertex_type = EXCLUDED.vertex_type,
          vertex_role = EXCLUDED.vertex_role,
          vertex_name = EXCLUDED.vertex_name,
          subtitle = EXCLUDED.subtitle,
          region_id = EXCLUDED.region_id,
          compute_node_id = EXCLUDED.compute_node_id,
          status = 'online',
          is_physical = EXCLUDED.is_physical,
          is_schedulable = EXCLUDED.is_schedulable,
          updated_at = NOW()
    """), {
        "id": vertex_id,
        "type": vertex_type,
        "role": role,
        "name": name,
        "subtitle": subtitle,
        "region": region_id,
        "node_id": compute_node_id,
        "physical": compute_node_id is not None,
        "schedulable": schedulable,
    })


def upsert_compute_node(conn, node_id: str, name: str, province_id: str, index: int, base_load: float) -> None:
    gpu_type = "NVIDIA H100" if index == 1 else "NVIDIA A800" if index == 2 else "NVIDIA A100"
    conn.execute(text("""
        INSERT INTO dim_compute_node (
          node_id, node_name, hostname, region_id, layer, node_code, ip_address,
          location, role_name, provider_name, compute_type, architecture, os_name,
          cpu_cores, memory_total_gb, disk_total_gb, gpu_type, gpu_count,
          network_bandwidth_mbps, bandwidth_total_gbps, status, warning_level,
          avg_response_time, task_success_rate, total_tasks_completed, running_tasks,
          health_score, source_type, last_heartbeat
        )
        VALUES (
          :id, :name, :id, :region, 'dc', :id, :ip, :name, '省级DC算力节点',
          '中国移动算网资源池', 'intelligent_dc', 'x86_64 / CUDA 12',
          'Ubuntu 22.04', :cpu, :memory, :disk, :gpu_type, :gpu_count,
          :bandwidth_mbps, :bandwidth_gbps, 'online', :warning,
          :latency, :success_rate, :completed, :running_tasks,
          :health, :source, NOW()
        )
        ON CONFLICT (node_id) DO UPDATE SET
          node_name = EXCLUDED.node_name,
          hostname = EXCLUDED.hostname,
          region_id = EXCLUDED.region_id,
          layer = EXCLUDED.layer,
          node_code = EXCLUDED.node_code,
          ip_address = EXCLUDED.ip_address,
          location = EXCLUDED.location,
          role_name = EXCLUDED.role_name,
          provider_name = EXCLUDED.provider_name,
          compute_type = EXCLUDED.compute_type,
          architecture = EXCLUDED.architecture,
          os_name = EXCLUDED.os_name,
          cpu_cores = EXCLUDED.cpu_cores,
          memory_total_gb = EXCLUDED.memory_total_gb,
          disk_total_gb = EXCLUDED.disk_total_gb,
          gpu_type = EXCLUDED.gpu_type,
          gpu_count = EXCLUDED.gpu_count,
          network_bandwidth_mbps = EXCLUDED.network_bandwidth_mbps,
          bandwidth_total_gbps = EXCLUDED.bandwidth_total_gbps,
          status = EXCLUDED.status,
          warning_level = EXCLUDED.warning_level,
          avg_response_time = EXCLUDED.avg_response_time,
          task_success_rate = EXCLUDED.task_success_rate,
          total_tasks_completed = EXCLUDED.total_tasks_completed,
          running_tasks = EXCLUDED.running_tasks,
          health_score = EXCLUDED.health_score,
          source_type = EXCLUDED.source_type,
          last_heartbeat = NOW(),
          updated_at = NOW()
    """), {
        "id": node_id,
        "name": name,
        "region": province_id,
        "ip": f"10.{50 + (index % 40)}.{abs(hash(province_id)) % 200}.{10 + index}",
        "cpu": 192 if index == 1 else 160,
        "memory": 1024 if index == 1 else 768,
        "disk": 12000 if index == 1 else 9600,
        "gpu_type": gpu_type,
        "gpu_count": 8 if index == 1 else 4,
        "bandwidth_mbps": 400000 if index == 1 else 200000,
        "bandwidth_gbps": 400 if index == 1 else 200,
        "warning": "warning" if base_load >= 80 else "normal",
        "latency": round(5 + index * 1.6 + base_load * 0.08, 1),
        "success_rate": 0.988 - index * 0.002,
        "completed": 1200 + index * 37,
        "running_tasks": 6 + index,
        "health": round(clamp(98 - base_load * 0.18 - index, 72, 98), 1),
        "source": SOURCE,
    })


def insert_edge(conn, source: str, target: str, role: str, bandwidth: float, priority: int) -> None:
    conn.execute(text("""
        INSERT INTO dim_topology_edge (
          source_vertex_id, target_vertex_id, edge_role, is_directed,
          capacity_bandwidth_mbps, priority, is_active
        )
        VALUES (:source_id, :target_id, :role, TRUE, :bandwidth, :priority, TRUE)
    """), {"source_id": source, "target_id": target, "role": role, "bandwidth": bandwidth, "priority": priority})


def insert_view(conn, view_id: str, name: str, kind: str, region_id: str | None, is_default: bool = False, node_id: str | None = None) -> None:
    conn.execute(text("""
        INSERT INTO dim_topology_view (view_id, view_name, view_kind, region_id, node_id, is_default, is_active)
        VALUES (:id, :name, :kind, :region, :node_id, :is_default, TRUE)
        ON CONFLICT (view_id) DO UPDATE SET
          view_name = EXCLUDED.view_name,
          view_kind = EXCLUDED.view_kind,
          region_id = EXCLUDED.region_id,
          node_id = EXCLUDED.node_id,
          is_default = EXCLUDED.is_default,
          is_active = TRUE
    """), {"id": view_id, "name": name, "kind": kind, "region": region_id, "node_id": node_id, "is_default": is_default})


def insert_layout(conn, view_id: str, vertex_id: str, x: float, y: float, size: float, order: int) -> None:
    conn.execute(text("""
        INSERT INTO dim_topology_view_vertex (view_id, vertex_id, display_order, is_visible)
        VALUES (:view_id, :vertex_id, :display_order, TRUE)
        ON CONFLICT (view_id, vertex_id) DO UPDATE SET
          display_order = EXCLUDED.display_order,
          is_visible = TRUE
    """), {"view_id": view_id, "vertex_id": vertex_id, "display_order": order})
    conn.execute(text("""
        DELETE FROM dim_topology_layout
        WHERE view_id = :view_id AND vertex_id = :vertex_id
    """), {"view_id": view_id, "vertex_id": vertex_id})
    conn.execute(text("""
        INSERT INTO dim_topology_layout (view_id, vertex_id, x, y, size_hint, layout_version)
        VALUES (:view_id, :vertex_id, :x, :y, :size, 'dispatch-demo-v1')
    """), {"view_id": view_id, "vertex_id": vertex_id, "x": x, "y": y, "size": size})


def insert_runtime(conn, vertex_id: str, load: float, predicted: float, level: str = "normal", target: bool = False) -> None:
    conn.execute(text("""
        INSERT INTO fact_topology_runtime_state (
          vertex_id, snapshot_time, status, current_load_pct, predicted_load_pct_10m,
          badge_text, highlight_level, task_target_flag
        )
        VALUES (:vertex_id, NOW(), 'online', :load, :predicted, :badge, :level, :target)
    """), {
        "vertex_id": vertex_id,
        "load": round(load, 1),
        "predicted": round(predicted, 1),
        "badge": "目标DC" if target else "高负载" if level == "warning" else "算法风险" if level == "critical" else None,
        "level": level,
        "target": target,
    })


def seed_topology(conn) -> list[tuple[str, str, str, int]]:
    upsert_region(conn, "china", "全国算力网络", "country", None, 0)
    upsert_vertex(conn, "national-center", "control", "national_dispatch_center", "国家级算力调度中心", "全国统一调度入口", "china")

    for hub_id, hub_name, subtitle, order in HUBS:
        upsert_region(conn, hub_id, hub_name, "hub", "china", order)
        upsert_vertex(conn, hub_id, "cloud", "national_hub", hub_name, subtitle, hub_id)
        insert_edge(conn, "national-center", hub_id, "national_dispatch", 400000, 100 - order)

    for region_id, region_name, hub_id, order in REGION_CENTERS:
        upsert_region(conn, region_id, region_name, "region", hub_id, order)
        upsert_vertex(conn, region_id, "service", "regional_center", region_name, "N·区域中心", region_id)
        insert_edge(conn, hub_id, region_id, "hub_dispatch", 200000, 80)

    dc_nodes: list[tuple[str, str, str, int]] = []
    for p_index, (province_id, province_name, region_id) in enumerate(PROVINCES, start=1):
        upsert_region(conn, province_id, province_name, "province", region_id, p_index)
        upsert_vertex(conn, province_id, "supercomputing", "province_supercenter", f"{province_name}省级超算中心", "31·省级调度节点", province_id)
        insert_edge(conn, region_id, province_id, "province_control", 100000, 60)

        for dc_index, dc_name in enumerate(dc_names_for(province_id), start=1):
            node_id = dc_id_for(province_id, dc_index)
            vertex_id = node_id
            city_id = city_id_for(province_id, dc_index)
            city_name = city_name_from_dc(dc_name)
            base = clamp(42 + (p_index * 7 + dc_index * 11) % 42, 28, 88)
            if node_id == TARGET_NODE_ID:
                base = 56
            if node_id == "dc-shanghai-01":
                base = 83
            if node_id == "dc-beijing-02":
                base = 74
            upsert_region(conn, city_id, city_name, "city", province_id, p_index * 10 + dc_index)
            upsert_compute_node(conn, node_id, dc_name, city_id, dc_index, base)
            upsert_vertex(conn, vertex_id, "compute", "dc_compute_node", dc_name, "地市DC算力节点", city_id, node_id, True)
            insert_edge(conn, province_id, vertex_id, "dc_dispatch", 80000, 45)
            dc_nodes.append((node_id, province_id, province_name, dc_index))
    return dc_nodes


def seed_views(conn, dc_nodes: list[tuple[str, str, str, int]]) -> None:
    insert_view(conn, "global", "全国算力调度大盘", "global", "china", True)
    insert_layout(conn, "global", "national-center", 0, 60, 124, 1)
    hub_x = [-390, -130, 130, 390]
    for idx, (hub_id, *_rest) in enumerate(HUBS):
        insert_layout(conn, "global", hub_id, hub_x[idx], 220, 92, 10 + idx)
    region_x = [-455, -325, -195, -65, 65, 195, 325, 455]
    for idx, (region_id, *_rest) in enumerate(REGION_CENTERS):
        insert_layout(conn, "global", region_id, region_x[idx], 390, 68, 30 + idx)

    provinces_by_region: dict[str, list[tuple[str, str, str]]] = {}
    for province_id, province_name, region_id in PROVINCES:
        provinces_by_region.setdefault(region_id, []).append((province_id, province_name, region_id))

    for region_id, region_name, _hub_id, _order in REGION_CENTERS:
        insert_view(conn, region_id, f"{region_name}视角", "region", region_id)
        insert_layout(conn, region_id, region_id, 0, 60, 112, 1)
        provinces = provinces_by_region[region_id]
        columns = 3 if len(provinces) <= 3 else 4 if len(provinces) == 4 else 5
        for idx, (province_id, _province_name, _region_id) in enumerate(provinces):
            row = idx // columns
            col = idx % columns
            row_count = min(columns, len(provinces) - row * columns)
            x = (col - (row_count - 1) / 2) * 185
            y = 225 + row * 145
            insert_layout(conn, region_id, province_id, x, y, 72, 20 + idx)

    dc_by_province: dict[str, list[tuple[str, str, str, int]]] = {}
    for item in dc_nodes:
        dc_by_province.setdefault(item[1], []).append(item)
    for province_id, province_name, _region_id in PROVINCES:
        view_id = province_id
        insert_view(conn, view_id, f"{province_name}省级视角", "province", province_id)
        insert_layout(conn, view_id, province_id, 0, 70, 108, 1)
        dcs = dc_by_province.get(province_id, [])
        for idx, (node_id, *_rest) in enumerate(dcs):
            x = (idx - (len(dcs) - 1) / 2) * 190
            insert_layout(conn, view_id, node_id, x, 255, 78, 20 + idx)

    if dc_nodes:
        target = TARGET_NODE_ID if any(node_id == TARGET_NODE_ID for node_id, *_ in dc_nodes) else dc_nodes[0][0]
        insert_view(conn, "node", "单节点监控", "node", None, False, target)
        insert_layout(conn, "node", target, 0, 120, 98, 1)


def seed_metrics(conn, dc_nodes: list[tuple[str, str, str, int]]) -> None:
    now = datetime.now(timezone.utc).replace(second=0, microsecond=0)
    for index, (node_id, _province_id, _province_name, dc_index) in enumerate(dc_nodes, start=1):
        latest_cpu = 0.0
        for minute in range(36):
            ts = now - timedelta(minutes=35 - minute)
            phase = minute / 4 + index * 0.51
            base = 44 + (index * 7 + dc_index * 13) % 36
            if node_id == TARGET_NODE_ID:
                base = 56
            if node_id == "dc-shanghai-01":
                base = 82
            if node_id == "dc-beijing-02":
                base = 73
            cpu = clamp(base + math.sin(phase) * 5 + math.cos(phase / 2) * 3, 15, 94)
            memory = clamp(cpu - 4 + math.sin(phase + 0.7) * 4, 12, 92)
            gpu = clamp(cpu + 5 + math.sin(phase + 1.1) * 7, 8, 98)
            disk = clamp(38 + (index % 10) * 3 + math.sin(phase) * 3, 20, 88)
            bandwidth = clamp(35 + cpu * 1.35, 40, 180)
            latency = clamp(6 + cpu * 0.18 + dc_index * 1.5, 5, 40)
            jitter = clamp(1.2 + latency * 0.04, 1, 6)
            loss = clamp(max(cpu - 82, 0) * 0.04, 0, 1.5)
            latest_cpu = round(cpu, 1)
            conn.execute(text("""
                INSERT INTO ts_node_metric (
                  metric_time, node_id, node_type, cpu_usage_pct, memory_usage_pct,
                  gpu_usage_pct, disk_usage_pct, bandwidth_usage_gbps,
                  latency_ms, jitter_ms, packet_loss_pct
                )
                VALUES (:ts, :node_id, 'dc', :cpu, :memory, :gpu, :disk, :bandwidth, :latency, :jitter, :loss)
            """), {
                "ts": ts,
                "node_id": node_id,
                "cpu": round(cpu, 1),
                "memory": round(memory, 1),
                "gpu": round(gpu, 1),
                "disk": round(disk, 1),
                "bandwidth": round(bandwidth, 1),
                "latency": round(latency, 1),
                "jitter": round(jitter, 2),
                "loss": round(loss, 2),
            })
        predicted = clamp(latest_cpu + (9 if node_id in {"dc-shanghai-01", "dc-beijing-02"} else 5), 5, 99)
        level = "critical" if node_id == "dc-beijing-02" else "warning" if latest_cpu >= 80 else "normal"
        insert_runtime(conn, node_id, latest_cpu, predicted, level, node_id == TARGET_NODE_ID)

    aggregate_vertices = ["national-center"] + [h[0] for h in HUBS] + [r[0] for r in REGION_CENTERS] + [p[0] for p in PROVINCES]
    for idx, vertex_id in enumerate(aggregate_vertices):
        base = clamp(45 + (idx * 9) % 32, 35, 82)
        level = "warning" if base >= 78 else "normal"
        insert_runtime(conn, vertex_id, base, clamp(base + 6, 0, 99), level)


def seed_tasks(conn) -> None:
    now = datetime.now(timezone.utc).replace(second=0, microsecond=0)
    conn.execute(text("""
        INSERT INTO fact_task (
          task_id, name, task_name, task_type, business_type, status, priority,
          priority_level, progress, assigned_node_id, source_system, description,
          submit_time, start_time
        )
        VALUES (
          :task_id, :name, :name, 'training', '反欺诈中心', 'running', 'high',
          4, 42, :target, 'task-ops', :description, :submit_time, :start_time
        )
    """), {
        "task_id": TASK_ID,
        "name": "联邦训练-图神经网络",
        "target": TARGET_NODE_ID,
        "description": "反欺诈业务发起的跨省联邦训练任务，调度中枢按负载、时延与风险评分选择广东 DC-02。",
        "submit_time": now - timedelta(minutes=22),
        "start_time": now - timedelta(minutes=12),
    })
    conn.execute(text("""
        INSERT INTO fact_task_requirement (
          task_id, cpu_requested, memory_requested, gpu_requested,
          gpu_type_requested, gpu_memory_requested, storage_requested,
          bandwidth_requested, required_cpu_cores, required_memory_gb,
          required_gpu_count, required_gpu_memory_gb, required_bandwidth_gbps,
          required_disk_gb, estimated_duration_sec, estimated_latency_ms
        )
        VALUES (:task_id, 16, 64, 4, 'NVIDIA A800', 80, 480, 40, 16, 64, 4, 80, 40, 480, 28800, 18)
    """), {"task_id": TASK_ID})
    conn.execute(text("""
        INSERT INTO fact_federated_task (
          task_id, aggregation_algorithm, encryption_type, rounds_total, rounds_current,
          min_participants, model_name, model_version, global_accuracy, global_loss,
          parameters_count
        )
        VALUES (:task_id, 'Bulyan', 'secure_aggregation', 50, 27, 8, 'GNN反欺诈图模型', 'v2.1', 0.9, 0.42, 128000000)
    """), {"task_id": TASK_ID})
    conn.execute(text("""
        INSERT INTO fact_task_assignment (
          task_id, target_node_id, pool_id, match_score, estimated_latency_ms,
          allocated_cpu_cores, allocated_memory_gb, allocated_gpu_count,
          allocated_gpu_pct, allocated_bandwidth_gbps, allocated_disk_gb,
          assignment_status, assigned_at
        )
        VALUES (:task_id, :target, 'south-ai-pool', 92, 11, 16, 64, 4, 46, 40, 480, 'running', :assigned_at)
    """), {"task_id": TASK_ID, "target": TARGET_NODE_ID, "assigned_at": now - timedelta(minutes=11)})

    candidates = [
        (TARGET_NODE_ID, 92, 96, 94, 91, 88, 6, 1),
        ("dc-shanghai-01", 86, 98, 72, 86, 78, 14, 2),
        ("dc-beijing-02", 81, 90, 70, 76, 74, 19, 3),
        ("dc-sichuan-01", 77, 84, 88, 68, 70, 16, 4),
    ]
    for node_id, total, resource, balance, latency, bandwidth, risk, rank in candidates:
        conn.execute(text("""
            INSERT INTO fact_task_candidate_score (
              task_id, candidate_node_id, score_total, score_resource_fit,
              score_latency, score_bandwidth, score_balance, score_risk,
              score_time, rank_no
            )
            VALUES (:task_id, :node_id, :total, :resource, :latency, :bandwidth, :balance, :risk, :score_time, :rank)
        """), {
            "task_id": TASK_ID,
            "node_id": node_id,
            "total": total,
            "resource": resource,
            "latency": latency,
            "bandwidth": bandwidth,
            "balance": balance,
            "risk": risk,
            "score_time": now - timedelta(minutes=14),
            "rank": rank,
        })

    logs = [
        ("national-center", "感知", "收到 task-fedtrain-99943，读取任务资源需求。", "info", 20),
        ("national-center", "感知", "拉取全国算力拓扑与 DC 当前负载，进入候选节点筛选。", "info", 18),
        ("national-center", "决策", "生成 4 个候选 DC 节点评分：资源匹配、负载均衡、网络时延、风险扣分。", "info", 16),
        ("national-center", "决策", "dc-guangdong-02 综合评分 92，排名第一。", "success", 15),
        ("national-center", "安全", "算法安全风险升高，训练监控侧检测到梯度异常比例 35%。", "warning", 13),
        ("national-center", "策略", "RL 策略选择 Bulyan 聚合，替代 FedAvg。", "success", 12),
        ("national-center", "下发", "任务绑定至 dc-guangdong-02，CPU 16 核、内存 64GB、GPU 4 张资源预留完成。", "info", 11),
        (TARGET_NODE_ID, "监控", "任务进入 running，当前进度 42%，调度链路保持稳定。", "info", 8),
    ]
    for vertex_id, phase, message, severity, minutes_ago in logs:
        conn.execute(text("""
            INSERT INTO fact_schedule_log (task_id, vertex_id, phase, log_time, message, severity)
            VALUES (:task_id, :vertex_id, :phase, :log_time, :message, :severity)
        """), {
            "task_id": TASK_ID,
            "vertex_id": vertex_id,
            "phase": phase,
            "log_time": now - timedelta(minutes=minutes_ago),
            "message": message,
            "severity": severity,
        })

    conn.execute(text("""
        INSERT INTO cfg_alert_threshold (
          metric_code, metric_name, unit, warning_threshold, critical_threshold, is_enabled, description
        )
        VALUES ('algorithm_risk', '梯度异常比例', '%', 25, 40, TRUE, '联邦训练梯度异常比例超过阈值')
        ON CONFLICT (metric_code) DO UPDATE SET
          metric_name = EXCLUDED.metric_name,
          warning_threshold = EXCLUDED.warning_threshold,
          critical_threshold = EXCLUDED.critical_threshold,
          is_enabled = TRUE,
          updated_at = NOW()
    """))
    conn.execute(text("""
        INSERT INTO fact_alert_record (
          node_id, node_name, metric_code, metric_name, current_value,
          threshold_value, alert_level, alert_message, status, triggered_at
        )
        VALUES ('dc-beijing-02', '亦庄 DC', 'algorithm_risk', '梯度异常比例', 35, 25, 'warning', '训练监控侧发现梯度异常，调度中枢切换 Bulyan 聚合。', 'active', :triggered_at)
    """), {"triggered_at": now - timedelta(minutes=13)})


def seed_security_and_strategy(conn) -> None:
    conn.execute(text("""
        INSERT INTO fact_security_overview_snapshot (
          view_id, snapshot_time, grade, data_score, algorithm_score,
          network_score, system_score, ds_confidence, pc1_ratio, pc1_driver,
          pc2_ratio, pc2_driver, explanation, source_type
        )
        VALUES (
          'global', NOW(), 'B+', 87, 82, 79, 76, 0.81, 42,
          '算法风险主导', 28, '数据风险次之',
          '训练监控侧发现梯度异常，调度中枢切换 Bulyan 聚合。',
          :source
        )
    """), {"source": SOURCE})

    run_id = conn.execute(text("""
        INSERT INTO fact_strategy_eval_run (
          task_id, strategy_name, attack_type, malicious_ratio,
          selected_algorithm, decision_mode, reason, run_time, source_type
        )
        VALUES (
          :task_id, '鲁棒联邦聚合策略', 'gradient_reverse', 35,
          'Bulyan', 'rl_auto', '35% 梯度异常时 Bulyan 鲁棒性最佳，FedAvg 精度明显崩溃。',
          NOW(), :source
        )
        RETURNING eval_run_id
    """), {"task_id": TASK_ID, "source": SOURCE}).scalar_one()

    finals = {
        "FedAvg": 61,
        "Krum": 85,
        "GeometricMedian": 82,
        "Bulyan": 90,
    }
    for algorithm, final_acc in finals.items():
        for round_no in range(1, 21):
            progress = round_no / 20
            if algorithm == "FedAvg":
                accuracy = 80 - max(round_no - 6, 0) * 1.35 + math.sin(round_no / 2) * 1.4
                accuracy = max(final_acc, accuracy)
            else:
                start = 58 + (2 if algorithm == "Bulyan" else 0)
                accuracy = start + (final_acc - start) * (1 - math.exp(-progress * 3.2))
            loss = max(0.1, 1.35 - accuracy / 100)
            conn.execute(text("""
                INSERT INTO fact_strategy_eval_metric (
                  eval_run_id, algorithm_name, round_no, accuracy, loss_value, metric_role
                )
                VALUES (:run_id, :algorithm, :round_no, :accuracy, :loss, 'accuracy')
            """), {
                "run_id": run_id,
                "algorithm": algorithm,
                "round_no": round_no,
                "accuracy": round(accuracy, 2),
                "loss": round(loss, 3),
            })


def main() -> None:
    engine = create_engine(settings.DATABASE_URL)
    with engine.begin() as conn:
        ensure_schema(conn)
        cleanup(conn)
        dc_nodes = seed_topology(conn)
        seed_views(conn, dc_nodes)
        seed_metrics(conn, dc_nodes)
        seed_tasks(conn)
        seed_security_and_strategy(conn)
    print("Seeded dispatch demo topology, task flow, security, and strategy data.")


if __name__ == "__main__":
    main()
