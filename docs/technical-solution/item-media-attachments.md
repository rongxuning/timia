# 任务媒体与文件平台 — 技术方案（修订）

> 规划-only。权威规格：[2026-09-15-item-media-attachments-design.md](../superpowers/specs/2026-09-15-item-media-attachments-design.md) revision 2。  
> 相对上一版：MinIO 仍私有、仍无公开路径；**预签名取消**；**字节不再走 core-service**，改由独立 `file-service` 管理，并按「以后还要存文件 + 查询展示」建模。

## 结论

| 问题 | 决定 |
|------|------|
| 谁读写 MinIO | 仅 `codes/file-service`（:8003，公网 `/file-service/`） |
| 预签名 | 不做 |
| 对象 | 私有桶 `timia-files`，key=`files/{file_id}/original`（+ thumb/poster） |
| 任务怎么挂图 | **不改** `items` 列。`files` + `file_bindings(binding_type=item)` |
| 以后通用文件 / 文件库 | 同一服务：`kind=file`、`GET /files` 查询、`GET /views/file-browser` 展示。core 不参与 |
| 防泄露 | 每次读 JWT + 项目/工作区权限；MinIO 不对公网；JSON 无 object key |

## 流量

```
任务 JSON  →  /core-service/  → core-service
图片视频文件 →  /file-service/  → file-service → MinIO（内网）
转移/删除任务 → core 内网 JSON /internal/bindings/* → file-service（不传文件）
```

nginx 只给 `/file-service/` 加大 `client_max_body_size 256m`。不要 `/media/`、`/minio/`。

客户端读：`GET /file-service/files/{id}/content?variant=thumb`，带登录 AT，拉成 blob。日历 v1 不拉文件。

## 表（file-service 自己的 Alembic）

- `files`：工作区/可选项目、kind（image/video/file）、文件名/MIME/大小、内部 object_key、软删  
- `file_variants`：thumb / poster  
- `file_bindings`：挂到 item（及以后 sticky_note / library）

查询：`workspace_id` + 可选 `project_id` / `kind` / `binding_*` / 文件名 `q` + cursor。这就是文件库的后端；页面可以后做。

## 鉴权

file-service 本地验 JWT、查同一库的 session 与 membership，**不把 content 请求转给 core**。PAT v1 不用。  
`/internal/*` 仅 docker 网 + `FILE_INTERNAL_TOKEN`。

## 限额（任务）

每任务 20 个 binding；图 10MiB；视频 200MiB。API 已允许 `kind=file`（≤20MiB），任务 UI 先不开放。
