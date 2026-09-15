# 任务截图 / 视频附件 — 设计规格

**Date:** 2026-09-15  
**Status:** 规划（本阶段不写实现代码）  
**Scope:** 给 `items`（任务）增加截图与视频；对象如何存放、表如何改、如何保证「拿到路径也不能直接读文件」  
**Out of scope（本阶段不做实现；规格里写清边界）:** 评论附件、便利贴对象存储迁移、服务端转码、公开 CDN、全文搜图/OCR

---

## Goal

任务可以挂多张截图、多段视频。文件存在私有对象存储里；Postgres 只存元数据与内部 object key。读文件必须经过登录 + 与任务相同的项目权限。对象 key / API 路径泄露本身不能让未授权者拿到内容。

## 现状（已核对）

| 点 | 现状 | 位置 |
|----|------|------|
| 任务表 | `items` 只有文本字段（title/body/details/color/…），无媒体列 | `codes/core-service/app/models/item.py` |
| 任务权限 | `require_project_content_access`：workspace owner 或 active project member | `app/services/permissions.py` |
| 任务 API | `/workspaces/{wid}/projects/{pid}/items`；`ItemOut` 无附件 | `app/routes/items.py`、`app/schemas/item.py` |
| 任务详情视图 | `build_item_detail_view` 拼 item + comments | `app/services/views/task_drawer.py` |
| 日历列表 | `ScheduleTaskItemOut` 同样无媒体；列表场景不能塞完整附件 | `app/schemas/views/schedule.py` |
| 跨工作区转移 | `apply_item_transfer` 会改 `items.workspace_id` / `comments.workspace_id`，附件必须跟着改 | `app/services/item_api.py` |
| 便利贴附件 | 表已建，`storage_url` 是 `local://{id}/{filename}`，文件在浏览器 IndexedDB / iOS 本地 | `sticky_note_attachments`；见 `docs/technical-solution/sticky-notes.md` |
| 生产拓扑 | 单机 docker-compose：Postgres + core-service + web + nginx + mcp；**没有对象存储** | `docker-compose.prod.yml`、`deploy/nginx.conf` |
| 上传能力 | core-service 无 `UploadFile` / multipart；nginx 未设 `client_max_body_size`（默认 1MB） | `pyproject.toml`、`nginx.conf` |
| 鉴权 | Web：Bearer AT + HttpOnly RT cookie；iOS：mobile JWT | `app/api/deps.py` |

关键结论：

1. **不能**把图片 URL 写进 `items.body` / `details` 当普通字符串——路径一旦出现在活动日志、MCP、截图、转发消息里就会变成可猜测入口。
2. 便利贴那套 `storage_url` 公开字段 **不能照搬**到任务：任务是协作数据，权限边界是项目成员，不是「只有自己的设备」。
3. 这是产品第一次真正存二进制，应一次把**私有桶 + 鉴权读**做对，而不是先公开目录再补洞。

---

## 方案对比

### 方案 A — 本地磁盘 + nginx 静态目录

文件落到 core-service 挂载卷，nginx `location /media/ { alias ...; }` 直接吐文件。

- 优点：实现最快，无新服务。
- 缺点：路径即权限。UUID 文件名只是「不好猜」，**拿到路径就能下**。备份、扩容、Range 视频都别扭。生产默认 1MB body 也拦不住本质问题。
- **否决。** 不满足「路径泄露不可读」。

### 方案 B — 私有 MinIO + core-service 鉴权代理（推荐）

compose 增加 MinIO（S3 API）。桶默认私有，**不对公网暴露**。上传、下载都走 core-service：先 `get_current_user` + `require_project_content_access`，再对内网 MinIO `GetObject` / `PutObject`。

- 优点：路径（object key 或 `/attachments/{id}/content`）没有凭证就是 401/403。与现有 RBAC 一致。浏览器/iOS 不用碰 MinIO。以后换 OSS/S3 只换 `STORAGE_*` 配置。
- 缺点：音视频流量经 Python；单机可接受。nginx 要加大 body 与超时。
- **采用。**

### 方案 C — 预签名 URL（短时）

鉴权通过后签发 60–300s 的 S3 GET URL，浏览器直连存储。

