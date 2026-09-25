FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PYTHONPATH=/app/services/pipeline \
    FLOOR01_MEMORY_FILE_PATH=/app/services/pipeline/floor01_strategy/data/memory.json

WORKDIR /app

COPY services/pipeline/floor01_strategy/pyproject.toml /app/services/pipeline/floor01_strategy/pyproject.toml
COPY services/pipeline/floor01_strategy /app/services/pipeline/floor01_strategy

RUN python -m pip install --upgrade pip \
    && python -m pip install /app/services/pipeline/floor01_strategy \
    && useradd --create-home --uid 10001 --shell /usr/sbin/nologin floor01 \
    && mkdir -p /app/services/pipeline/floor01_strategy/data \
    && chown -R floor01:floor01 /app/services/pipeline/floor01_strategy

USER floor01

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=3).read()"

CMD ["uvicorn", "floor01_strategy.main:app", "--host", "0.0.0.0", "--port", "8000", "--no-server-header"]
