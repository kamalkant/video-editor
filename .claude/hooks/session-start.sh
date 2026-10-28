#!/bin/bash
# Claude Code cloud sessions: install dependencies and start the video editor
# (video.viplay.in) with `npm run dev` on http://127.0.0.1:3000.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-.}"

# Run the install only if a listed file has changed since the install last succeeded
hashes=node_modules/.session-start.sha256
if ! sha256sum --check --status "$hashes" 2>/dev/null; then
  # Delete the old hashes first, so a failed install runs again next time
  rm -f "$hashes"
  npm install --no-audit --no-fund
  sha256sum .claude/hooks/session-start.sh package.json package-lock.json 2>/dev/null > "$hashes" || rm -f "$hashes"
fi

# Start the dev server once per container; resume/clear/compact find it already up
if ! curl -s -o /dev/null --max-time 2 http://127.0.0.1:3000/; then
  mkdir -p .next
  nohup npm run dev > .next/session-dev.log 2>&1 < /dev/null &
  disown
  # Wait (up to 60s) for it to answer, so the session starts with the app reachable
  for _ in $(seq 1 60); do
    curl -s -o /dev/null --max-time 2 http://127.0.0.1:3000/ && break
    sleep 1
  done
fi
echo "Video editor dev server: http://127.0.0.1:3000 (log: .next/session-dev.log)"