- 优点：大视频不占应用 CPU。
- 缺点：完整 URL（含 query）在有效期内等价于临时密钥。它会出现在 HAR、Referer、CDN 日志、`<video src>`。用户的威胁模型是「得到了路径」——预签名 URL **就是**可直连的路径。单机部署还要把 MinIO 或签名网关暴露到公网。
- **本阶段不采用。** 若以后流量上来，可在代理上对 `GET .../content` 做内部 302 到短时签名 URL，DB 与 API 元数据仍永不存可直连地址。

| | A 静态目录 | B 鉴权代理 | C 预签名直连 |
|--|-----------|-----------|-------------|
| 仅有 object key / API 路径能否下载 | 能 | 不能 | 不能（缺签名） |
| 完整 URL 泄露 | 永久可读 | 无完整直连 URL | TTL 内可读 |
| 与现有 JWT/项目权限 | 绕过 | 强制复用 | 签发时检查，读时不再检查 |
| 生产改动 | nginx alias | MinIO 内网 + 代理 | MinIO 需对浏览器可达 |
| 视频 Range | nginx 原生 | 代理转发 `Range` | 原生 |

**推荐：B。** 核心原则：**存储层无公开读；应用层每次读都鉴权。**

---

## 架构

```
Web / iOS
  │  Bearer AT（或 cookie 会话刷新后的 AT）
  │  multipart 上传 / GET 内容（带 Range）
  ▼
nginx  /core-service/     client_max_body_size 256m
  ▼
core-service
  1. get_current_user
  2. require_project_content_access(workspace, project, user)
  3. 用 attachment_id 查 item_attachments，校验 item/project/workspace 一致
  4. 内网 S3：PutObject / GetObject（含 Range）
  ▼
MinIO（compose 内网，不映射公网端口）
  bucket: timia-media（private）
  key:    item-media/{attachment_id}/original
          item-media/{attachment_id}/thumb
          item-media/{attachment_id}/poster
  ▲
Postgres
  item_attachments 只存 object_key 等内部字段
  API 响应永不返回 object_key、桶名、MinIO 主机
```

职责拆分：

| 单元 | 做什么 | 不做什么 |
|------|--------|----------|
| `item_attachments` 表 | 归属、类型、尺寸、内部 key、状态 | 不存可直连 URL |
| `MediaStore` | 对内网 S3 的 put/get/delete；测试可换本地目录 | 不做权限判断 |
| `item_media` service | 权限、MIME/大小、写库、剥 EXIF、生成缩略图 | 不直接操作 HTTP |
| `routes/item_attachments.py` | 鉴权依赖、multipart、流式响应、`log_activity` | 不拼 MinIO 公网 URL |
| nginx | 反代、放大 body/超时 | **不** `alias` 媒体目录、**不**暴露 MinIO |

`items` 表本身不加图片/视频列。一对多附件走独立表，避免 JSON 数组、乐观锁冲突和「body 里塞 markdown 图」。

---

## 对象如何存放

### 桶与网络

- 生产 / 本地 compose 都加 `minio` 服务；**只加入 docker 网络，不 `ports:` 到宿主机 9000**（运维需要控制台时用 SSH 隧道，不写进公网 nginx）。
- 桶 `timia-media`：创建后关闭匿名策略；core-service 用专用 AK/SK，最小权限（该桶读写）。
- 环境变量（`core/config.py`，禁止硬编码）：

| 变量 | 含义 | 生产示例 |
|------|------|----------|
| `MEDIA_BACKEND` | `s3`（默认生产）/ `memory`（单测） | `s3` |
| `MEDIA_S3_ENDPOINT` | MinIO 内网 | `http://minio:9000` |
| `MEDIA_S3_BUCKET` | 桶名 | `timia-media` |
| `MEDIA_S3_ACCESS_KEY` / `MEDIA_S3_SECRET_KEY` | 凭据 | 只在 `/etc/timia/.env.prod` |
| `MEDIA_S3_REGION` | 兼容字段 | `us-east-1` |
| `MEDIA_S3_USE_SSL` | 内网一般 false | `false` |

单测不启 MinIO：`MEDIA_BACKEND=memory` 或临时目录，接口与 S3 相同。

### Object key 规则

```
item-media/{attachment_id}/original
item-media/{attachment_id}/thumb
item-media/{attachment_id}/poster
```

