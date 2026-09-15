---
name: timia-health
description: Use when changing HealthKit sync, health samples/workouts/metrics, /health/sync, /views/me/health, health cards, rollup, or deciding whether health data belongs on Web, iOS, or MCP.
---

# Timia Health

个人域：只挂 `owner_user_id`，**不进 workspace**，**不写 `activity_log`**。别人的 id 一律 `404`（不要 `403`，防存在性泄露）。

## 谁写谁读

| 端 | 职责 |
|----|------|
| iOS | HealthKit 授权 + 逐条同步（前台/后台）`POST /health/sync/*` |
| Web | 只读 `/views/me/health`、cards、workouts；不做授权 |
| MCP | **禁止** sync / `DELETE /health/data`；只读 views 属 P2 未交付 |

幂等键：`(owner_user_id, hk_uuid)` unique。删除走 sync deletions + `deleted_at`。

## 不要做

- 不要同步 ECG；不要把健康明细写入活动流
- 不要只用会漏点的普通 `HKSampleQuery` 读累计型（步数/消耗等要用 series/statistics）
- 睡眠汇总**不加** `in_bed`；夜间归属按 `end_at` 的用户时区日历日
- 空状态显示「—」，不要用 0 冒充没戴表
- Web 侧栏「健康」`/my/health` 独立于「数据分析」；iOS **不做** analytics

训练：`health_workout_session`；指标卡片走日汇总。清数据：`DELETE /health/data`（仅本人，高危，MCP 永不暴露）。

规格：`docs/superpowers/specs/2026-08-27-health-domain-design.md`。
