from timia_mcp.profiles import P0_TOOLS
from timia_mcp.server import build_mcp
from timia_mcp.tools import registered_tool_names


def test_p0_registered_tools_match_p0_set(settings, client):
    mcp = build_mcp(settings, client)
    assert registered_tool_names(mcp) == P0_TOOLS


def test_p0_does_not_register_delete_tools(settings, client):
    mcp = build_mcp(settings, client)
    names = registered_tool_names(mcp)
    assert "delete_workspace" not in names
    assert "delete_project" not in names
