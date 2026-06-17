from __future__ import annotations

from dataclasses import dataclass
from datetime import date
import json
import os
from pathlib import Path
import subprocess
from typing import Any

import yaml

try:
    from .state_controller_v1 import (
        STATE_CONTROLLER_VERSION,
        classify_state,
        transition_from,
    )
except ImportError:
    from state_controller_v1 import (
        STATE_CONTROLLER_VERSION,
        classify_state,
        transition_from,
    )


class AdapterError(RuntimeError):
    pass


REQUIRED_BRIDGE_FIELDS = {"state", "risk", "confidence", "trigger_signal_ids", "rationale"}


@dataclass
class Engine:
    repo: Path
    import_target: str
    taxonomy: dict
    bridge_path: Path
    corridor_registry: dict[str, dict]
    previous_states: dict[str, str]

    @classmethod
    def from_env(cls, taxonomy_path: str | Path = "state_taxonomy.yaml") -> "Engine":
        repo_value = os.environ.get("PHANTOM_ENGINE_REPO")
        import_target = os.environ.get("PHANTOM_ENGINE_IMPORT")
        if not repo_value:
            raise AdapterError("PHANTOM_ENGINE_REPO is required")
        if not import_target:
            raise AdapterError("PHANTOM_ENGINE_IMPORT is required")

        repo = Path(repo_value).expanduser().resolve()
        if not repo.exists():
            raise AdapterError(f"PHANTOM_ENGINE_REPO does not exist: {repo}")

        here = Path(__file__).resolve().parent
        taxonomy = yaml.safe_load((here / taxonomy_path).read_text(encoding="utf-8"))
        registry = cls._load_corridor_registry(repo)

        return cls(
            repo=repo,
            import_target=import_target,
            taxonomy=taxonomy,
            bridge_path=here / "phantom_engine_bridge.ts",
            corridor_registry=registry,
            previous_states={},
        )

    @staticmethod
    def _load_corridor_registry(repo: Path) -> dict[str, dict]:
        path = repo / "public" / "data" / "corridors_meta.json"
        if not path.exists():
            return {}
        data = json.loads(path.read_text(encoding="utf-8"))
        return {str(item["id"]): item for item in data if "id" in item}

    def _tsx_command(self) -> list[str]:
        tsx = self.repo / "node_modules" / ".bin" / "tsx"
        if not tsx.exists():
            raise AdapterError(f"tsx executable not found at {tsx}")
        return [str(tsx), str(self.bridge_path)]

    def _call_bridge(self, payload: dict[str, Any]) -> dict[str, Any]:
        env = os.environ.copy()
        env["PHANTOM_ENGINE_IMPORT"] = self.import_target
        proc = subprocess.run(
            self._tsx_command(),
            cwd=self.repo,
            env=env,
            input=json.dumps(payload, ensure_ascii=False),
            text=True,
            capture_output=True,
            timeout=60,
            check=False,
        )
        if proc.returncode != 0:
            raise AdapterError(f"TypeScript bridge failed ({proc.returncode}): {proc.stderr.strip()}")
        try:
            result = json.loads(proc.stdout)
        except json.JSONDecodeError as exc:
            raise AdapterError(f"TypeScript bridge returned invalid JSON: {proc.stdout[:500]}") from exc

        missing = REQUIRED_BRIDGE_FIELDS - set(result)
        if missing:
            raise AdapterError(f"TypeScript bridge output missing fields: {sorted(missing)}")
        return result

    def evaluate_day(self, corridor_id: str, replay_date: date, visible_signals: list[dict]) -> dict:
        previous_state = self.previous_states.get(corridor_id)
        payload = {
            "corridor_id": corridor_id,
            "replay_date": str(replay_date),
            "visible_signals": visible_signals,
            "previous_state": previous_state,
            "corridor": self.corridor_registry.get(corridor_id, {"id": corridor_id}),
        }
        bridge_result = self._call_bridge(payload)

        risk = float(bridge_result["risk"])
        trigger_signal_ids = list(bridge_result.get("trigger_signal_ids") or [])
        state = classify_state(
            risk=risk,
            visible_signals=visible_signals,
            previous_state=previous_state,
            taxonomy=self.taxonomy,
        )
        transition = transition_from(previous_state, state, trigger_signal_ids)
        self.previous_states[corridor_id] = state

        return {
            "corridor_id": corridor_id,
            "date": str(replay_date),
            "state": state,
            "risk": risk,
            "confidence": float(bridge_result["confidence"]),
            "state_controller_version": STATE_CONTROLLER_VERSION,
            "transition": transition,
            "rationale": bridge_result["rationale"],
            "raw": bridge_result.get("raw", {}),
        }
