#!/usr/bin/env python3
"""Diff-aware cognitive complexity gate for the plan-execution skill.

Discovers TypeScript files modified vs HEAD (or accepts an explicit file list),
runs ESLint with the local complexity-only config, and classifies each
violation as either a *modified-function* blocker or a *pre-existing*
warning, based on whether the violation's line falls inside this task's
diff hunks.

Exit codes:
    0  clean OR only pre-existing violations remain (not a blocker)
    1  at least one violation falls on lines this task modified (blocker)
    2  setup error (eslint not installed, not in a git repo, malformed output)

Usage:
    python3 check.py                  # auto-discover via `git diff HEAD`
    python3 check.py path/to/file.ts  # explicit file list
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from pathlib import Path

TOOL_DIR = Path(__file__).resolve().parent
ESLINT = TOOL_DIR / "node_modules" / ".bin" / "eslint"
CONFIG = TOOL_DIR / "eslint.config.cjs"

SOURCE_EXT_RE = re.compile(r"\.(ts|tsx|cts|mts)$")
GATE_RULE_IDS = frozenset(
    {
        "sonarjs/cognitive-complexity",
        "complexity",
        "max-lines-per-function",
        "max-depth",
    }
)
SKIP_BASENAME_RE = re.compile(
    r"\.(spec|test|e2e-spec|integration-spec|it-spec|fixture|fixtures|stories|d)\.(ts|tsx|cts|mts)$"
)
SKIP_DIR_FRAGMENTS = (
    "/test/",
    "/tests/",
    "/__tests__/",
    "/__fixtures__/",
    "/fixtures/",
    "/__mocks__/",
    "/.storybook/",
    "/node_modules/",
    "/dist/",
    "/build/",
    "/.next/",
    "/coverage/",
    "/apps/firebase/",
)
HUNK_HEADER_RE = re.compile(r"^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@")


def fail(message: str, code: int = 2) -> None:
    print(f"complexity-check: {message}", file=sys.stderr)
    sys.exit(code)


def discover_default_files(base: str = "HEAD") -> list[str]:
    try:
        out = subprocess.check_output(
            ["git", "diff", base, "--name-only", "--diff-filter=AM"],
            stderr=subprocess.DEVNULL,
        ).decode()
    except subprocess.CalledProcessError:
        return []
    return [line for line in out.splitlines() if SOURCE_EXT_RE.search(line)]


def filter_files(files: list[str]) -> list[str]:
    targets: list[str] = []
    for path in files:
        if not path or not os.path.isfile(path):
            continue
        normalized = "/" + path.lstrip("/")
        if SKIP_BASENAME_RE.search(os.path.basename(path)):
            continue
        if any(fragment in normalized for fragment in SKIP_DIR_FRAGMENTS):
            continue
        targets.append(path)
    return targets


def _parse_hunk_ranges(diff_text: str) -> list[tuple[int, int]]:
    file_ranges: list[tuple[int, int]] = []
    for line in diff_text.splitlines():
        match = HUNK_HEADER_RE.match(line)
        if not match:
            continue
        start = int(match.group(1))
        count = int(match.group(2)) if match.group(2) is not None else 1
        if count == 0:
            continue
        file_ranges.append((start, start + count - 1))
    return file_ranges


def collect_changed_ranges(files: list[str], base: str = "HEAD") -> dict[str, list[tuple[int, int]]]:
    ranges: dict[str, list[tuple[int, int]]] = {}
    for path in files:
        try:
            diff_out = subprocess.check_output(
                ["git", "diff", base, "-U0", "--", path],
                stderr=subprocess.DEVNULL,
            ).decode()
        except subprocess.CalledProcessError:
            continue
        file_ranges = _parse_hunk_ranges(diff_out)
        if file_ranges:
            ranges[os.path.abspath(path)] = file_ranges
    return ranges


def run_eslint(targets: list[str]) -> list[dict]:
    proc = subprocess.run(
        [
            str(ESLINT),
            "--no-config-lookup",
            "-c",
            str(CONFIG),
            "--format",
            "json",
            *targets,
        ],
        capture_output=True,
    )
    raw = proc.stdout.decode()
    if not raw.strip():
        # ESLint printed nothing — typically all files were ignored. Treat as clean.
        return []
    try:
        return json.loads(raw)
    except json.JSONDecodeError as exc:
        # When the config itself is broken ESLint prints a non-JSON error to stderr.
        stderr_tail = proc.stderr.decode().strip().splitlines()[-5:]
        fail(
            "failed to parse eslint output: "
            + str(exc)
            + "\nlast stderr lines:\n  "
            + "\n  ".join(stderr_tail)
        )
        return []  # unreachable, fail() exits


def _gate_messages(file_result: dict) -> list[dict]:
    # Filter out everything that isn't one of our four gate rules. This drops
    # spurious "Definition for rule X was not found" messages ESLint emits
    # when source files contain `eslint-disable` directives for rules
    # outside this minimal config.
    return [
        msg
        for msg in file_result.get("messages", [])
        if (msg.get("ruleId") or "") in GATE_RULE_IDS
    ]


def _build_span_map(messages: list[dict]) -> dict[int, int]:
    # Every gate rule targets a function-level construct and reports `line`
    # at the declaration line. Some rules (`max-lines-per-function`) carry
    # the real function span in `endLine`; others (`complexity`, `max-depth`)
    # collapse `endLine` to the declaration line. Take the max `endLine`
    # seen at each declaration line so every rule sharing that line uses
    # the widest known span.
    spans: dict[int, int] = {}
    for msg in messages:
        line = msg.get("line", 0)
        end_line = msg.get("endLine", line) or line
        spans[line] = max(spans.get(line, line), end_line)
    return spans


def _ranges_overlap(line: int, span_end: int, ranges: list[tuple[int, int]]) -> bool:
    return any(not (span_end < start or line > end) for start, end in ranges)


def classify(
    results: list[dict], changed: dict[str, list[tuple[int, int]]]
) -> tuple[list[tuple[str, int, str, str]], list[tuple[str, int, str, str]]]:
    modified: list[tuple[str, int, str, str]] = []
    preexisting: list[tuple[str, int, str, str]] = []
    for file_result in results:
        abs_path = file_result.get("filePath", "")
        rel = os.path.relpath(abs_path) if abs_path else "<unknown>"
        file_ranges = changed.get(abs_path, [])
        gate_messages = _gate_messages(file_result)
        span_for_line = _build_span_map(gate_messages)
        for msg in gate_messages:
            line = msg.get("line", 0)
            span_end = span_for_line.get(line, line)
            item = (rel, line, msg.get("ruleId") or "?", msg.get("message", ""))
            bucket = modified if _ranges_overlap(line, span_end, file_ranges) else preexisting
            bucket.append(item)
    return modified, preexisting


def render(rows: list[tuple[str, int, str, str]], title: str) -> str:
    if not rows:
        return ""
    rows = sorted(rows, key=lambda r: (r[0], r[1]))
    lines = [title]
    for path, line, rule, message in rows:
        lines.append(f"  {path}:{line}  [{rule}]  {message}")
    return "\n".join(lines)


def _ensure_setup_or_exit() -> None:
    if not ESLINT.is_file() or not os.access(ESLINT, os.X_OK):
        fail(
            "eslint not installed in the tool dir.\n"
            f"  Run once: cd {TOOL_DIR} && pnpm install"
        )
    if not CONFIG.is_file():
        fail(f"missing eslint.config.cjs in {TOOL_DIR}")


def _enter_git_root_or_exit() -> None:
    try:
        git_root = (
            subprocess.check_output(
                ["git", "rev-parse", "--show-toplevel"],
                stderr=subprocess.DEVNULL,
            )
            .decode()
            .strip()
        )
    except subprocess.CalledProcessError:
        fail("not inside a git repo")
        return  # unreachable, fail() exits
    os.chdir(git_root)


def _emit_report(
    modified: list[tuple[str, int, str, str]],
    preexisting: list[tuple[str, int, str, str]],
) -> int:
    if not modified and not preexisting:
        print("complexity-check: clean")
        return 0
    chunks: list[str] = []
    if modified:
        chunks.append(
            render(
                modified,
                "🛑 MODIFIED-FUNCTION VIOLATIONS (blockers — refactor before marking completed):",
            )
        )
    if preexisting:
        chunks.append(
            render(
                preexisting,
                'ℹ️  PRE-EXISTING VIOLATIONS (surface under "Pre-existing complexity:" in checkpoint; not blocking):',
            )
        )
    print("\n\n".join(chunks))
    return 1 if modified else 0


def _get_best_base() -> str:
    """Return 'HEAD' if there are uncommitted TypeScript changes, else '@{u}...HEAD' if it exists,
    falling back to 'main...HEAD' or 'HEAD'."""
    try:
        out = subprocess.check_output(
            ["git", "diff", "HEAD", "--name-only", "--diff-filter=AM"],
            stderr=subprocess.DEVNULL,
        ).decode()
        uncommitted = [line for line in out.splitlines() if SOURCE_EXT_RE.search(line)]
        if uncommitted:
            return "HEAD"
    except subprocess.CalledProcessError:
        pass

    # Try upstream
    try:
        subprocess.check_call(
            ["git", "rev-parse", "--verify", "@{u}"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        return "@{u}...HEAD"
    except (subprocess.CalledProcessError, FileNotFoundError):
        pass

    # Try common base branches
    for base in ["main", "master", "develop"]:
        try:
            subprocess.check_call(
                ["git", "rev-parse", "--verify", base],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            return f"{base}...HEAD"
        except subprocess.CalledProcessError:
            continue

    return "HEAD"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "files",
        nargs="*",
        help="Optional explicit file list. Defaults to auto-discovered files.",
    )
    parser.add_argument(
        "--base",
        help="Git ref to compare against (default: auto-detect HEAD vs upstream)",
    )
    args = parser.parse_args()

    _ensure_setup_or_exit()
    _enter_git_root_or_exit()

    base = args.base or _get_best_base()
    targets = filter_files(args.files or discover_default_files(base))
    if not targets:
        print(f"complexity-check: no source files to check (base: {base})")
        return 0

    changed = collect_changed_ranges(targets, base)
    results = run_eslint(targets)
    modified, preexisting = classify(results, changed)
    return _emit_report(modified, preexisting)


if __name__ == "__main__":
    sys.exit(main())
