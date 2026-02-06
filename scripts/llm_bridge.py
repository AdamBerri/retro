#!/usr/bin/env python3
"""
LLM bridge stub.
Reads JSON on stdin and writes JSON on stdout.
Replace with your provider integration.
"""

import json
import sys


def main() -> int:
    try:
        payload = json.load(sys.stdin)
    except json.JSONDecodeError:
        sys.stderr.write("Invalid JSON input\n")
        return 1

    mode = payload.get("mode")
    if mode == "clarify":
        response = {
            "title": "LLM not configured",
            "message": "Set LLM_CMD to a real LLM bridge to generate clarifying questions.",
            "questions": [],
        }
        sys.stdout.write(json.dumps(response))
        return 0

    if mode == "compile":
        sys.stderr.write("LLM bridge not configured for compile.\n")
        return 1

    sys.stderr.write(f"Unknown mode: {mode}\n")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
