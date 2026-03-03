#!/usr/bin/env bash
set -e

# Resolve repo root (directory containing this script)
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
cd "$REPO_ROOT"

# Optional: --full forces install + build even if setup was done before
FORCE_FULL=false
for arg in "$@"; do
  case "$arg" in
    --full) FORCE_FULL=true ;;
    -h|--help)
      echo "Usage: ./run.sh [--full]"
      echo "  (no args)  Install deps if needed, then start the demo."
      echo "  --full     Run full setup (pnpm install + pnpm build) then start the demo."
      exit 0
      ;;
  esac
done

# --- Checks ---
if ! command -v node &>/dev/null; then
  echo "Error: Node.js is not installed or not in PATH."
  echo "This project requires Node.js >= 22. Install it from https://nodejs.org or via your package manager."
  exit 1
fi

NODE_MAJOR=$(node -e "console.log(process.versions.node.split('.')[0])")
if [[ "$NODE_MAJOR" -lt 22 ]]; then
  echo "Error: Node.js 22 or higher is required. Current: $(node -v)"
  exit 1
fi

# Use pnpm from PATH, or install via Corepack, or run via npx
PNPM_CMD=""
if command -v pnpm &>/dev/null; then
  PNPM_CMD="pnpm"
else
  echo "pnpm not in PATH. Setting up pnpm..."
  corepack enable 2>/dev/null || true
  # Prepare and activate pnpm@9 so the shim is available (matches packageManager in package.json)
  corepack prepare pnpm@9.0.0 --activate 2>/dev/null || true
  if command -v pnpm &>/dev/null; then
    PNPM_CMD="pnpm"
  elif npx -y pnpm@9 --version &>/dev/null; then
    PNPM_CMD="npx -y pnpm@9"
  else
    echo "Error: Could not run pnpm. Try: npm install -g pnpm"
    exit 1
  fi
fi

# --- First-time setup vs regular run ---
SETUP_DONE="$REPO_ROOT/.run-setup-done"

if [[ ! -f "$SETUP_DONE" ]] || [[ "$FORCE_FULL" == true ]]; then
  echo "Full setup: installing dependencies and building..."
  $PNPM_CMD install
  $PNPM_CMD build
  touch "$SETUP_DONE"
  echo "Setup complete."
else
  echo "Installing dependencies (if needed)..."
  $PNPM_CMD install
fi

echo "Starting demo..."
exec $PNPM_CMD run demo
