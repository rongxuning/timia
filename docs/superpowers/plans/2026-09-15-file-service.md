# File Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `codes/file-service` as the only MinIO client so tasks can attach images/videos, with query APIs ready for a later file browser; core-service never proxies bytes.

**Architecture:** FastAPI file-service validates the same JWT/session as core, stores blobs in private MinIO (memory backend in tests), exposes `/files` and `/views/file-browser`, and accepts docker-only `/internal` rehome/unbind. Web/iOS call file-service directly. Core notifies file-service after item/project transfer or delete.

**Tech Stack:** Python ≥3.11, uv, FastAPI, Pydantic v2, SQLAlchemy 2.0, Alembic, PostgreSQL, Pillow, boto3, MinIO, pytest, Next.js, Swift.

## Global Constraints

- No presigned URLs; JSON never includes object_key, bucket, MinIO host, or `X-Amz`
- MinIO not on public nginx; production compose does not publish 9000
- PAT `tm_pat_` rejected on file-service (401)
- API kinds: `image` | `video` | `file`; task UI only image/video
- Limits: 20 bindings/item, image 10MiB, video 200MiB, file 20MiB
- Cache-Control: `private, no-store`; Range supported
- Ruff line-length 100; new user-visible web copy via next-intl
- file-service Alembic version table `alembic_version_file_service`
- Internal token header `X-Internal-Token`

## File map

| Path | Role |
|------|------|
| `codes/file-service/` | New service |
| `docker-compose.prod.yml` / `docker-compose.local.yml` | minio + file-service |
| `deploy/nginx.conf` | `/file-service/` |
| `.env.example` / `.env.prod.example` | MEDIA_* FILE_* |
| `codes/core-service/app/services/file_notify.py` | unbind/rehome JSON |
| `codes/web/src/lib/file-api.ts` | client |
| `codes/web/src/components/task/TaskAttachments.tsx` | drawer UI |
| `codes/mobile/ios/Timia/Core/API/FilesAPI.swift` | iOS client |

---

### Task 1: file-service skeleton + health + MIME helpers

Create package, health route, `sniff_upload` / `object_key_for` / `sanitize_filename` with tests.

### Task 2: storage + models + migration

Memory and S3 stores; `files` / `file_variants` / `file_bindings` / `file_activity`; identity mappings; Alembic 0001.

### Task 3: auth, permissions, CRUD + content

JWT/session; upload/list/get/content/delete/bindings; FileOut redaction; Range; EXIF strip + thumb.

### Task 4: query + file-browser view + internal

`GET /files` filters; `GET /views/file-browser`; `/internal/bindings/rehome` and `unbind`.

### Task 5: compose, nginx, Makefile, env

MinIO + file-service; nginx body 256m; make targets; codegen.

### Task 6: core-service notify

After item delete/transfer and project transfer, POST internal JSON (no-op if base unset).

### Task 7: Web task drawer

fileApiFetch + attachments grid; upload after create.

### Task 8: iOS task editor

FilesAPI + picker in TaskEditorView.

Each task: tests first for behavior, then implementation, then `uv run pytest -q` / ruff, then commit.
