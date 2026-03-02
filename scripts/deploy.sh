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

# --- 生成配置 ---
if [ -f "$INSTALL_DIR/.env" ]; then
  warn "Existing .env found, keeping it"
  # 从现有 .env 读取 token
  MCP_TOKEN=$(grep -oP 'MCP_AUTH_TOKEN=\K.*' "$INSTALL_DIR/.env" || echo "")
else
  MCP_TOKEN=$(openssl rand -hex 32)
  cat > "$INSTALL_DIR/.env" <<EOF
TUNPILOT_PORT=3000
TUNPILOT_HOST=0.0.0.0
TUNPILOT_DB_PATH=$INSTALL_DIR/data/tunpilot.db
TUNPILOT_BASE_URL=http://$PUBLIC_IP:3000
MCP_AUTH_TOKEN=$MCP_TOKEN
EOF
  info ".env created"
fi

# --- 创建 systemd 服务 ---
BUN_PATH=$(command -v bun)
cat > /etc/systemd/system/$SERVICE_NAME.service <<EOF
[Unit]
Description=TunPilot MCP Server
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

# --- 输出连接命令 ---
echo ""
echo "Paste this in your terminal to connect Claude Code:"
echo ""
echo "  claude mcp add --transport http --header \"Authorization: Bearer $MCP_TOKEN\" --scope user tunpilot http://$PUBLIC_IP:3000/mcp"
echo ""
