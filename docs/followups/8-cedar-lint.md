# Follow-ups for branch 8 — cedar-lint (VS Code extension)

## PR description

Adds an opt-in **policy simplifier** to the extension: with `cedar.policySimplifier.enabled`,
every policy document that validates is also passed to `cedar lint --json` (the Cedar CLI built
with the `analyze` feature, plus cvc5), and its findings — expressions that are never true, never
false or always an error in every request environment, dead branches, contradictions with the
schema's `@semantics` conventions — appear as warnings on the exact span. Validation itself is
unchanged; the simplifier runs in the background and never blocks it.

```json
{ "cedar.policySimplifier.enabled": true, "cedar.policySimplifier.command": "/path/to/cedar" }
```

```
policies.cedar:7:5  warning  `resource has request` is never true in every request environment  (cedar static-outcome)
```

## What this branch contains

- `src/simplify.ts`, `src/validate.ts`, `src/extension.ts`, `package.json` settings, README
  sections, changelog entry, fixtures under `testdata/`, `src/test/suite/simplify.test.ts`,
  `docs/plans/8-cedar-lint.md`.

## Review findings

- The extension trusts a byte-offset JSON contract with `cedar lint --json` and a stderr prefix
  contract (`the @semantics`) for assumption errors; neither is versioned. A `version` field in
  the JSON and a structured error line would make a mismatched CLI fail loudly.
- `npm test` needs a VS Code download (`@vscode/test-cli`); the suite is unit-level (recorded
  output) and could run under plain mocha without the editor.
- A policy file without a schema document silently gets no findings; a one-time info message
  would help.

## Divergences from the private source

- `plans/*.md` (four design notes) are replaced by `docs/plans/8-cedar-lint.md`.
- `CHANGELOG.md`: one "Unreleased" entry describing the shipped behaviour instead of four
  bullets narrating the earlier separate helper.
- `README.md`: the pointers to the private plan files by number now point at the Cedar
  repository's `docs/plans/` (branches 6 and 7); the note that the CLI must come from a
  particular fork revision is dropped. `README.md` and `src/simplify.ts` say "the Cedar
  repository" where the source says "the Cedar fork".

## Suggested follow-ups

- The JSON version field; a mocha-only test entry point.
