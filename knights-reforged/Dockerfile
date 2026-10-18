# Portable Docker build: no Railpack plan, secret mounts or cache mounts.
# Build needs npm access, but never a database URL or application secrets.
FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --include=dev --no-audit --no-fund
COPY tsconfig.json ./
COPY src ./src
RUN npm run build
RUN npm prune --omit=dev --no-audit --no-fund

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8080
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --chown=node:node views ./views
COPY --chown=node:node public ./public
COPY --chown=node:node rulesets ./rulesets
COPY --chown=node:node migrations ./migrations
COPY --chown=node:node deployment/start.mjs deployment/migrate.mjs deployment/environment.mjs deployment/status.mjs deployment/grant-gray.mjs deployment/check-upgrade.mjs deployment/moderate.mjs deployment/audit-bots.mjs ./deployment/
COPY --chown=node:node deployment/release/candidate.mjs deployment/release/protocol.mjs deployment/release/proof.mjs ./deployment/release/
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/healthz',{signal:AbortSignal.timeout(3000)}).then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "deployment/start.mjs"]
