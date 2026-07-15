from __future__ import annotations

import sys
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import create_engine, text


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
load_dotenv(ROOT / ".env")

from app.core.config import settings  # noqa: E402


HUBS = [
    ("hub_jingjinji", "京津冀枢纽", "华北省级算网接入"),
    ("hub_yangtze_delta", "长三角枢纽", "东部省级算网接入"),
    ("hub_greater_bay", "粤港澳枢纽", "南部省级算网接入"),
    ("hub_chengyu", "成渝枢纽", "西部省级算网接入"),
]

PROVINCES = [
    ("beijing", "北京", "hub_jingjinji"),
    ("tianjin", "天津", "hub_jingjinji"),
    ("hebei", "河北", "hub_jingjinji"),
    ("shanxi", "山西", "hub_jingjinji"),
    ("neimenggu", "内蒙古", "hub_jingjinji"),
    ("liaoning", "辽宁", "hub_jingjinji"),
    ("jilin", "吉林", "hub_jingjinji"),
    ("heilongjiang", "黑龙江", "hub_jingjinji"),
    ("shanghai", "上海", "hub_yangtze_delta"),
    ("jiangsu", "江苏", "hub_yangtze_delta"),
    ("zhejiang", "浙江", "hub_yangtze_delta"),
    ("anhui", "安徽", "hub_yangtze_delta"),
    ("fujian", "福建", "hub_yangtze_delta"),
    ("jiangxi", "江西", "hub_yangtze_delta"),
    ("shandong", "山东", "hub_yangtze_delta"),
    ("guangdong", "广东", "hub_greater_bay"),
    ("guangxi", "广西", "hub_greater_bay"),
    ("hainan", "海南", "hub_greater_bay"),
    ("hubei", "湖北", "hub_greater_bay"),
    ("hunan", "湖南", "hub_greater_bay"),
    ("henan", "河南", "hub_greater_bay"),
    ("sichuan", "四川", "hub_chengyu"),
    ("chongqing", "重庆", "hub_chengyu"),
    ("guizhou", "贵州", "hub_chengyu"),
    ("yunnan", "云南", "hub_chengyu"),
    ("xizang", "西藏", "hub_chengyu"),
    ("shaanxi", "陕西", "hub_chengyu"),
    ("gansu", "甘肃", "hub_chengyu"),
    ("qinghai", "青海", "hub_chengyu"),
    ("ningxia", "宁夏", "hub_chengyu"),
    ("xinjiang", "新疆", "hub_chengyu"),
]

def upsert_region(conn, region_id: str, name: str, level: str, parent_id: str | None, order: int) -> None:
    conn.execute(
        text(
            """
            INSERT INTO dim_region (region_id, region_name, region_level, parent_region_id, display_order, is_active)
            VALUES (:id, :name, :level, :parent_id, :display_order, TRUE)
            ON CONFLICT (region_id) DO UPDATE SET
              region_name = EXCLUDED.region_name,
              region_level = EXCLUDED.region_level,
              parent_region_id = EXCLUDED.parent_region_id,
              display_order = EXCLUDED.display_order,
              is_active = TRUE,
              updated_at = now()
            """
        ),
        {"id": region_id, "name": name, "level": level, "parent_id": parent_id, "display_order": order},
    )


def upsert_vertex(
    conn,
    vertex_id: str,
    vertex_type: str,
    vertex_role: str,
    name: str,
    subtitle: str,
    region_id: str | None,
    compute_node_id: str | None = None,
    schedulable: bool = False,
) -> None:
    conn.execute(
        text(
            """
            INSERT INTO dim_topology_vertex (
              vertex_id, vertex_type, vertex_role, vertex_name, subtitle,
              region_id, compute_node_id, status, is_physical, is_schedulable
            )
            VALUES (
              :id, :type, :role, :name, :subtitle,
              :region_id, :compute_node_id, 'online', :is_physical, :is_schedulable
            )
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
              updated_at = now()
            """
        ),
        {
            "id": vertex_id,
            "type": vertex_type,
            "role": vertex_role,
            "name": name,
            "subtitle": subtitle,
            "region_id": region_id,
            "compute_node_id": compute_node_id,
            "is_physical": compute_node_id is not None,
            "is_schedulable": schedulable,
        },
    )