约束：

1. **key 里只有附件 UUID**，不含用户名、原文件名、item_id、workspace_id。原文件名只在 DB。
2. **不把 workspace/item 放进 key**：任务会跨项目/工作区转移，避免搬对象。权限只查表，不靠路径前缀。
3. 变体分文件，避免「猜到 original 就能枚举出 sibling」以外的信息；即便枚举到 thumb key，没有 MinIO 凭证也读不到（桶私有）。
4. 禁止目录 listing（MinIO 默认对匿名关闭即可）。

### 客户端看到的「路径」

API **只**给相对应用路径，例如：

```
GET /workspaces/{wid}/projects/{pid}/items/{iid}/attachments/{aid}/content
GET /workspaces/{wid}/projects/{pid}/items/{iid}/attachments/{aid}/content?variant=thumb
GET /workspaces/{wid}/projects/{pid}/items/{iid}/attachments/{aid}/content?variant=poster
```

这些路径出现在任务抽屉、`<img src>`、`<video src>` 里。没有 AT（或未带 cookie 会话）就是 401；有登录但不是该项目成员就是 403（与现有 `not_project_member` 一致）。**不要**再额外返回 `https://minio.../item-media/...`。

Web `<img>` / `<video>` 必须走现有 `apiFetch` 同源能力：生产是 `https://timia.online/core-service/...`，带 Authorization。不能把二进制 URL 丢给不带头的普通 `<img src>`（会 401）。实现时用 blob URL：先鉴权 GET，再 `URL.createObjectURL`。iOS 用 `URLRequest` 加 Bearer。

### 文件处理（入库时）

| 类型 | 原文件 | 派生 | 隐私 |
|------|--------|------|------|
| 图片 `image` | 原字节写入 `original`（可转存为 jpeg/webp，规格实现时定一种） | `thumb`：最长边 480px 的 jpeg/webp | **剥 GPS/方向以外的敏感 EXIF**（至少 `GPS*`）；保留 Orientation 用于正确旋转后剥掉 |
| 视频 `video` | 原容器原样存（v1 **不转码**） | `poster`：v1 可由客户端上传封面；没有则内容接口对 poster 返回 404，UI 用占位 | 不解析、不存轨内 metadata 到 API |

v1 不上 ffmpeg，避免 core-service 镜像膨胀。需要服务端截帧时另开阶段。

---

## 数据库如何调整

**不改** `items` 的业务列（不加 `screenshot_url`、不加 JSON 媒体数组）。  
**新增** `item_attachments`。Alembic 下一号：`0035_item_attachments`，`down_revision = 0034_merge_0033_heads`。

### 表 `item_attachments`

```sql
CREATE TABLE item_attachments (
  id                   UUID PRIMARY KEY,
  workspace_id         UUID NOT NULL REFERENCES workspaces(id),
  project_id           UUID NOT NULL REFERENCES projects(id),
  item_id              UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  created_by_user_id   UUID NOT NULL REFERENCES users(id),

  kind                 VARCHAR(20)  NOT NULL,  -- image | video
  status               VARCHAR(20)  NOT NULL DEFAULT 'ready',
                       -- pending | ready | failed（直传 multipart 成功即 ready；
                       -- 若以后拆「先占位再 PUT」，才用 pending）

  -- 内部存储定位：禁止出现在任何 API JSON
  object_key           VARCHAR(500) NOT NULL,
  thumb_object_key     VARCHAR(500),
  poster_object_key    VARCHAR(500),
  storage_backend      VARCHAR(20)  NOT NULL DEFAULT 's3',

  mime_type            VARCHAR(100) NOT NULL,
  byte_size            BIGINT       NOT NULL,
  original_filename    VARCHAR(255) NOT NULL,

  width_px             INTEGER,
  height_px            INTEGER,
  duration_ms          INTEGER,      -- 仅 video；客户端或以后 ffprobe

  sha256               CHAR(64),     -- 完整性；不做跨用户去重（避免侧信道）

  created_at           TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT uq_item_attachments_object_key UNIQUE (object_key),
  CONSTRAINT ck_item_attachments_kind CHECK (kind IN ('image', 'video')),
  CONSTRAINT ck_item_attachments_status CHECK (status IN ('pending', 'ready', 'failed'))
);

CREATE INDEX idx_item_attachments_item
  ON item_attachments (item_id, created_at);

CREATE INDEX idx_item_attachments_workspace
  ON item_attachments (workspace_id);
```

