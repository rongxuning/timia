"""HealthKit workout activity tokens and personal metric-card keys.

Tokens stay ≤32 chars so they fit health_workout_session.activity_type.
Unknown HealthKit types collapse to ``other``. When the client sends
``activity_type=other`` but ``activity_type_raw`` is a known case name or
``HKWorkoutActivityType(rawValue: N)``, we remap (this is how existing
HIIT rows stored as other get a real type on the next read/sync).
"""

from __future__ import annotations

import re

# token, HealthKit camelCase case name, HKWorkoutActivityType raw value
_CATALOG: tuple[tuple[str, str, int], ...] = (
    ("american_football", "americanFootball", 1),
    ("archery", "archery", 2),
    ("australian_football", "australianFootball", 3),
    ("badminton", "badminton", 4),
    ("baseball", "baseball", 5),
    ("basketball", "basketball", 6),
    ("bowling", "bowling", 7),
    ("boxing", "boxing", 8),
    ("climbing", "climbing", 9),
    ("cricket", "cricket", 10),
    ("cross_training", "crossTraining", 11),
    ("curling", "curling", 12),
    ("cycling", "cycling", 13),
    ("dance", "dance", 14),
    ("dance_inspired", "danceInspiredTraining", 15),
    ("elliptical", "elliptical", 16),
    ("equestrian", "equestrianSports", 17),
    ("fencing", "fencing", 18),
    ("fishing", "fishing", 19),
    ("functional_strength", "functionalStrengthTraining", 20),
    ("golf", "golf", 21),
    ("gymnastics", "gymnastics", 22),
    ("handball", "handball", 23),
    ("hiking", "hiking", 24),
    ("hockey", "hockey", 25),
    ("hunting", "hunting", 26),
    ("lacrosse", "lacrosse", 27),
    ("martial_arts", "martialArts", 28),
    ("mind_and_body", "mindAndBody", 29),
    ("mixed_cardio_old", "mixedMetabolicCardioTraining", 30),
    ("paddle", "paddleSports", 31),
    ("play", "play", 32),
    ("prep_recovery", "preparationAndRecovery", 33),
    ("racquetball", "racquetball", 34),
    ("rowing", "rowing", 35),
    ("rugby", "rugby", 36),
    ("running", "running", 37),
    ("sailing", "sailing", 38),
    ("skating", "skatingSports", 39),
    ("snow", "snowSports", 40),
    ("soccer", "soccer", 41),
    ("softball", "softball", 42),
    ("squash", "squash", 43),
    ("stair_climbing", "stairClimbing", 44),
    ("surfing", "surfingSports", 45),
    ("swimming", "swimming", 46),
    ("table_tennis", "tableTennis", 47),
    ("tennis", "tennis", 48),
    ("track_field", "trackAndField", 49),
    ("strength", "traditionalStrengthTraining", 50),
    ("volleyball", "volleyball", 51),
    ("walking", "walking", 52),
    ("water_fitness", "waterFitness", 53),
    ("water_polo", "waterPolo", 54),
    ("water_sports", "waterSports", 55),
    ("wrestling", "wrestling", 56),
    ("yoga", "yoga", 57),
    ("barre", "barre", 58),
    ("core_training", "coreTraining", 59),
    ("xc_skiing", "crossCountrySkiing", 60),
    ("downhill_skiing", "downhillSkiing", 61),
    ("flexibility", "flexibility", 62),
    ("hiit", "highIntensityIntervalTraining", 63),
    ("jump_rope", "jumpRope", 64),
    ("kickboxing", "kickboxing", 65),
    ("pilates", "pilates", 66),
    ("snowboarding", "snowboarding", 67),
    ("stairs", "stairs", 68),
    ("step_training", "stepTraining", 69),
    ("wheelchair_walk", "wheelchairWalkPace", 70),
    ("wheelchair_run", "wheelchairRunPace", 71),
    ("tai_chi", "taiChi", 72),
    ("mixed_cardio", "mixedCardio", 73),
    ("hand_cycling", "handCycling", 74),
    ("disc_sports", "discSports", 75),
    ("fitness_gaming", "fitnessGaming", 76),
    ("cardio_dance", "cardioDance", 77),
    ("social_dance", "socialDance", 78),
    ("pickleball", "pickleball", 79),
    ("cooldown", "cooldown", 80),
    ("triathlon", "swimBikeRun", 81),
    ("transition", "transition", 82),
    ("underwater_diving", "underwaterDiving", 83),
    ("other", "other", 3000),
)

WORKOUT_ACTIVITY_TYPES = frozenset(token for token, _, _ in _CATALOG)
RAW_VALUE_TO_TOKEN = {raw: token for token, _, raw in _CATALOG}

_ALIASES: dict[str, str] = {}
for _token, _camel, _raw in _CATALOG:
    _ALIASES[_token] = _token
    _ALIASES[_camel] = _token
    _ALIASES[_camel.lower()] = _token
    _ALIASES[f"HKWorkoutActivityType.{_camel}"] = _token

# Extra aliases for the compact HIIT token and deprecated names.
_ALIASES["high_intensity_interval_training"] = "hiit"
_ALIASES["highintensityintervaltraining"] = "hiit"
_ALIASES["functionalstrengthtraining"] = "functional_strength"
_ALIASES["traditionalstrengthtraining"] = "strength"

_RAW_VALUE_RE = re.compile(r"rawValue:\s*(\d+)", re.IGNORECASE)

DEFAULT_CARD_ORDER = (
    "steps",
    "active",
    "basal",
    "exercise",
    "stand",
    "rhr",
    "sleep",
    "weight",
    "hrv",
    "vo2",
    "recovery",
    "spo2",
)
KNOWN_CARD_KEYS = frozenset(DEFAULT_CARD_ORDER)


def normalize_activity_type(activity_type: str | None, raw: str | None = None) -> str:
    """Map a client token and/or HealthKit raw string to a stored token."""
    from_type = _lookup(activity_type)
    from_raw = _lookup(raw)
    if from_type and from_type != "other":
        return from_type
    if from_raw and from_raw != "other":
        return from_raw
    if from_type:
        return from_type
    return "other"


def _lookup(value: str | None) -> str | None:
    if not value:
        return None
    text = value.strip()
    if not text:
        return None
    if text in WORKOUT_ACTIVITY_TYPES:
        return text
    aliased = _ALIASES.get(text) or _ALIASES.get(text.lower())
    if aliased:
        return aliased
    match = _RAW_VALUE_RE.search(text)
    if match:
        return RAW_VALUE_TO_TOKEN.get(int(match.group(1)))
    return None


def normalize_card_order(keys: list[str] | None) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for key in keys or []:
        if key in KNOWN_CARD_KEYS and key not in seen:
            out.append(key)
            seen.add(key)
    for key in DEFAULT_CARD_ORDER:
        if key not in seen:
            out.append(key)
    return out
