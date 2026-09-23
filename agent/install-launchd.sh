#!/bin/bash
# 맥에 로그인할 때 에이전트를 켜고, AGENT_INTERVAL(기본 120초)마다 한 번씩 실행하도록 등록한다.
set -euo pipefail

AGENT_DIR="$(cd "$(dirname "$0")" && pwd)"
NODE_BIN="$(command -v node || true)"
LABEL="com.schedulemg.agent"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
INTERVAL="${AGENT_INTERVAL:-120}"
LOG_DIR="$HOME/.schedulemg"

if [ -z "$NODE_BIN" ]; then
  echo "node를 찾지 못했어요. Node.js 22.5 이상을 설치한 뒤 다시 실행하세요."
  exit 1
fi
if [ ! -f "$AGENT_DIR/.env" ]; then
  echo "agent/.env 가 없어요. 먼저 만드세요:  cp agent/.env.example agent/.env"
  exit 1
fi

mkdir -p "$HOME/Library/LaunchAgents" "$LOG_DIR"
cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE_BIN</string>
    <string>--no-warnings</string>
    <string>$AGENT_DIR/index.mjs</string>
  </array>
  <key>StartInterval</key><integer>$INTERVAL</integer>
  <key>RunAtLoad</key><true/>
  <key>ProcessType</key><string>Background</string>
  <key>StandardOutPath</key><string>$LOG_DIR/agent.log</string>
  <key>StandardErrorPath</key><string>$LOG_DIR/agent.log</string>
</dict>
</plist>
EOF

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "등록했어요: $PLIST"
echo "${INTERVAL}초마다 실행되고, 기록은 $LOG_DIR/agent.log 에 남아요."
