#!/usr/bin/env python3
"""Diff-aware readability gate for the plan-execution skill.

Discovers TypeScript files modified vs HEAD (or accepts an explicit file list),
runs ast-grep with the local readability ruleset, and classifies each match
as either an *introduced* blocker or a *pre-existing* warning based on whether
the match's line range overlaps this task's diff hunks.

Exit codes:
    0  clean OR only pre-existing matches remain (not a blocker)
    1  at least one match falls on lines this task modified (blocker)
    2  setup error (ast-grep not installed, not in a git repo, malformed output)

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
ASTGREP = TOOL_DIR / "node_modules" / ".bin" / "ast-grep"
SGCONFIG = TOOL_DIR / "sgconfig.yml"
SGCONFIG_TESTS = TOOL_DIR / "sgconfig-tests.yml"

SOURCE_EXT_RE = re.compile(r"\.(ts|tsx|cts|mts)$")
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

# Fragments that are never scanned regardless of whether the file is a test file
NEVER_SKIP_FRAGMENTS = (
    "/node_modules/",
    "/dist/",
    "/build/",
    "/.next/",
    "/coverage/",
    "/apps/firebase/",
)


def fail(message: str, code: int = 2) -> None:
    print(f"readability-check: {message}", file=sys.stderr)
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


def filter_test_files(files: list[str]) -> list[str]:
    """Return test files that are excluded by filter_files but should be scanned by the test ruleset."""
    targets: list[str] = []
    for path in files:
        if not path or not os.path.isfile(path):
            continue
        if not SOURCE_EXT_RE.search(path):
            continue
        normalized = "/" + path.lstrip("/")
        if any(frag in normalized for frag in NEVER_SKIP_FRAGMENTS):
            continue
        basename = os.path.basename(path)
        if SKIP_BASENAME_RE.search(basename) or any(
            frag in normalized for frag in ("/test/", "/tests/", "/__tests__/")
        ):
            targets.append(path)
    return targets


def run_astgrep(targets: list[str], config: Path = SGCONFIG) -> list[dict]:
    proc = subprocess.run(
        [
            str(ASTGREP),
            "scan",
            "-c",
            str(config),
            "--json=stream",
            *targets,
        ],
        capture_output=True,
    )
    raw = proc.stdout.decode().strip()
    if not raw:
        return []
    matches: list[dict] = []
    try:
        parsed = json.loads(raw)
        if isinstance(parsed, list):
            return parsed
        if isinstance(parsed, dict):
            return [parsed]
    except json.JSONDecodeError:
        # Stream mode: NDJSON, one match per line.
        pass
    for line in raw.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            matches.append(json.loads(line))
        except json.JSONDecodeError as exc:
            stderr_tail = proc.stderr.decode().strip().splitlines()[-5:]
            fail(
                "failed to parse ast-grep output: "
                + str(exc)
                + "\nlast stderr lines:\n  "
                + "\n  ".join(stderr_tail)
            )
    return matches


def _ranges_overlap(start: int, end: int, ranges: list[tuple[int, int]]) -> bool:
    return any(not (end < r_start or start > r_end) for r_start, r_end in ranges)


def _extract_line_range(match: dict) -> tuple[int, int]:
    # ast-grep --json=stream emits 0-indexed `range.start.line` /
    # `range.end.line`. Add 1 to align with `git diff`'s 1-indexed hunk headers.
    rng = match.get("range") or {}
    start_obj = rng.get("start") or {}
    end_obj = rng.get("end") or {}
    start = (start_obj.get("line", 0) or 0) + 1
    end = (end_obj.get("line", start - 1) or (start - 1)) + 1
    if end < start:
        end = start
    return start, end


def classify(
    matches: list[dict], changed: dict[str, list[tuple[int, int]]]
) -> tuple[list[tuple[str, int, str, str]], list[tuple[str, int, str, str]]]:
    introduced: list[tuple[str, int, str, str]] = []
    preexisting: list[tuple[str, int, str, str]] = []
    for m in matches:
        file_path = m.get("file") or m.get("filePath") or ""
        abs_path = os.path.abspath(file_path) if file_path else ""
        rel = os.path.relpath(abs_path) if abs_path else "<unknown>"
        start, end = _extract_line_range(m)
        rule_id = m.get("ruleId") or m.get("rule_id") or "?"
        raw_message = m.get("message") or ""
        first_line = raw_message.splitlines()[0].strip() if raw_message else ""
        item = (rel, start, rule_id, first_line)
        bucket = (
            introduced
            if _ranges_overlap(start, end, changed.get(abs_path, []))
            else preexisting
        )
        bucket.append(item)
    return introduced, preexisting


def render(rows: list[tuple[str, int, str, str]], title: str) -> str:
    if not rows:
        return ""
    rows = sorted(rows, key=lambda r: (r[0], r[1]))
    lines = [title]
    for path, line, rule, message in rows:
        lines.append(f"  {path}:{line}  [{rule}]  {message}")
    return "\n".join(lines)


def _ensure_setup_or_exit() -> None:
    if not ASTGREP.is_file() or not os.access(ASTGREP, os.X_OK):
        fail(
            "ast-grep not installed in the tool dir.\n"
            f"  Run once: cd {TOOL_DIR} && pnpm install"
        )
    if not SGCONFIG.is_file():
        fail(f"missing sgconfig.yml in {TOOL_DIR}")


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
    introduced: list[tuple[str, int, str, str]],
    preexisting: list[tuple[str, int, str, str]],
) -> int:
    if not introduced and not preexisting:
        print("readability-check: clean")
        return 0
    chunks: list[str] = []
    if introduced:
        chunks.append(
            render(
                introduced,
                "🛑 INTRODUCED READABILITY VIOLATIONS (blockers — refactor before marking completed):",
            )
        )
    if preexisting:
        chunks.append(
            render(
                preexisting,
                'ℹ️  PRE-EXISTING READABILITY VIOLATIONS (surface under "Pre-existing readability:" in checkpoint; not blocking):',
            )
        )
    print("\n\n".join(chunks))
    return 1 if introduced else 0


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
    raw_files = args.files or discover_default_files(base)
    targets = filter_files(raw_files)
    test_targets = filter_test_files(raw_files)

    if not targets and not test_targets:
        print(f"readability-check: no source files to check (base: {base})")
        return 0

    changed: dict[str, list[tuple[int, int]]] = {}
    changed.update(collect_changed_ranges(targets, base))
    changed.update(collect_changed_ranges(test_targets, base))

    matches: list[dict] = []
    if targets:
        matches += run_astgrep(targets)
    if test_targets and SGCONFIG_TESTS.is_file():
        matches += run_astgrep(test_targets, SGCONFIG_TESTS)

    introduced, preexisting = classify(matches, changed)
    return _emit_report(introduced, preexisting)


if __name__ == "__main__":
    sys.exit(main())
