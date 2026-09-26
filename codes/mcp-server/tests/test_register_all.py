from timia_mcp.profiles import FULL_TOOLS, P0_TOOLS, P1_TOOLS
from timia_mcp.server import MCP_SERVER_NAME, build_mcp
from timia_mcp.tools import registered_tool_names

_FORBIDDEN = {
    "delete_workspace",
    "delete_project",
    "delete_health_data",
    "sync_health",
}


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
    assert _FORBIDDEN.isdisjoint(names)
    assert "list_sticky_notes" not in names
    assert "get_health_summary" not in names


def test_p1_registers_notes_and_plans_without_health(settings, client):
    settings = settings.model_copy(update={"tool_profile": "p1"})
    mcp = build_mcp(settings, client)
    names = registered_tool_names(mcp)
    assert names == P1_TOOLS
    assert "get_health_summary" not in names
    assert _FORBIDDEN.isdisjoint(names)
    assert _resource_uris(mcp) >= {
        "timia://me",
        "timia://schedule/today",
    }
    assert _prompt_names(mcp) >= {
        "daily_briefing",
        "triage_overdue",
        "nl_to_schedule",
        "sticky_to_item",
    }


def test_full_registers_health_tools(settings, client):
    settings = settings.model_copy(update={"tool_profile": "full"})
    mcp = build_mcp(settings, client)
    assert registered_tool_names(mcp) == FULL_TOOLS
    assert _FORBIDDEN.isdisjoint(registered_tool_names(mcp))


def _resource_uris(mcp) -> set[str]:
    manager = getattr(mcp, "_resource_manager", None)
    if manager is None:
        return set()
    resources = getattr(manager, "_resources", {})
    return set(resources.keys())


def _prompt_names(mcp) -> set[str]:
    manager = getattr(mcp, "_prompt_manager", None)
    if manager is None:
        return set()
    prompts = getattr(manager, "_prompts", {})
    return set(prompts.keys())
