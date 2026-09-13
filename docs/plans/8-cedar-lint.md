# Plan 8 — The policy simplifier in the VS Code extension

## Goal

The Cedar VS Code extension validates policies against a schema (in WASM) and marks a policy
that is statically false. Two things it cannot say: *why* a policy is false, and that a branch
inside a live policy is dead — `(a && b) || (a && !a)` validates although its second disjunct can
never be true. And nothing knows the authorizer's conventions, such as `resource.request` being
populated only for write requests, which make a validating read policy statically false.

The Cedar CLI's `cedar lint` (the `analyze` feature; branches 5–8 of the Cedar repository)
answers both with the symbolic evaluator: it reports, per policy, the innermost expression that
is never true, never false or always an error in every request environment, under the schema's
`@semantics("<Cedar expression>")` assumptions. This branch adds an opt-in *policy simplifier*
to the extension that runs `cedar lint --json` after validation and shows its findings as
warnings.

## Design

- **Split by process.** The extension runs Cedar in WASM, but the symbolic evaluator needs an
  SMT solver process (cvc5), which WASM cannot spawn; so the analysis is the CLI's, and the
  extension is its client.
- **Settings.** `cedar.policySimplifier.enabled` (default off), `cedar.policySimplifier.command`
  (the Cedar CLI, default `cedar`; must be built with `analyze`), `cedar.policySimplifier.cvc5Path`
  (exported as `CVC5`).
- **When it runs** (`src/validate.ts`). Only on a policy document that validated against its
  schema document. It runs in the background — the solver takes time — keyed by document
  version: a run in flight for the same version is not repeated, and a result for a version the
  document has moved past is dropped. Findings are appended to the validation diagnostics.
- **How it runs** (`src/simplify.ts`). `spawn(command, ['lint', '--schema', schemaPath, '--json'])`
  with the policies on stdin and `CVC5` in the environment; stdout is the findings array
  `{offset, length, kind, message}` with *byte* offsets, converted to character positions with
  the document's text. A non-zero exit is a failure. A missing or failing CLI is reported once
  per session, not on every validation.
- **Semantic assumptions.** They travel inside the schema the extension already hands to the
  CLI, so nothing is configured. A rejected annotation (parse error, not well typed in some
  environment, unsatisfiable set) reaches stderr as a line starting with `the @semantics`; the
  extension shows it once per session as a warning naming the annotation's declaration and
  reports no findings until the schema is fixed.
- **Kept guards.** A `has`/`hasTag` guard that a later access relies on is never reported as
  always true — the CLI decides that (Cedar branch 7); the extension only renders.
- **Diagnostics.** Source `cedar`, code `static-outcome`, severity warning, the CLI's message.
- **Settings changes** re-validate the open Cedar documents, bypassing the cache, so warnings
  appear or disappear immediately.

## Files

- `src/simplify.ts` (new), `src/validate.ts`, `src/extension.ts`, `package.json`, `README.md`
  ("Policy simplifier (opt-in)" and "Semantic assumptions"), `CHANGELOG.md`,
  `testdata/policy-simplifier/*` and `testdata/kept-guard/*` (fixtures for manual runs),
  `src/test/suite/simplify.test.ts` (parses recorded CLI output: the output parsing, the
  byte-to-character conversion, the diagnostics conversion; no cvc5 needed).

## Verification

`npm run compile && npm run lint && npm test`; a manual run with a `cedar` built with
`--features analyze` and cvc5 installed on `testdata/policy-simplifier/foo.cedar` (several
findings) and `testdata/kept-guard/kept-guard.cedar` (exactly one: the guard nothing relies on).

## History

Merged from the extension's design note "Policy Simplifier and Semantic Linter", its
implementation notes, and the pointer notes for semantic assumptions and kept guards. The first
implementation ran a separate `cedar-symcc-simplify` helper; the CLI command replaced it before
publication, so the extension only ever knows `cedar lint`.
