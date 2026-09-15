import uuid

import pytest

from app.services.media_kind import (
    UploadRejected,
    object_key_for,
    sanitize_filename,
    sniff_upload,
)


def test_object_key_only_uses_file_id():
    file_id = uuid.UUID("11111111-1111-1111-1111-111111111111")
    assert object_key_for(file_id) == "files/11111111-1111-1111-1111-111111111111/original"
    assert object_key_for(file_id, "thumb") == "files/11111111-1111-1111-1111-111111111111/thumb"


def test_sanitize_filename_strips_path_and_odd_chars():
    assert sanitize_filename("../../secret CEO.png") == "secret_CEO.png"


def test_sniff_rejects_empty():
    with pytest.raises(UploadRejected, match="empty_file"):
        sniff_upload(kind="image", data=b"", declared_mime="image/jpeg")


def test_sniff_rejects_html_as_image():
    with pytest.raises(UploadRejected, match="unsupported_media_type"):
        sniff_upload(kind="image", data=b"<html>nope</html>", declared_mime="image/jpeg")


def test_sniff_jpeg_ok():
    from tests.helpers import jpeg_bytes

    mime = sniff_upload(kind="image", data=jpeg_bytes(), declared_mime="image/jpeg")
    assert mime == "image/jpeg"
