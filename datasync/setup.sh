#!/bin/bash
set -e

AIRBYTE_DIR="/airbyte/airbyte-platform"
AIRBYTE_VERSION="${AIRBYTE_VERSION:-0.63.11}"

# HOST_PWD is the host machine's absolute path to the datasync folder,
# passed in via the docker-compose.yml environment block.
# This is required so Docker resolves Airbyte's bind mounts from the host.
HOST_AIRBYTE_DIR="${HOST_PWD}/airbyte-data/airbyte-platform"

echo "========================================="
echo "  Airbyte Setup - Duties Dashboard Sync"
echo "  Version: ${AIRBYTE_VERSION}"
echo "========================================="

# Download Airbyte if not already present
if [ ! -d "$AIRBYTE_DIR" ]; then
  echo "[1/4] Downloading Airbyte ${AIRBYTE_VERSION}..."
  curl -fsSL \
    "https://github.com/airbytehq/airbyte-platform/archive/refs/tags/v${AIRBYTE_VERSION}.zip" \
    -o /tmp/airbyte.zip
  unzip -q /tmp/airbyte.zip -d /tmp
  mv "/tmp/airbyte-platform-${AIRBYTE_VERSION}" "$AIRBYTE_DIR"
  rm /tmp/airbyte.zip
  echo "      Done."
else
  echo "[1/4] Airbyte already downloaded. Skipping."
fi

# Create flags.yml — exists inside container AND on host via bind mount
if [ ! -f "$AIRBYTE_DIR/flags.yml" ]; then
  echo "[2/4] Creating flags.yml..."
  touch "$AIRBYTE_DIR/flags.yml"
  echo "      Done."
else
  echo "[2/4] flags.yml already exists. Skipping."
fi

# Copy .env overrides if provided
echo "[3/4] Applying environment configuration..."
if [ -f /airbyte/.env ]; then
  cp /airbyte/.env "$AIRBYTE_DIR/.env"
  echo "      Custom .env applied."
else
  echo "      No custom .env found — using Airbyte defaults."
fi

# Start Airbyte
# --env-file      → load variables from Airbyte's .env inside the container
# --project-directory → tell Docker daemon to resolve relative bind mount
#                       paths (e.g. ./flags.yml) from the HOST filesystem
echo "[4/4] Starting Airbyte services..."
docker compose \
  --project-directory "$HOST_AIRBYTE_DIR" \
  --env-file "$AIRBYTE_DIR/.env" \
  -f "$AIRBYTE_DIR/docker-compose.yaml" \
  up -d --remove-orphans

echo ""
echo "========================================="
echo "  Airbyte is starting up!"
echo "  UI: http://localhost:${AIRBYTE_PORT:-8000}"
echo "  User:     airbyte"
echo "  Password: password"
echo ""
echo "  Next steps:"
echo "  1. Add MS SQL Server as a Source"
echo "  2. Add PostgreSQL (jd_tariff_monitor) as Destination"
echo "  3. Create a Connection with your sync schedule"
echo "========================================="
