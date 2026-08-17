export const PLAN_USAGE_LABEL: Record<string, string> = {
  one_shot: "加入",
  subscription: "订阅",
};

export const PLAN_PERIOD_LABEL: Record<string, string> = {
  day: "日",
  week: "周",
  month: "月",
  year: "年",
};

export const PLAN_VISIBILITY_LABEL: Record<string, string> = {
  private: "私有",
  public: "公开",
};

export function planLabel(map: Record<string, string>, value: string) {
  return map[value] ?? value;
}

export function planApiMessage(message: string): string {
  switch (message) {
    case "too_many_slots":
      return "时段数量超出上限";
    case "invalid_slot":
      return "时段坐标或时间不合法";
    case "tag_too_long":
      return "标签最长 20 字";
    case "too_many_tags":
      return "最多 8 个标签";
    case "not_found":
      return "规划不存在或无权访问";
    case "already_applied":
      return "该周期已导入";
    case "already_subscribed":
      return "已订阅该规划";
    case "empty_template":
      return "模板没有可导入的时段";
    case "wrong_usage_kind":
      return "规划类型不匹配";
    default:
      return message;
  }
}
