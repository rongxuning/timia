from __future__ import annotations

import boto3
from botocore.client import Config
from botocore.exceptions import ClientError

from app.core.config import settings
from app.storage.base import MediaStore, ObjectNotFound


class S3Store(MediaStore):
    def __init__(self) -> None:
        self._bucket = settings.media_s3_bucket
        self._client = boto3.client(
            "s3",
            endpoint_url=settings.media_s3_endpoint,
            aws_access_key_id=settings.media_s3_access_key,
            aws_secret_access_key=settings.media_s3_secret_key,
            region_name=settings.media_s3_region,
            use_ssl=settings.media_s3_use_ssl,
            config=Config(s3={"addressing_style": "path"}),
        )

    def ensure_ready(self) -> None:
        try:
            self._client.head_bucket(Bucket=self._bucket)
        except ClientError:
            self._client.create_bucket(Bucket=self._bucket)

    def put(self, key: str, data: bytes, content_type: str) -> None:
        self._client.put_object(
            Bucket=self._bucket,
            Key=key,
            Body=data,
            ContentType=content_type,
        )

    def get(self, key: str) -> bytes:
        try:
            resp = self._client.get_object(Bucket=self._bucket, Key=key)
        except ClientError as e:
            if e.response.get("Error", {}).get("Code") in {"NoSuchKey", "404"}:
                raise ObjectNotFound(key) from e
            raise
        return resp["Body"].read()

    def get_range(self, key: str, start: int, end: int | None) -> tuple[bytes, int]:
        spec = f"bytes={start}-" if end is None else f"bytes={start}-{end}"
        try:
            resp = self._client.get_object(Bucket=self._bucket, Key=key, Range=spec)
        except ClientError as e:
            if e.response.get("Error", {}).get("Code") in {"NoSuchKey", "404"}:
                raise ObjectNotFound(key) from e
            raise
        body = resp["Body"].read()
        total = int(resp.get("ContentRange", "").rsplit("/", 1)[-1] or len(body))
        return body, total

    def delete(self, key: str) -> None:
        self._client.delete_object(Bucket=self._bucket, Key=key)

    def exists(self, key: str) -> bool:
        try:
            self._client.head_object(Bucket=self._bucket, Key=key)
            return True
        except ClientError:
            return False
