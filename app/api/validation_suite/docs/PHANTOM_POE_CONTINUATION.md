# PHANTOM POE — CONTINUATION FROM v1.0 PRE-REGISTRATION

## Decision

Continue with the Gallabat–Metema event as the primary validation event.

Ground truth remains:
- Closure triggered in early September 2024 after Fano took/seized Metema.
- Sudanese authorities closed Gallabat/Metema.
- Crossing reopened on 2024-10-21.
- Replay window remains 2024-06-01 through 2024-11-30.

## Section 5 controls — proposed lock candidates

These are proposed controls to complete Step 1 before Section 3 lock. If the 14-corridor registry already has exact canonical IDs, replace names below with registry IDs.

### C1 — Moyale OSBP, Ethiopia ↔ Kenya

Reason:
- Same Horn/East Africa operating environment.
- Known border crossing/OSBP.
- Useful as a same-macro-region open-control corridor.
Expected behavior:
- No full closed/disrupted transition during 2024-08-25 through 2024-10-21.
- Local risk can fluctuate, but no closed-state transition.

### C2 — Namanga OSBP, Kenya ↔ Tanzania

Reason:
- Different country pair.
- High-signal border post with public institutional coverage.
- Useful open-control corridor outside Sudan/Ethiopia conflict spillover.
Expected behavior:
- No closed-state transition during the replay window.

### C3 — Adré, Chad ↔ Sudan

Reason:
- Hard case already named in v1.0: politically pressured, famine/aid critical, but opened for humanitarian flow in August 2024 and remained materially open into the extension period.
Expected behavior:
- Elevated risk allowed.
- No full closed-state transition during the Gallabat/Metema closure window.

## Section 3.2 state mapping — safe default

Do not invent new Phantom states. Use this alias file only to map existing states to metric categories:

```yaml
ground_truth_categories:
  active:
    - ACTIVE
    - ACTIVE_CROSSING
    - NORMAL
  elevated_risk:
    - WATCH
    - STRESSED
    - DISSIPATING
    - PRESSURIZED
  disrupted:
    - DISRUPTED
    - CLOSED
    - DORMANT
    - BLOCKED
  recovery:
    - REOPENING
    - RECOVERING
```

If the engine has different state names, edit `validation/state_mapping.yaml` before locking. After lock, this file is immutable.

## Builder hard rules

1. The harness calls the frozen engine. It never reimplements score logic.
2. Every signal must have `event_date` and `pub_date`.
3. At replay date T, signal is visible only when both dates are <= T.
4. Transition logs are append-only.
5. If the engine crashes and a code fix is required, the run is void; re-freeze and re-seal.
6. Controls have equal dignity: false positives are not buried.

## Immediate next action

Fill these before seal:

```text
engine_git_hash:
soul_weight_vector_sha256:
truth_floor_thresholds_sha256:
transition_rules_version:
state_mapping_sha256:
controls_registry_ids:
locked_sections_1_6_sha256:
```
