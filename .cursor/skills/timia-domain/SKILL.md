---
name: timia-domain
description: Use when modeling or changing Timia entities (workspace, project, item, comment, sticky note, plan, health), item status/priority/version, membership roles, or deciding which API or MCP surface owns a feature.
---

# Timia Domain

**层级：** Workspace → Project → Item → Comment

协作任务在项目里；日程视图是 Item 的时间投影（`start_at` / `end_at`），不是另一套实体。

## Item（日程任务）

| 字段 | 合法值 |
|------|--------|
| `status` | `todo` / `doing` / `done` / `archived` |
| `priority` | `"1"` \| `"2"` \| `"3"` \| `"4"`（四象限；默认 `"1"`） |
| `repeat` | `none` / `daily` / `weekly` / `monthly` |
| `version` | 乐观锁；PATCH 必须带当前值，冲突 `409 version_conflict` |
| `color` | `#RRGGBB`，默认 `#FFFFFF` |

不要用模型注释里的 `low/medium/high`（已过时）。无日期 Item 只能 `todo`（`undated_requires_todo`）。日历**周从周日开始**。

## 成员

Workspace / Project 角色只有 **`owner` | `member`**（没有 admin/guest）。

- Workspace owner 可看该空间下全部项目
- 普通 member 需要 active `ProjectMember` 才能碰项目内容
- 权限函数在 `services/permissions.py`，**raise HTTPException**，不返回 bool

## 其它域（不要和 Item 搅在一起）

| 域 | 归属 | 备注 |
|----|------|------|
| Sticky notes | 个人、无 workspace | AI parse → convert 才变成 Item；MCP P1。见 `timia-sticky-notes` |
| Plans | 模板订阅/导入 | 导入会**创建真实 Item**；仅 Web。见 `timia-plans` |
| Health | iOS HealthKit → core | 同步写接口禁止进 MCP；只读 views 为 P2。见 `timia-health` |
| Analytics | **仅 Web** | iOS 不做数据分析 |

个人域（便签/健康）对他人 id 返回 **404** 而非 403。系统角色 `user`/`admin` 与空间角色 `owner`/`member` 不是同一套。

细则：日程 `timia-schedule`，鉴权 `timia-auth`。

## API vs MCP

- 业务规则、DB、权限只在 `codes/core-service`
- `codes/mcp-server` 只调 REST + 裁剪 JSON
- 页面聚合走 `/views/...`；写操作走资源 REST
- Web JWT audience `timia-web`；iOS 设备挑战会话；Agent 用 `tm_pat_…`（不进 JWT decode）
