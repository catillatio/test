# Separate one-shot verification service; never used as the game image.
FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --include=dev --no-audit --no-fund
COPY tsconfig.json ./
COPY src ./src
RUN npm run build
RUN npm prune --omit=dev --no-audit --no-fund
COPY public ./public
COPY views ./views
COPY migrations ./migrations
COPY rulesets ./rulesets
COPY deployment ./deployment
RUN mkdir -p /bundle/deployment/release \
 && cp -r node_modules dist package.json public views migrations rulesets /bundle/ \
 && cp deployment/start.mjs deployment/migrate.mjs deployment/check-upgrade.mjs deployment/environment.mjs /bundle/deployment/ \
 && cp deployment/release/worker.mjs deployment/release/transfer.mjs deployment/release/candidate.mjs deployment/release/protocol.mjs deployment/release/proof.mjs /bundle/deployment/release/

FROM postgres:18-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends age ca-certificates libatomic1 \
 && rm -rf /var/lib/apt/lists/*
COPY --from=build /usr/local/bin/node /usr/local/bin/node
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build --chown=postgres:postgres /bundle/ ./
USER postgres
# Override the database image entrypoint. This image cannot initialize or start
# PostgreSQL, serve HTTP, expose a provisioning route or run a recurring task.
ENTRYPOINT []
CMD ["node", "deployment/release/worker.mjs"]
