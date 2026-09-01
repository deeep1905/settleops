"""Vercel serverless entry — exposes the FastAPI app as `app`.

The engine package lives at the repo root, so we add the parent of this
file to sys.path. Cold start ~1-2s on the hobby tier; the console shows
"starting the engine…" meanwhile. There is no spin-down on this platform:
static assets are always-on and functions wake per request.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from settleops.api import app  # noqa: E402,F401
