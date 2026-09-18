# 任务媒体与文件平台 — 设计规格（修订）

**Date:** 2026-09-15  
**Revision:** 2（独立 `file-service`；禁止预签名）  
**Status:** 规划（本阶段不写实现代码）  
**Supersedes:** 同日 revision 1（当时把鉴权代理放在 core-service，并预留预签名）。本修订按已确认诉求改掉这两点。

**Confirmed:**

| 项 | 决定 |
|----|------|
| 存储访问 | 方案 B：私有 MinIO，应用鉴权后读写；路径泄露不可下载 |
| 预签名 URL | **不做**。不签发、不 302、不出现在响应里 |
| 谁碰 MinIO | **只有新服务** `codes/file-service`。core-service **不**代理字节、**不**持有 S3 密钥 |
| 扩展 | 同一服务后续承载通用文件、查询与展示，不另起「第二个 MinIO 网关」 |

**本阶段实现边界（文档写清，代码仍不写）：** 任务挂 image/video；查询 API 一次做对。Web 独立「文件库」页、文件夹、便利贴迁移、转码、OCR **不阻塞**任务附件，但数据模型不挡它们。

---

## Goal

1. 任务可挂多张截图、多段视频。  
2. 文件字节只经过 **file-service → 私有 MinIO**，不经过 core-service。  
3. 元数据与查询在 file-service，后续同一套 API 能管通用文件并支撑文件库 UI。  
4. 没有登录 + 对应范围权限，拿到任何路径（object key 或 `/files/{id}/content`）都读不到内容。

---

## 现状（仍成立）

| 点 | 现状 |
|----|------|
| 任务 | `items` 无媒体列；权限 `require_project_content_access` |
| 生产 | compose：Postgres + core-service:8000 + web + nginx + mcp；无对象存储 |
| 预留服务位 | README / nginx 已约定 `codes/<name>/` + `/<name>/`；`notification-service:8001`、`finance-service:8002` 为注释占位 |
| 鉴权 | JWT 由 core-service 签发；Web AT + RT cookie，iOS mobile JWT；会话表在同一 Postgres |
| 便利贴 | `storage_url = local://…`，文件在客户端；**本阶段不迁** |
| core-service | 无 multipart / 无 S3 依赖 |

---

## 方案对比（修订后）

### 仍否决

- **A. nginx 静态 `/media/`：** 路径即权限。  
- **C. 预签名直连 MinIO：** 完整 URL 在 TTL 内可转发下载；还要把存储暴露给浏览器。用户已明确不做。  
- **B-core. MinIO + core-service 代理（revision 1）：** 任务附件能跑，但会把大文件、缩略图、未来文件库、Range 播放全部堆进核心 API，和「后续还要存文件 + 查询展示」冲突。

### 采用：B-file — 私有 MinIO + 独立 file-service 鉴权代理

```
Web / iOS
  ├─ JSON 任务 CRUD ──────────────► nginx /core-service/  ► core-service:8000
  └─ 上传 / 下载 / 查询文件 ──────► nginx /file-service/  ► file-service:8003
                                                              │
                                                              ▼
                                                         MinIO:9000（内网，无私网映射）
                                                              ▲
Postgres（同一实例，分 Alembic 版本表）
  core 表：users / workspaces / memberships / items / sessions …
  file 表：files / file_variants / file_bindings
```

**核心原则：** 存储层无公开读；**file-service 每次读都鉴权**；core-service 继续只做协作域。

为什么独立服务而不是 core 里一个 module：

- 二进制与 JSON API 的超时、body 限制、依赖（Pillow 等）不同。  
- 文件库、通用文件、以后可能的转码，都不应拖 core 发布节奏。  
- 与仓库已有约定一致：新后端 = `codes/<name>/` + compose + nginx `location`。

---

## 服务边界

### `codes/file-service`（新）

端口 **8003**，对外 **`https://timia.online/file-service/`**（nginx 剥前缀，与 `/core-service/` 相同）。

| 负责 | 不负责 |
|------|--------|
| MinIO 唯一客户端（put/get/delete/ensure bucket） | 签发 JWT、改密码、成员管理 |
| `files` 元数据、变体、绑定 | `items` 标题/时间/评论 |
| 上传校验、剥 EXIF、缩略图 | 任务乐观锁、重复展开规则 |
| 文件查询与浏览器视图 API | 把 MinIO 暴露给公网 |
| 用 JWT + 成员表判断「能否碰这个文件」 | 预签名 URL |

