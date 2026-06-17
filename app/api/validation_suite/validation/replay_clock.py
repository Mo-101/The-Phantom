from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Iterable, Iterator


def parse_date(value: str | date) -> date:
    if isinstance(value, date):
        return value
    return datetime.strptime(value, "%Y-%m-%d").date()


@dataclass(frozen=True)
class ReplayWindow:
    start: date
    end: date

    @classmethod
    def from_strings(cls, start: str, end: str) -> "ReplayWindow":
        return cls(parse_date(start), parse_date(end))

    def days(self) -> Iterator[date]:
        current = self.start
        while current <= self.end:
            yield current
            current += timedelta(days=1)


def signal_visible_on(signal: dict, replay_date: date | str) -> bool:
    """Temporal firewall.

    A signal is visible only if both:
    - source event timestamp <= replay date
    - publication timestamp <= replay date

    Missing dates are not tolerated.
    """
    t = parse_date(replay_date)
    event_date = parse_date(signal["event_date"])
    pub_date = parse_date(signal["pub_date"])
    return event_date <= t and pub_date <= t


def visible_signals(signals: Iterable[dict], replay_date: date | str) -> list[dict]:
    return [s for s in signals if signal_visible_on(s, replay_date)]
