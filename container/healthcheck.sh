#!/usr/bin/env bash
set -euo pipefail
gosu postgres pg_isready -q
curl -fsS --max-time 2 http://127.0.0.1:3003/ready >/dev/null
curl -fsS --max-time 2 http://127.0.0.1:8000/auth/v1/health >/dev/null
curl -fsS --max-time 2 http://127.0.0.1:3000/api/v1/status >/dev/null
curl -fsS --max-time 2 http://127.0.0.1:3001/login >/dev/null
