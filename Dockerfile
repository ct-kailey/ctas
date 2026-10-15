FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm ci --include=dev --no-audit --no-fund
COPY vite.config.mjs ctds.config.json ./
COPY scripts/build-web.cjs ./scripts/
COPY platform/web ./platform/web
RUN npm run build
RUN npm prune --omit=dev --no-audit --no-fund

FROM node:22-bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-venv git ca-certificates fonts-nanum && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY nora/adapter/requirements.txt /tmp/requirements.txt
RUN python3 -m venv /opt/venv && /opt/venv/bin/pip install --no-cache-dir -r /tmp/requirements.txt
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
COPY platform/server ./platform/server
COPY scripts ./scripts
COPY nora/client ./nora/client
COPY nora/schemas ./nora/schemas
COPY nora/flow/manifest.json nora/flow/review-core.js ./nora/flow/
COPY nora/pipeline/manifest.json ./nora/pipeline/
COPY nora/registration/manifest.json nora/registration/request.schema.json nora/registration/suggestion.schema.json ./nora/registration/
COPY nora/channel-triage/manifest.json nora/channel-triage/request.schema.json nora/channel-triage/result.schema.json ./nora/channel-triage/
COPY nora/implementation-plan/manifest.json nora/implementation-plan/request.schema.json nora/implementation-plan/result.schema.json ./nora/implementation-plan/
COPY nora/commercial-drafting/manifest.json nora/commercial-drafting/request.schema.json nora/commercial-drafting/result.schema.json ./nora/commercial-drafting/
COPY nora/context/manifest.json nora/context/client.js nora/context/contract.js nora/context/request.schema.json nora/context/result.schema.json ./nora/context/
COPY nora/work-review/manifest.json nora/work-review/client.js nora/work-review/contract.js nora/work-review/request.schema.json nora/work-review/result.schema.json ./nora/work-review/
COPY nora/task-automation/risk-flow.js nora/task-automation/risk-flow-v2.js ./nora/task-automation/
COPY nora/adapter/extract_document.py ./nora/adapter/
RUN node -e "require('./platform/server/start.js')"
ENV NODE_ENV=production PYTHON_BIN=/opt/venv/bin/python PORT=3000
USER node
EXPOSE 3000
CMD ["node", "platform/server/start.js"]
