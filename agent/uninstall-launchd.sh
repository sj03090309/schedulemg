#!/bin/bash
# 자동 실행 등록을 해제한다. 수집 캐시(~/.schedulemg)는 남겨 둔다.
set -euo pipefail
LABEL="com.schedulemg.agent"
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
rm -f "$HOME/Library/LaunchAgents/$LABEL.plist"
echo "자동 실행을 껐어요."
