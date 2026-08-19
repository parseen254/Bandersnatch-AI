#!/usr/bin/env bash
# One-shot macOS setup for Bandersnatch-AI credentials via gcloud.
#
# Automates everything Google's CLI supports:
#   1. Installs the gcloud CLI (Homebrew) if missing
#   2. Signs you in and selects/creates a GCP project
#   3. Enables the Gemini + API Keys services
#   4. Creates a Gemini API key restricted to the Generative Language API
#   5. Opens the exact Console pages for the one step Google does NOT
#      expose via CLI/API: creating the OAuth 2.0 Web client
#   6. Writes VITE_GOOGLE_CLIENT_ID into .env.local
#
# Usage:  ./scripts/setup-oauth.sh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$REPO_ROOT/.env.local"
DEV_ORIGIN="http://localhost:5173"
PREVIEW_ORIGIN="http://localhost:4173"

say()  { printf '\n\033[1;32m» %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m! %s\033[0m\n' "$*"; }

[[ "$(uname -s)" == "Darwin" ]] || { warn "This script targets macOS."; exit 1; }

# 1. gcloud CLI
if ! command -v gcloud >/dev/null 2>&1; then
  say "Installing gcloud CLI via Homebrew..."
  command -v brew >/dev/null 2>&1 || { warn "Homebrew required: https://brew.sh"; exit 1; }
  brew install --cask google-cloud-sdk
  # shellcheck disable=SC1091
  source "$(brew --prefix)/share/google-cloud-sdk/path.bash.inc" 2>/dev/null || true
fi
say "gcloud $(gcloud version --format='value(\"Google Cloud SDK\")' 2>/dev/null || echo 'ready')"

# 2. Auth + project
if ! gcloud auth list --filter=status:ACTIVE --format='value(account)' | grep -q .; then
  say "Signing in to Google Cloud (browser will open)..."
  gcloud auth login
fi

CURRENT_PROJECT="$(gcloud config get-value project 2>/dev/null || true)"
if [[ -z "$CURRENT_PROJECT" || "$CURRENT_PROJECT" == "(unset)" ]]; then
  say "Available projects:"
  gcloud projects list --format='table(projectId,name)' || true
  read -r -p "Project ID to use (blank = create 'bandersnatch-ai-$(date +%s | tail -c 5)'): " PROJECT_ID
  if [[ -z "$PROJECT_ID" ]]; then
    PROJECT_ID="bandersnatch-ai-$(date +%s | tail -c 5)"
    say "Creating project $PROJECT_ID..."
    gcloud projects create "$PROJECT_ID" --name="Bandersnatch AI"
  fi
  gcloud config set project "$PROJECT_ID"
else
  PROJECT_ID="$CURRENT_PROJECT"
  say "Using active project: $PROJECT_ID"
fi

# 3. Enable services
say "Enabling Generative Language + API Keys services..."
gcloud services enable generativelanguage.googleapis.com apikeys.googleapis.com

# 4. Gemini API key (restricted to the Gemini API)
say "Creating Gemini API key..."
KEY_NAME="$(gcloud services api-keys create \
  --display-name="Bandersnatch Gemini" \
  --api-target=service=generativelanguage.googleapis.com \
  --format='value(response.name)')"
GEMINI_KEY="$(gcloud services api-keys get-key-string "$KEY_NAME" --format='value(keyString)')"

# 5. OAuth Web client — Console-only (no public API / gcloud command exists
#    for standard OAuth clients on external/personal projects).
say "Opening the Google Auth Platform Console for the OAuth client..."
cat <<EOF
  In the pages that open:
    a) Branding page: configure the consent screen once (app name + your email).
       External + Testing is fine — add yourself as a test user.
    b) Create client page:
         Application type : Web application
         Name             : Bandersnatch AI
         Authorized JavaScript origins:
           $DEV_ORIGIN
           $PREVIEW_ORIGIN
           (plus your production URL, if any)
       No redirect URIs are needed (Google Identity Services button flow).
EOF
open "https://console.cloud.google.com/auth/branding?project=$PROJECT_ID"
open "https://console.cloud.google.com/auth/clients/create?project=$PROJECT_ID"

read -r -p "Paste the OAuth Client ID (ends in .apps.googleusercontent.com): " CLIENT_ID
[[ "$CLIENT_ID" == *.apps.googleusercontent.com ]] || warn "That doesn't look like a Web client ID — writing it anyway."

# 6. Write .env.local
say "Writing $ENV_FILE"
{
  echo "VITE_GOOGLE_CLIENT_ID=$CLIENT_ID"
  echo "# Gemini API key (paste into the in-app BIOS screen; the app reads it from there):"
  echo "# GEMINI_API_KEY=$GEMINI_KEY"
} > "$ENV_FILE"

say "Done."
echo "  OAuth client ID -> .env.local (picked up by 'npm run dev')"
echo "  Gemini API key  -> $GEMINI_KEY"
echo "  Enter the key on the BANDERSNATCH BIOS screen when the app asks for it."
