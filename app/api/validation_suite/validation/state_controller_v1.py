from __future__ import annotations

from typing import Iterable

STATE_CONTROLLER_VERSION = "phantom-validation-state-v1"


def _haystack(signals: Iterable[dict]) -> str:
    parts: list[str] = []
    for signal in signals:
        for key in ("title", "summary", "description", "notes", "text", "rationale", "tag"):
            value = signal.get(key)
            if value:
                parts.append(str(value))
        for key in ("taxonomy", "tags", "keywords"):
            value = signal.get(key)
            if isinstance(value, list):
                parts.extend(str(item) for item in value)
            elif value:
                parts.append(str(value))
    return " ".join(parts).lower()


def _contains_taxonomy(signals: Iterable[dict], taxonomy: Iterable[str]) -> bool:
    text = _haystack(signals)
    return any(term.lower() in text for term in taxonomy)


def classify_state(
    risk: float,
    visible_signals: list[dict],
    previous_state: str | None,
    taxonomy: dict,
) -> str:
    recovery_hit = _contains_taxonomy(visible_signals, taxonomy.get("recovery_taxonomy", []))
    closure_hit = _contains_taxonomy(visible_signals, taxonomy.get("closure_taxonomy", []))

    if previous_state == "DISRUPTED" and recovery_hit:
        return "RECOVERING"
    if risk >= 0.65 and closure_hit:
        return "DISRUPTED"
    if risk >= 0.4:
        return "WATCH"
    return "ACTIVE"


def transition_from(previous_state: str | None, state: str, trigger_signal_ids: list[str]) -> dict | None:
    if previous_state is None or previous_state == state:
        return None
    return {
        "from_state": previous_state,
        "to_state": state,
        "trigger_signals": trigger_signal_ids,
    }
