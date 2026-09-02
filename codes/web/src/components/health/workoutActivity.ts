export type WorkoutActivityStyle = {
  label: string;
  icon: string;
  bg: string;
  text: string;
  band: string;
};

const HIIT = { bg: "bg-red-100", text: "text-red-700", band: "#fecaca" };
const RUNNING = { bg: "bg-blue-100", text: "text-blue-800", band: "#bfdbfe" };
const WALKING = { bg: "bg-green-100", text: "text-green-800", band: "#bbf7d0" };
const STRENGTH = { bg: "bg-yellow-100", text: "text-yellow-800", band: "#fef08a" };
const OTHER = { bg: "bg-violet-100", text: "text-violet-700", band: "#ddd6fe" };

const KNOWN: Record<string, WorkoutActivityStyle> = {
  hiit: { label: "高强度间歇", icon: "bolt", ...HIIT },
  running: { label: "跑步", icon: "directions_run", ...RUNNING },
  walking: { label: "步行", icon: "directions_walk", ...WALKING },
  strength: { label: "力量训练", icon: "fitness_center", ...STRENGTH },
  functional_strength: { label: "功能性力量", icon: "exercise", ...STRENGTH },
  cycling: { label: "骑行", icon: "directions_bike", ...OTHER },
  hiking: { label: "徒步", icon: "hiking", ...OTHER },
  swimming: { label: "游泳", icon: "pool", ...OTHER },
  yoga: { label: "瑜伽", icon: "self_improvement", ...OTHER },
  elliptical: { label: "椭圆机", icon: "fitness_center", ...OTHER },
  rowing: { label: "划船", icon: "rowing", ...OTHER },
  core_training: { label: "核心训练", icon: "accessibility_new", ...OTHER },
  pilates: { label: "普拉提", icon: "self_improvement", ...OTHER },
  dance: { label: "舞蹈", icon: "nightlife", ...OTHER },
  cardio_dance: { label: "有氧舞蹈", icon: "nightlife", ...OTHER },
  social_dance: { label: "社交舞", icon: "nightlife", ...OTHER },
  dance_inspired: { label: "舞蹈训练", icon: "nightlife", ...OTHER },
  martial_arts: { label: "武术", icon: "sports_martial_arts", ...OTHER },
  boxing: { label: "拳击", icon: "sports_mma", ...OTHER },
  kickboxing: { label: "踢拳", icon: "sports_martial_arts", ...OTHER },
  jump_rope: { label: "跳绳", icon: "sports", ...OTHER },
  stairs: { label: "爬楼梯", icon: "stairs", ...OTHER },
  stair_climbing: { label: "爬楼机", icon: "stairs", ...OTHER },
  flexibility: { label: "柔韧训练", icon: "self_improvement", ...OTHER },
  cooldown: { label: "放松恢复", icon: "spa", ...OTHER },
  mixed_cardio: { label: "混合有氧", icon: "monitor_heart", ...OTHER },
  mixed_cardio_old: { label: "混合有氧", icon: "monitor_heart", ...OTHER },
  cross_training: { label: "交叉训练", icon: "sports", ...OTHER },
  tennis: { label: "网球", icon: "sports_tennis", ...OTHER },
  table_tennis: { label: "乒乓球", icon: "sports_tennis", ...OTHER },
  badminton: { label: "羽毛球", icon: "sports_tennis", ...OTHER },
  basketball: { label: "篮球", icon: "sports_basketball", ...OTHER },
  soccer: { label: "足球", icon: "sports_soccer", ...OTHER },
  golf: { label: "高尔夫", icon: "golf_course", ...OTHER },
  tai_chi: { label: "太极", icon: "self_improvement", ...OTHER },
  barre: { label: "芭杆", icon: "self_improvement", ...OTHER },
  mind_and_body: { label: "身心训练", icon: "spa", ...OTHER },
  prep_recovery: { label: "热身恢复", icon: "spa", ...OTHER },
  wheelchair_walk: { label: "轮椅步行", icon: "accessible", ...OTHER },
  wheelchair_run: { label: "轮椅跑步", icon: "accessible", ...OTHER },
  hand_cycling: { label: "手摇骑行", icon: "directions_bike", ...OTHER },
  pickleball: { label: "匹克球", icon: "sports_tennis", ...OTHER },
  triathlon: { label: "铁人三项", icon: "pool", ...OTHER },
  underwater_diving: { label: "潜水", icon: "scuba_diving", ...OTHER },
  fitness_gaming: { label: "健身游戏", icon: "sports_esports", ...OTHER },
  other: { label: "其他训练", icon: "exercise", ...OTHER },
};

export function workoutActivityStyle(token: string, raw?: string | null): WorkoutActivityStyle {
  const key = token || "other";
  const known = KNOWN[key];
  if (known) return known;
  return {
    label: raw || key,
    icon: "exercise",
    ...OTHER,
  };
}
