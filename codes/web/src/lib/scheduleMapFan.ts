export const SCHEDULE_MAP_FAN_STEP_PX = 148;
export const SCHEDULE_MAP_FAN_VELOCITY_DIVISOR = 900;
export const SCHEDULE_MAP_FAN_VELOCITY_CLAMP = 1.25;
export const SCHEDULE_MAP_FAN_EDGE_RESISTANCE = 0.35;
export const SCHEDULE_MAP_FAN_TAP_SLOP = 8;
export const SCHEDULE_MAP_FAN_TAP_SPEED = 200;
export const SCHEDULE_MAP_FAN_FLICK_DOWN = 800;
export const SCHEDULE_MAP_FAN_RADIUS = 168;
export const SCHEDULE_MAP_FAN_ANGLE_STEP_DEG = 16;
export const SCHEDULE_MAP_FAN_MIN_ANGLE_STEP_DEG = 10;
export const SCHEDULE_MAP_FAN_MAX_SHIFT = 48;
export const SCHEDULE_MAP_FAN_CARD_HEIGHT = 88;
export const SCHEDULE_MAP_CARD_WIDTH = 148;
export const SCHEDULE_MAP_CARD_HEIGHT = 70;
export const SCHEDULE_MAP_PIN_SIZE = 12;
export const SCHEDULE_MAP_PIN_GAP = 3;
export const SCHEDULE_MAP_CARD_ZOOM_IN_LATITUDE_DELTA = 0.02;
export const SCHEDULE_MAP_CARD_ZOOM_OUT_LATITUDE_DELTA = 1.2;
export const SCHEDULE_MAP_CARD_ZOOM_SCALE_MIN = 0.56;
export const SCHEDULE_MAP_CARD_ZOOM_SCALE_MAX = 1.18;
export const SCHEDULE_MAP_CARD_ZOOM_SCALE_STEP = 0.04;

export function scheduleMapAnchorOffsets(): { cardTop: number; pinTop: number; pinSize: number } {
  return {
    cardTop: -(SCHEDULE_MAP_CARD_HEIGHT + SCHEDULE_MAP_PIN_GAP + SCHEDULE_MAP_PIN_SIZE),
    pinTop: -SCHEDULE_MAP_PIN_SIZE,
    pinSize: SCHEDULE_MAP_PIN_SIZE,
  };
}
export const SCHEDULE_MAP_FAN_TOP_PAD = 24;
export const SCHEDULE_MAP_FAN_OPEN_MS = 320;
export const SCHEDULE_MAP_FAN_OPEN_STAGGER_MS = 40;
export const SCHEDULE_MAP_FAN_SNAP_MS = 220;
export const SCHEDULE_MAP_FAN_CLOSE_MS = 280;
export const SCHEDULE_MAP_FAN_CLOSE_STAGGER_MS = 32;
export const SCHEDULE_MAP_FAN_CHEST_SCALE_MS = 120;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function applyScheduleMapFanDrag(
  index: number,
  dx: number,
  count: number,
  step = SCHEDULE_MAP_FAN_STEP_PX,
): number {
  const raw = index - dx / step;
  const max = Math.max(0, count - 1);
  if (raw < 0) return raw * SCHEDULE_MAP_FAN_EDGE_RESISTANCE;
  if (raw > max) return max + (raw - max) * SCHEDULE_MAP_FAN_EDGE_RESISTANCE;
  return raw;
}

export function snapScheduleMapFanIndex(index: number, vx: number, count: number): number {
  const velocity = clamp(
    -vx / SCHEDULE_MAP_FAN_VELOCITY_DIVISOR,
    -SCHEDULE_MAP_FAN_VELOCITY_CLAMP,
    SCHEDULE_MAP_FAN_VELOCITY_CLAMP,
  );
  return clamp(Math.round(index + velocity), 0, Math.max(0, count - 1));
}

export function isScheduleMapFanTap(dx: number, dy: number, speed: number): boolean {
  return Math.hypot(dx, dy) < SCHEDULE_MAP_FAN_TAP_SLOP && speed < SCHEDULE_MAP_FAN_TAP_SPEED;
}

export function isScheduleMapFanDismissFlick(vx: number, vy: number): boolean {
  return vy > SCHEDULE_MAP_FAN_FLICK_DOWN && Math.abs(vy) > Math.abs(vx);
}

export function scheduleMapFanSlot(
  offset: number,
): { rotate: number; scale: number; opacity: number } | null {
  const abs = Math.abs(offset);
  if (abs > 2) return null;
  const scale = abs <= 1 ? 1 - 0.12 * abs : 0.88 - 0.12 * (abs - 1);
  const opacity = abs <= 1 ? 1 - 0.14 * abs : 0.86 - 0.3 * (abs - 1);
  return { rotate: offset * SCHEDULE_MAP_FAN_ANGLE_STEP_DEG, scale, opacity };
}

