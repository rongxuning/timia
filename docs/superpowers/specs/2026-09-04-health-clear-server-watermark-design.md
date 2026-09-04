# Health Clear + Server Watermark Authority

## Scope

1. Web: compact range/source panels; 「数据管理」清除全部健康样本数据（保留档案与卡片布局）。
2. API: `DELETE /health/data` hard-deletes owner samples/workouts/routes/daily/insights/runs/state.
3. API: `POST /health/sync/checkpoint` advances `health_sync_state.last_synced_at` without a run row.
4. iOS: watermark authority is server; local UserDefaults is cache only; day success calls checkpoint; refresh applies server (null clears local).

## Clear keeps

- `health_profiles`
- `health_metrics_layout`
