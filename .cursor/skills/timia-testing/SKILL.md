---
name: timia-testing
description: Use when adding or running Timia tests, pytest, i18n key checks, iOS XCTest, mcp-server respx tests, or deciding which package's test command to run after a change.
---

# Timia Testing

按**改动的包**跑测试，不要编造全仓单一 test 命令。

| 包 | 命令 |
|----|------|
| core-service | `cd codes/core-service && uv run pytest -q`（可再加 `uv run ruff check .`） |
| mcp-server | `make mcp-server-test` 或 `cd codes/mcp-server && uv run pytest -q` |
| web | `cd codes/web && npm run test:i18n`（`src/i18n/*.test.ts` + 中英 key 对齐） |
| iOS | `xcodegen generate` 后 `xcodebuild` test/build（见 `codes/mobile/ios/README.md`） |
| API 形状 | 根目录 **`make codegen`**，不要手改 `generated.ts` |

## 怎么补测

- core：鉴权 401、主路径、snake_case 错误码；纯布局/日期可用无 DB 单测（参考 `test_schedule_views.py`、`test_plan_time.py`）
- mcp：respx mock HTTP；断言 URL/method/json；覆盖 401/403/409 与 readonly
- web：没有全站 Jest/RTL 套件；新逻辑优先抽纯函数（如 `planImportPreview.ts`）再测。**不要**为了测去引入 TanStack Query
- iOS：几何、同步队列、模型解码放 `TimiaTests`；UI 流程放 `TimiaUITests`

改日历周起始、时区、规划相对日：至少覆盖「周三 → 当周周日」。改乐观锁：参考 `test_version_conflict.py`。
