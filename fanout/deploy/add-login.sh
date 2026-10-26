#!/usr/bin/env bash
# Creates a Fanout login, or resets its password if the email already exists:
#   sudo /opt/fanout/fanout/deploy/add-login.sh
set -euo pipefail
application_directory="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

read -r -p "Their name (e.g. Gana): " name < /dev/tty
read -r -p "Their email: " email < /dev/tty
while true; do
  read -r -s -p "Password (8+ characters): " password < /dev/tty; echo
  read -r -s -p "Password again: " confirmation < /dev/tty; echo
  if [[ "$password" != "$confirmation" ]]; then echo "The passwords differ; try again."; continue; fi
  if (( ${#password} < 8 )); then echo "Use at least 8 characters."; continue; fi
  break
done

FANOUT_NEW_PASSWORD="$password" docker compose --project-directory "$application_directory" exec -T -e FANOUT_NEW_PASSWORD api \
  node apps/api/src/scripts/createUser.ts --email "$email" --name "$name"
echo "Share the web address, their email and this password with them."
