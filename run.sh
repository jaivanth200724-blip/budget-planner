#!/usr/bin/env bash
# Launch script for Personal Budget Planner
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cd "$DIR"

PORT=${1:-8000}

echo "=========================================================="
echo " Starting Personal Budget Planner (Fullstack Python + SQLite)"
echo " Server URL: http://localhost:$PORT"
echo "=========================================================="

python3 server.py "$PORT"