def upsert_compute_node(conn, node_id: str, name: str, region_id: str, layer: str, order: int) -> None:
    is_dc = layer == "dc"
    conn.execute(
        text(
            """
            INSERT INTO dim_compute_node (
              node_id, node_name, hostname, region_id, layer, node_code, ip_address,
              location, role_name, provider_name, compute_type, architecture, os_name,
              cpu_cores, memory_total_gb, disk_total_gb, gpu_type, gpu_count,
              network_bandwidth_mbps, bandwidth_total_gbps, status, warning_level,
              avg_response_time, task_success_rate, total_tasks_completed, health_score,
              running_tasks, source_type, last_heartbeat
            )
            VALUES (
              :id, :name, :hostname, :region_id, :layer, :id, :ip,
              :location, :role, :provider, :compute_type, 'x86_64 / CUDA 12',
              'Ubuntu 22.04', :cpu, :memory, :disk, :gpu_type, :gpu_count,
              :bandwidth_mbps, :bandwidth_gbps, 'online', 'normal',
              :latency, :success_rate, :tasks_completed, :health,
              :running_tasks, 'mobile_4_31_x_seed', now()
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
              health_score = EXCLUDED.health_score,
              running_tasks = EXCLUDED.running_tasks,
              source_type = EXCLUDED.source_type,
              last_heartbeat = EXCLUDED.last_heartbeat,
              updated_at = now()
            """
        ),
        {
            "id": node_id,
            "name": name,
            "hostname": node_id,
            "region_id": region_id,
            "layer": layer,
            "ip": f"10.{20 + order // 100}.{order % 100}.{10 if is_dc else 20}",
            "location": name,
            "role": "省级DC" if is_dc else "边缘算力节点",
            "provider": "中国移动算网资源池",
            "compute_type": "intelligent_dc" if is_dc else "edge_inference",
            "cpu": 96 if is_dc else 32,
            "memory": 384 if is_dc else 128,
            "disk": 8192 if is_dc else 2048,
            "gpu_type": "NVIDIA A800" if is_dc else "NVIDIA T4",
            "gpu_count": 4 if is_dc else 2,
            "bandwidth_mbps": 100000 if is_dc else 20000,
            "bandwidth_gbps": 100 if is_dc else 20,
            "latency": 4.5 if is_dc else 8.0,
            "success_rate": 0.992 if is_dc else 0.975,
            "tasks_completed": 1200 + order,
            "health": 92 if is_dc else 88,
            "running_tasks": 8 if is_dc else 3,
        },
    )


def ensure_edge(conn, source: str, target: str, role: str, bandwidth: int, priority: int) -> None:
    conn.execute(
        text(
            """
            INSERT INTO dim_topology_edge (
              source_vertex_id, target_vertex_id, edge_role, is_directed,
              capacity_bandwidth_mbps, priority, is_active
            )
            SELECT
              CAST(:source AS varchar),
              CAST(:target AS varchar),
              CAST(:role AS varchar),
              TRUE,
              CAST(:bandwidth AS double precision),
              CAST(:priority AS integer),
              TRUE
            WHERE NOT EXISTS (
              SELECT 1 FROM dim_topology_edge
              WHERE source_vertex_id = :source AND target_vertex_id = :target
            )
            """
        ),
        {"source": source, "target": target, "role": role, "bandwidth": bandwidth, "priority": priority},
    )


def main() -> None:
    engine = create_engine(settings.DATABASE_URL)
    with engine.begin() as conn:
        upsert_region(conn, "china", "中国", "country", None, 0)
        upsert_vertex(conn, "manager", "control", "national_brain", "国家级算力调度中心", "算网大脑", None)

        for index, (hub_id, hub_name, subtitle) in enumerate(HUBS, start=1):
            upsert_region(conn, hub_id, hub_name, "hub", "china", index)
            upsert_vertex(conn, hub_id, "hub", "hub_brain", hub_name, subtitle, hub_id)
            ensure_edge(conn, "manager", hub_id, "national_dispatch", 400000, 100)

        for index, (province_id, province_name, hub_id) in enumerate(PROVINCES, start=10):
            prov_vertex_id = f"prov_{province_id}"
            dc_node_id = f"dc-{province_id}-01"
            edge_node_id = f"edge-{province_id}-01"
            dc_vertex_id = f"dc_{province_id}_01"
            edge_vertex_id = f"edge_{province_id}_01"

            upsert_region(conn, province_id, province_name, "province", hub_id, index)
            upsert_vertex(conn, prov_vertex_id, "province", "province_brain", province_name, "省级算网节点", province_id)
            upsert_compute_node(conn, dc_node_id, f"{province_name} DC1", province_id, "dc", index)
            upsert_compute_node(conn, edge_node_id, f"{province_name}边缘节点1", province_id, "edge", index)
            upsert_vertex(conn, dc_vertex_id, "dc", "dc_node", f"{province_name} DC1", "省级DC", province_id, dc_node_id, True)
            upsert_vertex(conn, edge_vertex_id, "edge", "edge_node", f"{province_name}边缘节点1", "边缘算力", province_id, edge_node_id, True)
            ensure_edge(conn, hub_id, prov_vertex_id, "hub_to_province", 200000, 80)
            ensure_edge(conn, prov_vertex_id, dc_vertex_id, "province_to_dc", 100000, 60)
            ensure_edge(conn, dc_vertex_id, edge_vertex_id, "dc_to_edge", 20000, 40)

    print("Seeded China Mobile 4+31+X topology data.")


if __name__ == "__main__":
    main()
