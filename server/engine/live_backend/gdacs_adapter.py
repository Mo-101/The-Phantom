import requests
import re
from typing import List

GDACS_URL = "https://www.gdacs.org/xml/rss.xml"

def fetch_gdacs_signals() -> List[dict]:
    signals = []
    try:
        r = requests.get(GDACS_URL, timeout=2.5)
        if r.status_code != 200:
            return []

        text = r.text
        # Parse XML items
        items = re.findall(r"<item>([\s\S]*?)<\/item>", text)
        for block in items:
            title_match = re.search(r"<title>([\s\S]*?)<\/title>", block)
            title = re.sub(r"<[^>]+>", "", title_match.group(1)).strip() if title_match else "GDACS event"

            point_match = re.search(r"<georss:point>([\s\S]*?)<\/georss:point>", block)
            lat, lng = None, None
            if point_match:
                parts = point_match.group(1).strip().split()
                if len(parts) == 2:
                    try:
                        lat = float(parts[0])
                        lng = float(parts[1])
                    except ValueError:
                        pass

            alert_match = re.search(r"<gdacs:alertscore>([\s\S]*?)<\/gdacs:alertscore>", block)
            alert_score = 0.0
            if alert_match:
                try:
                    alert_score = float(alert_match.group(1))
                except ValueError:
                    pass

            signals.append({
                "source": "GDACS",
                "lat": lat,
                "lng": lng,
                "magnitude": min(1.0, max(0.0, alert_score / 100.0)),
                "title": title
            })
            if len(signals) >= 25:
                break
    except Exception as e:
        print(f"[GDACS Adapter] Error: {e}")

    return signals
