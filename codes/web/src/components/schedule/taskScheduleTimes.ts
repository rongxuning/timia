export type TaskScheduleTimesResult =
  | { ok: true; start_at: string | null; end_at: string | null }
  | { ok: false; error: string };

function blankToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function toIsoOrError(localValue: string): { ok: true; iso: string } | { ok: false; error: string } {
  const parsed = new Date(localValue);
  if (Number.isNaN(parsed.getTime())) {
    return { ok: false, error: "时间格式无效" };
  }
  return { ok: true, iso: parsed.toISOString() };
}

export function resolveTaskScheduleTimes(startLocal: string, endLocal: string): TaskScheduleTimesResult {
  const startRaw = blankToNull(startLocal);
  const endRaw = blankToNull(endLocal);

  let startIso: string | null = null;
  let endIso: string | null = null;

  if (startRaw) {
    const start = toIsoOrError(startRaw);
    if (!start.ok) return start;
    startIso = start.iso;
  }
  if (endRaw) {
    const end = toIsoOrError(endRaw);
    if (!end.ok) return end;
    endIso = end.iso;
  }

  if (startIso && endIso && new Date(endIso).getTime() < new Date(startIso).getTime()) {
    return { ok: false, error: "结束时间不能早于开始时间" };
  }

  return { ok: true, start_at: startIso, end_at: endIso };
}

export function validateUndatedTaskStatus(
  startAt: string | null,
  endAt: string | null,
  status: string,
): { ok: true } | { ok: false; error: string } {
  if (startAt == null && endAt == null && status !== "todo") {
    return { ok: false, error: "无时间任务只能保存为未开始" };
  }
  return { ok: true };
}
