#!/usr/bin/env bash
# Helper for Hostinger cron — set CRON_URL and CRON_SECRET in the panel environment
set -euo pipefail
curl -sS -X POST -H "x-cron-secret: ${CRON_SECRET}" "${APP_URL}/internal/cron/knowledge"
