#!/usr/bin/env bash
# Installs (or updates) Fanout on a fresh Ubuntu server with one command:
#   curl -fsSL https://raw.githubusercontent.com/timZelik/ganadelray/main/fanout/deploy/install.sh | sudo bash
# Optional environment variables:
#   FANOUT_BRANCH=main            which branch to install
#   FANOUT_DOMAIN=fanout.me.com   your own domain (needs DNS records for it and media.<it>); default is a free sslip.io address
# Safe to re-run: secrets in .env and all data are kept.
set -euo pipefail

repository_url="https://github.com/timZelik/ganadelray.git"
branch="${FANOUT_BRANCH:-main}"
install_directory="/opt/fanout"
application_directory="${install_directory}/fanout"

say() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
fail() { printf '\n\033[31mError: %s\033[0m\n' "$*" >&2; exit 1; }

require_root() {
  [[ "$(id -u)" -eq 0 ]] || fail "Run with sudo: curl -fsSL <install url> | sudo bash"
}

install_docker() {
  if command -v docker >/dev/null && docker compose version >/dev/null 2>&1; then return; fi
  say "Installing Docker"
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker
}

# Oracle Cloud's Ubuntu images ship iptables rules that block 80/443 even when the cloud firewall allows them.
open_web_ports() {
  say "Opening ports 80 and 443"
  for port in 80 443; do
    iptables -C INPUT -p tcp --dport "$port" -j ACCEPT 2>/dev/null || iptables -I INPUT 1 -p tcp --dport "$port" -j ACCEPT
  done
  if command -v netfilter-persistent >/dev/null; then netfilter-persistent save >/dev/null 2>&1 || true; fi
  if command -v ufw >/dev/null && ufw status | grep -q "Status: active"; then ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null; fi
}

fetch_code() {
  command -v git >/dev/null || { apt-get update -qq && apt-get install -y -qq git >/dev/null; }
  if [[ -d "${install_directory}/.git" ]]; then
    say "Updating the code (${branch})"
    git -C "$install_directory" fetch --quiet origin "$branch"
    git -C "$install_directory" checkout --quiet "$branch"
    git -C "$install_directory" reset --quiet --hard "origin/${branch}"
  else
    say "Downloading the code (${branch})"
    git clone --quiet --branch "$branch" "$repository_url" "$install_directory"
  fi
}

detect_addresses() {
  if [[ -n "${FANOUT_DOMAIN:-}" ]]; then
    site_address="$FANOUT_DOMAIN"
    media_address="media.${FANOUT_DOMAIN}"
    return
  fi
  local public_ip
  public_ip="$(curl -fsS https://api.ipify.org || curl -fsS https://ifconfig.me)" || fail "Could not detect this server's public IP address"
  # sslip.io turns any IP into a hostname for free, which lets Caddy get real HTTPS certificates.
  site_address="fanout-${public_ip//./-}.sslip.io"
  media_address="media-${public_ip//./-}.sslip.io"
}

random_secret() { openssl rand -base64 32 | tr -d '\n'; }
random_password() { openssl rand -hex 24; }

# Secrets are generated once and never overwritten: changing them would lock you out of stored data.
write_environment_file() {
  local environment_file="${application_directory}/.env"
  if [[ -f "$environment_file" ]]; then
    say "Keeping existing settings in .env (addresses refreshed)"
    sed -i "s|^SITE_ADDRESS=.*|SITE_ADDRESS=${site_address}|; s|^MEDIA_ADDRESS=.*|MEDIA_ADDRESS=${media_address}|; s|^PUBLIC_URL=.*|PUBLIC_URL=https://${site_address}|; s|^S3_PUBLIC_ENDPOINT=.*|S3_PUBLIC_ENDPOINT=https://${media_address}|" "$environment_file"
    return
  fi
  say "Creating settings with fresh secrets"
  umask 077
  cat > "$environment_file" <<ENVIRONMENT
NODE_ENV=production
LOG_LEVEL=info
SITE_ADDRESS=${site_address}
MEDIA_ADDRESS=${media_address}
PUBLIC_URL=https://${site_address}
HTTP_PORT=80
HTTPS_PORT=443
TOKEN_ENCRYPTION_KEY=$(random_secret)
AUTH_SECRET=$(random_secret)
POSTGRES_PASSWORD=$(random_password)
S3_ACCESS_KEY_ID=fanout
S3_SECRET_ACCESS_KEY=$(random_password)
S3_PUBLIC_ENDPOINT=https://${media_address}
PUBLISH_DRY_RUN=false
ENABLE_HUB_FOLDER=false
ENVIRONMENT
}

start_services() {
  say "Building and starting Fanout (the first build takes several minutes)"
  docker compose --project-directory "$application_directory" up -d --build --remove-orphans
}

wait_until_online() {
  say "Waiting for https://${site_address} (getting the HTTPS certificate)"
  for _ in $(seq 1 60); do
    if curl -fsS "https://${site_address}/api/health" >/dev/null 2>&1; then return; fi
    sleep 5
  done
  fail "Fanout did not come online. Check that ports 80 and 443 are allowed in your cloud firewall, then run: docker compose --project-directory ${application_directory} logs web"
}

create_first_login() {
  if [[ -f "${application_directory}/.first-login-created" ]]; then return; fi
  say "Create your login"
  if [[ ! -r /dev/tty ]]; then
    echo "No terminal available; create logins later with: sudo ${application_directory}/deploy/add-login.sh"
    return
  fi
  "${application_directory}/deploy/add-login.sh" && touch "${application_directory}/.first-login-created"
}

main() {
  require_root
  install_docker
  open_web_ports
  fetch_code
  detect_addresses
  write_environment_file
  start_services
  wait_until_online
  create_first_login
  say "Fanout is ready"
  echo "  Open:        https://${site_address}"
  echo "  Add a login: sudo ${application_directory}/deploy/add-login.sh"
  echo "  Update:      curl -fsSL <install url> | sudo bash   (same command as installing)"
}

main "$@"