ORM：`UUIDPrimaryKeyMixin` + `TimestampMixin`，与现有模型一致。  
`Item.attachments` relationship，`cascade="all,delete-orphan"`（删任务时删行；对象删除在 service 里显式调 `MediaStore.delete`，不能只靠 FK）。

### 冗余 `workspace_id` / `project_id`

与 `comments` 一样冗余，目的：

- 转移任务时一行 UPDATE，不必 join items
- 鉴权 SQL 可 `WHERE id=? AND workspace_id=? AND project_id=? AND item_id=?`，防止 IDOR（改 URL 里的 id 组合）

转移时（扩展 `apply_item_transfer` 与项目整迁）：

```text
UPDATE item_attachments
   SET workspace_id = :target_ws, project_id = :target_proj
 WHERE item_id = :item_id
```

对象 **不搬迁**（key 不含 ws/item）。

### 字段故意不放进 API 的

`object_key`、`thumb_object_key`、`poster_object_key`、`storage_backend`、`sha256`（sha256 可选：仅管理接口；对普通客户端无意义且可能用于碰撞探测）。

### `items` / `ItemOut` 怎么变

| 场景 | 字段 |
|------|------|
| `GET/PATCH` 单任务、`ItemDetailViewOut` | `attachments: ItemAttachmentOut[]`（仅 `status=ready`） |
| 日历 / 看板 / `ScheduleTaskItemOut` | **不**下发完整列表；可选 `media_count: int`（默认 0），避免 N 个任务 × 缩略图打爆日程接口 |
| 创建任务 `ItemCreate` | **不**带文件；先 201 出 item，再 POST 附件（抽屉/iOS 可本地暂存，保存成功后排队上传） |
| 重复任务展开 | 副本 **不复制**附件（避免存储放大与共享 key）；文档与 UI 写明 |

### `ItemAttachmentOut`（响应）

```text
id: str
kind: "image" | "video"
status: "ready"
mime_type: str
byte_size: int
original_filename: str
width_px: int | null
height_px: int | null
duration_ms: int | null
created_at: datetime
created_by: UserBrief | null
content_path: str          # 相对 API 路径，variant=original
thumb_path: str | null     # image 必有；video 可空
poster_path: str | null    # video 有封面才有
```

没有 `url`、`storage_url`、`signed_url`。

### 活动日志

`entity_type=item_attachment`（或挂在 `item` 上）：

- `attachment_added`：meta 仅 `item_id, attachment_id, kind, byte_size`（**不要** filename 以外的路径，filename 可保留）
- `attachment_deleted`：同上

禁止把 object key 写入 `activity_log.metadata`。

---

## 如何保证路径泄露不可读

威胁：攻击者拿到了 object key、content_path、或某次响应 JSON。

| 层 | 措施 | 挡住什么 |
|----|------|----------|
| 网络 | MinIO 不进 nginx、不映射公网端口 | 直接打 `http://host:9000/timia-media/...` |
| 桶 ACL | 私有桶，无匿名 GET | 即便误暴露端口，匿名仍 403 |
| 凭据 | AK/SK 仅 core-service 环境变量 | 客户端永远拿不到存储密钥 |
| API 契约 | JSON **永不**返回 key / 桶 / 签名 URL | 日志、MCP、前端 state 里没有直连地址 |
| 鉴权读 | `GET .../content` 必须 JWT + 项目权限，再 GetObject | 复制路径到匿名窗口 → 401；换号无项目权限 → 403 |
| IDOR | 路径四元组 (ws, project, item, attachment) 与行完全匹配，否则 `not_found` | 改 UUID 撞库 |
| 文件名 | key 用附件 UUID，不用 `screenshot-from-CEO.png` | 路径不泄露业务语义 |
| 缓存 | `Cache-Control: private, no-store`（或 `private, max-age=60` + `Vary: Authorization`） | 共享代理/CDN 把图缓存给其他人 |
| 浏览器 | Web 用带 Authorization 的 fetch → blob URL；禁止无头 `<img src>` | 避免「路径当 CDN」 |
| 上传 | 只接受 multipart 到已鉴权路由；校验 Content-Type **和** magic bytes | 假 MIME、HTML 当图 |
| 体积/数量 | 见限额 | 用存储当免费网盘 |
| EXIF | 入库剥 GPS | 图本身把家坐标带给项目里所有成员（项目内可见是产品选择；至少不要再泄露到派生文件以外） |
| 枚举 | UUID v4 主键，无自增 | 遍历 id |
| 删除 | 删行 + DeleteObject（original/thumb/poster）；失败记日志可重试，不把 key 回给客户端 | 残留对象仍因桶私有不可读 |

