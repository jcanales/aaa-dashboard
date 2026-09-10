#!/usr/bin/env bash
# One-time dependency install for duties-dashboard on an internal office
# Ubuntu/Debian server. Run as root (or via sudo):
#   sudo -E DOMAIN=usbroker.jdgroup.net BACKEND_PORT=3001 WEB_DIR=/var/www/duties-dashboard SITE_NAME=duties-dashboard bash scripts/setup-server.sh
#
# This server sits on the office LAN/VPN — its hostnames (e.g.
# usbroker.jdgroup.net) resolve only to its private IP, never routable from
# the raw public internet, even though they look like normal public domains.
# TLS is a pre-issued wildcard cert for *.jdgroup.net already placed at
# /etc/nginx/ssl/wildcard.jdgroup.net.{crt,key} (not certbot/Let's Encrypt —
# an ACME server could never reach this box to issue one). Passing DOMAIN
# generates an HTTPS vhost using that wildcard cert; every *.jdgroup.net
# subdomain (prod, dev, whatever's next) can reuse the same cert files.
# Leaving DOMAIN unset falls back to the original plain-HTTP-by-IP config.
#
# This script ONLY installs infrastructure — packages, a dedicated deploy user,
# directories, Docker (for the app's own Postgres), Node/pm2, and the nginx
# reverse proxy. It never writes secrets (JWT_SECRET, DB passwords, etc.) —
# those go in backend/.env, created separately. Safe to re-run.
#
# Optional: to let something (a CI job, a teammate) deploy over SSH as the
# dedicated user this script creates, generate a keypair LOCALLY (not on this
# server) and export its public half before running:
#   ssh-keygen -t ed25519 -f duties_dashboard_deploy_key -C "deploy@duties-dashboard" -N ""
#   export DEPLOY_SSH_PUBLIC_KEY="$(cat duties_dashboard_deploy_key.pub)"
#   sudo -E bash scripts/setup-server.sh
# This is entirely optional — the script runs fine without it.

set -uo pipefail   # -e intentionally omitted: failures are caught per-task

# ── Config — override via env vars (e.g. for a second, dev environment on the
# same box), or edit these defaults directly ─────────────────────────────────
APP_DIR="${APP_DIR:-/opt/duties-dashboard}"
WEB_DIR="${WEB_DIR:-/var/www/duties-dashboard}"
DEPLOY_USER="${DEPLOY_USER:-deploy}"
BACKEND_PORT="${BACKEND_PORT:-3001}"
SITE_NAME="${SITE_NAME:-duties-dashboard}"
LOG_FILE="${LOG_FILE:-/tmp/duties-dashboard-setup.log}"
TOTAL_STEPS=7

SERVER_IP=$(hostname -I 2>/dev/null | awk '{print $1}')

# ── Colors & symbols ──────────────────────────────────────────────────────────
RED='\033[0;31m';   GREEN='\033[0;32m';  YELLOW='\033[1;33m'
BLUE='\033[0;34m';  CYAN='\033[0;36m';   BOLD='\033[1m';  DIM='\033[2m'; NC='\033[0m'
SYM_OK="${GREEN}✔${NC}";  SYM_FAIL="${RED}✘${NC}"

STEP_NAMES=(); STEP_STATUS=(); STEP_DETAIL=()
CURRENT_STEP=0

print_banner() {
  clear
  echo -e "${BOLD}${BLUE}"
  echo "  ╔══════════════════════════════════════════════════╗"
  echo "  ║      Duties Dashboard — Server Setup Script       ║"
  printf "  ║       JD Group  ·  %-30s║\n" "${SERVER_IP:-office LAN}"
  echo "  ╚══════════════════════════════════════════════════╝${NC}"
  echo -e "  ${DIM}Full log: ${LOG_FILE}${NC}\n"
}

begin_step() {
  CURRENT_STEP=$((CURRENT_STEP + 1))
  local label="$1"
  echo -e "\n${BOLD}${CYAN}[${CURRENT_STEP}/${TOTAL_STEPS}]${NC} ${BOLD}${label}${NC}"
  STEP_NAMES+=("$label")
}

