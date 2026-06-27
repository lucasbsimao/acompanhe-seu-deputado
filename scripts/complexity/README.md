# complexity — diff-aware cognitive complexity gate

User-level tool consumed by the `plan-execution` skill. Runs ESLint with a
fixed complexity-only ruleset against the files modified in the current task,
then classifies each violation as either a _modified-function_ blocker or a
_pre-existing_ warning based on whether the violation's line falls inside the
diff.

## One-time setup

```bash
cd scripts/complexity
pnpm install
```

This installs `eslint@9`, `@typescript-eslint/parser`, and
`eslint-plugin-sonarjs` into the local `node_modules`. Self-contained — no
global pollution and no dependency on whichever project happens to be open.

## Usage

```bash
# Auto-discover files via `git diff HEAD --name-only` (default)
python3 scripts/complexity/check.py

# Or pass an explicit list
python3 scripts/complexity/check.py path/to/file.ts another.tsx
```

Exit codes:

- `0` — clean OR only pre-existing violations remain (proceed)
- `1` — at least one violation is on lines this task modified (blocker)
- `2` — setup error (run `npm install`, ensure inside a git repo)

## Ruleset

Aligned with the thresholds documented in
`~/.cursor/skills/plan-execution/SKILL.md` under "Cognitive complexity
(modified-function gate)". If you change either side, update both.

| Rule                           | Threshold                  |
| ------------------------------ | -------------------------- |
| `sonarjs/cognitive-complexity` | 15                         |
| `complexity` (cyclomatic)      | 15                         |
| `max-lines-per-function`       | 100 (skip blanks/comments) |
| `max-depth`                    | 4                          |

## Skip-listed paths

Tests, fixtures, stories, type-only declarations, build output, and
`apps/firebase/` are skipped silently — same shape as the typecheck hook in
`~/.cursor/hooks/typecheck.sh`.
