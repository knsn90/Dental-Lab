#!/bin/bash
export PATH="/usr/local/bin:$PATH"
cd "/Users/saber/Desktop/Dental Software/.claude/worktrees/heuristic-allen"
exec node /usr/local/lib/node_modules/npm/bin/npx-cli.js expo start --web --port 19006