**明确不依赖的假安全：**

- 「UUID 够长所以 URL 保密」——这是方案 A，否决。
- 「HTTPS 就安全」——HTTPS 只防传输窃听，不防 URL 被转发。
- 「文件名随机、nginx 不列目录」——对已泄露的那一条路径无效。

**预签名若将来启用：** 只存在内存/响应头 `Location`，TTL ≤ 120s，`GET` 限定单 key；DB 仍只存 object_key。规格默认仍走代理，避免第一期就把「可直连路径」发到客户端。

---

## HTTP API

前缀与任务一致，权限函数相同，写操作 `log_activity` + `commit`。

```
POST   /workspaces/{workspace_id}/projects/{project_id}/items/{item_id}/attachments
       multipart/form-data
       fields: file, kind=image|video
       201 ItemAttachmentOut

GET    /workspaces/{workspace_id}/projects/{project_id}/items/{item_id}/attachments
       200 list[ItemAttachmentOut]   # 仅 ready，按 created_at

GET    /workspaces/{workspace_id}/projects/{project_id}/items/{item_id}/attachments/{attachment_id}/content
       query: variant=original|thumb|poster  (default original)
       200 application/octet-stream（实际 Content-Type 用入库 mime）
       支持 Range（视频拖动）
       Content-Disposition: inline; filename="sanitized-name"
       Cache-Control: private, no-store

DELETE /workspaces/{workspace_id}/projects/{project_id}/items/{item_id}/attachments/{attachment_id}
       204
```

错误码（与 core-service 约定对齐）：

| HTTP | detail |
|------|--------|
| 401 | 未登录（现有 deps） |
| 403 | `not_a_member` / `not_project_member` |
| 404 | `item_not_found` / `not_found`（附件与路径不一致也用 not_found，减少存在性探测） |
| 400 | `unsupported_media_type` / `file_too_large` / `too_many_attachments` / `invalid_kind` / `empty_file` |
| 409 | 任务 `version_conflict` 与附件无关；附件删除不碰 item.version |
| 413 | nginx/body 超限（尽量在应用层先返回 `file_too_large`） |

谁能删：与改任务相同——项目内容权限即可（不单独做「只有上传者能删」）。若以后要更细，再加规则。

创建任务：附件 API 要求 item 已存在。Web `TaskDrawerWithComments` / iOS `TaskEditorView` 在 create 成功拿到 `id` 后再上传；失败则提示「任务已创建但媒体未传完」，允许重试（按 item 列附件）。

---

## 限额（v1 写死在 config，可调）

| 项 | 值 |
|----|----|
| 单任务附件数 | 20 |
| 图片 | jpeg / png / webp / heic（若 Pillow/解码支持；否则 v1 不含 heic，iOS 先转 jpeg） |
| 图片上限 | 10 MiB |
| 视频 | mp4（`video/mp4`）、quicktime（`video/quicktime`） |
| 视频上限 | 200 MiB |
| 视频时长 | v1 不强制（无 ffprobe）；客户端可传 `duration_ms` 作展示 |
| 工作区总容量 | v1 不做；后续按 `sum(byte_size)` |

Magic bytes 与声明 MIME 不一致 → `unsupported_media_type`。

---

## 客户端（规划，本阶段不改代码）

### Web

- 任务抽屉在 details 下增加「截图 / 视频」区：缩略图网格、点击预览、删除。
- 上传：`<input type="file" accept="image/*,video/mp4">`，保存任务后或编辑态直接 POST multipart。
- 展示：`apiFetch` 拉 blob，短时 object URL；抽屉关闭 revoke。
- 日历卡片：只用 `media_count` 小图标，不拉图。
- i18n：新文案走 `messages/*.json`。

