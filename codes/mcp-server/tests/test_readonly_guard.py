from timia_mcp.auth import assert_writable
from timia_mcp.config import Settings
from timia_mcp.errors import ReadonlyError


def test_readonly_blocks_writes():
    s = Settings(
        api_base="http://x",
        pat="tm_pat_x",
        readonly=True,
        tool_profile="p0",
        timeout_seconds=5,
        default_timezone="Asia/Shanghai",
    )
    try:
        assert_writable(s)
        assert False, "expected ReadonlyError"
    except ReadonlyError as e:
        assert e.to_dict()["error"] == "readonly_mode"
