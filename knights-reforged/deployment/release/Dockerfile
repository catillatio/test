# Separate one-shot verification service; never used as the game image.
FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY . .
RUN npm ci --include=dev --no-audit --no-fund && npm run build \
 && npm prune --omit=dev --no-audit --no-fund \
 && mkdir -p /bundle/deployment/release/retention \
 && cp -r node_modules dist package.json public views migrations rulesets /bundle/ \
 && cp deployment/start.mjs deployment/migrate.mjs deployment/check-upgrade.mjs deployment/environment.mjs /bundle/deployment/ \
 && cp deployment/release/worker.mjs deployment/release/transfer.mjs deployment/release/candidate.mjs deployment/release/protocol.mjs deployment/release/proof.mjs /bundle/deployment/release/ \
 && cp deployment/release/retention/observation.mjs deployment/release/retention/observations.sql deployment/release/retention/register-verified.mjs /bundle/deployment/release/retention/

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
