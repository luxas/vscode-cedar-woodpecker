# Cedar policy language for Visual Studio Code

The Cedar policy language extension for Visual Studio Code supports syntax highlighting, formatting, and validation.  Install from the [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=cedar-policy.vscode-cedar) or by [searching within VS Code](https://code.visualstudio.com/docs/editor/extension-gallery#_search-for-an-extension).

Cedar is an open-source language for writing authorization policies and making authorization decisions based on those policies. Visit the [Cedar policy language reference guide](https://docs.cedarpolicy.com/) for the documentation and the language specification.

**Note:** The release version of this extension uses Cedar SDK 4.x.

## Features

### Cedar policy language

Files matching `*.cedar` are detected as a Cedar policy language and receive syntax highlighting.  Validation is performed on document open, document save, during formatting, and via context menu.  IntelliSense for entity types and attributes.  Formatting can disabled per file using a leading comment line of `// @formatter:off`.  Policy navigation using Outline or Breadcrumb.  "Go to Definition" on Cedar entity types and action names.  Policies are exportable to their JSON representation (`*.cedar.json`) and receive syntax highlighting.

![Cedar policy validation and navigation](https://raw.githubusercontent.com/cedar-policy/vscode-cedar/main/docs/marketplace/cedar_policy.gif)

### Cedar schema

Files named `cedarschema` or matching `*.cedarschema` are detected as a Cedar schema and receive additional syntax highlighting.  Validation is performed on document open, document save, and via context menu.  When a Cedar schema file is detected or configured in [Settings](#settings), additional validation of Cedar files uses that schema.  Entity type navigation using Outline or Breadcrumb.  "Go to Definition" on Cedar entity types and action names.  The Cedar schema JSON format is supported for files named `cedarschema.json` or matching `*.cedarschema.json`.

![Cedar schema validation and navigation](https://raw.githubusercontent.com/cedar-policy/vscode-cedar/main/docs/marketplace/cedar_schema.gif)

### Cedar entities

Files named `cedarentities.json` or matching `*.cedarentities.json` are detected as Cedar entities and receive additional syntax highlighting.  Validation is performed against a Cedar schema on document open, document save, and via context menu.  IntelliSense for entity types and add entity via context menu.  Entity navigation using Outline or Breadcrumb.  "Go to Definition" on Cedar entity types.

![Cedar entities validation and navigation](https://raw.githubusercontent.com/cedar-policy/vscode-cedar/main/docs/marketplace/cedar_entities.gif)

### Cedar CLI

Various commands of the `cedar` CLI take JSON formatted file inputs.  Files named `cedarauth.json` or matching `*.cedarauth.json` are detected as input to the `--request-json` option for the `authorize` command.  Files named `cedartemplatelinks.json` or matching `*.cedartemplatelinks.json` are detected as input to the `--template-linked` option for the `authorize` command.  These files receive additional syntax highlighting.

### Markdown

Syntax highlighting of `cedar` and `cedarschema` code fence blocks within markdown (`*.md`) files.

![Cedar markdown syntax highlighting](https://raw.githubusercontent.com/cedar-policy/vscode-cedar/main/docs/marketplace/cedar_markdown.png)

### Command Palette

To see all available Cedar commands, open the [Command Palette](https://code.visualstudio.com/docs/getstarted/userinterface#_command-palette) and type **Cedar**.

![Cedar Command Palette](https://raw.githubusercontent.com/cedar-policy/vscode-cedar/main/docs/marketplace/cedar_commands.png)

### Settings

Sample `.vscode/settings.json` which enables `editor` settings for `cedar` files, sets a workspace level Cedar schema, and enables auto detection of folder level Cedar schema files.

```json
{
  "[cedar]": {
    "editor.tabSize": 2,
    "editor.wordWrapColumn": 80,
    "editor.formatOnSave": true,
    "editor.defaultFormatter": "cedar-policy.vscode-cedar",
  },
  "cedar.schemaFile": "tinytodo.cedarschema",
  "cedar.autodetectSchemaFile": true,
}
```

### Policy simplifier (opt-in)

With `cedar.policySimplifier.enabled`, policies that validate are also checked with the Cedar
symbolic evaluator: an expression that can never be true, never be false, or always errors — in
every request environment of the schema, given what is evaluated before it — gets a warning
(code `static-outcome`), pinpointing the innermost such expression rather than everything it
implies. In `(a && b) || (a && !a)` the warning lands on the `a` inside `!a` — always true once
the `&&` before it has evaluated — and `!a` and the dead branch are implied. A policy whose whole
condition is statically determined (`when { false }`) is reported as a whole; a policy without a
`when`/`unless` is not. Literals you wrote are not reported. Nor is a `has`/`hasTag` guard that a
later access relies on — an optional attribute, or any tag, accessed in the right operand of the
`&&` or the `then` branch of the `if` the guard heads — even when the [semantic
assumptions](#semantic-assumptions) make it always true: strict validation needs that guard, so the
warning would only invite a change the validator rejects. A guard nothing relies on (`principal
has nick && principal.active`) is still reported when always true, and any guard is when never
true.

This needs the Cedar CLI, since the symbolic evaluator drives an SMT solver: the extension runs
`cedar lint --json`, which the CLI has when built with the experimental `analyze` feature (the
`cedar-policy-cli-experimental-<target>` release archive, or `cargo build --release --features
analyze` in `cedar-policy-cli` of the Cedar repository — the binary lands in `target/release/cedar`).
Install [cvc5](https://cvc5.github.io/) too, and set the settings below if either is not on
`PATH`:

```json
{
  "cedar.policySimplifier.enabled": true,
  "cedar.policySimplifier.command": "/path/to/cedar",
  "cedar.policySimplifier.cvc5Path": "/path/to/cvc5"
}
```

#### Semantic assumptions

The simplifier only knows what the schema says. Conventions of the authorizer that the schema
cannot express — "`resource.request` is only populated for write requests" — are stated in the
schema as `@semantics("<Cedar boolean expression>")` annotations on a namespace, an entity type
or an action, and assumed true in every request environment. An expression that is statically
false *under those assumptions* is then reported like any other:

```cedarschema
namespace k8s {
  @semantics("if resource is core::secrets && (action == k8s::Action::\"get\" || action == k8s::Action::\"list\") then !(resource has request) else true")
  entity User { groups: Set<String> };
  …
}
```

Rules:

- **Global.** Wherever the annotation is written, the assumption holds for every request; the
  placement is only organisational. Several annotations are conjoined.
- **Well typed everywhere.** The expression must typecheck as a boolean in *every* request
  environment of the schema, so guard it with `<var> is <type>` (and `<var> has <attr>` for
  optional attributes) as above. The helper reports the annotation and the environment otherwise.
- **Write implications as `if A then B else true`**, not `!(A) || B` — it reads as the rule it is.
- An assumption set that is unsatisfiable in some environment is an error, since everything
  there would be vacuously determined.

Rejected annotations are reported once per session as a warning; the simplifier then reports
nothing until the schema is fixed. Local invariants of common types (an expression over `this`,
instantiated wherever the type is used) and a reference to a separate semantics file are planned;
see `docs/plans/6-semantic-assumptions.md` in the Cedar repository.

## Troubleshooting

Submit bug reports and feature requests [on our GitHub repository](https://github.com/cedar-policy/vscode-cedar/issues). For potential security issues, visit [reporting a vulnerability](https://github.com/cedar-policy/vscode-cedar/security/policy) for instructions.
