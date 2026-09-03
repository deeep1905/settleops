# SettleOps — one image, any host (Render, Koyeb, Fly, HF Spaces, Cloud Run).
#
# Stage 1 builds the console (vite + tsc), stage 2 is the engine with the
# built console mounted at "/" — one process serves both, the same way
# api/index.py does on Vercel. No data files needed at runtime: the batch
# is generated deterministically on boot (seed 42).

# --- stage 1: the console ---
FROM node:20-alpine AS console
WORKDIR /build
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ .
RUN npm run build

# --- stage 2: the engine + console, one process ---
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY settleops/ settleops/
COPY api/ api/
COPY --from=console /build/dist web/dist

# PORT is injected by Render/Koyeb/Cloud Run; 8000 matches local `make run`
ENV PORT=8000
EXPOSE 8000
CMD ["sh", "-c", "uvicorn api.index:app --host 0.0.0.0 --port ${PORT:-8000}"]
