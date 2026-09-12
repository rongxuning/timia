from timia_mcp.errors import tool_error_from_http


def test_version_conflict():
    err = tool_error_from_http(409, "version_conflict")
    assert err["error"] == "version_conflict"
    assert err["http_status"] == 409
