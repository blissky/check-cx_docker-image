#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

if (($#)); then
  exec "$@"
fi

mkdir -p /data /run/check-cx
# Bind mounts and mktemp directories may start at 0700; Postgres needs traversal.
chmod 711 /data
chown app:app /run/check-cx
chmod 755 /run/check-cx
node /opt/check-cx/configure.mjs
# shellcheck disable=SC1091
source /run/check-cx/environment

install -d -m 700 -o postgres -g postgres "$PGDATA"
install -d -m 775 -o postgres -g postgres /var/run/postgresql
if [[ -f "$PGDATA/PG_VERSION" ]]; then
  if [[ "$(cat "$PGDATA/PG_VERSION")" != '17' ]]; then
    echo 'This image requires PostgreSQL 17 data. Use a logical backup/restore for major upgrades.' >&2
    exit 1
  fi
else
  gosu postgres initdb --auth-local=peer --auth-host=scram-sha-256 --encoding=UTF8
fi

children=()
postgres_pid=''
# Invoked indirectly by the EXIT trap.
# shellcheck disable=SC2329
cleanup() {
  trap - EXIT
  # Keep Postgres running until application processes have stopped.
  for pid in "${children[@]}"; do kill -TERM "$pid" 2>/dev/null || true; done
  for pid in "${children[@]}"; do wait "$pid" 2>/dev/null || true; done
  if [[ -n "$postgres_pid" ]]; then
    gosu postgres pg_ctl -D "$PGDATA" -m fast -w -t 30 stop || true
    wait "$postgres_pid" 2>/dev/null || true
  fi
}
trap 'cleanup' EXIT
trap 'exit 0' TERM INT

gosu postgres postgres -D "$PGDATA" -c listen_addresses=127.0.0.1 -c unix_socket_directories=/var/run/postgresql &
postgres_pid=$!
ready=false
for ((attempt=0; attempt<60; attempt++)); do
  kill -0 "$postgres_pid"
  if gosu postgres pg_isready -q; then ready=true; break; fi
  sleep 1
done
if [[ "$ready" != true ]]; then echo 'PostgreSQL readiness timed out.' >&2; exit 1; fi
node /opt/check-cx/migrate.mjs

gosu app postgrest &
children+=("$!")
gosu app auth &
children+=("$!")
gosu app nginx -c /opt/check-cx/nginx.conf -g 'daemon off;' &
children+=("$!")

ready=false
for ((attempt=0; attempt<120; attempt++)); do
  for pid in "$postgres_pid" "${children[@]}"; do kill -0 "$pid"; done
  if curl -fsS --max-time 2 http://127.0.0.1:3003/ready >/dev/null 2>&1 \
    && curl -fsS --max-time 2 http://127.0.0.1:8000/auth/v1/health >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 1
done
if [[ "$ready" != true ]]; then echo 'REST/Auth readiness timed out.' >&2; exit 1; fi
node /opt/check-cx/init-admin.mjs
unset ADMIN_PASSWORD

gosu app env HOSTNAME=0.0.0.0 PORT=3000 node /app/panel/server.js &
children+=("$!")
gosu app env HOSTNAME=0.0.0.0 PORT=3001 node /app/admin/server.js &
children+=("$!")

echo '[check-cx] Started panel :3000 and admin :3001; database/API/Auth are internal.'
# Any essential process exiting stops the container, allowing Docker's restart policy to recover it.
status=0
wait -n "$postgres_pid" "${children[@]}" || status=$?
echo '[check-cx] An essential process exited; stopping container.' >&2
if ((status == 0)); then status=1; fi
exit "$status"
