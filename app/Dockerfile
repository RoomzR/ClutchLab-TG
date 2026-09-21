FROM node:22-bookworm-slim AS node_base

FROM python:3.12-slim-bookworm

# Bring Node.js runtime for cs2parser worker
COPY --from=node_base /usr/local/bin/node /usr/local/bin/node
COPY --from=node_base /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -sf /usr/local/lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
    && ln -sf /usr/local/lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY cs2parser-worker/package.json cs2parser-worker/package-lock.json ./cs2parser-worker/
WORKDIR /app/cs2parser-worker
RUN npm ci --omit=dev

WORKDIR /app
COPY . .
RUN mkdir -p uploads

EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--limit-max-requests", "1000", "--limit-concurrency", "50"]
