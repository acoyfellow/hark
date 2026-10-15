#!/usr/bin/env bash
cd "$(dirname "$0")/.."
tail -n "${1:-40}" -F .wrangler/logs/dev.log | grep --line-buffered -E '"trace"|"event":"hark.turn"|ERROR|Error|✘'
