from __future__ import annotations

import argparse
import json
from pathlib import Path
import yaml

from metrics import (
    Transition,
    detection_pass,
    persistence_ratio,
    recovery_pass,
    control_false_positive_count,
)


def load_jsonl(path: str | Path) -> list[dict]:
    records = []
    with Path(path).open("r", encoding="utf-8") as f:
        for line in f:
            if line.strip():
                records.append(json.loads(line))
    return records


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--controls", required=True)
    parser.add_argument("--state-mapping", required=True)
    parser.add_argument("--transition-log", required=True)
    parser.add_argument("--daily-states", required=True)
    parser.add_argument("--out", default="divergence_report.json")
    args = parser.parse_args()

    controls = yaml.safe_load(Path(args.controls).read_text())
    mapping = yaml.safe_load(Path(args.state_mapping).read_text())

    transitions = [Transition.from_record(r) for r in load_jsonl(args.transition_log)]
    daily_states = load_jsonl(args.daily_states)

    primary = controls["primary"]
    primary_id = primary["corridor_id"]

    m1_pass, m1_hit = detection_pass(
        transitions, primary_id, mapping,
        primary["expected_event"]["detection_window_start"],
        primary["expected_event"]["detection_window_end"],
    )

    m3_ratio = persistence_ratio(
        daily_states, primary_id, mapping,
        primary["expected_event"]["closure_date"],
        primary["expected_event"]["reopen_date"],
    )

    m4_pass, m4_hit = recovery_pass(
        transitions, primary_id, mapping,
        primary["expected_event"]["reopen_date"],
        tolerance_days=14,
    )

    c1_c2 = [c["corridor_id"] for c in controls["controls"][:2]]
    fp = control_false_positive_count(transitions, c1_c2, mapping)
    m5_pass = fp == 0

    if m1_pass and m3_ratio >= 0.80 and m4_pass and m5_pass:
        verdict = "VALIDATED"
    elif m1_pass:
        verdict = "PARTIALLY VALIDATED"
    else:
        verdict = "NOT VALIDATED"

    report = {
        "verdict": verdict,
        "metrics": {
            "M1_detection_pass": m1_pass,
            "M1_detection_transition": m1_hit.__dict__ if m1_hit else None,
            "M3_persistence_ratio": m3_ratio,
            "M3_persistence_pass": m3_ratio >= 0.80,
            "M4_recovery_pass": m4_pass,
            "M4_recovery_transition": m4_hit.__dict__ if m4_hit else None,
            "M5_control_false_positive_count": fp,
            "M5_specificity_pass": m5_pass,
        },
    }

    Path(args.out).write_text(json.dumps(report, indent=2, default=str), encoding="utf-8")
    print(json.dumps(report, indent=2, default=str))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
