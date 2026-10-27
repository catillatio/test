# Restricted permit issuer/private reviewer only; no runtime, signer or adopter.
FROM node:24-bookworm-slim
WORKDIR /app
COPY --chown=node:node package.json package-lock.json ./
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi; \
    npm ci --ignore-scripts --omit=dev --no-audit --no-fund
COPY --chown=node:node deployment/release/protocol.mjs ./deployment/release/protocol.mjs
COPY --chown=node:node deployment/release/retention/protocol.mjs deployment/release/retention/retention.mjs deployment/release/retention/verification.mjs deployment/release/retention/journal.mjs deployment/release/retention/guards.mjs deployment/release/retention/permit.mjs deployment/release/retention/ready.mjs deployment/release/retention/bootstrap.sql deployment/release/retention/observation.mjs ./deployment/release/retention/
COPY --chown=node:node deployment/release/retention/delivery/worker.mjs deployment/release/retention/delivery/approval.mjs deployment/release/retention/delivery/protocol.mjs deployment/release/retention/delivery/io.mjs deployment/release/retention/delivery/image.mjs deployment/release/retention/delivery/volume.mjs deployment/release/retention/delivery/bundle.mjs deployment/release/retention/delivery/build-image.mjs deployment/release/retention/delivery/prepare.mjs ./deployment/release/retention/delivery/
COPY --chown=node:node rulesets/level100-rivals-1/rules.json ./rulesets/level100-rivals-1/rules.json
RUN node deployment/release/retention/delivery/build-image.mjs authorizer
ENV NODE_ENV=production KINGDOM_RETENTION_ENABLED=0
USER node
ENTRYPOINT ["node", "deployment/release/retention/delivery/worker.mjs"]
