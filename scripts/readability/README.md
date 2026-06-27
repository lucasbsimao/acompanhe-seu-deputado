# readability — diff-aware ast-grep readability gate

User-level tool consumed by the `plan-execution` skill. Runs ast-grep with a
fixed readability ruleset against the files modified in the current task,
then classifies each match as either an _introduced_ blocker or a
_pre-existing_ warning based on whether the match's line range overlaps the
diff hunks.

## One-time setup

```bash
cd scripts/readability
pnpm install
```

This installs `@ast-grep/cli` into the local `node_modules`. The
`pnpm.onlyBuiltDependencies` allowlist in `package.json` permits ast-grep's
postinstall to fetch the platform-specific binary (Darwin / Linux / Windows)
without an interactive `pnpm approve-builds` step. Self-contained — no global
pollution and no dependency on whichever project happens to be open.

If `node_modules/.bin/ast-grep` exists but exits with `no such file`, the
postinstall was skipped. Re-run it manually:

```bash
cd scripts/readability/node_modules/.pnpm/@ast-grep+cli@*/node_modules/@ast-grep/cli && node postinstall.js
```

## Usage

```bash
# Auto-discover files via `git diff HEAD --name-only` (default)
python3 scripts/readability/check.py

# Or pass an explicit list
python3 scripts/readability/check.py path/to/file.ts another.tsx
```

Exit codes:

- `0` — clean OR only pre-existing matches remain (proceed)
- `1` — at least one match is on lines this task modified (blocker)
- `2` — setup error (run `pnpm install`, ensure inside a git repo)

## Ruleset

Aligned with the wording in
`~/.cursor/skills/plan-execution/SKILL.md` under "Readability (diff-aware
ast-grep gate)". If you change either side, update both.

| Rule                                   | Config               | Pattern flagged                                                                                                                           |
| -------------------------------------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `no-inline-call-as-call-arg-property`  | `sgconfig.yml`       | `outer({ key: inner(...) })`, also `new X()` and `await f()`; whitelist for `Number/String/Boolean/BigInt/Symbol/t/as`                    |
| `no-spread-of-call-in-call-arg-object` | `sgconfig.yml`       | `outer({ ...computeExtras() })` (also wrapped via `await`, `as`, parens)                                                                  |
| `no-conditional-spread-in-object`      | `sgconfig.yml`       | `{ ...(cond && { k: v }) }` in any object literal                                                                                         |
| `no-await-as-cast`                     | `sgconfig.yml`       | `(await x()) as T` and `await x() as T` — cast on awaited expression                                                                      |
| `no-ternary-spread-in-object`          | `sgconfig.yml`       | `...(cond ? { k: v } : {})` — ternary whose result is immediately spread; extract to a named const                                        |
| `no-as-cast-property-access`           | `sgconfig.yml`       | `(expr as T).prop` — property access directly on a cast; extract the cast to a named const first                                          |
| `no-inline-test-repo-instantiation`    | `sgconfig-tests.yml` | `new TestXxxRepository(db).method()` — test repo instantiated and called inline; hoist to `describe` scope and initialise in `beforeEach` |

## Skip-listed paths

Source files in test dirs (`/tests/`, `/__tests__/`, `/test/`), fixture, story,
and type-only declaration files, build output, and `apps/firebase/` are excluded
from the main `sgconfig.yml` scan.

Test files from those same paths are scanned in a _separate pass_ using
`sgconfig-tests.yml` (rules in `test-rules/`), so test-specific gates fire
without polluting the main ruleset.
