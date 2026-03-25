#!/usr/bin/env bash
set -e

# Resolve repo root (directory containing this script)
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
cd "$REPO_ROOT"

for arg in "$@"; do
  case "$arg" in
    -h|--help)
      echo "Usage: ./run.sh"
      echo "  Run demo only (no install/build/update steps)."
      exit 0
      ;;
  esac
done

if ! command -v node &>/dev/null; then
  echo "Error: Node.js is not installed or not in PATH."
  echo "This project requires Node.js >= 22."
  exit 1
fi

NODE_MAJOR=$(node -e "console.log(process.versions.node.split('.')[0])")
if [[ "$NODE_MAJOR" -lt 22 ]]; then
  echo "Error: Node.js 22 or higher is required. Current: $(node -v)"
  exit 1
fi

if ! command -v pnpm &>/dev/null; then
  echo "Error: pnpm is not installed or not in PATH."
  echo "Run setup first with ./setupandrun.sh"
  exit 1
fi

echo "Starting demo..."
exec pnpm run demo
