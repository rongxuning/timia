# Timia Cursor Skills — 调研与范围

**Date:** 2026-09-15  
**Also:** MCP Cursor 名称 `timia-prod` → `timia-mcp`

## 为什么用 Skill 而不是再堆 Rule

- **Rule**（`.cursor/rules`）适合「打开某类文件就自动带上」的规范。现有 `ui-interaction-design.mdc`（web glob）应保留。
- **Skill** 适合「遇到某类任务才加载」的流程：MCP 调用顺序、领域字段、各端脚手架。只在 description 命中时读全文，省 context。
- `core-service.mdc` 没有 glob、`alwaysApply: false`，作为 Skill 更容易被发现；Rule 仍保留作细则。

## 已落地（13）

### 横切 / MCP

| Skill | 触发场景 | 解决什么 |
|-------|----------|----------|
| `using-timia-mcp` | 用 MCP 管日程/任务 | 漏 `version`、把 NL parse 当落库、MCP 名叫 `timia-prod` |
| `timia-domain` | 改实体或选 API/MCP 面 | `priority` 取值、角色、个人域 vs 协作域 |
| `timia-auth` | 登录/JWT/PAT | 混用 web/iOS/agent 凭证 |
| `extending-timia-mcp` | 给 mcp-server 加 tool | 直连 DB、注册破坏性 tool |
| `timia-testing` | 补测或跑测 | 找错包的命令、给 web 硬上 Jest |
| `timia-deploy` | 生产/nginx/compose | 引入 TCR、改错 MCP 反代 |

### 产品域

| Skill | 触发场景 | 解决什么 |
|-------|----------|----------|
| `timia-schedule` | 日历/改期/NL | ISO 周、无日期任务改状态、漏 timezone |
| `timia-plans` | 规划模板/订阅/导入 | 改不可变 kind、导入未选项目、当 iOS 功能做 |
| `timia-health` | HealthKit / 健康页 | 把 sync 暴露给 MCP、健康写活动日志、用 0 填空 |
| `timia-sticky-notes` | 便签/AI 转任务 | 给便签加 workspace、parse 失败就不让保存 |

### 各端

| Skill | 触发场景 | 解决什么 |
|-------|----------|----------|
| `core-service` | 改 FastAPI | 分层、权限 raise、codegen、Alembic |
| `timia-web` | 改 Next.js | 硬编码文案、引入未使用的 react-query |
| `timia-ios` | 改 SwiftUI | 手改 xcodeproj、用 Web JWT |

## 仍不做独立 Skill

| 候选 | 原因 |
|------|------|
| 把 UI Rule 整份复制成 Skill | glob Rule 已自动生效 |
| 通用 TDD/Git | 仓库外 Superpowers 已覆盖 |
| HealthKit 逐类型样本百科 | `timia-health` + 规格已够；细节链到 health-domain spec |

## 维护

- Skill 只写「智能体容易做错」的约束；细则链到现有 rule/README/spec。
- MCP 宿主配置键与 FastMCP 名一律 `timia-mcp`。
- 新域先问：没有非显而易见的约束就不要再拆 Skill。
