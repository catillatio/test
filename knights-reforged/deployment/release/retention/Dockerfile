# Credential-free payload for a separately approved isolated private executor.
# This is NOT a GitHub runner installer and provisions no Railway service.
FROM node:24-bookworm-slim
WORKDIR /app
COPY --chown=node:node package.json package-lock.json ./
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi; \
    npm ci --ignore-scripts --omit=dev --no-audit --no-fund
COPY --chown=node:node deployment/release/protocol.mjs ./deployment/release/protocol.mjs
COPY --chown=node:node deployment/release/retention/protocol.mjs deployment/release/retention/retention.mjs deployment/release/retention/verification.mjs deployment/release/retention/journal.mjs deployment/release/retention/guards.mjs deployment/release/retention/reconcile.mjs deployment/release/retention/cli.mjs deployment/release/retention/job.mjs deployment/release/retention/spool.mjs deployment/release/retention/bootstrap.sql ./deployment/release/retention/
COPY --chown=node:node deployment/release/retention/observation.mjs ./deployment/release/retention/observation.mjs
COPY --chown=node:node rulesets/level100-rivals-1/rules.json ./rulesets/level100-rivals-1/rules.json
ENV NODE_ENV=production KINGDOM_RETENTION_ENABLED=0
USER node
ENTRYPOINT ["node", "deployment/release/retention/job.mjs"]