技术栈与 core-service 对齐，便于运维：**Python ≥3.11、uv、FastAPI、Pydantic v2、SQLAlchemy 2.0、Alembic、Ruff 100**。分层同样是 `routes/` / `services/` / `schemas/` / `models/` / `core/`。另加 `app/storage/`（S3 适配，测试可 memory）。

### `codes/core-service`

- **不**加 `item_attachments`，**不**加 `MEDIA_*`，**不**流式转发文件。  
- 任务详情 **不**内嵌附件字节；客户端并行调 file-service 列表。  
- 仅在任务/项目 **转移或删除** 时，用内网 JSON 通知 file-service 更新绑定（见生命周期）。这不是文件代理。

### MinIO

- compose 服务 `minio`，数据卷 `timia_minio`。  
- **不** `ports:` 到宿主机，**不**进 nginx。运维控制台用 SSH 隧道。  
- 桶名 `timia-files`（私有，关匿名）。只有 file-service 的 AK/SK。  
- 以后「再存一类文件」= 同一桶不同 key 前缀，或同服务第二桶；**不**新开网关进程。

---

## 鉴权（文件请求不进 core-service）

file-service 自己校验请求，**不**把 GET content 转发到 core。

1. **凭证：** 与 core 相同的 `Authorization: Bearer <AT>`。共享 `JWT_SECRET` / `JWT_ISSUER` / web 与 mobile audience。  
2. **会话：** 读同一 Postgres 的 `web_sessions` / `mobile_device_sessions`（逻辑与 `app/api/deps.py` 相同）。AT 过期仍由客户端打 core 的 `/auth/refresh`，file-service 不发 refresh。  
3. **用户：** `users.status == active`。  
4. **范围：** 读 `workspace_members` / `project_members` / `projects`，规则与 `require_project_content_access` **相同**（workspace owner 看全部项目；member 需 active project member）。file-service 实现自己的 `require_file_scope`，以文件行上的 `workspace_id`/`project_id` 为准。  
5. **PAT：** v1 **拒绝**（`tm_pat_` → 401）。MCP 不拉二进制，避免 Agent Token 变成网盘。以后若要元数据查询，另开 scope，不在本规格打开 content。

**不采用**「每个 Range 请求 HTTP 问 core `/internal/can-access`」：视频拖动会打爆 core，也违背「文件流量不走 core」。共享库复制 50 行 JWT+成员查询是可接受的耦合；成员规则变更时两处对齐（测试锁住相同 403 码）。

IDOR：`GET /files/{id}/content` 只凭 `file_id` + 当前用户权限，**不**再要求客户端把 workspace/item 拼进路径（避免漏改 URL 四元组）。列表接口必须带 `workspace_id`，服务端再鉴权。

---

## 对象如何存放

### Key

```
files/{file_id}/original
files/{file_id}/thumb
files/{file_id}/poster
```

- 只有文件 UUID，无用户名、原文件名、item/workspace id（转移不搬对象）。  
- 通用文件与图片视频同一前缀；用 DB `kind` 区分，不用 `images/` vs `docs/` 目录当权限。  
- 禁止匿名 listing。

### 客户端路径（唯一合法读法）

```
GET /file-service/files/{file_id}/content
GET /file-service/files/{file_id}/content?variant=thumb
GET /file-service/files/{file_id}/content?variant=poster
```

生产完整 URL 形如 `https://timia.online/file-service/files/{id}/content`。这仍是 **API 路径**，不是对象存储路径。无 AT → 401；无范围权限 → 403。

JSON **永不**返回：object key、桶名、MinIO 主机、`X-Amz-*`、任何 `https://minio…`。

Web：带 Authorization 的 fetch → blob URL。禁止无头 `<img src>`。iOS：带 Bearer 的 `URLRequest`；播放器不得用裸 URL。

### 入库处理

| kind | original | 派生 | 隐私 |
|------|----------|------|------|
| `image` | 存原图 | `thumb` 最长边 480px | 剥 GPS EXIF；Orientation 用于转正后去掉 |
| `video` | 原容器，v1 不转码 | `poster` 可选（客户端传封面） | 不把轨内 metadata 送进 API |
| `file` | 原字节 | 无；以后可加 `preview` 变体 | MIME 白名单 |

ffmpeg / 预览图放在 **file-service** 后续迭代，不进 core 镜像。

