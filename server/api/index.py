"""
Vercel Serverless entry point.
Re-exports the FastAPI app from main.py so Vercel can discover it.
"""
import sys
import os

# Ensure the parent directory (server/) is on the path so we can import main & road_detector
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from main import app  # noqa: E402, F401
