# Node runtime and Debian Chromium work on both amd64 and arm64.
FROM node:22-bookworm-slim
ENV NODE_ENV=production \
    PYTHONUNBUFFERED=1 \
    HYPERFRAMES_BROWSER_PATH=/usr/bin/chromium \
    PRODUCER_HEADLESS_SHELL_PATH=/usr/bin/chromium \
    PRODUCER_FORCE_SCREENSHOT=true \
    HYPERFRAMES_NO_TELEMETRY=1 \
    PATH="/opt/edge-venv/bin:${PATH}"
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium ffmpeg python3 python3-venv ca-certificates \
    fonts-liberation fonts-noto-color-emoji \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements-edge.txt ./
RUN python3 -m venv /opt/edge-venv \
    && /opt/edge-venv/bin/pip install --no-cache-dir -r requirements-edge.txt
COPY package.json package-lock.json ./
# tsx and the renderer need the development toolchain at runtime.
RUN npm ci --include=dev && npm cache clean --force
COPY --chown=node:node . .
RUN mkdir -p output .cache .uploads .zerotts-venv .zerotts-models .zerotts-runtime \
    && chown -R node:node /app
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--import", "tsx", "src/server.ts"]
