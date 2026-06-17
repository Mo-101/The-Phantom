# Pre-Lock Checklist

Complete before Section 3 seal.

## Event ground truth
- [ ] Gallabat/Metema closure date recorded.
- [ ] Reopening date recorded.
- [ ] All ground-truth citations captured in case-study bibliography.

## Controls
- [ ] C1 registry ID confirmed.
- [ ] C2 registry ID confirmed.
- [ ] C3 Adré registry ID confirmed.
- [ ] Expected behavior for each control locked.

## Engine freeze
- [ ] Git commit hash recorded.
- [ ] Signed tag created: `validation/gallabat-metema-v1`.
- [ ] Soul-weight vector exported and hashed.
- [ ] Truth-floor thresholds exported and hashed.
- [ ] Transition rule version recorded.
- [ ] State mapping YAML finalized and hashed.

## Data firewall
- [ ] Signal manifest schema approved.
- [ ] ACLED publication lag model specified.
- [ ] Every source has event_date and pub_date.
- [ ] No source outside declared set.

## Run doctrine
- [ ] One-run rule accepted.
- [ ] Rerun reason policy accepted.
- [ ] Transition log append-only storage path created.
