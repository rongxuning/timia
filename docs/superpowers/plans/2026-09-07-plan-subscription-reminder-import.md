# 订阅提醒持续展示 + 导入本期 Implementation Plan

> **For agentic workers:** Use executing-plans. This session implements the spec directly after writing it (user: 写 spec 并且直接开工).

**Goal:** 提醒从 D-1 20:00 起保持到被下一周期替换；订阅中可手动导入今天所在周期。

**Architecture:** 纯函数改 `plan_time.upcoming_period_start` / `reminder_has_started`；job 只按候选建 pending、替换时过期旧 pending；导入走 `plan_apply` 新接口；列表加 `current_period_imported`。

**Tech Stack:** FastAPI + SQLAlchemy 2 + pytest；Next.js App Router。

## Global Constraints

- 提醒开始仍是订阅时区 `D-1 20:00`
- 不因周期结束过期 pending
- 已 `applied` 不展示「导入本期」
- 跳过/过期可再导本期
- 文案简体中文

---

### Task 1: Time helpers + reminder job

- `reminder_has_started`；`upcoming_period_start` → `date | None`（最晚已开启未占用周期）
- Job：`None` 则跳过；去掉周期结束过期；替换时旧通知标已读
- 测试：周一补跑、周期结束仍 pending、替换并标已读

### Task 2: 导入本期 API + 列表字段

- `GET/POST /plan-subscriptions/{id}/current-period` 与 `import-current-period`
- `PlanSubscribedRowOut.current_period_imported`
- 测试：409、成功、pending 合流、跳过后可再导

### Task 3: 订阅中 UI

- 收藏靠标题；条件渲染「导入本期」+ 弹窗
- codegen + api-catalog