---

## 数据模型（为文件库预留）

同一 Postgres。file-service 使用独立 Alembic 版本表 `alembic_version_file_service`，**不**往 core 的 `0035` 里塞文件表。

`items` **不加**媒体列。

### `files`（逻辑文件，查询主表）

```sql
CREATE TABLE files (
  id                 UUID PRIMARY KEY,
  workspace_id       UUID NOT NULL REFERENCES workspaces(id),
  project_id         UUID REFERENCES projects(id),          -- 空 = 工作区级文件（文件库后期）
  folder_id          UUID,                                  -- v1 全 NULL；文件夹表以后再加 FK
  created_by_user_id UUID NOT NULL REFERENCES users(id),

  kind               VARCHAR(20)  NOT NULL,                 -- image | video | file
  status             VARCHAR(20)  NOT NULL DEFAULT 'ready', -- pending | ready | failed | deleted

  original_filename  VARCHAR(255) NOT NULL,
  mime_type          VARCHAR(100) NOT NULL,
  byte_size          BIGINT       NOT NULL,
  width_px           INTEGER,
  height_px          INTEGER,
  duration_ms        INTEGER,

  object_key         VARCHAR(500) NOT NULL,                 -- 内部
  storage_backend    VARCHAR(20)  NOT NULL DEFAULT 's3',
  sha256             CHAR(64),

  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at         TIMESTAMPTZ,                           -- 软删，文件库回收站预留

  CONSTRAINT uq_files_object_key UNIQUE (object_key),
  CONSTRAINT ck_files_kind CHECK (kind IN ('image', 'video', 'file')),
  CONSTRAINT ck_files_status CHECK (status IN ('pending', 'ready', 'failed', 'deleted'))
);

CREATE INDEX idx_files_workspace_created
  ON files (workspace_id, created_at DESC)
  WHERE deleted_at IS NULL AND status = 'ready';

CREATE INDEX idx_files_project_created
  ON files (project_id, created_at DESC)
  WHERE deleted_at IS NULL AND status = 'ready' AND project_id IS NOT NULL;

CREATE INDEX idx_files_workspace_kind
  ON files (workspace_id, kind, created_at DESC)
  WHERE deleted_at IS NULL AND status = 'ready';

CREATE INDEX idx_files_filename
  ON files (workspace_id, original_filename);
```

文件名检索 v1 用 `ILIKE '%'||q||'%'`（`q` 已限 100 字符，并拒绝 `%`/`_` 或对二者转义）。工作区文件量上去再加 `pg_trgm`，不作为本阶段依赖。

### `file_activity`（v1 要写，不进 core `activity_log`）

```sql
CREATE TABLE file_activity (
  id          UUID PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  actor_user_id UUID NOT NULL REFERENCES users(id),
  file_id     UUID REFERENCES files(id) ON DELETE SET NULL,
  action      VARCHAR(40) NOT NULL,   -- uploaded | downloaded | renamed | deleted | bound | unbound
  metadata    JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_file_activity_workspace
  ON file_activity (workspace_id, created_at DESC);
```

`metadata` 只允许 `kind`、`byte_size`、`binding_type`、`binding_id`、`original_filename`。禁止 object key。content 热路径（Range 播放）**不**写 downloaded，避免刷库。

### `file_variants`

```sql
CREATE TABLE file_variants (
  id          UUID PRIMARY KEY,
  file_id     UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  variant     VARCHAR(20) NOT NULL,           -- thumb | poster | preview
  object_key  VARCHAR(500) NOT NULL,
  mime_type   VARCHAR(100) NOT NULL,
  byte_size   BIGINT NOT NULL,
  width_px    INTEGER,
  height_px   INTEGER,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_file_variants_file_variant UNIQUE (file_id, variant),
  CONSTRAINT uq_file_variants_object_key UNIQUE (object_key)
);
```

original 放在 `files.object_key`，不在 variants 再存一行，避免双源。

### `file_bindings`（挂到任务 / 以后便利贴 / 评论 / 文件库）

```sql
CREATE TABLE file_bindings (
  id             UUID PRIMARY KEY,
  file_id        UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  binding_type   VARCHAR(30) NOT NULL,        -- item | sticky_note | comment | library
  binding_id     UUID NOT NULL,               -- 对应实体 id；library 可用 workspace_id
  workspace_id   UUID NOT NULL REFERENCES workspaces(id),
  project_id     UUID REFERENCES projects(id),
  sort_order     INTEGER NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_file_bindings_target UNIQUE (file_id, binding_type, binding_id)
);

CREATE INDEX idx_file_bindings_target
  ON file_bindings (binding_type, binding_id, sort_order);
```

