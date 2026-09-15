# Timia Cursor Skills — 调研与范围

**Date:** 2026-09-15  
**Also:** MCP Cursor 名称 `timia-prod` → `timia-mcp`

## 为什么用 Skill 而不是再堆 Rule

- **Rule**（`.cursor/rules`）适合「打开某类文件就自动带上」的规范。现有 `ui-interaction-design.mdc`（web glob）应保留。
- **Skill** 适合「遇到某类任务才加载」的流程：MCP 调用顺序、领域字段、各端脚手架。只在 description 命中时读全文，省 context。
- `core-service.mdc` 没有 glob、`alwaysApply: false`，作为 Skill 更容易被发现；Rule 仍保留作细则。

## 已落地（6）

| Skill | 触发场景 | 不写进 Skill 的原因的反面（它解决什么） |
|-------|----------|------------------------------------------|
| `using-timia-mcp` | 用 MCP 管日程/任务 | 漏 `version`、把 NL parse 当落库、MCP 名叫 `timia-prod`、乱调不存在的删除/健康工具 |
| `timia-domain` | 改实体或选 API/MCP 面 | `priority` 被写成 low/high；角色写成 admin/guest；便签/规划/健康边界不清 |
| `core-service` | 改 FastAPI | 分层、权限 raise、codegen、Alembic |
| `timia-web` | 改 Next.js | 硬编码文案、引入未使用的 react-query、漏 codegen |
| `timia-ios` | 改 SwiftUI | 手改 xcodeproj、用 Web JWT、HealthKit 逻辑塞进 MCP |
| `extending-timia-mcp` | 给 mcp-server 加 tool | 直连 DB、注册破坏性 tool、中文 tool 文案 |

## 明确不做

| 候选 | 原因 |
|------|------|
| 部署/轻量云 runbook | 低频；`docs/deploy/cloud.md` 已完整 |
| HealthKit 同步内部 | 只属于 iOS；MCP 永不暴露 `/health/sync/*` |
| Plans 订阅导入 | 领域 Skill 点到即可；P1 MCP tools 尚未实现 |
| 把 UI Rule 整份复制成 Skill | glob Rule 已自动生效 |
| 通用 TDD/Git | 仓库外 Superpowers 已覆盖 |

## 维护

- Skill 只写「智能体容易做错」的约束；细则链到现有 rule/README。
- MCP 宿主配置键与 FastMCP 名一律 `timia-mcp`。
