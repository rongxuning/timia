"""E.164 normalization and display masks for phone login."""

from __future__ import annotations


class PhoneNumberError(ValueError):
    pass


def normalize_phone(raw: str) -> str:
    """Accept +E.164, a Chinese 11-digit mobile, or 86-prefixed digits."""
    compact = raw.strip().replace(" ", "").replace("-", "")
    if compact.startswith("+"):
        digits = "+" + "".join(ch for ch in compact[1:] if ch.isdigit())
    else:
        only = "".join(ch for ch in compact if ch.isdigit())
        if len(only) == 11 and only.startswith("1"):
            digits = "+86" + only
        elif only.startswith("86") and len(only) == 13:
            digits = "+" + only
        else:
            digits = "+" + only
    national = digits[1:]
    if not national.isdigit() or not 8 <= len(national) <= 15:
        raise PhoneNumberError("invalid_phone")
    return digits


def mask_phone(e164: str) -> str:
    digits = e164[1:] if e164.startswith("+") else e164
    local = digits[2:] if digits.startswith("86") and len(digits) >= 13 else digits
    if len(local) < 7:
        return "****"
    return f"{local[:3]}****{local[-4:]}"