v1 任务附件：`binding_type='item'`，`binding_id=item.id`，`project_id=item.project_id`。  
同一文件以后可以再绑 `library`，任务删除绑定不必立刻删对象（文件库保留）。**v1 产品行为：** 从任务移除 = 若无其它 binding 则软删文件并删对象；有其它 binding 则只解绑。

`binding_id` **不加** 指向 `items.id` 的 FK：file-service 不在 core 事务里级联，删除任务只走 `/internal/bindings/unbind`。错误 binding 在查询时自然查不到任务侧 UI。

### 以后加、现在预留的位置

| 能力 | 怎么扩，不必改 MinIO 网关 |
|------|---------------------------|
| 通用文件 | `kind=file` + MIME 白名单；同一 POST /files |
| 文件夹 | `file_folders` + `files.folder_id`；查询加 `folder_id` |
| 文件库页 | 已有 `GET /files` + `GET /views/file-browser` |
| 便利贴 | `binding_type=sticky_note`，权限改成 owner |
| 工作区容量 | `SUM(byte_size) GROUP BY workspace_id` |
| 回收站 | `deleted_at` 已在 `files` |

---

## HTTP API（file-service）

鉴权：所有下列路由 `Depends(get_current_user)`。写操作记 `file_activity`，**不**写 core `activity_log`。任务抽屉不依赖活动流也能看附件。Range 播放不记 `downloaded`。

### 写入 / 读取 / 删除

```
POST /files
  multipart: file
  form: kind=image|video|file
        workspace_id
        project_id?          # 任务场景必填
        binding_type?        # 任务：item
        binding_id?          # 任务：item_id
  201 FileOut

GET  /files/{file_id}
  200 FileOut

GET  /files/{file_id}/content?variant=original|thumb|poster
  200 / 206 Range
  Content-Type: 入库 mime
  Content-Disposition: inline; filename="sanitized"
  Cache-Control: private, no-store

PATCH /files/{file_id}
  json: original_filename?
  200 FileOut                  # 重命名，文件库需要

DELETE /files/{file_id}
  204                          # 软删 + 无 binding 时删对象；见生命周期

POST /files/{file_id}/bindings
  json: binding_type, binding_id, workspace_id, project_id?
  201 FileBindingOut

DELETE /files/{file_id}/bindings/{binding_id}
  204
```

`kind=file` 的 POST v1 **可以接受并落库**（白名单 PDF/zip 等另列），任务 UI 先不入口；避免第二次改表。若希望 v1 严格只收图/视频：API 已允许 `file`，任务抽屉只传 image/video。**决定：API 支持三种 kind；任务 UI 只暴露 image/video。**

### 查询（文件查询系统的后端，v1 就做）

```
GET /files
  query:
    workspace_id          required
    project_id            optional
    kind                  optional image|video|file
    binding_type          optional
    binding_id            optional     # 任务抽屉：item + item_id
    q                     optional     # 文件名 substring，最长 100
    status                default ready
    limit                 1–100, default 40
    cursor                opaque
  200 FileListOut { items: FileOut[], next_cursor }
```

权限：先 `require_workspace_member`；若带 `project_id` 或结果行有 `project_id`，按行过滤不可见项目（member 只能看见自己参与的项目文件；owner 全可见）。**禁止**返回其它工作区文件。

### 展示视图（给以后文件库页，v1 实现构建函数 + 路由，Web 可以后接）

```
GET /views/file-browser
  query: workspace_id, project_id?, folder_id?, kind?, q, sort=created_at|name|size, order=desc|asc, limit, cursor
  200 FileBrowserViewOut
      workspace_id, workspace_name
      project_id?, project_name?
      folder_id?, folder_name?
      crumbs: [{id, name}]          # v1 空
      folders: []                   # v1 空数组
      files: FileBrowserItemOut[]   # 含 thumb_path、kind、size_label、created_at
      next_cursor
      totals: { file_count, byte_size }   # 当前过滤条件下
```

`workspace_name`：file-service 读 `workspaces` 表。不要为了拼名字去调 core HTTP。

### `FileOut`（无内部存储字段）

