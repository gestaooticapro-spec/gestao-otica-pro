#!/usr/bin/env bash
set -euo pipefail

deploy_dir="${1:-/opt/whatsapp-automation/deploy}"
cd "$deploy_dir"

db_password="$(openssl rand -hex 24)"
evolution_api_key="$(openssl rand -hex 32)"
webhook_secret="$(openssl rand -hex 32)"
internal_secret="$(openssl rand -hex 32)"

cat > evolution.env <<EOF
SERVER_NAME=evolution
SERVER_TYPE=http
SERVER_PORT=8080
SERVER_URL=http://127.0.0.1:8080
POSTGRES_DATABASE=evolution
POSTGRES_USERNAME=evolution
POSTGRES_PASSWORD=$db_password
DATABASE_ENABLED=true
DATABASE_PROVIDER=postgresql
DATABASE_CONNECTION_URI=postgresql://evolution:$db_password@postgres:5432/evolution?schema=public
DATABASE_CONNECTION_CLIENT_NAME=gestao_otica
DATABASE_SAVE_DATA_INSTANCE=true
DATABASE_SAVE_DATA_NEW_MESSAGE=false
DATABASE_SAVE_MESSAGE_UPDATE=false
DATABASE_SAVE_DATA_CONTACTS=false
DATABASE_SAVE_DATA_CHATS=false
DATABASE_SAVE_DATA_LABELS=false
DATABASE_SAVE_DATA_HISTORIC=false
CACHE_REDIS_ENABLED=true
CACHE_REDIS_URI=redis://redis:6379/6
CACHE_REDIS_PREFIX_KEY=gestao_otica
CACHE_REDIS_SAVE_INSTANCES=false
CACHE_LOCAL_ENABLED=false
AUTHENTICATION_API_KEY=$evolution_api_key
AUTHENTICATION_EXPOSE_IN_FETCH_INSTANCES=false
TELEMETRY_ENABLED=false
LOG_LEVEL=ERROR,WARN,INFO,WEBHOOKS
LOG_BAILEYS=error
DEL_INSTANCE=false
LANGUAGE=pt-BR
WEBHOOK_GLOBAL_ENABLED=false
WEBHOOK_EVENTS_MESSAGES_UPSERT=true
WEBHOOK_EVENTS_CONNECTION_UPDATE=true
WEBHOOK_RETRY_MAX_ATTEMPTS=10
WEBHOOK_RETRY_NON_RETRYABLE_STATUS_CODES=400,401,403,404,422
EOF

cat > automation.env <<EOF
PORT=8080
APP_BASE_URL=https://gestao-otica-pro.vercel.app
WHATSAPP_INTERNAL_SECRET=$internal_secret
EVOLUTION_API_URL=http://evolution-api:8080
EVOLUTION_API_KEY=$evolution_api_key
EVOLUTION_WEBHOOK_SECRET=$webhook_secret
EOF

chmod 600 evolution.env automation.env
echo "Environment files created in $deploy_dir"
