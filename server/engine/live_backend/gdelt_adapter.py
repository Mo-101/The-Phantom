import requests
from typing import List, Dict

GDELT_URL = "https://api.gdeltproject.org/api/v2/doc/doc"

GAZETTEER = {
    "arua": (3.02, 30.911),
    "koboko": (3.412, 30.957),
    "yumbe": (3.465, 31.247),
    "maracha": (3.287, 30.879),
    "oraba": (3.495, 30.96),
    "vurra": (2.96, 30.93),
    "logiri": (3.13, 30.86),
    "midigo": (3.52, 31.0),
    "lodonga": (3.33, 31.06),
    "nyadri": (3.29, 30.88),
    "omugo": (3.23, 31.15)
}

def fetch_gdelt_signals() -> List[dict]:
    params = {
        "query": "Uganda (refugee OR border OR Arua)",
        "mode": "artlist",
        "format": "json",
        "maxrecords": "75",
        "timespan": "3d"
    }

    signals = []
    try:
        r = requests.get(GDELT_URL, params=params, headers={"User-Agent": "phantom-poe/1.0"}, timeout=2.5)
        if r.status_code != 200:
            return []

        data = r.json()
        articles = data.get("articles", [])
        for art in articles:
            title = art.get("title", "").lower()
            url = art.get("url", "").lower()
            text_to_search = f"{title} {url}"

            # Check gazetteer
            for place, coords in GAZETTEER.items():
                if place in text_to_search:
                    signals.append({
                        "source": "GDELT",
                        "lat": coords[0],
                        "lng": coords[1],
                        "magnitude": 0.8,
                        "title": art.get("title", "")
                    })
    except Exception as e:
        print(f"[GDELT Adapter] Error: {e}")

    return signals
