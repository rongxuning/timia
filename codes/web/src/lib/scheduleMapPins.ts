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

export function scheduleMapCardCopy<T extends ScheduleMapPinItem>(
  items: T[],
  labels: ScheduleMapCardLabels,
  formatTime: (start?: string | null, end?: string | null) => string | null,
): ScheduleMapCardCopy {
  const first = items[0];
  const title =
    items.length > 1 ? labels.moreItems(first.title, items.length) : first.title;
  return {
    title,
    timeLabel: formatTime(first.start_at, first.end_at) ?? labels.unscheduled,
    statusLabel: labels.status(first.status ?? ""),
    locationLabel: (first.location ?? "").trim(),
    count: items.length,
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

  const card = document.createElement("div");
  card.className = "max-w-[220px] rounded-xl border px-3 py-2 text-left";
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

  root.append(card, pin);
  return root;
}