task() {
  local label="$1"; shift
  local tmp_log; tmp_log=$(mktemp)
  "$@" >> "$tmp_log" 2>&1
  local rc=$?
  cat "$tmp_log" >> "$LOG_FILE"
  if [ $rc -eq 0 ]; then
    printf "  %-46s %b\n" "$label" "$SYM_OK"
  else
    printf "  %-46s %b\n" "$label" "$SYM_FAIL"
    echo -e "    ${RED}↳ $(tail -4 "$tmp_log" | head -1)${NC}"
  fi
  rm -f "$tmp_log"
  return $rc
}

step_ok()   { STEP_STATUS+=("OK");     STEP_DETAIL+=("${1:-}"); }
step_fail() { STEP_STATUS+=("FAILED"); STEP_DETAIL+=("${1:-}"); }

print_summary() {
  local failures=0
  echo ""
  echo -e "${BOLD}${BLUE}  Installation summary${NC}"
  for i in "${!STEP_NAMES[@]}"; do
    local status="${STEP_STATUS[$i]:-SKIPPED}"
    if [ "$status" = "OK" ]; then
      printf "  %b %-30s %s\n" "$SYM_OK" "${STEP_NAMES[$i]}" "${STEP_DETAIL[$i]:-}"
    else
      printf "  %b %-30s %s\n" "$SYM_FAIL" "${STEP_NAMES[$i]}" "${STEP_DETAIL[$i]:-}"
      failures=$((failures + 1))
    fi
  done
  echo ""
  if [ $failures -eq 0 ]; then
    echo -e "  ${GREEN}${BOLD}All ${#STEP_NAMES[@]} steps completed successfully${NC}"
  else
    echo -e "  ${RED}${BOLD}${failures} step(s) failed${NC} — see ${LOG_FILE}"
  fi

  echo ""
  echo -e "${BOLD}  Installed versions:${NC}"
  printf "  %-12s %s\n" "Node.js" "$(node -v 2>/dev/null || echo 'not found')"
  printf "  %-12s %s\n" "Docker"  "$(docker --version 2>/dev/null | cut -d' ' -f3 | tr -d ',' || echo 'not found')"
  printf "  %-12s %s\n" "nginx"   "$(nginx -v 2>&1 | cut -d'/' -f2 || echo 'not found')"
  printf "  %-12s %s\n" "pm2"     "$(sudo -u "${DEPLOY_USER}" pm2 -v 2>/dev/null || echo 'not found')"

  echo ""
  echo -e "${BOLD}  Directories:${NC}"
  printf "  %-12s %s (owned by %s)\n" "Backend"  "${APP_DIR}"  "${DEPLOY_USER}"
  printf "  %-12s %s (owned by %s)\n" "Frontend" "${WEB_DIR}"  "${DEPLOY_USER}"

  echo ""
  echo -e "${BOLD}  Next steps to actually run the app:${NC}"
  echo -e "  ${CYAN}1.${NC} Put the built backend in ${APP_DIR}/backend (dist/, package.json,"
  echo -e "     package-lock.json, docker-compose.yml, ecosystem.config.cjs) and the"
  echo -e "     built frontend (npm run build → dist/) in ${WEB_DIR}."
  echo -e "  ${CYAN}2.${NC} Write ${APP_DIR}/backend/.env — JWT_SECRET, DATABASE_URL"
  echo -e "     (e.g. postgresql://duties_dashboard:<PG_PASSWORD>@localhost:5433/duties_dashboard),"
  echo -e "     PG_PASSWORD (same one, for docker-compose.yml), and the MSSQL_* vars"
  echo -e "     for the legacy RB Systems database (see backend/.env.example)."
  echo -e "  ${CYAN}3.${NC} As ${DEPLOY_USER}, from ${APP_DIR}/backend:"
  echo -e "       docker compose up -d && npm ci --omit=dev && npx prisma migrate deploy"
  echo -e "       pm2 startOrReload ecosystem.config.cjs --update-env && pm2 save"
  echo -e "  ${CYAN}4.${NC} curl http://localhost:${BACKEND_PORT}/health should return {\"status\":\"ok\"}."
  echo -e "  ${CYAN}5.${NC} Visit http://${SERVER_IP:-this-servers-ip}/ from the office network."
  echo ""
}

# ═════════════════════════════════════════════════════════════════════════════
: > "$LOG_FILE"
print_banner

