export type HttpMethod = "GET" | "POST" | "PATCH" | "DELETE";

/** 仅用于文档展示的 JSON 可序列化结构（字段值为类型说明字符串或嵌套对象） */
export type ApiJsonShape = Record<string, unknown> | unknown[] | string | number | boolean | null;

export type ApiCatalogEntry = {
  method: HttpMethod;
  /** OpenAPI 风格路径，如 /workspaces/{workspace_id}/projects */
  path: string;
  /** 中文名称 */
  name: string;
  /** 入参：路径、query、请求体、鉴权等（文档用 JSON） */
  requestJson: ApiJsonShape;
  /** 出参：响应 JSON 形状说明 */
  responseJson: ApiJsonShape;
};

const authBearer = { Authorization: "Bearer <access_token>" };

const workspacePath = { workspace_id: "uuid (path)" };
const workspaceProjectPath = { workspace_id: "uuid (path)", project_id: "uuid (path)" };
const itemPath = {
  workspace_id: "uuid (path)",
  project_id: "uuid (path)",
  item_id: "uuid (path)",
};
const commentPath = {
  ...itemPath,
  comment_id: "uuid (path)",
};
const userPath = { user_id: "uuid (path)" };

/** 与 apps/api 中 FastAPI 路由对齐；前端「是否使用」由源码扫描 apiFetch 得到 */
export const API_CATALOG: ApiCatalogEntry[] = [
  {
    method: "GET",
    path: "/health",
    name: "健康检查",
    requestJson: { headers: null, query: null, jsonBody: null },
    responseJson: { ok: true },
  },

  {
    method: "POST",
    path: "/auth/login",
    name: "登录",
    requestJson: { headers: null, query: null, jsonBody: { email: "string (email)", password: "string" } },
    responseJson: { access_token: "string", token_type: "string (default bearer)" },
  },
  {
    method: "POST",
    path: "/auth/register",
    name: "注册",
    requestJson: {
      headers: null,
      query: null,
      jsonBody: { email: "string (email)", display_name: "string", password: "string (min 8)" },
    },
    responseJson: {
      id: "string (uuid)",
      email: "string",
      display_name: "string",
      system_role: "user",
    },
  },
  {
    method: "GET",
    path: "/auth/me",
    name: "当前用户",
    requestJson: { headers: authBearer, query: null, jsonBody: null },
    responseJson: {
      id: "string (uuid)",
      email: "string",
      display_name: "string",
      system_role: "admin | user",
    },
  },

  {
    method: "GET",
    path: "/workspaces",
    name: "工作空间列表",
    requestJson: { headers: authBearer, query: null, jsonBody: null },
    responseJson: {
      type: "array",
      items: {
        id: "string (uuid)",
        name: "string",
        description: "string | null",
      },
    },
  },
  {
    method: "GET",
    path: "/workspaces/cards",
    name: "工作空间卡片",
    requestJson: { headers: authBearer, query: null, jsonBody: null },
    responseJson: {
      type: "array",
      items: {
        id: "string (uuid)",
        name: "string",
        description: "string | null",
        project_count: "number",
        todo_count: "number",
        doing_count: "number",
        done_count: "number",
        archived_count: "number",
        owners: "WorkspaceCardUser[]",
        members: "WorkspaceCardUser[]",
        my_workspace_role: "string",
      },
    },
  },
  {
    method: "POST",
    path: "/workspaces",
    name: "创建工作空间",
    requestJson: {
      headers: authBearer,
      query: null,
      jsonBody: { name: "string", description: "string | null" },
    },
    responseJson: {
      id: "string (uuid)",
      name: "string",
      description: "string | null",
      created_at: "string (iso datetime) | null",
      created_by_user_id: "string | null",
      created_by_display_name: "string | null",
    },
  },
  {
    method: "GET",
    path: "/workspaces/{workspace_id}",
    name: "工作空间详情",
    requestJson: { headers: authBearer, pathParams: workspacePath, query: null, jsonBody: null },
    responseJson: {
      id: "string (uuid)",
      name: "string",
      description: "string | null",
      created_at: "string (iso datetime) | null",
      created_by_user_id: "string | null",
      created_by_display_name: "string | null",
    },
  },
  {
    method: "PATCH",
    path: "/workspaces/{workspace_id}",
    name: "更新工作空间",
    requestJson: {
      headers: authBearer,
      pathParams: workspacePath,
      query: null,
      jsonBody: { name: "string | null", description: "string | null" },
    },
    responseJson: {
      id: "string (uuid)",
      name: "string",
      description: "string | null",
      created_at: "string (iso datetime) | null",
      created_by_user_id: "string | null",
      created_by_display_name: "string | null",
    },
  },
  {
    method: "GET",
    path: "/workspaces/{workspace_id}/recent-discussions",
    name: "最近讨论",
    requestJson: {
      headers: authBearer,
      pathParams: workspacePath,
      query: { limit: "integer (default 20, max 80)", offset: "integer (default 0)" },
      jsonBody: null,
    },
    responseJson: {
      type: "array",
      items: {
        id: "string (uuid)",
        body: "string",
        created_at: "string (iso datetime)",
        author_user_id: "string (uuid)",
        author_display_name: "string",
        is_reply: "boolean",
        completion_status: "string",
        project_id: "string (uuid)",
        project_name: "string",
        item_id: "string (uuid)",
        item_title: "string",
      },
    },
  },
  {
    method: "GET",
    path: "/workspaces/{workspace_id}/stats",
    name: "工作空间统计",
    requestJson: { headers: authBearer, pathParams: workspacePath, query: null, jsonBody: null },
    responseJson: {
      project_count: "number",
      total_task_count: "number",
      todo_count: "number",
      doing_count: "number",
      done_count: "number",
      archived_count: "number",
      high_priority_count: "number",
    },
  },
  {
    method: "DELETE",
    path: "/workspaces/{workspace_id}",
    name: "删除工作空间",
    requestJson: { headers: authBearer, pathParams: workspacePath, query: null, jsonBody: null },
    responseJson: { httpStatus: 204, jsonBody: null },
  },

  {
    method: "GET",
    path: "/workspaces/{workspace_id}/members",
    name: "成员列表（空间）",
    requestJson: { headers: authBearer, pathParams: workspacePath, query: null, jsonBody: null },
    responseJson: {
      type: "array",
      items: {
        id: "string (uuid)",
        user_id: "string (uuid)",
        email: "string",
        display_name: "string",
        role: "string",
        status: "string",
        is_creator: "boolean",
      },
    },
  },
  {
    method: "POST",
    path: "/workspaces/{workspace_id}/members",
    name: "添加空间成员",
    requestJson: {
      headers: authBearer,
      pathParams: workspacePath,
      query: null,
      jsonBody: {
        email: "string (email) | null — exactly one of email or user_id",
        user_id: "string (uuid) | null",
        role: '"owner" | "member"',
      },
    },
    responseJson: {
      id: "string (uuid)",
      user_id: "string (uuid)",
      email: "string",
      display_name: "string",
      role: "string",
      status: "string",
      is_creator: "boolean",
    },
  },
  {
    method: "PATCH",
    path: "/workspaces/{workspace_id}/members/{user_id}",
    name: "更新成员角色",
    requestJson: {
      headers: authBearer,
      pathParams: { ...workspacePath, user_id: "uuid (path)" },
      query: null,
      jsonBody: { role: '"owner" | "member"' },
    },
    responseJson: {
      id: "string (uuid)",
      user_id: "string (uuid)",
      email: "string",
      display_name: "string",
      role: "string",
      status: "string",
      is_creator: "boolean",
    },
  },
  {
    method: "DELETE",
    path: "/workspaces/{workspace_id}/members/{user_id}",
    name: "移除成员",
    requestJson: {
      headers: authBearer,
      pathParams: { ...workspacePath, user_id: "uuid (path)" },
      query: null,
      jsonBody: null,
    },
    responseJson: { httpStatus: 204, jsonBody: null },
  },

  {
    method: "GET",
    path: "/workspaces/{workspace_id}/projects",
    name: "项目列表",
    requestJson: { headers: authBearer, pathParams: workspacePath, query: null, jsonBody: null },
    responseJson: {
      type: "array",
      items: {
        id: "string (uuid)",
        name: "string",
        description: "string | null",
        archived: "boolean",
        created_at: "string (iso datetime)",
        created_by_user_id: "string | null",
        created_by_display_name: "string | null",
        can_manage: "boolean",
      },
    },
  },
  {
    method: "GET",
    path: "/workspaces/{workspace_id}/projects/progress",
    name: "项目进度汇总",
    requestJson: { headers: authBearer, pathParams: workspacePath, query: null, jsonBody: null },
    responseJson: {
      type: "object",
      description: "keys are project_id (uuid string); values are per-project counts",
      additionalProperties: {
        todo_doing: "number",
        done_archived: "number",
      },
    },
  },
  {
    method: "POST",
    path: "/workspaces/{workspace_id}/projects",
    name: "创建项目",
    requestJson: {
      headers: authBearer,
      pathParams: workspacePath,
      query: null,
      jsonBody: { name: "string", description: "string | null" },
    },
    responseJson: {
      id: "string (uuid)",
      name: "string",
      description: "string | null",
      archived: "boolean",
      created_at: "string (iso datetime)",
      created_by_user_id: "string | null",
      created_by_display_name: "string | null",
      can_manage: "boolean",
    },
  },
  {
    method: "GET",
    path: "/workspaces/{workspace_id}/projects/{project_id}",
    name: "项目详情",
    requestJson: { headers: authBearer, pathParams: workspaceProjectPath, query: null, jsonBody: null },
    responseJson: {
      id: "string (uuid)",
      name: "string",
      description: "string | null",
      archived: "boolean",
      created_at: "string (iso datetime)",
      created_by_user_id: "string | null",
      created_by_display_name: "string | null",
      can_manage: "boolean",
    },
  },
  {
    method: "PATCH",
    path: "/workspaces/{workspace_id}/projects/{project_id}",
    name: "更新项目",
    requestJson: {
      headers: authBearer,
      pathParams: workspaceProjectPath,
      query: null,
      jsonBody: { name: "string | null", description: "string | null", archived: "boolean | null" },
    },
    responseJson: {
      id: "string (uuid)",
      name: "string",
      description: "string | null",
      archived: "boolean",
      created_at: "string (iso datetime)",
      created_by_user_id: "string | null",
      created_by_display_name: "string | null",
      can_manage: "boolean",
    },
  },
  {
    method: "DELETE",
    path: "/workspaces/{workspace_id}/projects/{project_id}",
    name: "删除项目",
    requestJson: { headers: authBearer, pathParams: workspaceProjectPath, query: null, jsonBody: null },
    responseJson: { httpStatus: 204, jsonBody: null },
  },

  {
    method: "GET",
    path: "/workspaces/{workspace_id}/projects/{project_id}/members",
    name: "项目成员列表",
    requestJson: { headers: authBearer, pathParams: workspaceProjectPath, query: null, jsonBody: null },
    responseJson: {
      type: "array",
      items: {
        id: "string (uuid)",
        user_id: "string (uuid)",
        email: "string",
        display_name: "string",
        role: "string",
        status: "string",
        is_creator: "boolean",
      },
    },
  },
  {
    method: "POST",
    path: "/workspaces/{workspace_id}/projects/{project_id}/members",
    name: "添加项目成员",
    requestJson: {
      headers: authBearer,
      pathParams: workspaceProjectPath,
      query: null,
      jsonBody: { user_id: "string (uuid)", role: '"owner" | "member"' },
    },
    responseJson: {
      id: "string (uuid)",
      user_id: "string (uuid)",
      email: "string",
      display_name: "string",
      role: "string",
      status: "string",
      is_creator: "boolean",
    },
  },
  {
    method: "PATCH",
    path: "/workspaces/{workspace_id}/projects/{project_id}/members/{user_id}",
    name: "更新项目成员角色",
    requestJson: {
      headers: authBearer,
      pathParams: { ...workspaceProjectPath, user_id: "uuid (path)" },
      query: null,
      jsonBody: { role: '"owner" | "member"' },
    },
    responseJson: {
      id: "string (uuid)",
      user_id: "string (uuid)",
      email: "string",
      display_name: "string",
      role: "string",
      status: "string",
      is_creator: "boolean",
    },
  },
  {
    method: "DELETE",
    path: "/workspaces/{workspace_id}/projects/{project_id}/members/{user_id}",
    name: "移除项目成员",
    requestJson: {
      headers: authBearer,
      pathParams: { ...workspaceProjectPath, user_id: "uuid (path)" },
      query: null,
      jsonBody: null,
    },
    responseJson: { httpStatus: 204, jsonBody: null },
  },

  {
    method: "GET",
    path: "/workspaces/{workspace_id}/projects/{project_id}/items",
    name: "任务列表",
    requestJson: {
      headers: authBearer,
      pathParams: workspaceProjectPath,
      query: { status_filter: "string | null (item status)" },
      jsonBody: null,
    },
    responseJson: {
      type: "array",
      items: {
        id: "string (uuid)",
        title: "string",
        body: "string | null",
        status: "string",
        priority: "string | null",
        start_at: "string (iso datetime) | null",
        end_at: "string (iso datetime) | null",
        details: "string | null",
        version: "number",
        created_by: "{ id, display_name } | null",
        assignee: "{ id, display_name } | null",
        participants: "UserBrief[]",
        location: "string | null",
      },
    },
  },
  {
    method: "POST",
    path: "/workspaces/{workspace_id}/projects/{project_id}/items",
    name: "创建任务",
    requestJson: {
      headers: authBearer,
      pathParams: workspaceProjectPath,
      query: null,
      jsonBody: {
        title: "string",
        body: "string | null",
        status: "string",
        priority: "string",
        start_at: "string (iso datetime) | null",
        end_at: "string (iso datetime) | null",
        details: "string | null",
        assignee_user_id: "string | null",
        participant_user_ids: "string[]",
        location: "string | null",
      },
    },
    responseJson: {
      id: "string (uuid)",
      title: "string",
      body: "string | null",
      status: "string",
      priority: "string | null",
      start_at: "string (iso datetime) | null",
      end_at: "string (iso datetime) | null",
      details: "string | null",
      version: "number",
      created_by: "UserBrief | null",
      assignee: "UserBrief | null",
      participants: "UserBrief[]",
      location: "string | null",
    },
  },
  {
    method: "GET",
    path: "/workspaces/{workspace_id}/projects/{project_id}/items/{item_id}",
    name: "任务详情",
    requestJson: { headers: authBearer, pathParams: itemPath, query: null, jsonBody: null },
    responseJson: {
      id: "string (uuid)",
      title: "string",
      body: "string | null",
      status: "string",
      priority: "string | null",
      start_at: "string (iso datetime) | null",
      end_at: "string (iso datetime) | null",
      details: "string | null",
      version: "number",
      created_by: "UserBrief | null",
      assignee: "UserBrief | null",
      participants: "UserBrief[]",
      location: "string | null",
    },
  },
  {
    method: "PATCH",
    path: "/workspaces/{workspace_id}/projects/{project_id}/items/{item_id}",
    name: "更新任务",
    requestJson: {
      headers: authBearer,
      pathParams: itemPath,
      query: null,
      jsonBody: {
        version: "number (required, optimistic lock)",
        title: "string | null",
        body: "string | null",
        status: "string | null",
        priority: "string | null",
        start_at: "string (iso datetime) | null",
        end_at: "string (iso datetime) | null",
        details: "string | null",
        assignee_user_id: "string | null",
        participant_user_ids: "string[] | null",
        location: "string | null",
      },
    },
    responseJson: {
      id: "string (uuid)",
      title: "string",
      body: "string | null",
      status: "string",
      priority: "string | null",
      start_at: "string (iso datetime) | null",
      end_at: "string (iso datetime) | null",
      details: "string | null",
      version: "number",
      created_by: "UserBrief | null",
      assignee: "UserBrief | null",
      participants: "UserBrief[]",
      location: "string | null",
    },
  },
  {
    method: "DELETE",
    path: "/workspaces/{workspace_id}/projects/{project_id}/items/{item_id}",
    name: "删除任务",
    requestJson: { headers: authBearer, pathParams: itemPath, query: null, jsonBody: null },
    responseJson: { httpStatus: 204, jsonBody: null },
  },

  {
    method: "GET",
    path: "/workspaces/{workspace_id}/projects/{project_id}/items/{item_id}/comments",
    name: "评论列表",
    requestJson: { headers: authBearer, pathParams: itemPath, query: null, jsonBody: null },
    responseJson: {
      type: "array",
      items: {
        id: "string (uuid)",
        author_user_id: "string (uuid)",
        author_display_name: "string",
        body: "string",
        created_at: "string (iso datetime)",
        deleted_at: "string (iso datetime) | null",
        parent_comment_id: "string (uuid) | null",
        completion_status: "string",
      },
    },
  },
  {
    method: "POST",
    path: "/workspaces/{workspace_id}/projects/{project_id}/items/{item_id}/comments",
    name: "发表评论",
    requestJson: {
      headers: authBearer,
      pathParams: itemPath,
      query: null,
      jsonBody: { body: "string", parent_comment_id: "string (uuid) | null" },
    },
    responseJson: {
      id: "string (uuid)",
      author_user_id: "string (uuid)",
      author_display_name: "string",
      body: "string",
      created_at: "string (iso datetime)",
      deleted_at: "string (iso datetime) | null",
      parent_comment_id: "string (uuid) | null",
      completion_status: "string",
    },
  },
  {
    method: "PATCH",
    path: "/workspaces/{workspace_id}/projects/{project_id}/items/{item_id}/comments/{comment_id}",
    name: "更新评论（完成状态等）",
    requestJson: {
      headers: authBearer,
      pathParams: commentPath,
      query: null,
      jsonBody: { completion_status: '"pending" | "done"' },
    },
    responseJson: {
      id: "string (uuid)",
      author_user_id: "string (uuid)",
      author_display_name: "string",
      body: "string",
      created_at: "string (iso datetime)",
      deleted_at: "string (iso datetime) | null",
      parent_comment_id: "string (uuid) | null",
      completion_status: "string",
    },
  },
  {
    method: "DELETE",
    path: "/workspaces/{workspace_id}/projects/{project_id}/items/{item_id}/comments/{comment_id}",
    name: "删除评论",
    requestJson: { headers: authBearer, pathParams: commentPath, query: null, jsonBody: null },
    responseJson: { httpStatus: 204, jsonBody: null },
  },

  {
    method: "GET",
    path: "/users",
    name: "系统用户列表",
    requestJson: { headers: authBearer, query: null, jsonBody: null },
    responseJson: {
      type: "array",
      items: {
        id: "string (uuid)",
        email: "string",
        display_name: "string",
        status: "string",
        system_role: "admin | user",
        workspace_count: "number",
        created_at: "string (iso datetime)",
      },
    },
  },
  {
    method: "GET",
    path: "/users/{user_id}/workspaces",
    name: "用户所属工作空间",
    requestJson: { headers: authBearer, pathParams: userPath, query: null, jsonBody: null },
    responseJson: {
      type: "array",
      items: {
        workspace: { id: "string (uuid)", name: "string", description: "string | null" },
        membership: { id: "string (uuid)", role: "string", status: "string" },
        projects: "ProjectBrief[]",
      },
    },
  },

  {
    method: "GET",
    path: "/workspaces/{workspace_id}/activity",
    name: "活动日志",
    requestJson: {
      headers: authBearer,
      pathParams: workspacePath,
      query: { limit: "integer (default 50, max 200)" },
      jsonBody: null,
    },
    responseJson: {
      type: "array",
      items: {
        id: "string (uuid)",
        actor_user_id: "string (uuid)",
        entity_type: "string",
        entity_id: "string (uuid)",
        action: "string",
        metadata: "object",
        created_at: "string (iso datetime)",
      },
    },
  },

  {
    method: "GET",
    path: "/me/items",
    name: "我的任务（跨空间，创建人或参与人）",
    requestJson: { headers: authBearer, query: null, jsonBody: null },
    responseJson: {
      type: "array",
      items: {
        id: "string (uuid)",
        title: "string",
        body: "string | null",
        status: "string",
        priority: "string | null",
        start_at: "string (iso datetime) | null",
        end_at: "string (iso datetime) | null",
        details: "string | null",
        version: "number",
        workspace_id: "string (uuid)",
        workspace_name: "string",
        project_id: "string (uuid)",
        project_name: "string",
        created_by: "UserBrief | null",
        assignee: "UserBrief | null",
        participants: "UserBrief[]",
        location: "string | null",
      },
    },
  },

  {
    method: "GET",
    path: "/dev/db-tables",
    name: "开发：数据库表快照",
    requestJson: {
      headers: null,
      query: null,
      jsonBody: null,
      note: "requires settings.enable_dev_db_tables on API; no auth in route",
    },
    responseJson: {
      tables: [
        {
          name: "string (table key)",
          columns: "string[]",
          rows: "array of record objects (serialized ORM rows)",
        },
      ],
    },
  },
];

export function openApiPathToSegments(openApiPath: string): string[] {
  return openApiPath.split("/").filter(Boolean).map((seg) => (/^\{[^}]+\}$/.test(seg) ? "*" : seg));
}
