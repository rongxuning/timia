import pytest

from timia_mcp.config import Settings
from timia_mcp.http_client import TimiaHttpClient


@pytest.fixture
def settings():
    return Settings(
        api_base="http://timia.test",
        pat="tm_pat_test",
        readonly=False,
        tool_profile="p0",
        timeout_seconds=5,
        default_timezone="Asia/Shanghai",
    )


@pytest.fixture
def client(settings):
    return TimiaHttpClient(settings)
