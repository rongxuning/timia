from timia_mcp.profiles import P0_TOOLS
from timia_mcp.server import MCP_SERVER_NAME, build_mcp
from timia_mcp.tools import registered_tool_names


def test_server_name_is_timia_mcp(settings, client):
    mcp = build_mcp(settings, client)
    assert MCP_SERVER_NAME == "timia-mcp"
    assert mcp.name == "timia-mcp"


def test_p0_registered_tools_match_p0_set(settings, client):
    mcp = build_mcp(settings, client)
    assert registered_tool_names(mcp) == P0_TOOLS


def test_p0_does_not_register_delete_tools(settings, client):
    mcp = build_mcp(settings, client)
    names = registered_tool_names(mcp)
    assert "delete_workspace" not in names
    assert "delete_project" not in names
