"""0–100 health card scores. Missing values stay None (shown as none in UI).

These are product heuristics for personal trend observation, not medical advice.
Range mode should pass the daily average (or last value for sparse metrics).
"""

from __future__ import annotations

from app.models.health_types import DEFAULT_CARD_ORDER
from app.schemas.views.health import HealthCurrentOut, HealthScoreFormulaOut

SCORE_MAX = 100

SCORE_FORMULAS: dict[str, HealthScoreFormulaOut] = {
    "steps": HealthScoreFormulaOut(
        formula="clamp(round(100 × 步数 / 10000), 0, 100)",
        hint="总分100分，以10000 步为基础",
    ),
    "active": HealthScoreFormulaOut(
        formula="clamp(round(100 × kcal / 500), 0, 100)",
        hint="总分100分，以500 kcal为基础",
    ),
    "basal": HealthScoreFormulaOut(
        formula="none",
        hint="暂不评分，缺少个人基础代谢目标",
    ),
    "exercise": HealthScoreFormulaOut(
        formula="clamp(round(100 × 分钟 / 30), 0, 100)",
        hint="总分100分，以30 分钟为基础",
    ),
    "stand": HealthScoreFormulaOut(
        formula="clamp(round(100 × 小时 / 12), 0, 100)",
        hint="总分100分，以12 小时为基础",
    ),
    "rhr": HealthScoreFormulaOut(
        formula=(
            "50–65 bpm → 100；<50 → clamp(round(100 − (50 − bpm) × 2), 0, 100)；"
            ">65 → clamp(round(100 − (bpm − 65) × 2.2), 0, 100)"
        ),
        hint="总分100分，以50–65 bpm为最佳区间",
    ),
    "sleep": HealthScoreFormulaOut(
        formula=(
            "7–9 小时 → 100；<7h → clamp(round(100 × hours / 7), 0, 100)；"
            ">9h → clamp(round(100 − (hours − 9) × 20), 0, 100)"
        ),
        hint="总分100分，以7–9小时为基础",
    ),
    "weight": HealthScoreFormulaOut(
        formula="none",
        hint="暂不评分，缺少身高或个人目标体重",
    ),
    "hrv": HealthScoreFormulaOut(
        formula="clamp(round(100 × ms / 60), 0, 100)",
        hint="总分100分，以60 ms为基础",
    ),
    "vo2": HealthScoreFormulaOut(
        formula="clamp(round(100 × (vo2 − 20) / 30), 0, 100)",
        hint="总分100分，以50为满分（20为0分）",
    ),
    "recovery": HealthScoreFormulaOut(
        formula="clamp(round(100 × bpm / 30), 0, 100)",
        hint="总分100分，以30 bpm为基础",
    ),
    "spo2": HealthScoreFormulaOut(
        formula="clamp(round(100 × (spo2 − 0.90) / 0.08), 0, 100)",
        hint="总分100分，以98%为满分（90%为0分）",
    ),
}


def score_current(current: HealthCurrentOut) -> dict[str, int | None]:
    values = {
        "steps": _linear(current.steps, 10000),
        "active": _linear(current.active_energy_kcal, 500),
        "basal": None,
        "exercise": _linear(current.exercise_minutes, 30),
        "stand": _linear(
            current.stand_hours if current.stand_hours is not None else None,
            12,
        ),
        "rhr": _score_resting_hr(current.resting_hr_bpm),
        "sleep": _score_sleep(current.sleep_asleep_minutes),
        "weight": None,
        "hrv": _linear(current.hrv_median_ms, 60),
        "vo2": _score_vo2(current.vo2_max),
        "recovery": _linear(current.cardio_recovery_bpm, 30),
        "spo2": _score_spo2(current.spo2_avg),
    }
    return {key: values[key] for key in DEFAULT_CARD_ORDER}


def _clamp(value: float) -> int:
    return max(0, min(SCORE_MAX, int(round(value))))


def _linear(value: float | None, target: float) -> int | None:
    if value is None or target <= 0:
        return None
    return _clamp(SCORE_MAX * (value / target))


def _score_resting_hr(bpm: float | None) -> int | None:
    if bpm is None:
        return None
    if 50 <= bpm <= 65:
        return SCORE_MAX
    if bpm < 50:
        return _clamp(SCORE_MAX - (50 - bpm) * 2)
    return _clamp(SCORE_MAX - (bpm - 65) * 2.2)


def _score_sleep(minutes: float | None) -> int | None:
    if minutes is None:
        return None
    hours = minutes / 60
    if 7 <= hours <= 9:
        return SCORE_MAX
    if hours < 7:
        return _clamp(SCORE_MAX * hours / 7)
    return _clamp(SCORE_MAX - (hours - 9) * 20)


def _score_vo2(vo2: float | None) -> int | None:
    if vo2 is None:
        return None
    return _clamp(SCORE_MAX * (vo2 - 20) / 30)


def _score_spo2(spo2: float | None) -> int | None:
    if spo2 is None:
        return None
    return _clamp(SCORE_MAX * (spo2 - 0.90) / 0.08)
