"""
RoadAnalyzer Server
FastAPI server that receives screenshots from the Chrome extension
and returns detected baccarat road patterns.

Supports both local development and cloud deployment.
Set environment variable ROAD_ANALYZER_ENV=production for cloud mode.
"""

from fastapi import FastAPI, File, UploadFile, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from typing import Optional
import json
import os

from road_detector import analyze_image

IS_PRODUCTION = os.environ.get("ROAD_ANALYZER_ENV") == "production"

app = FastAPI(title="RoadAnalyzer Server", version="1.0.0")

# Allow Chrome extension to call this server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "RoadAnalyzer"}


@app.post("/analyze")
async def analyze(
    image: UploadFile = File(...),
    region: Optional[str] = Form(None),
):
    """
    Analyze a screenshot for baccarat road patterns.

    - image: Screenshot file (PNG/JPEG)
    - region: Optional JSON string like '{"x":100,"y":600,"w":800,"h":200}'
    """
    image_bytes = await image.read()

    # Parse region if provided
    region_tuple = None
    if region:
        try:
            r = json.loads(region)
            region_tuple = (int(r["x"]), int(r["y"]), int(r["w"]), int(r["h"]))
        except (json.JSONDecodeError, KeyError, TypeError):
            pass

    # Save debug files only in local development
    if not IS_PRODUCTION:
        debug_dir = os.path.join(os.path.dirname(__file__), "debug")
        os.makedirs(debug_dir, exist_ok=True)
        with open(os.path.join(debug_dir, "latest.png"), "wb") as f:
            f.write(image_bytes)
        with open(os.path.join(debug_dir, "region.json"), "w") as f:
            json.dump({"region": list(region_tuple) if region_tuple else None}, f)

    result = analyze_image(image_bytes, region_tuple)
    print(f"[analyze] {len(result.get('sequence', []))} items detected")
    return JSONResponse(content=result)


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 18920))
    host = "0.0.0.0" if IS_PRODUCTION else "127.0.0.1"
    print(f"Starting RoadAnalyzer server on http://{host}:{port}")
    uvicorn.run(app, host=host, port=port)
