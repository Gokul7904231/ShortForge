FROM python:3.11-slim

# Install system dependencies: FFmpeg and ffprobe for rendering
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    procps \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY agent.py .
COPY scripts/ ./scripts/

# Create non-root worker user for secure isolated execution
RUN useradd -m -u 1000 worker && \
    mkdir -p /tmp/instabox_workspace && \
    chown -R worker:worker /app /tmp/instabox_workspace

USER worker

ENV PYTHONUNBUFFERED=1 \
    WORKSPACE_BASE=/tmp/instabox_workspace

ENTRYPOINT ["python", "agent.py"]
