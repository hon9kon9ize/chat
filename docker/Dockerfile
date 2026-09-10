# ── Stage 1: build frontend ────────────────────────────────────────────────
FROM node:20-slim AS frontend-build

WORKDIR /build
COPY frontend/package.json ./
RUN npm install --frozen-lockfile 2>/dev/null || npm install

COPY frontend/ ./
RUN npm run build

# ── Stage 2: runtime ───────────────────────────────────────────────────────
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /app

# Install Python deps
COPY pyproject.toml ./
RUN pip install --no-cache-dir \
      "fastapi>=0.110.0" \
      "uvicorn[standard]>=0.29.0" \
      "pydantic>=2.0.0" \
      "pydantic-settings>=2.0.0" \
      "strands-agents>=1.55.0" \
      "strands-agents-tools>=0.8.0"

# Copy backend source
COPY backend/ ./backend/

# Copy agents definitions
COPY agents/ ./agents/

# Copy built frontend assets from stage 1
COPY --from=frontend-build /build/index.html ./frontend/index.html
COPY --from=frontend-build /build/dist/ ./frontend/dist/

EXPOSE 8000

CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
