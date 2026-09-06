# iOS 日/周拖拽与空闲折叠 — 手动 QA 清单

> 配套实现：`docs/superpowers/plans/2026-09-06-ios-calendar-drag-collapse.md`  
> Cloud Agent 环境无 Xcode；下列项需在 macOS 模拟器/真机完成。

## 单测（macOS）

```bash
cd codes/mobile/ios && xcodebuild test -scheme Timia \
  -destination 'platform=iOS Simulator,name=iPhone 16' \
  -only-testing:TimiaTests/IdleCollapsePlannerTests \
  -only-testing:TimiaTests/TimelineGeometryTests \
  -only-testing:TimiaTests/RescheduleMathTests
```

## 折叠

| # | 场景 | 期望 |
|---|------|------|
| C1 | 稀疏日日程进入 | ≥2h 空闲自动压缩；顶栏显示「展开全部」 |
| C2 | 点顶栏「展开全部」 | 全部空闲展开为 24h；按钮变为「折叠空闲」 |
| C3 | 点压缩条 | **不**单独展开该段；不新建任务 |
| C4 | 周模式仅一天有会 | 公共空闲压缩条七列对齐；顶栏总开关控制整周 |
| C5 | 杀进程重进 | `schedule.idleCollapseEnabled` 偏好保持 |

## 拖拽

| # | 场景 | 期望 |
|---|------|------|
| D1 | 日模式长按拖到另一整点 | PATCH 成功；时长不变；整点 snap |
| D2 | 拖回原整点松手 | **无**网络请求 |
| D3 | 周模式跨列拖 | 日期+时刻更新；目标列高亮 |
| D4 | archived / 全天 | 不可拖 |
| D5 | 拖拽中 | 滚动锁定；时间轴临时全展开；松手后恢复折叠偏好 |
| D6 | 单击（非长按） | 仍打开编辑器 |

## 回归

| # | 场景 | 期望 |
|---|------|------|
| R1 | 点空白新建 | 仍 15 分钟 snap |
| R2 | 翻日/翻周分页 | 正常 |
| R3 | 重叠 lane | 不错乱 |
| R4 | 今日当前时间线 | 折叠后仍可见（protectNow） |
| R5 | 409 冲突 | tip + 回滚/刷新 |
