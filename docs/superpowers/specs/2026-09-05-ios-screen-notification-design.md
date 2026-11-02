# iOS 锁屏实时通知（Live Activity）设计

## Goal

在用户允许「后台持续运行」后，于锁屏展示当日未开始、进行中、逾期与全天待办。不展示健康同步。这些行都为空时立即结束 Live Activity。

## Behavior

1. **授权提示**：登录后若尚未选择，弹出提示「是否允许 Timia 在后台持续运行」，按钮「允许」「不允许」。
2. **不允许**：关闭提示，写入偏好 `denied`，不启动锁屏活动；可在「我的」中重新开启。
3. **允许**：写入偏好 `allowed`。有待展示任务时启动 Live Activity，并在 App 活跃 / 日程刷新时更新内容。未开始、进行中、逾期、全天行都为空时立即结束活动（`dismissalPolicy: .immediate`）；任务再次出现时重新 `request`。iOS 无法保证进程永不被杀，锁屏卡片由系统托管直至活动结束或过期。
4. **展示（自上而下）**：
   - **进行中**：当日定时 `doing` 且非全天、非逾期。
   - **未开始**：当日 `todo` 且非全天、非逾期的定时任务，每行「名称 + 时间」。
   - **逾期**：截止日早于当天且仍为 `todo` / `doing` 的任务（含 builder 已合并的逾期），每行「名称 + 带日期时间」。仅有逾期未完成任务时卡片保持打开。
   - **全天**：当日全天任务（`end - start ≥ 23h` 或无 `startAt`）且状态为 `todo` / `doing`，每行「名称 + 时间」。
   - 不展示「健康数据同步」。HealthKit 同步保留，只是不出现在锁屏 Live Activity 上。
5. **关闭**：用户在「我的」关闭开关时结束 Live Activity。当日没有任何上述任务行时同样立即结束。

## Non-goals

- Android（当前无原生客户端）
- Push / Remote Live Activity
- 真正绕过 iOS 后台限制保活进程
- Dynamic Island 紧凑态复杂布局（提供最小紧凑态即可）

## Architecture

| 组件 | 职责 |
|------|------|
| `ScreenNotificationPreference` | UserDefaults 偏好：unset / allowed / denied |
| `TimiaScreenActivityAttributes` | ActivityKit 属性与 ContentState（双 target 共享源文件） |
| `ScreenNotificationManager` | 启停/刷新 Live Activity；拉取当日日历任务与逾期列表；组装 ContentState |
| `ScreenNotificationPromptModifier` | 登录后一次性提示 UI |
| `TimiaWidget` 扩展 | 锁屏 / Dynamic Island Live Activity 视图 |
| Account「锁屏通知」开关 | 再次允许或关闭 |

数据源复用：`GET /views/schedule/calendar?view=day`、`GET /views/schedule/overdue`、与日历相同的全天判定。
