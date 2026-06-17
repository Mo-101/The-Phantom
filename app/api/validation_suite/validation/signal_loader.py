from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Iterable

REQUIRED_FIELDS = {
    "signal_id",
    "source",
    "event_date",
    "pub_date",
    "license_basis",
    "retrieved",
    "sha256",
    "corridor_match",
}

PLACEHOLDER_MARKERS = (
    "example only",
    "replace before lock",
    "placeholder",
    "synthetic",
)


class ManifestError(ValueError):
    pass


def _validate_line(record: dict, line_no: int) -> None:
    missing = REQUIRED_FIELDS - set(record)
    if missing:
        raise ManifestError(f"line {line_no}: missing required fields {sorted(missing)}")
    if len(record["sha256"]) != 64:
        raise ManifestError(f"line {line_no}: sha256 must be 64 hex chars")
    if set(record["sha256"].lower()) == {"0"}:
        raise ManifestError(f"line {line_no}: sha256 is a placeholder zero hash")

    text = " ".join(
        str(record.get(key, ""))
        for key in ("signal_id", "source", "notes", "license_basis", "source_url")
    ).lower()
    for marker in PLACEHOLDER_MARKERS:
        if marker in text:
            raise ManifestError(f"line {line_no}: manifest contains placeholder marker {marker!r}")


def load_manifest(path: str | Path) -> list[dict]:
    records: list[dict] = []
    with Path(path).open("r", encoding="utf-8") as f:
        for line_no, line in enumerate(f, start=1):
            if not line.strip():
                continue
            record = json.loads(line)
            _validate_line(record, line_no)
            records.append(record)
    return records


def sha256_file(path: str | Path) -> str:
    h = hashlib.sha256()
    with Path(path).open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def verify_payload_hashes(records: Iterable[dict], base_dir: str | Path = ".") -> list[str]:
    """Return list of errors; empty means all present payloads match.

    Manifest lines may omit payload_path when licensing only permits metadata.
    """
    errors: list[str] = []
    root = Path(base_dir)
    for r in records:
        payload = r.get("payload_path")
        if not payload:
            continue
        path = root / payload
        if not path.exists():
            errors.append(f"{r['signal_id']}: payload missing: {path}")
            continue
        actual = sha256_file(path)
        if actual.lower() != r["sha256"].lower():
            errors.append(f"{r['signal_id']}: sha mismatch expected {r['sha256']} got {actual}")
    return errors
