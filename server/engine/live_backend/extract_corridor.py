from typing import List, Dict
from surface import ProbabilitySurface

ARUA = [30.911, 3.02]
KOBOKO = [30.957, 3.412]

def extract_geojson(surface: ProbabilitySurface, meta: dict) -> dict:
    # Get all cells with posterior > 0.15, sorted by latitude center
    lit_cells = [cell for cell in surface.cells if cell.posterior > 0.15]
    lit_cells.sort(key=lambda c: c.lat_center)

    informal_coords = [[cell.lng_center, cell.lat_center] for cell in lit_cells]

    features = [
        {
            "type": "Feature",
            "properties": {
                "kind": "formal",
                "isRisk": False,
                "label": "Arua-Koboko (official)",
                "status": "gazetted",
                "distance_km": 52,
                "coverage_pct": 82
            },
            "geometry": {
                "type": "LineString",
                "coordinates": [ARUA, KOBOKO]
            }
        }
    ]

    if len(informal_coords) >= 2:
        avg_posterior = sum(c.posterior for c in lit_cells) / len(lit_cells)
        # Find freshest evidence in minutes
        now = meta.get("now_time", 0.0)
        freshest_age_min = 0.0
        active_ages = [now - c.last_evidence_at for c in lit_cells if c.last_evidence_at is not None]
        if active_ages:
            freshest_age_min = min(active_ages) / 60.0

        features.append({
            "type": "Feature",
            "properties": {
                "kind": "informal",
                "isRisk": True,
                "label": "Phantom corridor (runtime inferred)",
                "status": "RUNTIME_INFERRED",
                "field_validation": "PENDING",
                "posterior": round(avg_posterior, 3),
                "freshest_evidence_min": round(freshest_age_min, 1),
                "synthetic": False,
                "risk_class": "HIGH" if avg_posterior > 0.4 else "MEDIUM",
                "score": round(avg_posterior, 3),
                "distance_km": 52
            },
            "geometry": {
                "type": "LineString",
                "coordinates": informal_coords
            }
        })

    return {
        "type": "FeatureCollection",
        "features": features,
        "cells": [
            {
                "cellId": cell.cell_id,
                "latCenter": round(cell.lat_center, 4),
                "lngCenter": round(cell.lng_center, 4),
                "posterior": round(cell.posterior, 4),
                "qBaseline": round(cell.q_baseline, 4),
                "contributingSources": list(cell.contributing_sources),
                "evidenceCount": cell.evidence_count,
                "lastEvidenceAt": int(cell.last_evidence_at * 1000) if cell.last_evidence_at else None
            }
            for cell in surface.cells
        ],
        "meta": {
            "generated_at": int(meta.get("now_time", 0.0) * 1000),
            "classification": "PROVISIONAL OSINT INFERENCE",
            "field_validation": "PENDING",
            "synthetic_input": False,
            "contributing_sources": meta.get("contributing_sources", 0),
            "total_sources": 3,
            "geometry_status": "RUNTIME_INFERRED" if len(informal_coords) >= 2 else "NO_RUNTIME_RIDGE"
        }
    }
