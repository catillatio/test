# Dedicated private operator image. Never the game or release-verifier image.
ARG NODE_IMAGE=node:24-bookworm-slim
FROM ${NODE_IMAGE} AS build
WORKDIR /app/source
COPY . .
RUN npm ci --include=dev --no-audit --no-fund && npm run build && npm prune --omit=dev --no-audit --no-fund

FROM ${NODE_IMAGE}
RUN apt-get update && apt-get install -y --no-install-recommends age ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build --chown=node:node /app/source/node_modules ./node_modules
COPY --from=build --chown=node:node /app/source/dist ./dist
COPY --from=build --chown=node:node /app/source/rulesets ./rulesets
COPY --from=build --chown=node:node /app/source/deployment/operator ./deployment/operator
COPY --from=build --chown=node:node /app/source/src ./source/src
COPY --from=build --chown=node:node /app/source/rulesets ./source/rulesets
COPY --from=build --chown=node:node /app/source/deployment/operator ./source/deployment/operator
COPY --from=build --chown=node:node /app/source/package.json /app/source/package-lock.json /app/source/tsconfig.json /app/source/Dockerfile /app/source/operator-build.json ./source/
USER node
# No listener, exposed port, migrations, database binaries or initialization.
CMD ["node", "deployment/operator/worker.mjs"]
