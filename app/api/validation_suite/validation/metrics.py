from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from typing import Iterable


def parse_date(value: str | date) -> date:
    if isinstance(value, date):
        return value
    return datetime.strptime(value, "%Y-%m-%d").date()


@dataclass(frozen=True)
class Transition:
    corridor_id: str
    date: date
    from_state: str
    to_state: str
    trigger_signals: list[str]

    @classmethod
    def from_record(cls, r: dict) -> "Transition":
        return cls(
            corridor_id=r["corridor_id"],
            date=parse_date(r["date"]),
            from_state=r["from_state"],
            to_state=r["to_state"],
            trigger_signals=list(r.get("trigger_signals", [])),
        )


def category_for_state(state: str, mapping: dict) -> str | None:
    for category, states in mapping["ground_truth_categories"].items():
        if state in states:
            return category
    return None


def first_disrupted_transition(
    transitions: Iterable[Transition],
    corridor_id: str,
    mapping: dict,
) -> Transition | None:
    for t in sorted(transitions, key=lambda x: x.date):
        if t.corridor_id != corridor_id:
            continue
        if category_for_state(t.to_state, mapping) == "disrupted":
            return t
    return None


def detection_pass(
    transitions: Iterable[Transition],
    corridor_id: str,
    mapping: dict,
    window_start: str,
    window_end: str,
) -> tuple[bool, Transition | None]:
    hit = first_disrupted_transition(transitions, corridor_id, mapping)
    if not hit:
        return False, None
    return parse_date(window_start) <= hit.date <= parse_date(window_end), hit


def persistence_ratio(
    daily_states: list[dict],
    corridor_id: str,
    mapping: dict,
    start: str,
    end: str,
) -> float:
    s = parse_date(start)
    e = parse_date(end)
    days = [
        d for d in daily_states
        if d["corridor_id"] == corridor_id and s <= parse_date(d["date"]) <= e
    ]
    if not days:
        return 0.0
    disrupted = [
        d for d in days
        if category_for_state(d["state"], mapping) == "disrupted"
    ]
    return len(disrupted) / len(days)


def recovery_pass(
    transitions: Iterable[Transition],
    corridor_id: str,
    mapping: dict,
    reopen_date: str,
    tolerance_days: int = 14,
) -> tuple[bool, Transition | None]:
    r = parse_date(reopen_date)
    lo = date.fromordinal(r.toordinal() - tolerance_days)
    hi = date.fromordinal(r.toordinal() + tolerance_days)

    for t in sorted(transitions, key=lambda x: x.date):
        if t.corridor_id != corridor_id:
            continue
        cat = category_for_state(t.to_state, mapping)
        if cat in {"active", "recovery"} and lo <= t.date <= hi:
            return True, t
    return False, None


def control_false_positive_count(
    transitions: Iterable[Transition],
    control_ids: list[str],
    mapping: dict,
) -> int:
    count = 0
    for cid in control_ids:
        if first_disrupted_transition(transitions, cid, mapping):
            count += 1
    return count
