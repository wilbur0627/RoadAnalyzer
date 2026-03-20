"""
RoadAnalyzer Local Server
FastAPI server that receives screenshots from the Chrome extension
and returns detected baccarat road patterns.
"""

from fastapi import FastAPI, File, UploadFile, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from typing import Optional
import json

from road_detector import analyze_image

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

    result = analyze_image(image_bytes, region_tuple)
    return JSONResponse(content=result)


if __name__ == "__main__":
    import uvicorn
    print("Starting RoadAnalyzer server on http://localhost:18920")
    uvicorn.run(app, host="127.0.0.1", port=18920)
