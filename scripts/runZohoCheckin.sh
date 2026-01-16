#!/bin/bash

# Wrapper script for launchd to run Zoho check-in with proper environment setup
# This ensures the .env file is loaded and Node.js path is correct

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Change to project directory
cd "$PROJECT_DIR" || exit 1

# Load environment variables from .env file
if [ -f "$PROJECT_DIR/.env" ]; then
    export $(cat "$PROJECT_DIR/.env" | grep -v '^#' | xargs)
fi

# Find Node.js (try common locations)
if [ -f "/usr/local/bin/node" ]; then
    NODE_PATH="/usr/local/bin/node"
elif [ -f "/opt/homebrew/bin/node" ]; then
    NODE_PATH="/opt/homebrew/bin/node"
elif command -v node &> /dev/null; then
    NODE_PATH=$(which node)
else
    echo "ERROR: Node.js not found" >&2
    exit 1
fi

# Run the check-in script
exec "$NODE_PATH" "$SCRIPT_DIR/zohoCheckin.js"