```
id, kind, status
mime_type, byte_size, original_filename
width_px, height_px, duration_ms
workspace_id, project_id, folder_id
created_by: {id, display_name}
created_at
bindings: [{id, binding_type, binding_id}]
content_path, thumb_path?, poster_path?
```

没有 `url` / `storage_url` / `signed_url` / `object_key`。

### 错误码

| HTTP | detail |
|------|--------|
| 401 | `missing_token` / `invalid_token` / `invalid_session`（与 core 对齐） |
| 403 | `not_a_member` / `not_project_member` |
| 404 | `not_found` |
| 400 | `unsupported_media_type` / `file_too_large` / `too_many_bindings` / `invalid_kind` / `empty_file` / `query_too_long` |
| 413 | 网关超限 |

任务侧限额：同一 `item` 的 binding 最多 **20** → `too_many_bindings`。

---

## core-service 怎么配合（无文件代理）

| 事件 | core 做什么 | file-service 做什么 |
|------|-------------|---------------------|
| 创建/编辑任务 | 只写 items | 无 |
| 上传附件 | 无 | 客户端直接 POST /files |
| 读任务抽屉 | 返回 ItemOut **不含** attachments | 客户端 `GET /files?binding_type=item&binding_id=` |
| 日历 | 不加 attachments；v1 **不加** media_count（免得 core 查文件表） | 需要角标时以后 `GET /files` 聚合或单独 count 接口 |
| 转移任务 | 改 items/comments 后 **内网 POST** `http://file-service:8003/internal/bindings/rehome` body: `{binding_type:item, binding_id, workspace_id, project_id}` | 更新该 item 下 bindings + files 的 ws/project |
| 删除任务 | 内网 `POST /internal/bindings/unbind` `{binding_type:item, binding_id}` | 解绑；无剩余 binding 则软删+删对象 |
| 转移整个项目 | 同样 rehome，按 project_id 批量 | 批量 UPDATE |

`/internal/*`：只监听 docker 网络，nginx **不**反代；校验 `X-Internal-Token`（与 file-service 共享的 `FILE_INTERNAL_TOKEN`）。**不走用户 JWT，不传文件。**

core **不**为了拼 ItemOut 去调 file-service（避免任务列表 N+1 HTTP）。

重复展开的新任务：无 binding，无附件。

---

## 限额

| 项 | v1 |
|----|----|
| 单 item binding | 20 |
| image | jpeg/png/webp；10 MiB；heic：v1 不含，iOS 先转 jpeg |
| video | mp4 / quicktime；200 MiB |
| file | pdf / txt / markdown / zip / docx；20 MiB（任务 UI 不用） |
| 工作区总容量 | 不做，查询视图已返回 `totals.byte_size` 方便以后配额 |
| `q` | 最长 100 字符 |

Magic bytes 与声明 MIME 不一致 → `unsupported_media_type`。

---

## 防泄露（无预签名）

| 层 | 措施 |
|----|------|
| 网络 | MinIO 不进 nginx、不映射端口 |
| 桶 | 私有，匿名 403 |
| 密钥 | 仅 file-service 环境变量 |
| 契约 | JSON 无 key / 无签名 URL |
| 读 | 每次 JWT + 范围权限 + GetObject |
| 缓存 | `private, no-store` |
| 浏览器 | 必须带 Authorization |
| 枚举 | UUID，无自增 |
| 内部口 | `/internal` 不暴露公网 |

明确不做：UUID 当保密、HTTPS 当授权、预签名当「短时公开路径」。

---

## 基础设施

compose（prod + local 加 minio；local 开发可只起 minio+db，file-service 本机 8003）：

- `file-service`：build `codes/file-service`，expose 8003，`alembic upgrade` 后 uvicorn  
- `minio`：`depends_on` 仅 file-service 需要  
- core-service **不** depends_on minio  

nginx 新增，**只**这段加大 body（不要改小 JSON 的 core）：