export function scheduleMapFanLayout(
  origin: { x: number; y: number },
  canvas: { width: number; height: number },
): { direction: 1 | -1; shiftX: number; angleStep: number } {
  const needed = SCHEDULE_MAP_FAN_RADIUS + SCHEDULE_MAP_FAN_CARD_HEIGHT + SCHEDULE_MAP_FAN_TOP_PAD;
  const direction: 1 | -1 = origin.y >= needed ? -1 : 1;
  const half = 2 * SCHEDULE_MAP_FAN_RADIUS * Math.sin((SCHEDULE_MAP_FAN_ANGLE_STEP_DEG * Math.PI) / 180);
  let shiftX = 0;
  if (origin.x - half < 0) shiftX = Math.min(SCHEDULE_MAP_FAN_MAX_SHIFT, half - origin.x);
  if (origin.x + half > canvas.width) {
    shiftX = Math.max(-SCHEDULE_MAP_FAN_MAX_SHIFT, canvas.width - origin.x - half);
  }
  const stillOverflows =
    origin.x + shiftX - half < 0 || origin.x + shiftX + half > canvas.width;
  const angleStep = stillOverflows ? SCHEDULE_MAP_FAN_MIN_ANGLE_STEP_DEG : SCHEDULE_MAP_FAN_ANGLE_STEP_DEG;
  return { direction, shiftX, angleStep };
}

/** Top-center of a card relative to the chest anchor. Downward fans sit below the pin. */
export function scheduleMapFanCardOffset(
  indexOffset: number,
  layout: { direction: 1 | -1; angleStep: number },
): { x: number; y: number } {
  const angle = (indexOffset * layout.angleStep * Math.PI) / 180;
  const x = Math.sin(angle) * SCHEDULE_MAP_FAN_RADIUS;
  const arc = (1 - Math.cos(angle)) * SCHEDULE_MAP_FAN_RADIUS;
  if (layout.direction === 1) return { x, y: arc };
  return { x, y: -arc - SCHEDULE_MAP_FAN_CARD_HEIGHT };
}

export function scheduleMapFanCloseTotalMs(count: number): number {
  return SCHEDULE_MAP_FAN_CLOSE_MS + Math.max(0, count - 1) * SCHEDULE_MAP_FAN_CLOSE_STAGGER_MS;
}

export const SCHEDULE_MAP_REEL_STEP_PX = 58;
export const SCHEDULE_MAP_REEL_TILE = 64;
export const SCHEDULE_MAP_REEL_GAP = 12;

export function scheduleMapReelSlot(
  offset: number,
): { scale: number; opacity: number; y: number } | null {
  const abs = Math.abs(offset);
  if (abs > 2) return null;
  const scale = abs <= 1 ? 1 - 0.22 * abs : 0.78 - 0.16 * (abs - 1);
  const opacity = abs <= 1 ? 1 - 0.28 * abs : 0.72 - 0.32 * (abs - 1);
  return { scale, opacity, y: offset * SCHEDULE_MAP_REEL_STEP_PX };
}

export function scheduleMapReelSide(
  originX: number,
  canvasWidth: number,
  cardWidth = SCHEDULE_MAP_CARD_WIDTH,
): "left" | "right" {
  const need = SCHEDULE_MAP_REEL_TILE + SCHEDULE_MAP_REEL_GAP + 24;
  const half = cardWidth / 2 + 10;
  if (originX < need + half) return "right";
  if (originX > canvasWidth - half) return "left";
  return "left";
}

export function scheduleMapLatitudeDelta(north: number, south: number): number {
  return Math.max(0.0001, north - south);
}

export function scheduleMapCardZoomScale(latitudeDelta: number): number {
  const delta = Math.max(latitudeDelta, 0.0001);
  const zoomedIn = Math.log(SCHEDULE_MAP_CARD_ZOOM_IN_LATITUDE_DELTA);
  const zoomedOut = Math.log(SCHEDULE_MAP_CARD_ZOOM_OUT_LATITUDE_DELTA);
  const t = (Math.log(delta) - zoomedOut) / (zoomedIn - zoomedOut);
  const clamped = clamp(t, 0, 1);
  return (
    SCHEDULE_MAP_CARD_ZOOM_SCALE_MIN +
    (SCHEDULE_MAP_CARD_ZOOM_SCALE_MAX - SCHEDULE_MAP_CARD_ZOOM_SCALE_MIN) * clamped
  );
}

export function scheduleMapCardZoomScaleQuantized(
  latitudeDelta: number,
  step = SCHEDULE_MAP_CARD_ZOOM_SCALE_STEP,
): number {
  const raw = scheduleMapCardZoomScale(latitudeDelta);
  if (raw <= SCHEDULE_MAP_CARD_ZOOM_SCALE_MIN) return SCHEDULE_MAP_CARD_ZOOM_SCALE_MIN;
  if (raw >= SCHEDULE_MAP_CARD_ZOOM_SCALE_MAX) return SCHEDULE_MAP_CARD_ZOOM_SCALE_MAX;
  return clamp(Math.round(raw / step) * step, SCHEDULE_MAP_CARD_ZOOM_SCALE_MIN, SCHEDULE_MAP_CARD_ZOOM_SCALE_MAX);
}

export type ScheduleMapReelHit = { action: "open" } | { action: "focus"; index: number };

export function scheduleMapReelHit(action: string | null, indexAttr: string | null): ScheduleMapReelHit | null {
  if (action === "open") return { action: "open" };
  if (action === "focus") {
    const index = Number(indexAttr);
    if (Number.isInteger(index)) return { action: "focus", index };
  }
  return null;
}

export function scheduleMapReelHitFromElement(el: Element | null): ScheduleMapReelHit | null {
  const hit = el?.closest("[data-reel-action]") ?? null;
  return scheduleMapReelHit(hit?.getAttribute("data-reel-action") ?? null, hit?.getAttribute("data-fan-index") ?? null);
}

/** Escape closes the task drawer first; the reel stays until a later Escape. */
export function shouldDismissReelOnEscape({ drawerOpen }: { drawerOpen: boolean }): boolean {
  return !drawerOpen;
}
