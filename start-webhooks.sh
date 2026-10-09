#!/usr/bin/env bash
# Forwards Stripe's sandbox billing events to the local app, so checkout,
# renewals, plan switches and cancellations update the workspace like in production
# (README, "Billing"). Needs the Stripe CLI (brew install stripe/stripe-cli/stripe),
# NEXT_PUBLIC_EDITION=cloud and a sandbox STRIPE_SECRET_KEY in .env.local.
#
#   ./start-webhooks.sh

set -euo pipefail
cd "$(dirname "$0")"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

ENV_FILE=.env.local
# The events /api/billing/webhook handles.
EVENTS=checkout.session.completed,invoice.paid,customer.subscription.created,customer.subscription.updated,customer.subscription.deleted

env_value() {
  { grep -E "^$1=" "$ENV_FILE" 2>/dev/null || true; } | tail -n 1 | cut -d= -f2- | tr -d "\"'"
}

if ! command -v stripe >/dev/null 2>&1; then
  echo -e "${RED}The Stripe CLI isn't installed.${NC} Install it with: brew install stripe/stripe-cli/stripe"
  exit 1
fi

KEY=$(env_value STRIPE_SECRET_KEY)
case "$KEY" in
  sk_test_* | rk_test_*) ;;
  "")
    echo -e "${RED}Set STRIPE_SECRET_KEY in $ENV_FILE first.${NC}"
    exit 1
    ;;
  *)
    echo -e "${RED}STRIPE_SECRET_KEY is a live key. Use a sandbox key locally.${NC}"
    exit 1
    ;;
esac

if [ "$(env_value NEXT_PUBLIC_EDITION)" != "cloud" ]; then
  echo -e "${YELLOW}NEXT_PUBLIC_EDITION isn't cloud, so the app ignores billing events.${NC}"
fi

APP_URL=$(env_value NEXT_PUBLIC_APP_URL)
APP_URL=${APP_URL:-http://localhost:3010}
TARGET="${APP_URL%/}/api/billing/webhook"

# The CLI signs what it forwards with its own secret, so the app has to
# verify with that one. Next picks up the change without a restart.
SECRET=$(stripe listen --print-secret --api-key "$KEY" | { grep -oE 'whsec_[A-Za-z0-9]+' || true; } | head -n 1)
if [ -z "$SECRET" ]; then
  echo -e "${RED}The Stripe CLI didn't return a signing secret. Check STRIPE_SECRET_KEY.${NC}"
  exit 1
fi
if [ "$(env_value STRIPE_BILLING_WEBHOOK_SECRET)" != "$SECRET" ]; then
  if grep -qE "^STRIPE_BILLING_WEBHOOK_SECRET=" "$ENV_FILE"; then
    tmp=$(mktemp)
    awk -v line="STRIPE_BILLING_WEBHOOK_SECRET=$SECRET" '/^STRIPE_BILLING_WEBHOOK_SECRET=/ { print line; next } { print }' "$ENV_FILE" >"$tmp"
    cat "$tmp" >"$ENV_FILE"
    rm -f "$tmp"
  else
    printf '\nSTRIPE_BILLING_WEBHOOK_SECRET=%s\n' "$SECRET" >>"$ENV_FILE"
  fi
  echo -e "${GREEN}Saved the CLI's signing secret as STRIPE_BILLING_WEBHOOK_SECRET in $ENV_FILE.${NC}"
fi

# The local https server uses a self-signed certificate.
SKIP_VERIFY=""
case "$TARGET" in https://localhost* | https://127.0.0.1*) SKIP_VERIFY=--skip-verify ;; esac

echo -e "${BLUE}Forwarding Stripe billing events to $TARGET${NC}"
echo -e "${YELLOW}Press Ctrl+C to stop${NC}\n"
exec stripe listen --api-key "$KEY" --events "$EVENTS" --forward-to "$TARGET" $SKIP_VERIFY
