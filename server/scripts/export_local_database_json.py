"""Export the active local PostgreSQL database to per-object JSON files.

The script reads ``server/.env`` through the existing application settings,
discovers every table/view under ``public``, exports each object as a JSON
array, and writes a Markdown data dictionary for the exported snapshot.
"""

from __future__ import annotations

import json
import math
import sys
from datetime import date, datetime, time
from decimal import Decimal
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import psycopg
from dotenv import load_dotenv
from psycopg import sql
from psycopg.rows import dict_row

ROOT = Path(__file__).resolve().parents[1]
PROJECT_ROOT = ROOT.parent
sys.path.insert(0, str(ROOT))
load_dotenv(ROOT / ".env")

from app.core.config import settings  # noqa: E402

EXPORT_DIR = ROOT / "exports" / "local_database_json"
SCHEMA_NAME = "public"

OBJECT_DESCRIPTION = {
    "cfg_alert_threshold": "告警阈值配置表，保存资源、任务和安全态势指标的分级阈值。",
    "dim_client": "客户端维表，描述参与联邦学习或算力调度的客户端实体。",
    "dim_compute_node": "算力节点维表，保存节点规格、位置、状态和运行基础信息。",
    "dim_node_gpu_device": "节点 GPU 设备维表，记录节点下挂载的 GPU 设备明细。",
    "dim_region": "区域维表，保存国家、省、市、园区等层级区域信息。",
    "dim_supercomputing_center": "超算中心维表，描述超算中心基础资料和能力边界。",
    "dim_topology_edge": "拓扑边维表，描述拓扑节点之间的逻辑链路和链路能力。",
    "dim_topology_layout": "拓扑布局表，保存不同视图下拓扑节点的位置与尺寸。",
    "dim_topology_vertex": "拓扑点维表，描述调度中心、区域中心、算力节点等拓扑实体。",
    "dim_topology_view": "拓扑视图定义表，描述前端可切换的全国、区域、省级等视图。",
    "dim_topology_view_vertex": "拓扑视图与顶点关系表，控制每个视图展示的顶点范围。",
    "fact_alert_record": "告警事实表，记录已产生的告警事件。",
    "fact_federated_task": "联邦任务事实表，保存联邦学习任务的业务主记录。",
    "fact_forecast_run": "预测运行事实表，记录资源预测任务的一次运行。",
    "fact_schedule_log": "调度日志事实表，记录算力任务调度过程中的关键动作。",
    "fact_security_overview_snapshot": "安全态势快照表，保存安全评估概览指标。",
    "fact_strategy_eval_metric": "策略评估指标表，保存策略评估运行中的指标明细。",
    "fact_strategy_eval_run": "策略评估运行表，记录策略评估任务的运行上下文。",
    "fact_task": "算力任务事实表，保存任务基本信息、状态和执行摘要。",
    "fact_task_assignment": "任务分配事实表，记录任务到节点的分配结果。",
    "fact_task_candidate_score": "任务候选节点评分表，保存调度候选节点的评分明细。",
    "fact_task_requirement": "任务需求事实表，保存任务所需 CPU、GPU、内存、带宽等资源约束。",
    "fact_topology_runtime_state": "拓扑运行态表，保存拓扑顶点实时负载、健康度和状态。",
    "ts_forecast_point": "预测时间序列表，保存预测运行产生的时间点数据。",
    "ts_node_metric": "节点指标时间序列表，保存节点 CPU、内存、网络等运行监控指标。",
    "ts_resource_trend_5m": "资源五分钟趋势表，保存聚合后的资源趋势点。",
    "vw_node_runtime_snapshot": "节点运行态视图，汇总节点基础信息和最新运行指标。",
    "vw_task_stats_snapshot": "任务统计快照视图，汇总任务数量、状态和调度统计。",
}


def json_default(value: Any) -> Any:
    if isinstance(value, (datetime, date, time)):
        return value.isoformat()
    if isinstance(value, Decimal):
        if value.is_nan():
            return None
        if value == value.to_integral_value():
            return int(value)
        number = float(value)
        return number if math.isfinite(number) else str(value)
    if isinstance(value, memoryview):
        return value.tobytes().hex()
    if isinstance(value, bytes):
        return value.hex()
    return str(value)


def masked_database_url(database_url: str) -> str:
    parsed = urlparse(database_url)
    if not parsed.password:
        return database_url
    safe_netloc = parsed.netloc.replace(f":{parsed.password}@", ":***@")
    return parsed._replace(netloc=safe_netloc).geturl()


def database_name(database_url: str) -> str:
    parsed = urlparse(database_url)
    return parsed.path.lstrip("/") or "unknown"


def get_objects(conn: psycopg.Connection[dict[str, Any]]) -> list[dict[str, Any]]:
    query = """
        SELECT table_name, table_type
        FROM information_schema.tables
        WHERE table_schema = %s
          AND table_type IN ('BASE TABLE', 'VIEW')
        ORDER BY
          CASE table_type WHEN 'BASE TABLE' THEN 0 ELSE 1 END,
          table_name
    """
    return list(conn.execute(query, (SCHEMA_NAME,)).fetchall())


