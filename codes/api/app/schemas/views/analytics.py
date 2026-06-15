from pydantic import BaseModel


class MyAnalyticsViewOut(BaseModel):
    display_name: str
    email: str
    task_total: int
    todo_count: int
    doing_count: int
    done_count: int
    archived_count: int
    high_priority_count: int
    health_percent: int | None
    workspace_count: int
    project_count: int
