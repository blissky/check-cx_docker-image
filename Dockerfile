# syntax=docker/dockerfile:1
# panel and admin are BuildKit named contexts checked out at upstream commits.
FROM node:22-bookworm-slim AS node-base
RUN corepack enable && corepack prepare pnpm@10.10.0 --activate
ENV NEXT_TELEMETRY_DISABLED=1

FROM node-base AS panel-build
WORKDIR /src
COPY --from=panel /package.json /pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY --from=panel / ./
COPY patches/site-branding /opt/site-branding
RUN node /opt/site-branding/apply.mjs panel /src && pnpm build

FROM node-base AS admin-build
WORKDIR /src
COPY --from=admin /package.json /pnpm-lock.yaml /pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY --from=admin / ./
COPY patches/admin-password /opt/admin-password
COPY patches/site-branding /opt/site-branding
RUN node /opt/admin-password/apply.mjs /src \
    && node /opt/site-branding/apply.mjs admin /src \
    && pnpm lint && pnpm build

# Match the versions used by the upstream self-hosted stack.
# The PostgREST amd64 image contains a static /bin/postgrest binary.
FROM postgrest/postgrest:v14.12 AS rest
FROM supabase/gotrue:v2.189.0 AS auth

FROM postgres:17-bookworm AS runtime
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl nginx-light tini libatomic1 \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --uid 1000 --create-home app
COPY --from=node-base /usr/local/bin/node /usr/local/bin/node
COPY --from=rest /bin/postgrest /usr/local/bin/postgrest
COPY --from=auth /usr/local/bin/auth /usr/local/bin/auth
COPY --from=auth /usr/local/etc/auth/migrations /usr/local/etc/auth/migrations
COPY --from=panel-build --chown=app:app /src/.next/standalone /app/panel
COPY --from=panel-build --chown=app:app /src/.next/static /app/panel/.next/static
COPY --from=panel-build --chown=app:app /src/public /app/panel/public
COPY --from=admin-build --chown=app:app /src/.next/standalone /app/admin
COPY --from=admin-build --chown=app:app /src/.next/static /app/admin/.next/static
COPY --from=admin-build --chown=app:app /src/public /app/admin/public
COPY --from=panel /supabase /opt/check-cx/supabase
COPY --from=panel /LICENSE /usr/share/licenses/check-cx/LICENSE
COPY container /opt/check-cx
RUN chmod +x /opt/check-cx/*.sh

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PGDATA=/data/postgres \
    PGHOST=/var/run/postgresql \
    PGUSER=postgres \
    PGDATABASE=postgres
EXPOSE 3000 3001
HEALTHCHECK --interval=30s --timeout=10s --start-period=120s --retries=3 \
    CMD ["/opt/check-cx/healthcheck.sh"]
ENTRYPOINT ["/usr/bin/tini", "--", "/opt/check-cx/entrypoint.sh"]
