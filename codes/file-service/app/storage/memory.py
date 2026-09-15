from app.storage.base import MediaStore, ObjectNotFound


class MemoryStore(MediaStore):
    def __init__(self) -> None:
        self._blobs: dict[str, bytes] = {}
        self._types: dict[str, str] = {}

    def put(self, key: str, data: bytes, content_type: str) -> None:
        self._blobs[key] = data
        self._types[key] = content_type

    def get(self, key: str) -> bytes:
        try:
            return self._blobs[key]
        except KeyError as e:
            raise ObjectNotFound(key) from e

    def get_range(self, key: str, start: int, end: int | None) -> tuple[bytes, int]:
        data = self.get(key)
        total = len(data)
        start = max(start, 0)
        if start >= total:
            return b"", total
        stop = total if end is None else min(end + 1, total)
        return data[start:stop], total

    def delete(self, key: str) -> None:
        self._blobs.pop(key, None)
        self._types.pop(key, None)

    def exists(self, key: str) -> bool:
        return key in self._blobs

    def clear(self) -> None:
        self._blobs.clear()
        self._types.clear()
