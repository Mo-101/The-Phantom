from validation.metrics import Transition, detection_pass, persistence_ratio, control_false_positive_count

MAPPING = {
    "ground_truth_categories": {
        "active": ["ACTIVE"],
        "elevated_risk": ["WATCH"],
        "disrupted": ["DISRUPTED", "CLOSED"],
        "recovery": ["RECOVERING"],
    }
}


def test_detection_window_passes_on_disrupted_transition_inside_window():
    transitions = [
        Transition.from_record({
            "corridor_id": "gallabat_metema_sd_et",
            "date": "2024-09-02",
            "from_state": "WATCH",
            "to_state": "DISRUPTED",
            "trigger_signals": ["s1"],
        })
    ]
    ok, hit = detection_pass(
        transitions,
        "gallabat_metema_sd_et",
        MAPPING,
        "2024-08-25",
        "2024-09-08",
    )
    assert ok
    assert hit.to_state == "DISRUPTED"


def test_persistence_ratio():
    daily = [
        {"corridor_id": "g", "date": "2024-09-01", "state": "DISRUPTED"},
        {"corridor_id": "g", "date": "2024-09-02", "state": "DISRUPTED"},
        {"corridor_id": "g", "date": "2024-09-03", "state": "ACTIVE"},
    ]
    assert persistence_ratio(daily, "g", MAPPING, "2024-09-01", "2024-09-03") == 2 / 3


def test_control_false_positive_count():
    transitions = [
        Transition.from_record({
            "corridor_id": "c1",
            "date": "2024-09-02",
            "from_state": "ACTIVE",
            "to_state": "DISRUPTED",
            "trigger_signals": [],
        })
    ]
    assert control_false_positive_count(transitions, ["c1", "c2"], MAPPING) == 1
