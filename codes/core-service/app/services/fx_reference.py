"""Official CNY bridge rates from the ECB euro foreign-exchange reference feed.

The daily file is published once each TARGET business day:
https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml

Cubes quote foreign currency per 1 euro. We store CNY per 1 unit, which is
CNY-per-euro divided by that currency's euro rate. EUR itself is CNY-per-euro.
"""

from __future__ import annotations

import logging
import os
import threading
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal, ROUND_HALF_UP
from xml.etree import ElementTree

import httpx
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models.asset import AssetReferenceRate

logger = logging.getLogger(__name__)

ECB_DAILY_URL = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml"
ECB_SOURCE = "ecb"
ECB_PAGE_URL = (
    "https://www.ecb.europa.eu/stats/policy_and_exchange_rates/"
    "euro_reference_exchange_rates/html/index.en.html"
)
REFERENCE_CURRENCIES = ("USD", "EUR", "GBP", "HKD", "JPY", "KRW")
REFRESH_AFTER = timedelta(hours=6)
_QUANTUM = Decimal("0.00000001")
_refresh_lock = threading.Lock()
_stop = threading.Event()
_started = False


class FxFeedError(Exception):
    pass


def parse_ecb_daily(xml_text: str) -> tuple[date, dict[str, Decimal]]:
    root = ElementTree.fromstring(xml_text)
    day = next((node for node in root.iter() if _local(node.tag) == "Cube" and node.get("time")), None)
    if day is None or not day.get("time"):
        raise FxFeedError("ecb_feed_empty")
    per_eur: dict[str, Decimal] = {}
    for node in day:
        if _local(node.tag) != "Cube":
            continue
        code = node.get("currency")
        rate = node.get("rate")
        if not code or not rate:
            continue
        per_eur[code] = Decimal(rate)
    cny_per_eur = per_eur.get("CNY")
    if cny_per_eur is None or cny_per_eur <= 0:
        raise FxFeedError("ecb_cny_missing")
    rates: dict[str, Decimal] = {}
    for code in REFERENCE_CURRENCIES:
        if code == "EUR":
            rates[code] = _quantize(cny_per_eur)
            continue
        foreign = per_eur.get(code)
        if foreign is None or foreign <= 0:
            continue
        rates[code] = _quantize(cny_per_eur / foreign)
    return date.fromisoformat(day.get("time") or ""), rates


def store_reference_rates(
    db: Session,
    as_of: date,
    rates: dict[str, Decimal],
    *,
    source: str = ECB_SOURCE,
    fetched_at: datetime | None = None,
) -> None:
    moment = fetched_at or datetime.now(timezone.utc)
    for code, value in rates.items():
        row = db.get(AssetReferenceRate, code)
        if row is None:
            row = AssetReferenceRate(
                currency=code,
                cny_per_unit=value,
                as_of=as_of,
                fetched_at=moment,
                source=source,
            )
        else:
            row.cny_per_unit = value
            row.as_of = as_of
            row.fetched_at = moment
            row.source = source
        db.add(row)
    db.commit()


def list_reference_rates(db: Session) -> list[AssetReferenceRate]:
    rows = list(db.scalars(select(AssetReferenceRate)).all())
    order = {code: index for index, code in enumerate(REFERENCE_CURRENCIES)}
    rows.sort(key=lambda row: (order.get(row.currency, len(order)), row.currency))
    return rows


def reference_rate_map(db: Session) -> dict[str, Decimal]:
    return {row.currency: Decimal(row.cny_per_unit) for row in list_reference_rates(db)}


def refresh_from_ecb(db: Session) -> None:
    response = httpx.get(
        ECB_DAILY_URL,
        timeout=8.0,
        headers={"User-Agent": "Timia/core-service", "Accept": "application/xml"},
    )
    response.raise_for_status()
    as_of, rates = parse_ecb_daily(response.text)
    store_reference_rates(db, as_of, rates)


def ensure_fresh_reference_rates(db: Session) -> None:
    if os.environ.get("PYTEST_CURRENT_TEST"):
        return
    if _is_fresh(db) or not _refresh_lock.acquire(blocking=False):
        return
    try:
        if not _is_fresh(db):
            refresh_from_ecb(db)
    except Exception:
        db.rollback()
        logger.warning("ecb fx refresh failed", exc_info=True)
    finally:
        _refresh_lock.release()


def start_fx_refresh() -> None:
    global _started
    if os.environ.get("PYTEST_CURRENT_TEST") or _started:
        return
    _started = True
    threading.Thread(target=_refresh_loop, name="fx-refresh", daemon=True).start()


def _refresh_loop() -> None:
    while not _stop.is_set():
        db = SessionLocal()
        try:
            ensure_fresh_reference_rates(db)
        finally:
            db.close()
        if _stop.wait(REFRESH_AFTER.total_seconds()):
            return


def _is_fresh(db: Session) -> bool:
    newest = db.scalar(select(func.max(AssetReferenceRate.fetched_at)))
    if newest is None:
        return False
    moment = newest if newest.tzinfo else newest.replace(tzinfo=timezone.utc)
    return moment >= datetime.now(timezone.utc) - REFRESH_AFTER


def _quantize(value: Decimal) -> Decimal:
    return value.quantize(_QUANTUM, rounding=ROUND_HALF_UP)


def _local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]
