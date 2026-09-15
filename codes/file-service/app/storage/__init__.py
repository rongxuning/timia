from functools import lru_cache

from app.core.config import settings
from app.storage.base import MediaStore
from app.storage.memory import MemoryStore
from app.storage.s3 import S3Store

_memory = MemoryStore()


@lru_cache(maxsize=1)
def get_store() -> MediaStore:
    if settings.media_backend == "s3":
        store = S3Store()
        store.ensure_ready()
        return store
    return _memory