```nginx
upstream timia_file_service { server file-service:8003; }

location /file-service/ {
    client_max_body_size 256m;
    proxy_request_buffering off;
    proxy_read_timeout 300s;
    proxy_send_timeout 300s;
    proxy_pass http://timia_file_service/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header Authorization $http_authorization;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

禁止 `location /media/`、`location /minio/`、`location /internal/`。

环境变量（file-service，写入 `.env.example` / `.env.prod.example`）：

| 变量 | 含义 |
|------|------|
| `DATABASE_URL` | 与 core 同一库 |
| `JWT_SECRET` / `JWT_ISSUER` / audiences | 与 core 相同 |
| `FILE_INTERNAL_TOKEN` | core 调 /internal |
| `MEDIA_BACKEND` | `s3` \| `memory` |
| `MEDIA_S3_ENDPOINT` | `http://minio:9000` |
| `MEDIA_S3_BUCKET` | `timia-files` |
| `MEDIA_S3_ACCESS_KEY` / `SECRET` / `REGION` / `USE_SSL` | |

Web：`NEXT_PUBLIC_FILE_API_BASE_URL` 生产为 `https://timia.online/file-service`。开发：Next rewrite `/file-service/:path*` → `localhost:8003`，或直连。codegen：file-service 自己 `export_openapi.py`，前端可第二份 generated types，或 Makefile `codegen` 跑两次。

Makefile 增加 `file-service-install` / `file-service`（端口 8003），与注释里的 8001/8002 约定一致。

---

## 客户端（规划）

### Web 任务抽屉

保存任务拿到 `item.id` 后 `POST /file-service/files`（kind + binding）。编辑态列表走查询接口。日历 v1 不拉文件。

### Web 文件库（后做页面，API 先有）

独立路由例如 `/w/[workspaceId]/files`，调 `/views/file-browser`。本规格不设计视觉稿，只保证 API 能按工作区/项目/类型/文件名列出并给 thumb_path。

### iOS

`TaskEditorView` 直连 file-service。播放与图片加载带 AT。

### MCP

不增加文件 tool。

---

## 生命周期

| 事件 | 行为 |
|------|------|
| 上传失败 | 不留 ready；已 put 的 object 删掉 |
| 解绑任务 | 无其它 binding → `deleted_at` + DeleteObject（original+variants） |
| 任务删除 | core internal unbind |
| 任务转移 | core internal rehome；对象 key 不变 |
| 软删 | 查询默认排除；content → 404 |
| 孤儿 GC | 定期列出 `files/{uuid}/` 与 DB 对比，只在 file-service 内跑 |

---

## 测试（file-service）

1. 无 AT 拉 content → 401  
2. 非成员 → 403  
3. 成员 → 200，字节一致  
4. 改 file_id → 404  
5. JSON 无 `object_key` / `minio` / `X-Amz`  
6. 超限 / 错 MIME → 400  
7. Range `bytes=0-10` → 206  
8. `GET /files?binding_type=item&binding_id=` 只返回该任务  
9. `q` 过滤文件名；跨 workspace 参数被忽略或 403  
10. 删除后 content 404 且 memory/s3 无 key  
11. `/internal` 无 token → 401，nginx 不暴露则额外用单元测  

core-service 现有测试不因文件而改，除非加 internal 客户端的契约测试（可选）。

---

## 实现切分（仍不写代码）

1. compose：MinIO + file-service 空服务 health  
2. file-service：JWT/会话/成员鉴权 + 表 migration  
3. storage 适配 + 上传/content/删除 + 剥 EXIF/thumb  
4. 查询 `GET /files` + `GET /views/file-browser`  
5. `/internal` rehome/unbind；core 在转移/删除处调用  
6. nginx / env / Makefile / codegen  
7. Web 任务抽屉  
8. iOS 任务编辑  
9. （后）Web 文件库页、文件夹、便利贴 binding  

1–6 可单独上线（API 可用、UI 未接）。未完成 3 之前不要在任务字段里写任何文件 URL。

---

## 否决清单

- core-service 代理字节或持有 S3 密钥  
- `items` 上的 URL 数组 / markdown 当存储  
- nginx 静态目录或公网 MinIO  
- 预签名、302 到存储  
- `item_attachments` 表（已被 `files` + `file_bindings` 替代）  
- 把 `sticky_note_attachments.storage_url` 当公开地址  
- file-service 签发 refresh token  
- 为文件再复制一套用户登录  

---

## Spec 自检

- 无 TBD；服务名、端口、桶、表、API、错误码、internal token、查询参数已钉死。  
- 「不走 core」= 字节与文件查询都不经 core；仅转移/删除一条 JSON。  
- 「不要预签名」= 规格内无签发路径。  
- 扩展：`kind=file`、bindings、file-browser 视图、folder_id 空位。  
- 防泄露与 B 方案一致，执行点从 core 换成 file-service。
