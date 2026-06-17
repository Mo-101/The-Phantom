from pathlib import Path
import json
import os
import tempfile

from validation.engine_adapter import AdapterError, Engine
from validation.run_validation import clean_stop, refuse_example, STATUS_CLEAN_STOP_NO_MANIFEST
from validation.signal_loader import ManifestError, load_manifest


def test_engine_from_env_requires_repo():
    old_repo = os.environ.pop("PHANTOM_ENGINE_REPO", None)
    old_import = os.environ.get("PHANTOM_ENGINE_IMPORT")
    os.environ["PHANTOM_ENGINE_IMPORT"] = "src/services/intelligence.ts:ExplainabilityEngine"
    try:
        try:
            Engine.from_env()
        except AdapterError as exc:
            assert "PHANTOM_ENGINE_REPO" in str(exc)
        else:
            raise AssertionError("Engine.from_env should require PHANTOM_ENGINE_REPO")
    finally:
        if old_repo is not None:
            os.environ["PHANTOM_ENGINE_REPO"] = old_repo
        if old_import is not None:
            os.environ["PHANTOM_ENGINE_IMPORT"] = old_import


def test_engine_from_env_requires_import():
    old_repo = os.environ.get("PHANTOM_ENGINE_REPO")
    old_import = os.environ.pop("PHANTOM_ENGINE_IMPORT", None)
    os.environ["PHANTOM_ENGINE_REPO"] = os.getcwd()
    try:
        try:
            Engine.from_env()
        except AdapterError as exc:
            assert "PHANTOM_ENGINE_IMPORT" in str(exc)
        else:
            raise AssertionError("Engine.from_env should require PHANTOM_ENGINE_IMPORT")
    finally:
        if old_repo is not None:
            os.environ["PHANTOM_ENGINE_REPO"] = old_repo
        else:
            os.environ.pop("PHANTOM_ENGINE_REPO", None)
        if old_import is not None:
            os.environ["PHANTOM_ENGINE_IMPORT"] = old_import


def test_call_bridge_rejects_bad_exit():
    with tempfile.TemporaryDirectory() as td:
        tmp_path = Path(td)
        bridge = tmp_path / "bridge.ts"
        bridge.write_text("process.stderr.write('boom'); process.exit(2);", encoding="utf-8")
        tsx = tmp_path / "node_modules" / ".bin" / "tsx"
        tsx.parent.mkdir(parents=True)
        tsx.write_text("#!/usr/bin/env bash\nexit 2\n", encoding="utf-8")
        tsx.chmod(0o755)
        engine = Engine(tmp_path, "x:y", {}, bridge, {}, {})

        try:
            engine._call_bridge({})
        except AdapterError as exc:
            assert "TypeScript bridge failed" in str(exc)
        else:
            raise AssertionError("bad bridge exit should fail")


def test_call_bridge_rejects_invalid_json():
    with tempfile.TemporaryDirectory() as td:
        tmp_path = Path(td)
        bridge = tmp_path / "bridge.ts"
        bridge.write_text("", encoding="utf-8")
        tsx = tmp_path / "node_modules" / ".bin" / "tsx"
        tsx.parent.mkdir(parents=True)
        tsx.write_text("#!/usr/bin/env bash\nprintf 'not-json'\n", encoding="utf-8")
        tsx.chmod(0o755)
        engine = Engine(tmp_path, "x:y", {}, bridge, {}, {})

        try:
            engine._call_bridge({})
        except AdapterError as exc:
            assert "invalid JSON" in str(exc)
        else:
            raise AssertionError("invalid bridge JSON should fail")


def test_call_bridge_rejects_missing_fields():
    with tempfile.TemporaryDirectory() as td:
        tmp_path = Path(td)
        bridge = tmp_path / "bridge.ts"
        bridge.write_text("", encoding="utf-8")
        tsx = tmp_path / "node_modules" / ".bin" / "tsx"
        tsx.parent.mkdir(parents=True)
        tsx.write_text("#!/usr/bin/env bash\nprintf '{}'\n", encoding="utf-8")
        tsx.chmod(0o755)
        engine = Engine(tmp_path, "x:y", {}, bridge, {}, {})

        try:
            engine._call_bridge({})
        except AdapterError as exc:
            assert "missing fields" in str(exc)
        else:
            raise AssertionError("missing bridge fields should fail")


def test_refuse_example_manifest():
    try:
        refuse_example(Path("signals_manifest.example.jsonl"), "manifest")
    except SystemExit as exc:
        assert "example manifest" in str(exc)
    else:
        raise AssertionError("example manifest should be refused")


def test_renamed_example_manifest_refused_by_content():
    with tempfile.TemporaryDirectory() as td:
        manifest = Path(td) / "signals_manifest.jsonl"
        manifest.write_text(
            '{"corridor_match":"C-SD-001","event_date":"2024-09-01","license_basis":"licensed/internal-metadata","notes":"Example only. Replace before lock.","payload_path":"","pub_date":"2024-09-06","retrieved":"2026-06-12T00:00:00Z","sha256":"0000000000000000000000000000000000000000000000000000000000000000","signal_id":"example-acled-amhar-2024-09-01-001","source":"ACLED","source_url":""}\n',
            encoding="utf-8",
        )
        try:
            load_manifest(manifest)
        except ManifestError as exc:
            assert "placeholder" in str(exc).lower()
        else:
            raise AssertionError("renamed example manifest should be refused by content")


def test_clean_stop_receipt():
    with tempfile.TemporaryDirectory() as td:
        tmp_path = Path(td)
        status = clean_stop(tmp_path, "gallabat-metema-v1", "manifest missing")
        assert status == 0
        receipt = json.loads((tmp_path / "run_receipts.json").read_text(encoding="utf-8"))
        assert receipt["status"] == STATUS_CLEAN_STOP_NO_MANIFEST
        assert receipt["verdict"] is None
        assert receipt["transition_log_written"] is False
