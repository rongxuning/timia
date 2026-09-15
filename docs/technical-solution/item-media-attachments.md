# 任务截图与视频 — 技术方案

> 规划文档。实现以 [2026-09-15-item-media-attachments-design.md](../superpowers/specs/2026-09-15-item-media-attachments-design.md) 为准。本文只回答三件事：文件放哪、表怎么改、路径泄露为什么读不到。

## 结论（先看这个）

| 问题 | 决定 |
|------|------|
| 视频/图片放哪 | 私有 MinIO 桶 `timia-media`，仅 docker 内网；**不**走 nginx 静态目录，**不**对公网开 9000 |
| 对象 key | `item-media/{attachment_id}/original`（另有 `thumb` / `poster`）。key 不含文件名、用户、任务 id |
| 数据库 | **不改** `items` 业务列。新表 `item_attachments`。API **永不**返回 object key |
| 防泄露 | 读文件只走已登录 + `require_project_content_access` 的 `GET .../attachments/{id}/content`。只有路径、没有会话 = 401 |

否决：本地磁盘 + `/media/` 静态托管（路径即权限）；v1 预签名直连（完整 URL 在 TTL 内仍可被转发下载）。

## 存放

```
浏览器 / App
  → nginx /core-service/   （client_max_body_size 256m）
  → core-service（JWT + 项目权限）
  → MinIO:9000（内网）PutObject / GetObject+Range
Postgres 只存元数据 + 内部 object_key
```

生产 compose 增加 `minio` 服务与数据卷，**不**在 `deploy/nginx.conf` 增加 `/minio/` 或 `/media/`。

客户端拿到的是应用路径，例如：

`GET /workspaces/{wid}/projects/{pid}/items/{iid}/attachments/{aid}/content?variant=thumb`

Web 必须带 Authorization 拉成 blob 再显示，不能把该路径当普通 CDN 丢进 `<img src>`。

图片入库剥 GPS EXIF，并生成最长边 480px 缩略图。视频 v1 原样存储、不转码；封面可选。

限额：每任务 20 个；图 10MiB（jpeg/png/webp）；视频 200MiB（mp4/quicktime）。

## 数据库

Alembic：`0035_item_attachments`，接在 `0034_merge_0033_heads` 之后。

`item_attachments` 要点：

- 归属：`workspace_id` / `project_id` / `item_id`（ON DELETE CASCADE）+ `created_by_user_id`
- `kind`: `image` \| `video`；`status`: `pending` \| `ready` \| `failed`
- 内部：`object_key` / `thumb_object_key` / `poster_object_key` / `storage_backend` / `sha256` — **不进 OpenAPI 响应**
- 展示：`mime_type` `byte_size` `original_filename` `width_px` `height_px` `duration_ms`

`ItemOut` / 任务详情带 `attachments[]`。日历 `ScheduleTaskItemOut` 只加 `media_count`，不下发文件。

任务跨工作区转移时 UPDATE 附件上的 `workspace_id`/`project_id`，对象不搬（key 与 ws 无关）。重复展开的新任务不复制附件。

## 防泄露

1. MinIO 公网不可达 + 桶私有 + AK/SK 只在服务端  
2. JSON 不出现可直连 URL / 签名 query  
3. `GET content` 每次鉴权；路径四元组必须与行一致，否则 404  
4. `Cache-Control: private, no-store`  
5. 活动日志不写 object key  

「UUID 够长所以保密」不算安全措施。

## 本阶段

只提交规格，不写业务代码。实现顺序见规格文末：存储底座 → 表 → API → 视图 → nginx/测试 → Web → iOS。
