"""Vercel serverless entry — exposes the FastAPI app as `app`.

The engine package lives at the repo root, so we add the parent of this
file to sys.path. Cold start ~1-2s on the hobby tier; the console shows
"starting the engine…" meanwhile. There is no spin-down on this platform:
static assets are always-on and functions wake per request.

The console itself is served from here too. The project's build command
(`cd web && npm install && npm run build`) produces web/dist, and
mounting it with StaticFiles lets Vercel promote the files to the CDN
at build time — the API routes register first, so they always win; the
mount only ever answers paths no route claimed. In local dev the dist
folder is usually absent and the mount simply never happens.

One thing this file must never do: rewrite request paths. The previous
vercel.json sent /api/* through a rewrite to /api, which is the path the
app then saw — every route 404'd while /docs kept working. The app is
the site's root handler and needs the original URL, untouched.
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from settleops.api import app  # noqa: E402,F401

_DIST = ROOT / "web" / "dist"
if _DIST.is_dir():
    from fastapi.staticfiles import StaticFiles  # noqa: E402

    app.mount("/", StaticFiles(directory=str(_DIST), html=True), name="console")
