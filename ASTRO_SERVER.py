from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

app = FastAPI(title="Astronomy Visualization API")

# Define base directories
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static")

# Ensure static directory exists (Handle read-only filesystem on Vercel)
try:
    os.makedirs(STATIC_DIR, exist_ok=True)
except Exception:
    pass

# Mount static files (CSS, JS, assets)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

@app.get("/")
async def read_index():
    index_path = os.path.join(STATIC_DIR, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return {"message": "index.html not found in static folder."}

from app.astro_calc import get_celestial_data
import requests
from typing import Optional

@app.get("/api/status")
async def get_status():
    return {"status": "ok", "message": "Astronomy API is running."}

@app.get("/api/location")
async def get_location():
    try:
        response = requests.get("http://ip-api.com/json/")
        if response.status_code == 200:
            data = response.json()
            return {
                "latitude": data.get("lat"),
                "longitude": data.get("lon"),
                "city": data.get("city"),
                "country": data.get("country")
            }
    except Exception:
        pass
    return {"latitude": 0, "longitude": 0, "city": "Unknown", "country": "Unknown"}

class CelestialRequest(BaseModel):
    latitude: float
    longitude: float
    elevation: Optional[float] = 0.0
    time_iso: Optional[str] = None

@app.post("/api/celestial_data")
async def fetch_celestial_data(req: CelestialRequest):
    try:
        data = get_celestial_data(
            lat=req.latitude,
            lon=req.longitude,
            elevation=req.elevation,
            time_iso=req.time_iso
        )
        return {"status": "success", "data": data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    import webbrowser
    from threading import Timer
    
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", 8000))

    def open_browser():
        print(f"Opening browser at http://localhost:{port}...")
        webbrowser.open(f"http://localhost:{port}")
        
    # Open the browser after 1.5 seconds to ensure the server has time to start
    Timer(1.5, open_browser).start()
    
    uvicorn.run("ASTRO_SERVER:app", host=host, port=port, reload=True)
