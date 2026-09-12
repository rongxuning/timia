from app.core.config import settings
from app.services.agent_tokens import PAT_PREFIX, generate_pat, hash_pat


def test_generate_pat_prefix_and_hash_roundtrip():
    full, prefix, hashed = generate_pat()
    assert full.startswith(PAT_PREFIX)
    assert prefix == full[:12]
    assert hashed == hash_pat(full)
    assert hash_pat(full) != hash_pat(full + "x")
    assert hashed == __import__("hashlib").sha256(
        f"{settings.jwt_secret}:{full}".encode()
    ).hexdigest()
