import { SCHEDULE_MAP_CARD_HEIGHT, SCHEDULE_MAP_CARD_WIDTH } from "./scheduleMapFan.ts";

export type ScheduleMapPinItem = {
  id: string;
  title: string;
  status?: string | null;
  location?: string | null;
  location_lat: number;
  location_lng: number;
  start_at?: string | null;
  end_at?: string | null;
};

export type ScheduleMapCardLabels = {
  unscheduled: string;
  moreItems: (title: string, count: number) => string;
  status: (status: string) => string;
};

export type ScheduleMapCardCopy = {
  title: string;
  timeLabel: string;
  statusLabel: string;
  locationLabel: string;
  count: number;
  countDisplay: string;
};

export function scheduleMapCoordinateKey(lat: number, lng: number): string {
  return `${lat.toFixed(6)},${lng.toFixed(6)}`;
}

export function groupScheduleMapItemsByCoordinate<T extends { location_lat: number; location_lng: number }>(
  items: T[],
): T[][] {
  const order: string[] = [];
  const buckets = new Map<string, T[]>();
  for (const item of items) {
    const key = scheduleMapCoordinateKey(item.location_lat, item.location_lng);
    const existing = buckets.get(key);
    if (existing) {
      existing.push(item);
      continue;
    }
    order.push(key);
    buckets.set(key, [item]);
  }
  return order.map((key) => buckets.get(key) ?? []);
}

export function scheduleMapCountDisplay(count: number): string {
  if (count <= 1) return "";
  return count > 99 ? "99+" : String(count);
}

export function scheduleMapCardCopy<T extends ScheduleMapPinItem>(
  items: T[],
  labels: ScheduleMapCardLabels,
  formatTime: (start?: string | null, end?: string | null) => string | null,
): ScheduleMapCardCopy {
  const first = items[0];
  return {
    title: first.title,
    timeLabel: formatTime(first.start_at, first.end_at) ?? labels.unscheduled,
    statusLabel: labels.status(first.status ?? ""),
    locationLabel: (first.location ?? "").trim(),
    count: items.length,
    countDisplay: scheduleMapCountDisplay(items.length),
  };
}

export function createScheduleMapPinElement(
  copy: ScheduleMapCardCopy & {
    accent: string;
    background: string;
    foreground: string;
    ariaLabel: string;
  },
): HTMLButtonElement {
  const root = document.createElement("button");
  root.type = "button";
  root.className = "schedule-map-pin flex flex-col items-center";
  root.setAttribute("aria-label", copy.ariaLabel);
  root.style.cssText = "border:0;background:transparent;padding:0;cursor:pointer;filter:drop-shadow(0 8px 16px rgb(15 23 42 / 0.12));";

  const wrap = document.createElement("div");
  wrap.className = "relative";
  wrap.style.width = `${SCHEDULE_MAP_CARD_WIDTH}px`;

  const card = document.createElement("div");
  card.className = "box-border overflow-hidden rounded-xl border px-3 py-2 text-left";
  card.style.width = `${SCHEDULE_MAP_CARD_WIDTH}px`;
  card.style.height = `${SCHEDULE_MAP_CARD_HEIGHT}px`;
  card.style.background = copy.background;
  card.style.borderColor = copy.accent;
  card.style.borderLeft = `3px solid ${copy.accent}`;

  const title = document.createElement("div");
  title.className = "truncate text-small font-semibold";
  title.style.color = copy.foreground;
  title.textContent = copy.title;
  card.append(title);

  const time = document.createElement("div");
  time.className = "mt-0.5 truncate text-caption";
  time.style.color = copy.foreground;
  time.style.opacity = "0.82";
  time.textContent = copy.timeLabel;
  card.append(time);

  const status = document.createElement("div");
  status.className = "truncate text-caption";
  status.style.color = copy.foreground;
  status.style.opacity = "0.82";
  status.textContent = copy.statusLabel;
  card.append(status);

  if (copy.locationLabel) {
    const location = document.createElement("div");
    location.className = "truncate text-caption";
    location.style.color = copy.foreground;
    location.style.opacity = "0.82";
    location.textContent = copy.locationLabel;
    card.append(location);
  }

  wrap.append(card);
  if (copy.countDisplay) {
    const badge = document.createElement("span");
    badge.className = "schedule-map-count-badge";
    badge.textContent = copy.countDisplay;
    badge.setAttribute("aria-hidden", "true");
    badge.style.cssText = [
      "position:absolute",
      "top:-8px",
      "right:-8px",
      "min-width:20px",
      "height:20px",
      "padding:0 5px",
      "border-radius:999px",
      "display:flex",
      "align-items:center",
      "justify-content:center",
      "background:var(--color-primary, #4f46e5)",
      "color:#fff",
      "font-size:11px",
      "font-weight:600",
      "line-height:1",
      "border:2px solid #fff",
      "box-shadow:0 1px 3px rgb(15 23 42 / 0.28)",
      "z-index:1",
    ].join(";");
    wrap.append(badge);
  }

  const pin = document.createElement("span");
  pin.setAttribute("aria-hidden", "true");
  pin.style.cssText = [
    "display:block",
    "width:14px",
    "height:14px",
    "margin-top:4px",
    "border-radius:999px",
    `background:${copy.accent}`,
    "border:2px solid #fff",
    "box-shadow:0 1px 3px rgb(15 23 42 / 0.28)",
  ].join(";");

  root.append(wrap, pin);
  return root;
}