### iOS

- `TaskEditorView`：PhotosPicker / 相机；编辑态上传。
- 请求头带 mobile AT；AVPlayer 不能直接喂无鉴权 URL，需下载到临时文件或自定义 `AVAssetResourceLoader`（实现阶段再定，规格要求「不能用裸 URL 播」）。

### MCP

- v1 **不**增加二进制 tool。列表任务不要把 content_path 当可公开链接文档化。

### 便利贴

- **不在本需求迁移。** 将来 `StickyNoteAttachment.storage_url` 改为同一 `MediaStore`，权限改为 `owner_user_id == current_user`。任务与便利贴共享存储实现、分表分前缀（`item-media/` vs `sticky-media/`）。

---

## 基础设施

`docker-compose.prod.yml` / `docker-compose.local.yml`：

- 服务 `minio`：官方镜像，数据卷 `timia_minio`
- 初始化 job 或 core-service 启动时 ensure bucket
- core-service `depends_on: minio`

`deploy/nginx.conf` 仅改 `/core-service/`：

```nginx
client_max_body_size 256m;
proxy_request_buffering off;   # 大视频上传
proxy_read_timeout 300s;
proxy_send_timeout 300s;
```

**禁止**增加 `location /media/` 或 `location /minio/`。

`.env.prod.example` / `.env.example` 补上 `MEDIA_*`。

core-service 依赖：`boto3`（或 `minio` SDK）、`python-multipart`、`Pillow`。Ruff 行宽 100。API 变更后 `make codegen`。

---

## 生命周期

| 事件 | 行为 |
|------|------|
| 删附件 | DeleteObject 三个 key（忽略 NoSuchKey）+ DELETE 行 |
| 删任务 | ORM cascade 删行；service 先列 key 再删对象（或 DB 触发器外的显式清理，避免孤儿对象） |
| 转移任务/项目 | 更新 `workspace_id`/`project_id`；对象不动 |
| 重复展开 | 新 item 无附件 |
| 上传中途失败 | 不留 `ready` 行；已写入的 object 删除或标记 failed 后 GC |

孤儿对象 GC（可选后续）：按 `item-media/` 列桶，对比 DB `object_key`，删除无行对象。v1 可手工运维。

---

## 测试（实现阶段最低集）

1. 未登录 GET content → 401  
2. 非项目成员 GET content → 403  
3. 项目成员 GET content → 200，body 与上传一致  
4. 把合法 content_path 的 attachment_id 换成其他任务的 → 404  
5. 直接请求 MinIO 公网映射（生产应根本连不上）；单测断言响应 JSON 无 `object_key`、无 `minio`、无 `X-Amz`  
6. 超限 / 错误 MIME → 400  
7. Range：`bytes=0-10` 返回 206  
8. 删除后 GET → 404，且 store 中 key 不存在  

---

## 实现阶段切分（仍不写代码）

1. **存储抽象 + MinIO compose + 配置**  
2. **表 + migration + 模型**  
3. **上传/列表/下载/删除 API + 权限 + 剥 EXIF + 缩略图**  
4. **ItemOut / 详情视图带 attachments；转移时更新冗余列**  
5. **nginx body；测试；codegen**  
6. **Web 抽屉**  
7. **iOS 编辑器**  

1–5 可单独合并，前端后跟。未完成 3 之前不要把任何媒体 URL 写进任务字段。

---

## 否决清单

- 在 `items` 上加 `screenshots text[]` / `video_url`
- 把 markdown 图片写进 `body` 当存储方案
- nginx 静态 `/media/`
- API 返回永久 `https://...` 文件地址
- 复用 `sticky_note_attachments.storage_url` 语义（`local://` 或将来的公开 CDN URL）
- 预签名 URL 作为 v1 默认读路径
- 评论/便利贴一并做对象存储

---

## Spec 自检

- 无 TBD/TODO 占位；限额、key 格式、API、错误码已钉死。
- 与「路径泄露不可读」一致：全程不发可直连 URL，MinIO 内网私有，读必鉴权。
- 范围单域：任务媒体 + 存储底座；便利贴迁移明确排除。
- 转移任务、重复任务、日历列表的行为无歧义。