if [ -z "${DEPLOY_SSH_PUBLIC_KEY:-}" ]; then
  echo -e "  ${YELLOW}DEPLOY_SSH_PUBLIC_KEY not set — skipping SSH key install for ${DEPLOY_USER}.${NC}"
  echo -e "  ${DIM}(Optional. Export it and re-run if you want key-based SSH deploy access.)${NC}\n"
fi

# ── Step 1 — System packages ──────────────────────────────────────────────────
begin_step "System packages"
  task "apt-get update"                    bash -c "DEBIAN_FRONTEND=noninteractive apt-get update -y"
  task "Install core utilities"            bash -c "DEBIAN_FRONTEND=noninteractive apt-get install -y \
    curl wget git gnupg lsb-release ca-certificates \
    apt-transport-https software-properties-common rsync unzip build-essential"
step_ok "installed"

# ── Step 2 — Deploy user ─────────────────────────────────────────────────────
begin_step "Deploy user (${DEPLOY_USER})"
  task "Create user '${DEPLOY_USER}'"       bash -c "id ${DEPLOY_USER} &>/dev/null || useradd -m -s /bin/bash ${DEPLOY_USER}"
  if [ -n "${DEPLOY_SSH_PUBLIC_KEY:-}" ]; then
    task "Install deploy SSH public key"    bash -c "
      mkdir -p /home/${DEPLOY_USER}/.ssh
      touch /home/${DEPLOY_USER}/.ssh/authorized_keys
      grep -qxF '${DEPLOY_SSH_PUBLIC_KEY}' /home/${DEPLOY_USER}/.ssh/authorized_keys || echo '${DEPLOY_SSH_PUBLIC_KEY}' >> /home/${DEPLOY_USER}/.ssh/authorized_keys
      chown -R ${DEPLOY_USER}:${DEPLOY_USER} /home/${DEPLOY_USER}/.ssh
      chmod 700 /home/${DEPLOY_USER}/.ssh
      chmod 600 /home/${DEPLOY_USER}/.ssh/authorized_keys"
  fi
  task "Grant passwordless sudo for nginx"  bash -c "echo '${DEPLOY_USER} ALL=(ALL) NOPASSWD: /usr/bin/systemctl reload nginx, /usr/bin/systemctl restart nginx' > /etc/sudoers.d/${DEPLOY_USER} && chmod 440 /etc/sudoers.d/${DEPLOY_USER}"
step_ok "ready"

# ── Step 3 — Docker + Compose plugin (runs the app's own Postgres) ──────────
begin_step "Docker + Compose plugin"
  task "Install Docker (get.docker.com)"   bash -c "curl -fsSL https://get.docker.com | sh"
  task "Enable & start Docker"             bash -c "systemctl enable docker && systemctl start docker"
  task "Add ${DEPLOY_USER} to docker group" usermod -aG docker "${DEPLOY_USER}"
step_ok "$(docker --version 2>/dev/null | cut -d' ' -f3 | tr -d ',')"

# ── Step 4 — Node.js 20 + pm2 ─────────────────────────────────────────────────
begin_step "Node.js 20 + pm2"
  task "Add NodeSource repo"               bash -c "curl -fsSL https://deb.nodesource.com/setup_20.x | bash -"
  task "Install nodejs"                    bash -c "DEBIAN_FRONTEND=noninteractive apt-get install -y nodejs"
  task "Install pm2 globally"              bash -c "npm install -g pm2"
  task "pm2 startup for ${DEPLOY_USER}"    bash -c "env PATH=\$PATH:/usr/bin pm2 startup systemd -u ${DEPLOY_USER} --hp /home/${DEPLOY_USER} | tail -1 | bash"
step_ok "$(node -v 2>/dev/null)"

# ── Step 5 — nginx ────────────────────────────────────────────────────────────
# In production this box actually terminates TLS with a pre-issued wildcard
# cert for *.jdgroup.net (not certbot/Let's Encrypt — DOMAIN's public-looking
# hostname still only resolves to this box's private IP, reachable over the
# office network/VPN). Pass DOMAIN (and optionally WILDCARD_CERT/WILDCARD_KEY,
# if they ever live somewhere other than the defaults below) to get that same
# HTTPS vhost; leave DOMAIN unset for the original plain-HTTP-by-IP fallback.
DOMAIN="${DOMAIN:-}"
WILDCARD_CERT="${WILDCARD_CERT:-/etc/nginx/ssl/wildcard.jdgroup.net.crt}"
WILDCARD_KEY="${WILDCARD_KEY:-/etc/nginx/ssl/wildcard.jdgroup.net.key}"