def get_columns(conn: psycopg.Connection[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    query = """
        SELECT
            table_name,
            column_name,
            ordinal_position,
            data_type,
            udt_name,
            is_nullable,
            column_default
        FROM information_schema.columns
        WHERE table_schema = %s
        ORDER BY table_name, ordinal_position
    """
    columns: dict[str, list[dict[str, Any]]] = {}
    for row in conn.execute(query, (SCHEMA_NAME,)).fetchall():
        columns.setdefault(row["table_name"], []).append(row)
    return columns


def get_primary_keys(conn: psycopg.Connection[dict[str, Any]]) -> dict[str, list[str]]:
    query = """
        SELECT
            tc.table_name,
            kcu.column_name,
            kcu.ordinal_position
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
         AND tc.table_schema = kcu.table_schema
        WHERE tc.table_schema = %s
          AND tc.constraint_type = 'PRIMARY KEY'
        ORDER BY tc.table_name, kcu.ordinal_position
    """
    primary_keys: dict[str, list[str]] = {}
    for row in conn.execute(query, (SCHEMA_NAME,)).fetchall():
        primary_keys.setdefault(row["table_name"], []).append(row["column_name"])
    return primary_keys


def get_foreign_keys(conn: psycopg.Connection[dict[str, Any]]) -> list[dict[str, Any]]:
    query = """
        SELECT
            tc.constraint_name,
            tc.table_name,
            kcu.column_name,
            ccu.table_name AS foreign_table_name,
            ccu.column_name AS foreign_column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
         AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage ccu
          ON ccu.constraint_name = tc.constraint_name
         AND ccu.table_schema = tc.table_schema
        WHERE tc.table_schema = %s
          AND tc.constraint_type = 'FOREIGN KEY'
        ORDER BY tc.table_name, kcu.column_name
    """
    return list(conn.execute(query, (SCHEMA_NAME,)).fetchall())


def count_rows(conn: psycopg.Connection[dict[str, Any]], object_name: str) -> int:
    query = sql.SQL("SELECT COUNT(*) AS row_count FROM {}.{}").format(
        sql.Identifier(SCHEMA_NAME),
        sql.Identifier(object_name),
    )
    return int(conn.execute(query).fetchone()["row_count"])


def export_object(
    conn: psycopg.Connection[dict[str, Any]],
    object_name: str,
    primary_keys: list[str],
) -> list[dict[str, Any]]:
    base = sql.SQL("SELECT * FROM {}.{}").format(
        sql.Identifier(SCHEMA_NAME),
        sql.Identifier(object_name),
    )
    if primary_keys:
        order_by = sql.SQL(", ").join(sql.Identifier(column) for column in primary_keys)
        query = base + sql.SQL(" ORDER BY ") + order_by
    else:
        query = base
    return list(conn.execute(query).fetchall())


def write_json(path: Path, data: Any) -> None:
    path.write_text(
        json.dumps(data, ensure_ascii=False, indent=2, default=json_default) + "\n",
        encoding="utf-8",
    )


def markdown_table(headers: list[str], rows: list[list[Any]]) -> list[str]:
    lines = [
        "| " + " | ".join(headers) + " |",
        "| " + " | ".join("---" for _ in headers) + " |",
    ]
    for row in rows:
        lines.append("| " + " | ".join(str(item) for item in row) + " |")
    return lines


def build_readme(
    database_url: str,
    objects: list[dict[str, Any]],
    columns: dict[str, list[dict[str, Any]]],
    primary_keys: dict[str, list[str]],
    foreign_keys: list[dict[str, Any]],
    row_counts: dict[str, int],
) -> str:
    generated_at = datetime.now().astimezone().isoformat(timespec="seconds")
    base_tables = [item for item in objects if item["table_type"] == "BASE TABLE"]
    views = [item for item in objects if item["table_type"] == "VIEW"]

    lines: list[str] = [
        "# 当前本地数据库说明与 JSON 导出",
        "",
        f"生成时间：`{generated_at}`",
        "",
        "## 导出范围",
        "",
        f"- 数据库：`{database_name(database_url)}`",
        f"- 连接：`{masked_database_url(database_url)}`",
        f"- Schema：`{SCHEMA_NAME}`",
        f"- 输出目录：`server/exports/local_database_json`",
        f"- 对象数量：{len(objects)}（基础表 {len(base_tables)}，视图 {len(views)}）",
        "- JSON 格式：每个表/视图一个同名 `.json` 文件，内容为行对象数组；空表导出为 `[]`。",
        "",
        "## 文件清单",
        "",
    ]

    file_rows = []
    for item in objects:
        name = item["table_name"]
        file_rows.append(
            [
                f"`{name}.json`",
                "`表`" if item["table_type"] == "BASE TABLE" else "`视图`",
                row_counts[name],
                len(columns.get(name, [])),
                OBJECT_DESCRIPTION.get(name, "当前数据库对象，未配置专项说明。"),
            ]
        )
    lines.extend(markdown_table(["文件", "类型", "行数", "字段数", "说明"], file_rows))

    lines.extend(
        [
            "",
            "## 业务分层",
            "",
            "- `cfg_*`：配置类数据，例如告警阈值。",
            "- `dim_*`：维度/主数据，例如区域、节点、拓扑点边和视图。",
            "- `fact_*`：业务事实数据，例如任务、调度、告警、预测运行和策略评估。",
            "- `ts_*`：时间序列数据，例如节点指标、预测点和资源趋势。",
            "- `vw_*`：查询视图，用于聚合前端页面所需的运行态或统计快照。",
            "",
            "## 主外键关系",
            "",
        ]
    )
    if foreign_keys:
        fk_rows = [
            [
                f"`{row['table_name']}.{row['column_name']}`",
                f"`{row['foreign_table_name']}.{row['foreign_column_name']}`",
                f"`{row['constraint_name']}`",
            ]
            for row in foreign_keys
        ]
        lines.extend(markdown_table(["本表字段", "引用字段", "约束名"], fk_rows))
    else:
        lines.append("当前 schema 未声明外键约束。")

    lines.extend(["", "## 字段字典", ""])
    for item in objects:
        name = item["table_name"]
        pk_columns = set(primary_keys.get(name, []))
        lines.extend(
            [
                f"### `{name}`",
                "",
                OBJECT_DESCRIPTION.get(name, "当前数据库对象，未配置专项说明。"),
                "",
                f"- 类型：{'基础表' if item['table_type'] == 'BASE TABLE' else '视图'}",
                f"- 行数：{row_counts[name]}",
                f"- 主键：{', '.join(f'`{column}`' for column in primary_keys.get(name, [])) or '未声明'}",
                "",
            ]
        )

        column_rows = []
        for column in columns.get(name, []):
            default = column["column_default"] or ""
            column_rows.append(
                [
                    f"`{column['column_name']}`",
                    column["data_type"],
                    "否" if column["is_nullable"] == "NO" else "是",
                    "是" if column["column_name"] in pk_columns else "",
                    f"`{default}`" if default else "",
                ]
            )
        lines.extend(markdown_table(["字段", "类型", "可为空", "主键", "默认值"], column_rows))
        lines.append("")

    lines.extend(
        [
            "## 导入提示",
            "",
            "这些 JSON 文件是当前本地库的只读快照。若后续需要回灌到 PostgreSQL，建议先建表并校验主键、外键、枚举值和时间字段类型，再按维表、事实表、时间序列表、视图依赖的顺序导入。",
            "",
        ]
    )
    return "\n".join(lines)


def main() -> None:
    database_url = settings.DATABASE_URL
    if database_url.startswith("postgresql+psycopg://"):
        database_url = database_url.replace("postgresql+psycopg://", "postgresql://", 1)

    EXPORT_DIR.mkdir(parents=True, exist_ok=True)

    with psycopg.connect(database_url, row_factory=dict_row) as conn:
        objects = get_objects(conn)
        columns = get_columns(conn)
        primary_keys = get_primary_keys(conn)
        foreign_keys = get_foreign_keys(conn)

        row_counts: dict[str, int] = {}
        exported_files: list[dict[str, Any]] = []
        for item in objects:
            name = item["table_name"]
            row_counts[name] = count_rows(conn, name)
            rows = export_object(conn, name, primary_keys.get(name, []))
            output_file = EXPORT_DIR / f"{name}.json"
            write_json(output_file, rows)
            exported_files.append(
                {
                    "object": name,
                    "type": item["table_type"],
                    "file": output_file.name,
                    "rows": row_counts[name],
                    "columns": len(columns.get(name, [])),
                }
            )

        manifest = {
            "generated_at": datetime.now().astimezone().isoformat(timespec="seconds"),
            "database": database_name(database_url),
            "schema": SCHEMA_NAME,
            "source": masked_database_url(database_url),
            "object_count": len(objects),
            "base_table_count": sum(item["table_type"] == "BASE TABLE" for item in objects),
            "view_count": sum(item["table_type"] == "VIEW" for item in objects),
            "files": exported_files,
        }
        write_json(EXPORT_DIR / "manifest.json", manifest)

        readme = build_readme(
            database_url=database_url,
            objects=objects,
            columns=columns,
            primary_keys=primary_keys,
            foreign_keys=foreign_keys,
            row_counts=row_counts,
        )
        (EXPORT_DIR / "README.md").write_text(readme, encoding="utf-8")

    print(f"Exported {len(exported_files)} objects to {EXPORT_DIR.relative_to(PROJECT_ROOT)}")


if __name__ == "__main__":
    main()
