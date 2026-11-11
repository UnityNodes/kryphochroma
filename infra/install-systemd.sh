#!/usr/bin/env bash
set -euo pipefail

repo="${REPO:-$(git -C "$(dirname "$0")" rev-parse --show-toplevel)}"
run_user="${RUN_USER:-$(stat -c %U "$repo")}"
node_bin="${NODE_BIN:-$(command -v node)}"

for unit in kryphochroma-bots kryphochroma-web; do
  sed -e "s#@USER@#${run_user}#g" -e "s#@NODE@#${node_bin}#g" -e "s#@REPO@#${repo}#g" \
    "$repo/infra/systemd/${unit}.service" | sudo tee "/etc/systemd/system/${unit}.service" >/dev/null
done
sudo systemctl daemon-reload
sudo systemctl enable --now kryphochroma-bots kryphochroma-web
