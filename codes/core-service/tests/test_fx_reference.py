from datetime import date
from decimal import Decimal

import pytest

from app.services.fx_reference import FxFeedError, parse_ecb_daily

_FEED = """<?xml version="1.0" encoding="UTF-8"?>
<gesmes:Envelope xmlns:gesmes="http://www.gesmes.org/xml/2002-08-01"
  xmlns="http://www.ecb.int/vocabulary/2002-08-01/eurofxref">
  <Cube>
    <Cube time="2026-10-16">
      <Cube currency="USD" rate="1.08"/>
      <Cube currency="JPY" rate="162"/>
      <Cube currency="GBP" rate="0.84"/>
      <Cube currency="CNY" rate="7.7"/>
      <Cube currency="HKD" rate="8.4"/>
      <Cube currency="KRW" rate="1500"/>
    </Cube>
  </Cube>
</gesmes:Envelope>
"""


def test_ecb_feed_becomes_cny_per_unit():
    as_of, rates = parse_ecb_daily(_FEED)
    assert as_of == date(2026, 10, 16)
    assert rates["EUR"] == Decimal("7.70000000")
    assert rates["USD"] == Decimal("7.12962963")
    assert rates["HKD"] == Decimal("0.91666667")
    assert rates["JPY"] == (Decimal("7.7") / Decimal("162")).quantize(Decimal("0.00000001"))
    assert rates["KRW"] == (Decimal("7.7") / Decimal("1500")).quantize(Decimal("0.00000001"))
    assert rates["GBP"] == (Decimal("7.7") / Decimal("0.84")).quantize(Decimal("0.00000001"))


def test_ecb_feed_without_cny_is_rejected():
    with pytest.raises(FxFeedError, match="ecb_cny_missing"):
        parse_ecb_daily('<Cube><Cube time="2026-10-16"><Cube currency="USD" rate="1.1"/></Cube></Cube>')
