from datetime import date

from validation.replay_clock import signal_visible_on, visible_signals


def test_signal_requires_event_and_publication_date_before_replay_date():
    s = {"event_date": "2024-09-01", "pub_date": "2024-09-06"}
    assert not signal_visible_on(s, "2024-09-01")
    assert not signal_visible_on(s, "2024-09-05")
    assert signal_visible_on(s, "2024-09-06")


def test_visible_signals_filters_future_publication():
    signals = [
        {"signal_id": "a", "event_date": "2024-09-01", "pub_date": "2024-09-01"},
        {"signal_id": "b", "event_date": "2024-09-01", "pub_date": "2024-09-06"},
    ]
    visible = visible_signals(signals, date(2024, 9, 3))
    assert [s["signal_id"] for s in visible] == ["a"]
