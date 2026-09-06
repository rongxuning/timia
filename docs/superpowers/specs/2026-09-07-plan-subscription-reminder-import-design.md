# 订阅提醒持续展示 + 导入本期

**Date:** 2026-09-07  
**Branch:** `feature/plan-reminder-import-current`  
**Scope:** 订阅周期提醒窗口、`plan_reminders` 补跑/替换、`订阅中` 卡片布局与「导入本期」  
**Out of scope:** 邮件/系统推送；改 cron 安装流程；静默自动写入日程

## Goal

订阅提醒从「周期开始前一天 20:00」出现后一直保持，直到下一个周期提醒被创建并替换。`订阅中` 在本周期尚未 `applied` 时提供「导入本期」，把今天所在周期的任务写入该订阅已绑定的空间/项目。

## Decisions (confirmed)

| Topic | Choice |
|-------|--------|
| 提醒开始 | 不变：本地 `D-1` 的 20:00 |
| 提醒结束 | 不再因 4 小时窗口或周期结束而消失 |
| 替换 | 仅当更新的周期提醒被创建时，旧 `pending` → `expired`，并标旧 `upcoming_period` 已读 |
| 补跑 | cron 任一小时：提醒已开始且该周期无占用 run，即可建/补 `pending` |
| 候选周期 | 提醒已开启的**最晚**未占用周期（周六 20:00 起推下一周，周一可补本周） |
| 导入本期入口 | 当前周期已有 `applied` → **不渲染按钮** |
| 跳过后再导 | 允许 |
| 周六 20:00 重叠 | 新提醒已指向下周，但日历仍在本周且未 `applied` → 仍显示「导入本期」，补本周 |
| 弹窗目标 | 不再选空间/项目，用订阅上的绑定 |

## 1. 提醒

占用 run：`applied` / `pending` / `skipped` / `expired`。

`upcoming_period_start` 返回「提醒已开始的最晚周期」，占用则继续往后，直到下一候选的提醒尚未开始则返回 `None`。

```text
now >= reminder_start(next(current))  → 候选从 next 起算（替换）
否则                                 → 候选 = current（可补本周）
占用则 next；next 未到开启时刻 → None
```

`reminder_has_started(D)`：订阅时区本地时间 `>= D 前一天 20:00`。

小时 job：

1. 对每个进行中分段算候选 `D`；`D is None` 则跳过。
2. 窗口已开且无占用 run → 插入 `pending` + `upcoming_period`。
3. 插入前把该订阅上更早的 `pending` 标 `expired`，对应未读 `upcoming_period` 标已读。
4. **不再**因「本地日期 > 周期最后一天」过期 `pending`。

「待确认导入」卡片、通知、角标仍只认 `status=pending`。

## 2. 导入本期

`GET /plan-subscriptions/{id}/current-period`  
`POST /plan-subscriptions/{id}/import-current-period`

- 校验：订阅属于当前用户，分段未结束。
- 周期：`current_period_start(period_kind, now, subscription.timezone)`。
- 预览：周期范围、目标空间/项目、是否已导入、槽位落到本周期后的任务（标题/起止/全日/地点）；映射失败的槽位省略。
- 写入：已有 `applied` → `409 already_imported`；已有 `pending` → 走现有确认；否则新建 `applied` 并 `materialize`。`skipped` / `expired` / `canceled` 不阻挡。

订阅列表行增加 `current_period_imported`，供前端决定是否渲染按钮。

## 3. UI

```
复crossfit  ♡                          [导入本期]  [取消订阅]
```

收藏紧贴标题右侧（`gap-2`）。「导入本期」仅当 `current_period_imported === false`。弹窗：周期、目标、任务列表、取消 / 确认导入。

提醒待确认与「导入本期」并存：前者跟 cron 选出的周期，后者永远是今天所在周期。

## 4. 错误码

| detail | HTTP |
|--------|------|
| `not_found` | 404 |
| `already_imported` | 409 |
| `empty_template` | 400 |
| `invalid_timezone` | 400 |

## 5. 测试

- 周一补跑能建出本周 pending。
- 周期结束不自动过期 pending。
- 下一周期开启时旧 pending 被替换，旧通知已读。
- 导入本期：成功 / 已导入 409 / 与同周期 pending 确认合流 / 跳过后可再导。
- 订阅列表在本周期已导入时 `current_period_imported=true`。
