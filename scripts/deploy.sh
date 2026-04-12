#!/usr/bin/env bash
# TunPilot 一键部署脚本
# Usage: curl -fsSL https://raw.githubusercontent.com/Buywatermelon/tunpilot/main/scripts/deploy.sh | bash
set -euo pipefail

INSTALL_DIR="/opt/tunpilot"
REPO="https://github.com/Buywatermelon/tunpilot.git"
SERVICE_NAME="tunpilot"

info()  { echo -e "\033[1;32m✔\033[0m $*"; }
warn()  { echo -e "\033[1;33m!\033[0m $*"; }
error() { echo -e "\033[1;31m✘\033[0m $*" >&2; exit 1; }

# --- 检测 / 安装 Bun ---
if command -v bun &>/dev/null; then
  info "Bun $(bun --version) already installed"
else
  warn "Installing Bun..."
  curl -fsSL https://bun.sh/install | bash
  export BUN_INSTALL="$HOME/.bun"
  export PATH="$BUN_INSTALL/bin:$PATH"
  info "Bun $(bun --version) installed"
fi

# --- 检测公网 IP ---
PUBLIC_IP=$(curl -fsSL --max-time 5 ifconfig.me 2>/dev/null || curl -fsSL --max-time 5 icanhazip.com 2>/dev/null || echo "localhost")

# --- 克隆或更新仓库 ---
if [ -d "$INSTALL_DIR/.git" ]; then
  warn "Existing installation found, updating..."
  git -C "$INSTALL_DIR" pull --ff-only
else
  rm -rf "$INSTALL_DIR"
  git clone "$REPO" "$INSTALL_DIR"
fi

cd "$INSTALL_DIR"

# --- 安装依赖 ---
bun install --frozen-lockfile 2>/dev/null || bun install

# --- 构建 Web Admin（若存在） ---
if [ -d "$INSTALL_DIR/web" ] && [ -f "$INSTALL_DIR/web/package.json" ]; then
  (cd "$INSTALL_DIR/web" && bun install --frozen-lockfile 2>/dev/null || bun install) || true
  (cd "$INSTALL_DIR/web" && bun run build) || warn "Web admin build skipped"
fi

# --- 生成配置 ---
if [ -f "$INSTALL_DIR/.env" ]; then
  warn "Existing .env found, keeping it"
  AUTH_TOKEN=$(grep -oP 'TUNPILOT_AUTH_TOKEN=\K.*' "$INSTALL_DIR/.env" || echo "")
  if [ -z "$AUTH_TOKEN" ]; then
    AUTH_TOKEN=$(openssl rand -hex 32)
    echo "TUNPILOT_AUTH_TOKEN=$AUTH_TOKEN" >> "$INSTALL_DIR/.env"
    info "Added missing TUNPILOT_AUTH_TOKEN to existing .env"
  fi
else
  AUTH_TOKEN=$(openssl rand -hex 32)
  cat > "$INSTALL_DIR/.env" <<EOF
TUNPILOT_PORT=3000
TUNPILOT_HOST=0.0.0.0
TUNPILOT_DB_PATH=$INSTALL_DIR/data/tunpilot.db
TUNPILOT_BASE_URL=http://$PUBLIC_IP:3000
TUNPILOT_AUTH_TOKEN=$AUTH_TOKEN
EOF
  info ".env created"
fi

# --- 创建 systemd 服务 ---
BUN_PATH=$(command -v bun)
cat > /etc/systemd/system/$SERVICE_NAME.service <<EOF
[Unit]
Description=TunPilot Proxy Node Management
After=network.target

[Service]
Type=simple
WorkingDirectory=$INSTALL_DIR
ExecStart=$BUN_PATH run src/index.ts
Restart=on-failure
RestartSec=5s
EnvironmentFile=$INSTALL_DIR/.env

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable "$SERVICE_NAME" --quiet
systemctl restart "$SERVICE_NAME"
sleep 2

# --- 验证 ---
if curl -fsSL --max-time 5 "http://localhost:3000/health" &>/dev/null; then
  info "TunPilot deployed on http://$PUBLIC_IP:3000"
else
  error "TunPilot failed to start. Check: journalctl -u $SERVICE_NAME"
fi

# --- 输出访问信息 ---
cat <<POST
$(tput setaf 2 2>/dev/null)TunPilot is live.$(tput sgr0 2>/dev/null)

  Web Admin:   http://$PUBLIC_IP:3000
  REST API:    http://$PUBLIC_IP:3000/api/v1
  Auth Token:  $AUTH_TOKEN

Paste the token into the web login page, or configure the CLI locally:

  bun install -g github:Buywatermelon/tunpilot
  tunpilot config set server http://$PUBLIC_IP:3000
  tunpilot config set token $AUTH_TOKEN
  tunpilot node list

Rotate the token by editing TUNPILOT_AUTH_TOKEN in $INSTALL_DIR/.env and
restarting: systemctl restart $SERVICE_NAME
POST
