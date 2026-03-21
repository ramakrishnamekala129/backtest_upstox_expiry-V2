FROM node:20-bookworm AS frontend-builder
WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build


FROM python:3.12-slim AS runtime
WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PORT=10000

RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY web_app.py ./
COPY upstox_tools ./upstox_tools
COPY docs ./docs
COPY .env.example ./
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

EXPOSE 10000

CMD ["sh", "-c", "uvicorn web_app:app --host 0.0.0.0 --port ${PORT}"]
