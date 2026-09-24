#!/bin/bash
# 맥에 로그인할 때 에이전트를 켜고, AGENT_INTERVAL(기본 120초)마다 한 번씩 실행하도록 등록한다.
# 그리고 캘린더·메모·알림 DB 파일이 바뀌는 순간 맥 데이터만 바로 보내는 감시 작업도 함께 등록한다.
set -euo pipefail

AGENT_DIR="$(cd "$(dirname "$0")" && pwd)"
NODE_BIN="$(command -v node || true)"
LABEL="com.schedulemg.agent"
WATCH_LABEL="com.schedulemg.agent.watch"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
WATCH_PLIST="$HOME/Library/LaunchAgents/$WATCH_LABEL.plist"
INTERVAL="${AGENT_INTERVAL:-120}"
LOG_DIR="$HOME/.schedulemg"
GROUPS_DIR="$HOME/Library/Group Containers"

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

# SQLite는 새 내용을 먼저 -wal 파일에 쓰므로 본 파일과 -wal을 함께 지켜본다.
# 메모를 입력하는 동안에는 파일이 계속 바뀌니 5초에 한 번까지만 실행한다.
WATCH_PATHS=""
for f in \
  "$GROUPS_DIR/group.com.apple.calendar/Calendar.sqlitedb" \
  "$GROUPS_DIR/group.com.apple.calendar/Calendar.sqlitedb-wal" \
  "$GROUPS_DIR/group.com.apple.notes/NoteStore.sqlite" \
  "$GROUPS_DIR/group.com.apple.notes/NoteStore.sqlite-wal" \
  "$GROUPS_DIR/group.com.apple.usernoted/db2/db-wal"; do
  WATCH_PATHS="$WATCH_PATHS    <string>$f</string>
"
done

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
    <string>--mac-only</string>
  </array>
  <key>WatchPaths</key>
  <array>
$WATCH_PATHS  </array>
  <key>ThrottleInterval</key><integer>5</integer>
  <key>ProcessType</key><string>Background</string>
  <key>StandardOutPath</key><string>$LOG_DIR/agent.log</string>
  <key>StandardErrorPath</key><string>$LOG_DIR/agent.log</string>
</dict>
</plist>
EOF

for pair in "$LABEL:$PLIST" "$WATCH_LABEL:$WATCH_PLIST"; do
  launchctl bootout "gui/$(id -u)/${pair%%:*}" 2>/dev/null || true
  launchctl bootstrap "gui/$(id -u)" "${pair#*:}"
done
echo "등록했어요: $PLIST"
echo "등록했어요: $WATCH_PLIST"
echo "${INTERVAL}초마다 실행되고, 캘린더·메모·알림이 바뀌면 몇 초 안에 바로 보내요. 기록은 $LOG_DIR/agent.log 에 남아요."
