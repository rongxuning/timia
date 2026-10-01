export type ScheduleAppearance = "plain" | "stage";

export function schedulePaperClass(appearance: ScheduleAppearance = "plain") {
  return appearance === "stage"
    ? "border-2 border-black bg-white"
    : "border border-border-subtle bg-white";
}