export type ScheduleMapChestLabels = {
  chestTasks: (count: number) => string;
  chestAria: (place: string, count: number) => string;
};

export type ScheduleMapChestCopy = {
  placeTitle: string;
  countDisplay: string;
  countLabel: string;
  ariaLabel: string;
};

export function scheduleMapChestCopy(
  cluster: { placeTitle: string; count: number },
  labels: ScheduleMapChestLabels,
): ScheduleMapChestCopy {
  const countDisplay = cluster.count > 99 ? "99+" : String(cluster.count);
  return {
    placeTitle: cluster.placeTitle,
    countDisplay,
    countLabel: labels.chestTasks(cluster.count),
    ariaLabel: labels.chestAria(cluster.placeTitle, cluster.count),
  };
}

export function createScheduleMapChestElement(
  copy: ScheduleMapChestCopy,
): HTMLButtonElement {
  const root = document.createElement("button");
  root.type = "button";
  root.className = "schedule-map-chest flex flex-col items-center";
  root.setAttribute("aria-label", copy.ariaLabel);
  root.setAttribute("aria-expanded", "false");
  root.style.cssText =
    "border:0;background:transparent;padding:0;cursor:pointer;filter:drop-shadow(0 8px 16px rgb(15 23 42 / 0.12));";

  const stack = document.createElement("div");
  stack.style.cssText = "position:relative;width:min(220px,70vw);";

  for (const layer of [2, 1]) {
    const back = document.createElement("div");
    back.setAttribute("aria-hidden", "true");
    back.style.cssText = [
      "position:absolute",
      "inset:0",
      `transform:translate(${layer * 4}px,${-layer * 4}px)`,
      "border-radius:12px",
      "border:1px solid var(--color-border-subtle, #e4e4e7)",
      "background:#fff",
    ].join(";");
    stack.append(back);
  }

  const card = document.createElement("div");
  card.className = "relative rounded-xl border border-border-subtle bg-surface px-3 py-2 text-left";
  const titleRow = document.createElement("div");
  titleRow.className = "flex items-center gap-2";
  const title = document.createElement("div");
  title.className = "min-w-0 flex-1 truncate text-small font-semibold text-text-primary";
  title.textContent = copy.placeTitle;
  const badge = document.createElement("span");
  badge.className =
    "rounded-full bg-primary/10 px-1.5 text-caption font-semibold text-primary";
  badge.textContent = copy.countDisplay;
  titleRow.append(title, badge);
  const subtitle = document.createElement("div");
  subtitle.className = "mt-0.5 truncate text-caption text-text-secondary";
  subtitle.textContent = copy.countLabel;
  card.append(titleRow, subtitle);
  stack.append(card);

  const pin = document.createElement("span");
  pin.setAttribute("aria-hidden", "true");
  pin.style.cssText = [
    "display:block",
    "width:14px",
    "height:14px",
    "margin-top:4px",
    "border-radius:999px",
    "background:var(--color-primary, #4f46e5)",
    "border:2px solid #fff",
    "box-shadow:0 1px 3px rgb(15 23 42 / 0.28)",
  ].join(";");

  const body = document.createElement("div");
  body.className = "schedule-map-chest-body";
  body.style.cssText = "transform-origin:center bottom;transition:transform 120ms ease-out;transform:scale(1);";
  body.append(stack, pin);
  root.append(body);
  return root;
}