if [ -n "$DOMAIN" ] && [ -f "$WILDCARD_CERT" ] && [ -f "$WILDCARD_KEY" ]; then
  NGINX_CONF=$(cat <<NGINXEOF
server {
    listen 80;
    server_name ${DOMAIN};
    return 301 https://\$host\$request_uri;
}

server {
    listen 443 ssl;
    server_name ${DOMAIN};

    ssl_certificate     ${WILDCARD_CERT};
    ssl_certificate_key ${WILDCARD_KEY};
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;

    server_tokens off;
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;
    add_header X-Content-Type-Options    "nosniff" always;
    add_header X-Frame-Options           "DENY" always;
    add_header Referrer-Policy           "strict-origin-when-cross-origin" always;

    location /api/ {
        # Matches multer's fileUpload limit (converterConversions.ts) — nginx's
        # own default (1m) would otherwise 413 any PDF upload over ~1MB.
        client_max_body_size 15m;
        proxy_pass         http://127.0.0.1:${BACKEND_PORT}/api/;
        proxy_http_version 1.1;
        proxy_set_header   Host \$host;
        proxy_set_header   X-Real-IP \$remote_addr;
        proxy_set_header   X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
        proxy_buffering    off;
        proxy_read_timeout 300s;
    }

    root ${WEB_DIR};
    index index.html;
    location / { try_files \$uri \$uri/ /index.html; }
}
NGINXEOF
)
  NGINX_STEP_LABEL="https://${DOMAIN}/"
else
  NGINX_CONF=$(cat <<NGINXEOF
server {
    listen 80;
    server_name _;

    location /api/ {
        # Matches multer's fileUpload limit (converterConversions.ts) — nginx's
        # own default (1m) would otherwise 413 any PDF upload over ~1MB.
        client_max_body_size 15m;
        proxy_pass         http://127.0.0.1:${BACKEND_PORT}/api/;
        proxy_http_version 1.1;
        proxy_set_header   Host \$host;
        proxy_set_header   X-Real-IP \$remote_addr;
        proxy_set_header   X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
        proxy_buffering    off;
        proxy_read_timeout 300s;
    }

    root ${WEB_DIR};
    index index.html;

    # React Router SPA fallback
    location / { try_files \$uri \$uri/ /index.html; }
}
NGINXEOF
)
  NGINX_STEP_LABEL="http://${SERVER_IP:-<server-ip>}/"
fi
export NGINX_CONF

begin_step "nginx"
  task "Install nginx"                     bash -c "DEBIAN_FRONTEND=noninteractive apt-get install -y nginx"
  task "Enable nginx"                      systemctl enable nginx
  task "Write nginx site config"           bash -c 'printf "%s\n" "$NGINX_CONF" > "/etc/nginx/sites-available/'"${SITE_NAME}"'"'
  task "Activate site config"              bash -c "ln -sf /etc/nginx/sites-available/${SITE_NAME} /etc/nginx/sites-enabled/${SITE_NAME} && rm -f /etc/nginx/sites-enabled/default && nginx -t && systemctl reload nginx"
step_ok "${NGINX_STEP_LABEL}"

# ── Step 6 — App + web directories ───────────────────────────────────────────
begin_step "App + web directories"
  task "Create backend directory"          bash -c "mkdir -p ${APP_DIR}/backend && chown -R ${DEPLOY_USER}:${DEPLOY_USER} ${APP_DIR}"
  task "Create web directory"              bash -c "mkdir -p ${WEB_DIR} && chown -R ${DEPLOY_USER}:${DEPLOY_USER} ${WEB_DIR}"
step_ok "ready for deploy"

# ── Step 7 — pm2 boot placeholder ────────────────────────────────────────────
# The app itself isn't started here — that needs backend/.env (secrets) and the
# built dist/ in place first. See "Next steps" below.
begin_step "pm2 sanity check"
  task "pm2 responds as ${DEPLOY_USER}"    sudo -u "${DEPLOY_USER}" pm2 ping
step_ok "ready for first deploy"

# ═════════════════════════════════════════════════════════════════════════════
print_summary
