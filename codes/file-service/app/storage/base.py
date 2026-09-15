from abc import ABC, abstractmethod


class MediaStore(ABC):
    @abstractmethod
    def put(self, key: str, data: bytes, content_type: str) -> None:
        raise NotImplementedError

    @abstractmethod
    def get(self, key: str) -> bytes:
        raise NotImplementedError

    @abstractmethod
    def get_range(self, key: str, start: int, end: int | None) -> tuple[bytes, int]:
        raise NotImplementedError

    @abstractmethod
    def delete(self, key: str) -> None:
        raise NotImplementedError

    @abstractmethod
    def exists(self, key: str) -> bool:
        raise NotImplementedError

    def ensure_ready(self) -> None:
        return None


class ObjectNotFound(KeyError):
    pass
