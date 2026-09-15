---
name: timia-sticky-notes
description: Use when changing Timia sticky notes, floating note UI, AI parse of notes, convert-to-item, attachments, or /sticky-notes APIs on web or iOS.
---

# Timia Sticky Notes

便利贴是**个人速记**，没有 `workspace_id`/`project_id`。他人 note id → `404`。不写 workspace `activity_log`。

## 流程

1. 用户写下 title/content（content 必填；AI **失败也要能保存**）
2. `POST /sticky-notes/{id}/ai-parse` → 草稿（可多次，看 `/parses`）
3. 用户确认空间/项目后 `POST /sticky-notes/{id}/convert`（`parse_id` + `workspace_id` + `project_id`）
4. convert **复用 items API** 建正式任务；不要在便利贴侧另写一套创建任务

`item_id` 若已有：只把 parse **关联**到该任务（Web 任务抽屉先创建再 link 的路径）。

AI 草稿里的 `workspace_name` / `project_name` 是字符串，前端必须对上真实 id，对不上就让用户手选。

## UI

- Web：浮动按钮弹层；上输入、下列表
- iOS：页面切换，同一布局；可语音录入（`StickyNoteSpeechRecognizer`）
- 附件表已有多态 `attachment_type`（text/image/audio/video/file），不要另起附件模型

MCP notes tools 是 P1，尚未注册。规格：`docs/technical-solution/sticky-notes.md`。
