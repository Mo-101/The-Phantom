import time
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from surface import ProbabilitySurface
from gdelt_adapter import fetch_gdelt_signals
from gdacs_adapter import fetch_gdacs_signals
from imerg_adapter import fetch_imerg_signals
from extract_corridor import extract_geojson

app = FastAPI(title="Phantom POE Live Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health():
    return {"status": "healthy", "timestamp": time.time()}

import concurrent.futures

@app.get("/corridor")
def get_corridor():
    now = time.time()
    
    # 1. Fetch live signals from adapters in parallel
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
        future_gdelt = executor.submit(fetch_gdelt_signals)
        future_gdacs = executor.submit(fetch_gdacs_signals)
        future_imerg = executor.submit(fetch_imerg_signals)
        
        try:
            gdelt_signals = future_gdelt.result(timeout=3.0)
        except Exception as e:
            print(f"[main] GDELT fetch error or timeout: {e}")
            gdelt_signals = []
            
        try:
            gdacs_signals = future_gdacs.result(timeout=3.0)
        except Exception as e:
            print(f"[main] GDACS fetch error or timeout: {e}")
            gdacs_signals = []
            
        try:
            imerg_signals = future_imerg.result(timeout=3.0)
        except Exception as e:
            print(f"[main] IMERG fetch error or timeout: {e}")
            imerg_signals = []
    
    all_signals = gdelt_signals + gdacs_signals + imerg_signals
    
    # 2. Count active contributing sources
    sources_present = set()
    if gdelt_signals:
        sources_present.add("GDELT")
    if gdacs_signals:
        sources_present.add("GDACS")
    if imerg_signals:
        sources_present.add("IMERG")
        
    contributing_count = len(sources_present)
    
    # 3. Fuse into the surface
    surface = ProbabilitySurface()
    surface.fuse(all_signals)
    
    # 4. Extract and return GeoJSON
    meta = {
        "now_time": now,
        "contributing_sources": contributing_count
    }
    
    geojson = extract_geojson(surface, meta)
    return geojson

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8085)
