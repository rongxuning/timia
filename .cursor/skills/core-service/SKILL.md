---
name: core-service
description: Use when implementing or changing codes/core-service FastAPI routes, services, schemas, models, Alembic migrations, permissions, views APIs, PAT/auth, or OpenAPI codegen.
---

# Core Service

**细则：** `.cursor/rules/core-service.mdc`（分层、错误码、测试清单以该文件为准）。

## 栈

Python ≥3.11，**uv**，FastAPI + Pydantic v2 + SQLAlchemy 2.0 + Alembic + Postgres。Ruff 行宽 **100**。`cd codes/core-service && uv run pytest -q`；改 API 后根目录 **`make codegen`**。

## 放哪

| 场景 | 位置 |
|------|------|
| 写/CRUD/事务 | `routes/` + 必要时 `services/` |
| 页面只读聚合 | `routes/views/` → `services/views/`（view 路由不写 SQL） |
| 权限 | `services/permissions.py`，路由顶部 `require_*` |
| DTO | `schemas/` 或 `schemas/views/` |
| ORM | `models/`（无 repository） |

写操作顺序：`db.add/flush` → `log_activity()` → `db.commit()`。PATCH 用 `payload.model_fields_set`。新建 `201`。

## 易错

- 查询用 `select()` + `scalar`/`scalars`，不要 `db.query()`
- 时间 UTC（`utcnow()`）；UUID 响应序列化成 `str`
- Migration：`app/migrations/versions/00xx_描述.py`，revision 链连续
- PAT 路径有 scope 白名单；未映射路径 `403 pat_path_not_allowed`。JWT 请求不走该表
- 错误码 snake_case：`not_found`、`not_a_member`、`version_conflict`
- 密钥只来自 `core/config.py`

## 检查清单

1. Schema 已定义  
2. 权限在路由顶部  
3. 写操作有 activity + commit  
4. 涉及表结构则有 migration  
5. `uv run ruff check .`  
6. 测试覆盖 401 / 主路径 / 错误码  
7. OpenAPI 变了就 `make codegen`
