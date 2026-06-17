import requests
from typing import List

IMERG_URL = "https://flood.ssec.wisc.edu/json/events.json"

def fetch_imerg_signals() -> List[dict]:
    signals = []
    try:
        r = requests.get(IMERG_URL, timeout=2.5)
        if r.status_code != 200:
            return []

        data = r.json()
        events = data.get("events", [])
        for e in events:
            country = str(e.get("country", "")).upper()
            if country in ["UG", "SS", "CD"]:
                try:
                    lat = float(e.get("latitude", 0))
                    lng = float(e.get("longitude", 0))
                    severity = float(e.get("severity", 0))
                except (ValueError, TypeError):
                    continue

                signals.append({
                    "source": "IMERG",
                    "lat": lat,
                    "lng": lng,
                    "magnitude": min(1.0, max(0.0, severity / 4.0)),
                    "title": f"IMERG flood: {e.get('name', e.get('id', ''))}"
                })
                if len(signals) >= 20:
                    break
    except Exception as e:
        print(f"[IMERG Adapter] Error: {e}")

    return signals
