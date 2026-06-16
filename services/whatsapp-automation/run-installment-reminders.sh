#!/usr/bin/env sh
set -eu

ENV_FILE="/opt/whatsapp-automation/deploy/automation.env"

if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
fi

if [ -z "${APP_BASE_URL:-}" ] || [ -z "${WHATSAPP_INTERNAL_SECRET:-}" ]; then
  echo "APP_BASE_URL or WHATSAPP_INTERNAL_SECRET is missing"
  exit 1
fi

curl -fsS \
  -H "authorization: Bearer ${WHATSAPP_INTERNAL_SECRET}" \
  "${APP_BASE_URL%/}/api/whatsapp/installment-reminders"
