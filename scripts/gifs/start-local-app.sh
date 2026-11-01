#!/usr/bin/env bash
# Build this branch's app and serve it locally with Cloudflare's local bindings (no secrets, no deploy).
# Used by .github/workflows/gifs.yml. Serves http://localhost:8787 and keeps the server in the background.
#
# Why local and not the shared preview Worker: the preview deploys only from pull requests to main and is
# shared by every PR, so it may be running other code; this serves exactly the commit being captured, with its own
# local D1, Durable Object and rate-limit state (POST /api/demo limits are per run, not shared with anyone).
set -euo pipefail

PORT="${PORT:-8787}"
LOG="${LOG:-$PWD/app/e2e/gifs/out/app-server.log}"
mkdir -p "$(dirname "$LOG")"

# Throwaway local secrets: random, never printed, never committed (app/.dev.vars is git-ignored).
rand() { head -c 32 /dev/urandom | base64 | tr -d '\n'; }
cat > app/.dev.vars <<VARS
PUBLIC_BASE_URL=http://localhost:${PORT}
TWITCH_CLIENT_SECRET=local-not-used
EVENTSUB_SECRET=$(rand)
SESSION_HMAC_KEY=$(rand)
TOKEN_ENC_KEY=$(rand)
VARS
cp app/.dev.vars app/.dev.vars.preview

# The preview environment: no R2 bucket, no queue, local grading, demo rooms on.
export CLOUDFLARE_ENV=preview
npm run build -w app

(cd app && npx wrangler d1 migrations apply mfd-preview --local --env preview) || echo "d1 migrations skipped (demo rooms do not read D1)"

(cd app && nohup npx vite preview --port "$PORT" --strictPort --host localhost > "$LOG" 2>&1 &)

for i in $(seq 1 60); do
  if curl -fsS "http://localhost:${PORT}/api/health" >/dev/null 2>&1; then
    echo "app is up on http://localhost:${PORT}"
    curl -fsS "http://localhost:${PORT}/api/health"; echo
    exit 0
  fi
  sleep 2
done
echo "app did not come up; server log:"
tail -n 60 "$LOG" || true
exit 1
