import base64
import json

import pytest
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.utils import encode_dss_signature

from app.core.config import settings
from app.services.apns import load_signing_key, provider_token, reset_provider_token_cache


def _pem() -> str:
    key = ec.generate_private_key(ec.SECP256R1())
    return key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption(),
    ).decode()


def _b64decode(segment: str) -> bytes:
    pad = "=" * (-len(segment) % 4)
    return base64.urlsafe_b64decode(segment + pad)


@pytest.fixture
def apns_key():
    pem = _pem()
    saved = (
        settings.apns_key_id,
        settings.apns_team_id,
        settings.apns_bundle_id,
        settings.apns_key_p8,
        settings.apns_use_sandbox,
    )
    settings.apns_key_id = "KEYID12345"
    settings.apns_team_id = "TEAMID1234"
    settings.apns_bundle_id = "online.timia.ios"
    settings.apns_key_p8 = pem
    settings.apns_use_sandbox = True
    reset_provider_token_cache()
    yield pem
    (
        settings.apns_key_id,
        settings.apns_team_id,
        settings.apns_bundle_id,
        settings.apns_key_p8,
        settings.apns_use_sandbox,
    ) = saved
    reset_provider_token_cache()


def test_load_signing_key_accepts_escaped_newlines_and_base64():
    pem = _pem()
    escaped = pem.replace("\n", "\\n")
    encoded = base64.b64encode(pem.encode()).decode()
    first = load_signing_key(escaped)
    second = load_signing_key(encoded)
    assert first.key_size == 256
    assert second.key_size == 256


def test_provider_token_is_es256_without_exp(apns_key):
    issued = 1_700_000_000
    token = provider_token(now=issued)
    header_b64, payload_b64, sig_b64 = token.split(".")
    header = json.loads(_b64decode(header_b64))
    payload = json.loads(_b64decode(payload_b64))
    assert header == {"alg": "ES256", "kid": "KEYID12345"}
    assert payload == {"iss": "TEAMID1234", "iat": issued}
    raw = _b64decode(sig_b64)
    assert len(raw) == 64
    signature = encode_dss_signature(
        int.from_bytes(raw[:32], "big"),
        int.from_bytes(raw[32:], "big"),
    )
    key = load_signing_key(apns_key)
    key.public_key().verify(
        signature,
        f"{header_b64}.{payload_b64}".encode(),
        ec.ECDSA(hashes.SHA256()),
    )
    assert provider_token(now=issued + 60) == token
    reset_provider_token_cache()
    refreshed = provider_token(now=issued + 60)
    assert refreshed != token
    assert json.loads(_b64decode(refreshed.split(".")[1]))["iat"] == issued + 60


def test_missing_key_material_is_not_configured(apns_key):
    from app.services.apns import apns_is_configured

    assert apns_is_configured() is True
    settings.apns_key_p8 = "  "
    assert apns_is_configured() is False
