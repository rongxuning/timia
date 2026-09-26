import uuid

from app.models.agent_token import AgentToken
from app.models.llm_api_key import LlmApiKey
from app.routes.dev_db_tables import _TABLE_ORDER, _orm_row_dict

_EXPECTED = {
    "agent_tokens",
    "agent_tool_calls",
    "llm_api_keys",
    "health_metrics_dirty",
    "health_sync_run",
    "health_sync_state",
}


def test_dev_table_order_includes_agent_and_health_sync():
    names = {name for name, _model in _TABLE_ORDER}
    assert _EXPECTED <= names


def test_masks_agent_token_hash_and_llm_api_key():
    token = AgentToken(
        user_id=uuid.uuid4(),
        name="cursor",
        token_prefix="tm_pat_abcd",
        token_hash="secret-hash",
        scopes=["profile:read"],
    )
    masked = _orm_row_dict(AgentToken, token)
    assert masked["token_hash"] == "***"
    assert masked["token_prefix"] == "tm_pat_abcd"

    key = LlmApiKey(
        name="primary",
        base_url="https://llm.example",
        api_key="sk-secret",
        model="mini",
        enabled=True,
        priority=1,
    )
    masked_key = _orm_row_dict(LlmApiKey, key)
    assert masked_key["api_key"] == "***"
    assert masked_key["model"] == "mini"
