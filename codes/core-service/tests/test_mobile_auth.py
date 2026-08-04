import base64
import uuid

import pytest
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec

from app.core.config import settings
from app.core.security import create_access_token, decode_access_token
from app.services.mobile_auth import (
    MobileAuthError,
    derive_refresh_token,
    login_message,
    refresh_message,
    registration_message,
    verify_device_signature,
)


def test_device_signatures_verify_canonical_messages():
    private_key = ec.generate_private_key(ec.SECP256R1())
    public_key = private_key.public_key().public_bytes(
        encoding=serialization.Encoding.X962,
        format=serialization.PublicFormat.UncompressedPoint,
    )
    encoded_public_key = base64.b64encode(public_key).decode()
    challenge_id = uuid.uuid4()
    message = registration_message(
        challenge_id,
        "nonce-value",
        "installation-identifier",
        encoded_public_key,
    )
    signature = private_key.sign(message, ec.ECDSA(hashes.SHA256()))

    verify_device_signature(
        encoded_public_key,
        base64.b64encode(signature).decode(),
        message,
    )

    with pytest.raises(MobileAuthError, match="invalid_device_signature"):
        verify_device_signature(
            encoded_public_key,
            base64.b64encode(signature).decode(),
            message + b"tampered",
        )


def test_canonical_login_and_refresh_messages_are_stable():
    challenge_id = uuid.UUID("9ebd50d6-cdac-44dc-8452-4ca4f2b104f4")
    session_id = uuid.UUID("93c3242b-f3fd-4315-b9dd-cac113c9c120")

    assert login_message(
        challenge_id,
        "nonce",
        "installation-identifier",
        " USER@Example.COM ",
    ).startswith(b"timia-mobile-login\n9ebd50d6-cdac")
    assert refresh_message(
        challenge_id,
        "nonce",
        "installation-identifier",
        session_id,
        "request-identifier",
        "refresh-secret",
    ).splitlines()[-1] != b"refresh-secret"


def test_mobile_access_token_has_device_session_claims():
    token = create_access_token(
        str(uuid.uuid4()),
        audience=settings.mobile_jwt_audience,
        expires_minutes=15,
        session_id=str(uuid.uuid4()),
        device_id=str(uuid.uuid4()),
    )
    payload = decode_access_token(token)

    assert payload["aud"] == settings.mobile_jwt_audience
    assert payload["sid"]
    assert payload["did"]


def test_refresh_token_changes_for_each_generation():
    session_id = uuid.uuid4()

    first = derive_refresh_token(session_id, 0)
    assert first == derive_refresh_token(session_id, 0)
    assert first != derive_refresh_token(session_id, 1)
    assert len(first) >= 32
