# syntax=docker/dockerfile:1
# Prepared deployment image. Not built or deployed in the restricted workspace.
FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
# Ordinary hosts use their system CA. Managed builds can provide proxy_ca using
# --secret id=proxy_ca,src=/path/to/the/approved/ca.pem without persisting it.
RUN --mount=type=secret,id=proxy_ca,required=false \
    if [ -s /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi; \
    if [ -f package-lock.json ]; then npm ci --no-audit --no-fund; else npm install --no-audit --no-fund; fi
COPY . .
RUN npm run typecheck && npm test && npm run build
RUN npm prune --omit=dev --no-audit --no-fund

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/views ./views
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/rulesets ./rulesets
COPY --from=build --chown=node:node /app/migrations ./migrations
COPY --from=build --chown=node:node /app/deployment ./deployment
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/healthz',{signal:AbortSignal.timeout(3000)}).then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "deployment/start.mjs"]
