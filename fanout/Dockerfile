# syntax=docker/dockerfile:1.7
# One image recipe for every service; `target` picks api, worker or web.
# Packages ship as TypeScript and run through Node's native type stripping, so there is no compile step.
# Behind a TLS-intercepting proxy, add: --secret id=extra_ca_certificates,src=proxy-ca.pem

ARG NODE_IMAGE=node:24-alpine
ARG FFMPEG_IMAGE=mwader/static-ffmpeg:8.0

FROM ${FFMPEG_IMAGE} AS ffmpeg

FROM ${NODE_IMAGE} AS pnpm-base
ENV CI=true
COPY infra/with-extra-ca.sh /usr/local/bin/with-extra-ca
RUN --mount=type=secret,id=extra_ca_certificates,required=false with-extra-ca npm install --global pnpm@10.28.0
WORKDIR /app

# Downloads every locked package once into the shared store cache; later stages install offline from it.
FROM pnpm-base AS package-store
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    --mount=type=secret,id=extra_ca_certificates,required=false \
    with-extra-ca pnpm fetch && touch /tmp/package-store-ready

FROM pnpm-base AS production-dependencies
COPY --from=package-store /tmp/package-store-ready /tmp/
COPY . .
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --offline --frozen-lockfile --prod --filter "@fanout/api..." --filter "@fanout/worker..." --filter "!@fanout/testing"

FROM pnpm-base AS web-build
COPY --from=package-store /tmp/package-store-ready /tmp/
COPY . .
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --offline --frozen-lockfile --filter "@fanout/web..."
RUN pnpm --filter @fanout/web build

FROM ${NODE_IMAGE} AS node-runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=production-dependencies --chown=node:node /app /app
USER node

FROM node-runtime AS api
EXPOSE 3000
CMD ["node", "apps/api/src/main.ts"]

FROM node-runtime AS worker
# Static, pinned ffmpeg/ffprobe: reproducible and independent of the distribution's package mirror.
COPY --from=ffmpeg /ffmpeg /ffprobe /usr/local/bin/
ENV MEDIA_WORK_DIRECTORY=/tmp/fanout-media
CMD ["node", "apps/worker/src/main.ts"]

FROM caddy:2-alpine AS web
COPY --from=web-build /app/apps/web/dist /srv
COPY infra/Caddyfile /etc/caddy/Caddyfile
