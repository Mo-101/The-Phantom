import math
import time
from typing import Dict, List, Set, Optional

# Grid parameters
LAT_MIN, LAT_MAX = 3.00, 3.50
LNG_MIN, LNG_MAX = 30.85, 31.05
ROWS, COLS = 7, 4

# Baselines q_m
Q_M = {
    "GDELT": 0.08,
    "GDACS": 0.05,
    "IMERG": 0.06
}

# Time constants tau_m in seconds
TAU_M = {
    "GDELT": 45 * 60,
    "GDACS": 18 * 60,
    "IMERG": 2 * 3600
}

# Weights w_m
W_M = {
    "GDELT": 0.25,
    "GDACS": 0.40,
    "IMERG": 0.30
}

INFLUENCE_RADIUS_DEG = 0.36

class GridCell:
    def __init__(self, row: int, col: int, lat_min: float, lat_max: float, lng_min: float, lng_max: float):
        self.cell_id = f"{col}:{row}"
        self.row = row
        self.col = col
        self.lat_min = lat_min
        self.lat_max = lat_max
        self.lng_min = lng_min
        self.lng_max = lng_max
        self.lat_center = lat_min + (lat_max - lat_min) / 2
        self.lng_center = lng_min + (lng_max - lng_min) / 2
        self.posterior = 0.10
        self.q_baseline = 0.10
        self.last_evidence_at: Optional[float] = None
        self.evidence_count = 0
        self.contributing_sources: Set[str] = set()

class ProbabilitySurface:
    def __init__(self):
        self.cells: List[GridCell] = []
        lat_step = (LAT_MAX - LAT_MIN) / ROWS
        lng_step = (LNG_MAX - LNG_MIN) / COLS

        for r in range(ROWS):
            for c in range(COLS):
                cell = GridCell(
                    row=r,
                    col=c,
                    lat_min=LAT_MIN + r * lat_step,
                    lat_max=LAT_MIN + (r + 1) * lat_step,
                    lng_min=LNG_MIN + c * lng_step,
                    lng_max=LNG_MIN + (c + 1) * lng_step
                )
                self.cells.append(cell)

    def fuse(self, signals: List[dict]) -> None:
        now = time.time()

        for sig in signals:
            source = sig.get("source")
            if source not in Q_M:
                continue

            lat = sig.get("lat")
            lng = sig.get("lng")
            magnitude = sig.get("magnitude", 1.0)

            # 1. Decay step
            self.decay_all(now)

            # 2. Spatial update
            if lat is not None and lng is not None:
                for cell in self.cells:
                    # Euclidean distance in degrees
                    dist = math.sqrt((cell.lat_center - lat) ** 2 + (cell.lng_center - lng) ** 2)
                    if dist <= INFLUENCE_RADIUS_DEG:
                        # Gaussian influence decay
                        influence = magnitude * math.exp(-0.5 * (dist / (INFLUENCE_RADIUS_DEG / 3)) ** 2)
                        w = W_M[source]
                        # Bayesian nudge: p' = p + (1 - p) * influence * w_m
                        cell.posterior = cell.posterior + (1.0 - cell.posterior) * influence * w
                        cell.posterior = max(0.0, min(1.0, cell.posterior))
                        cell.last_evidence_at = now
                        cell.evidence_count += 1
                        cell.contributing_sources.add(source)

            # 3. Baseline updates
            q = Q_M[source]
            w = W_M[source]
            for cell in self.cells:
                cell.q_baseline = cell.q_baseline * (1 - 0.05 * w) + q * 0.05 * w

    def decay_all(self, now: float) -> None:
        for cell in self.cells:
            if cell.last_evidence_at is None:
                continue

            age_s = now - cell.last_evidence_at
            # Shortest tau among contributing sources as decay constant
            min_tau = 12 * 3600
            for src in cell.contributing_sources:
                tau = TAU_M.get(src, 12 * 3600)
                if tau < min_tau:
                    min_tau = tau

            decay_factor = math.exp(-age_s / min_tau)
            # p_decayed = q + (p - q) * exp(-dt / tau)
            cell.posterior = cell.q_baseline + (cell.posterior - cell.q_baseline) * decay_factor
            if cell.posterior < cell.q_baseline:
                cell.posterior = cell.q_baseline
