#!/usr/bin/env bash
# Installs a GitHub Actions self-hosted runner on this server, as a systemd
# service running under the "deploy" user (created by scripts/setup-server.sh
# — run that first).
#
# Why a self-hosted runner: this server has no inbound internet access, so a
# GitHub-hosted runner could never SSH into it. A self-hosted runner instead
# makes an OUTBOUND connection to github.com to poll for jobs — no inbound
# port needs to open at all. The deploy workflow then runs directly on this
# box (no SSH/rsync required — it already IS the target).
#
# Usage:
#   1. In GitHub: Settings → Actions → Runners → "New self-hosted runner"
#      → Linux → copies a one-time registration TOKEN (valid ~1 hour).
#   2. On this server, as root:
#        export RUNNER_TOKEN="<paste the token>"
#        sudo -E bash scripts/install-github-runner.sh
#
# Safe to re-run: if a runner is already configured here, it's removed and
# re-registered with a fresh token (useful if the old token expired or you
# need to re-point this at a renamed/moved repo).

set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/jcanales/aaa-dashboard}"
RUNNER_USER="deploy"
RUNNER_DIR="/home/${RUNNER_USER}/actions-runner"
RUNNER_LABELS="duties-dashboard"
RUNNER_NAME="${RUNNER_NAME:-duties-dashboard-$(hostname -s)}"

RED='\033[0;31m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

if [ -z "${RUNNER_TOKEN:-}" ]; then
  echo -e "${RED}${BOLD}RUNNER_TOKEN is not set.${NC}"
  echo "Get a one-time registration token from:"
  echo "  ${REPO_URL}/settings/actions/runners/new"
  echo "Then run:"
  echo '  export RUNNER_TOKEN="<paste the token>"'
  echo "  sudo -E bash scripts/install-github-runner.sh"
  exit 1
fi

if ! id "${RUNNER_USER}" &>/dev/null; then
  echo -e "${RED}User '${RUNNER_USER}' does not exist — run scripts/setup-server.sh first.${NC}"
  exit 1
fi

echo -e "${CYAN}${BOLD}Detecting latest runner release…${NC}"
ARCH=$(uname -m)
case "$ARCH" in
  x86_64)  RUNNER_ARCH="x64" ;;
  aarch64) RUNNER_ARCH="arm64" ;;
  *) echo -e "${RED}Unsupported architecture: ${ARCH}${NC}"; exit 1 ;;
esac

LATEST_JSON=$(curl -fsSL https://api.github.com/repos/actions/runner/releases/latest)
RUNNER_VERSION=$(echo "$LATEST_JSON" | grep -o '"tag_name": *"v[^"]*"' | head -1 | sed -E 's/.*"v([^"]*)"/\1/')
if [ -z "$RUNNER_VERSION" ]; then
  echo -e "${RED}Could not determine latest runner version — check outbound internet access to api.github.com.${NC}"
  exit 1
fi
PKG="actions-runner-linux-${RUNNER_ARCH}-${RUNNER_VERSION}.tar.gz"
DOWNLOAD_URL="https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/${PKG}"
echo "  Version: ${RUNNER_VERSION} (${RUNNER_ARCH})"

# If a runner is already installed here, stop and unconfigure it first so this
# script can be safely re-run (e.g. after a token expired, or to move repos).
if [ -f "${RUNNER_DIR}/.runner" ]; then
  echo -e "${CYAN}Existing runner found — removing before re-registering…${NC}"
  # svc.sh manages the systemd unit — always run it as root, regardless of
  # which user the service itself runs under.
  (cd "${RUNNER_DIR}" && ./svc.sh stop)      || true
  (cd "${RUNNER_DIR}" && ./svc.sh uninstall) || true
  # config.sh, by contrast, must run as the same non-root user configured to
  # run the runner.
  sudo -u "${RUNNER_USER}" bash -c "cd '${RUNNER_DIR}' && ./config.sh remove --token '${RUNNER_TOKEN}'" || true
fi

echo -e "${CYAN}${BOLD}Downloading runner package…${NC}"
sudo -u "${RUNNER_USER}" mkdir -p "${RUNNER_DIR}"
sudo -u "${RUNNER_USER}" bash -c "
  cd '${RUNNER_DIR}' &&
  curl -fsSL -o runner.tar.gz '${DOWNLOAD_URL}' &&
  tar xzf runner.tar.gz &&
  rm -f runner.tar.gz
"

echo -e "${CYAN}${BOLD}Configuring runner…${NC}"
sudo -u "${RUNNER_USER}" bash -c "
  cd '${RUNNER_DIR}' &&
  ./config.sh --url '${REPO_URL}' --token '${RUNNER_TOKEN}' --name '${RUNNER_NAME}' \
    --labels '${RUNNER_LABELS}' --work '_work' --unattended --replace
"

echo -e "${CYAN}${BOLD}Installing as a systemd service…${NC}"
cd "${RUNNER_DIR}"
./svc.sh install "${RUNNER_USER}"
./svc.sh start

echo ""
echo -e "${GREEN}${BOLD}Runner installed and running.${NC}"
echo "  Check status:  sudo ${RUNNER_DIR}/svc.sh status"
echo "  View in GitHub: ${REPO_URL}/settings/actions/runners"
echo ""
echo "Workflows should target this runner with:"
echo "  runs-on: [self-hosted, ${RUNNER_LABELS}]"
