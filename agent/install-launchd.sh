#!/bin/bash
# 맥에 로그인할 때 에이전트를 켜고, AGENT_INTERVAL(기본 120초)마다 한 번씩 실행하도록 등록한다.
# 그리고 캘린더·메모·알림이 바뀌면 몇 초 안에 맥 데이터만 바로 보내는 감시 작업도 함께 등록한다.
set -euo pipefail

AGENT_DIR="$(cd "$(dirname "$0")" && pwd)"
NODE_BIN="$(command -v node || true)"
LABEL="com.schedulemg.agent"
WATCH_LABEL="com.schedulemg.agent.watch"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
WATCH_PLIST="$HOME/Library/LaunchAgents/$WATCH_LABEL.plist"
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

# 감시 작업은 계속 켜 두고, 캘린더·메모·알림 DB 파일이 바뀌면 곧바로 보낸다. 오류로 멈추면 launchd가 다시 켠다.
cat > "$WATCH_PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$WATCH_LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE_BIN</string>
    <string>--no-warnings</string>
    <string>$AGENT_DIR/index.mjs</string>
    <string>--watch-mac</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key>
  <dict>
    <key>SuccessfulExit</key><false/>
  </dict>
  <key>StandardOutPath</key><string>$LOG_DIR/agent.log</string>
  <key>StandardErrorPath</key><string>$LOG_DIR/agent.log</string>
</dict>
</plist>
EOF

register() {
  local domain="gui/$(id -u)"
  launchctl bootout "$domain/$1" 2>/dev/null || true
  # bootout은 끝날 때까지 기다려 주지 않아서, 바로 다시 등록하면 실패할 수 있다.
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    launchctl print "$domain/$1" >/dev/null 2>&1 || break
    sleep 0.5
  done
  launchctl bootstrap "$domain" "$2"
}
register "$LABEL" "$PLIST"
register "$WATCH_LABEL" "$WATCH_PLIST"
echo "등록했어요: $PLIST"
echo "등록했어요: $WATCH_PLIST"
echo "${INTERVAL}초마다 실행되고, 캘린더·메모·알림이 바뀌면 몇 초 안에 바로 보내요. 기록은 $LOG_DIR/agent.log 에 남아요."
