from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import subprocess
from typing import Any

import yaml

try:
    from .engine_adapter import Engine
    from .replay_clock import ReplayWindow, visible_signals
    from .signal_loader import load_manifest, sha256_file, verify_payload_hashes
    from .state_controller_v1 import STATE_CONTROLLER_VERSION
except ImportError:
    from engine_adapter import Engine
    from replay_clock import ReplayWindow, visible_signals
    from signal_loader import load_manifest, sha256_file, verify_payload_hashes
    from state_controller_v1 import STATE_CONTROLLER_VERSION


STATUS_CLEAN_STOP_NO_MANIFEST = "CLEAN_STOP_NO_MANIFEST"


def append_jsonl(path: Path, record: dict) -> None:
    with path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(record, ensure_ascii=False, sort_keys=True) + "\n")


def write_json(path: Path, record: dict) -> None:
    path.write_text(json.dumps(record, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def load_yaml(path: str | Path) -> dict:
    with Path(path).open("r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def refuse_example(path: Path, label: str) -> None:
    if ".example." in path.name or path.name.endswith(".example.yaml"):
        raise SystemExit(f"Refusing sacred replay with example {label}: {path}")


def clean_stop(out_dir: Path, run_id: str, reason: str) -> int:
    out_dir.mkdir(parents=True, exist_ok=True)
    receipt = {
        "run_id": run_id,
        "status": STATUS_CLEAN_STOP_NO_MANIFEST,
        "verdict": None,
        "transition_log_written": False,
        "reason": reason,
    }
    write_json(out_dir / "run_receipts.json", receipt)
    print(json.dumps(receipt, indent=2))
    return 0


def git_output(repo: Path, *args: str) -> str:
    proc = subprocess.run(
        ["git", *args],
        cwd=repo,
        text=True,
        capture_output=True,
        check=False,
    )
    return proc.stdout.strip() if proc.returncode == 0 else f"unavailable: {proc.stderr.strip()}"


def count_jsonl(path: Path) -> int:
    with path.open("r", encoding="utf-8") as f:
        return sum(1 for line in f if line.strip())


def receipt_hash(path: Path) -> str | None:
    return sha256_file(path) if path.exists() else None


def collect_receipts(
    repo: Path,
    run_id: str,
    controls_path: Path,
    controls_ground_truth_path: Path,
    state_mapping_path: Path,
    taxonomy_path: Path,
    state_controller_path: Path,
    manifest_path: Path,
    signals: list[dict],
) -> dict[str, Any]:
    return {
        "run_id": run_id,
        "status": "EXECUTED",
        "verdict": None,
        "transition_log_written": True,
        "engine_git_commit": git_output(repo, "rev-parse", "HEAD"),
        "git_status_summary": git_output(repo, "status", "--short"),
        "soul_weight_vector": {
            "gravity": 0.1,
            "diffusion": 0.15,
            "centrality": 0.12,
            "hmm": 0.15,
            "seasonal": 0.05,
            "linguistic": 0.05,
            "entropy": 0.08,
            "friction": 0.05,
            "evidence": 0.05,
            "path": 0.1,
            "location": 0.05,
            "forecast": 0.05,
            "anomaly": 0.05,
        },
        "truth_floor_thresholds": {
            "MEDIUM": 0.4,
            "HIGH": 0.65,
            "CRITICAL": 0.85,
        },
        "state_machine_version": STATE_CONTROLLER_VERSION,
        "state_controller_hash": receipt_hash(state_controller_path),
        "taxonomy_hash": receipt_hash(taxonomy_path),
        "controls_hash": receipt_hash(controls_path),
        "controls_ground_truth_hash": receipt_hash(controls_ground_truth_path),
        "state_mapping_hash": receipt_hash(state_mapping_path),
        "manifest_count": len(signals),
        "manifest_hash": receipt_hash(manifest_path),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--controls", default="controls.yaml")
    parser.add_argument("--controls-ground-truth", default="controls_ground_truth.yaml")
    parser.add_argument("--state-mapping", default="state_mapping.yaml")
    parser.add_argument("--out-dir", default="out")
    parser.add_argument("--start", default="2024-06-01")
    parser.add_argument("--end", default="2024-11-30")
    parser.add_argument("--run-id", default=os.environ.get("PHANTOM_RUN_ID", "gallabat-metema-v1"))
    parser.add_argument("--reason", default=None, help="Required only for reruns; logged into run metadata.")
    args = parser.parse_args()

    controls_path = Path(args.controls)
    controls_ground_truth_path = Path(args.controls_ground_truth)
    state_mapping_path = Path(args.state_mapping)
    manifest_path = Path(args.manifest)
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    run_marker = out_dir / "RUN_ALREADY_EXECUTED"
    if run_marker.exists() and not args.reason:
        raise SystemExit("Refusing rerun without --reason. Single replay run doctrine.")

    refuse_example(manifest_path, "manifest")
    refuse_example(state_mapping_path, "state mapping")

    if not manifest_path.exists():
        return clean_stop(out_dir, args.run_id, f"{manifest_path} missing or not validated")

    try:
        signals = load_manifest(manifest_path)
        payload_errors = verify_payload_hashes(signals, manifest_path.parent)
        if payload_errors:
            return clean_stop(out_dir, args.run_id, "manifest payload validation failed: " + "; ".join(payload_errors))
    except Exception as exc:
        return clean_stop(out_dir, args.run_id, f"{manifest_path} missing or not validated: {exc}")

    controls = load_yaml(controls_path)
    load_yaml(controls_ground_truth_path)
    load_yaml(state_mapping_path)
    corridors = [controls["primary"]["corridor_id"]] + [c["corridor_id"] for c in controls["controls"]]

    engine = Engine.from_env()
    daily_path = out_dir / "daily_states.jsonl"
    transition_path = out_dir / "transition_log.jsonl"
    daily_path.write_text("", encoding="utf-8")
    transition_path.write_text("", encoding="utf-8")

    for day in ReplayWindow.from_strings(args.start, args.end).days():
        day_signals = visible_signals(signals, day)
        for cid in corridors:
            result = engine.evaluate_day(cid, day, day_signals)
            append_jsonl(daily_path, result)
            if result.get("transition"):
                append_jsonl(transition_path, {
                    "corridor_id": cid,
                    "date": str(day),
                    **result["transition"],
                })

    here = Path(__file__).resolve().parent
    repo = Path(os.environ["PHANTOM_ENGINE_REPO"]).expanduser().resolve()
    receipts = collect_receipts(
        repo=repo,
        run_id=args.run_id,
        controls_path=controls_path,
        controls_ground_truth_path=controls_ground_truth_path,
        state_mapping_path=state_mapping_path,
        taxonomy_path=here / "state_taxonomy.yaml",
        state_controller_path=here / "state_controller_v1.py",
        manifest_path=manifest_path,
        signals=signals,
    )
    if args.reason:
        receipts["rerun_reason"] = args.reason
    write_json(out_dir / "run_receipts.json", receipts)
    run_marker.write_text("executed\n", encoding="utf-8")
    print(json.dumps(receipts, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
