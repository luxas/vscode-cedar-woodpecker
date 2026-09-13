// Copyright Cedar Contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * The policy simplifier: warnings for expressions that are statically true
 * or false (or always an error), pinpointed with the symbolic evaluator.
 *
 * The symbolic evaluator needs an SMT solver process (cvc5), which the
 * extension's WASM build cannot run, so the analysis lives in the Cedar CLI
 * built with the `analyze` feature: `cedar lint --json` (the Cedar repository's
 * `cedar-policy-cli`, over its `cedar-policy-symcc` crate). It reads the
 * schema and the policy document and prints a JSON array of findings with
 * byte offsets into the document. Opt-in: `cedar.policySimplifier.enabled`.
 */

import * as vscode from 'vscode';
import { execFile } from 'node:child_process';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';

export const SIMPLIFIER_CODE = 'static-outcome';
const SOURCE_CEDAR = 'Cedar';
const TIMEOUT_MS = 60_000;

/** One finding of the helper command. */
export type SimplifierFinding = {
  offset: number;
  length: number;
  kind: 'never-true' | 'never-false' | 'always-error';
  message: string;
};

export type SimplifierSettings = {
  enabled: boolean;
  command: string;
  cvc5Path: string;
};

export const simplifierSettings = (
  scope?: vscode.ConfigurationScope
): SimplifierSettings => {
  const config = vscode.workspace.getConfiguration(
    'cedar.policySimplifier',
    scope
  );
  return {
    enabled: config.get<boolean>('enabled', false),
    command: config.get<string>('command', 'cedar'),
    cvc5Path: config.get<string>('cvc5Path', ''),
  };
};

/**
 * The helper reports byte offsets into the UTF-8 document; VS Code positions
 * count UTF-16 code units. Converts one to the other.
 */
export const byteOffsetToCharOffset = (
  text: string,
  byteOffset: number
): number => {
  const bytes = Buffer.from(text, 'utf8');
  return bytes.subarray(0, Math.min(byteOffset, bytes.length)).toString('utf8')
    .length;
};

/**
 * Converts the helper's findings into diagnostics on `document`: warnings
 * with source `Cedar` and code `static-outcome`.
 */
export const simplifierDiagnostics = (
  document: vscode.TextDocument,
  findings: SimplifierFinding[]
): vscode.Diagnostic[] => {
  const text = document.getText();
  return findings.map((finding) => {
    const start = byteOffsetToCharOffset(text, finding.offset);
    const end = byteOffsetToCharOffset(
      text,
      finding.offset + Math.max(finding.length, 1)
    );
    const range = new vscode.Range(
      document.positionAt(start),
      document.positionAt(Math.max(end, start + 1))
    );
    const diagnostic = new vscode.Diagnostic(
      range,
      finding.message,
      vscode.DiagnosticSeverity.Warning
    );
    diagnostic.source = SOURCE_CEDAR;
    diagnostic.code = SIMPLIFIER_CODE;
    return diagnostic;
  });
};

/** Parses the helper's stdout. Throws on anything but a findings array. */
export const parseSimplifierOutput = (stdout: string): SimplifierFinding[] => {
  const parsed: unknown = JSON.parse(stdout);
  if (!Array.isArray(parsed)) {
    throw new Error('the simplifier did not print a findings array');
  }
  return parsed.map((item) => {
    if (
      typeof item !== 'object' ||
      item === null ||
      typeof item.offset !== 'number' ||
      typeof item.length !== 'number' ||
      typeof item.message !== 'string' ||
      typeof item.kind !== 'string'
    ) {
      throw new Error('the simplifier printed a malformed finding');
    }
    return item as SimplifierFinding;
  });
};

let reportedSpawnFailure = false;
let reportedAnalysisFailure = false;
let reportedSemanticsFailure = false;

/**
 * Runs the helper on `policyText` against the schema in `schemaDoc` and
 * returns the findings; an empty list when the helper cannot run. A missing
 * helper is reported once per session; an analysis failure (a timeout, a
 * crash on some document) is logged, and reported once per session too.
 */
export const runSimplifier = async (
  settings: SimplifierSettings,
  schemaDoc: vscode.TextDocument,
  policyText: string
): Promise<SimplifierFinding[]> => {
  let tmpDir: string | undefined;
  try {
    // the schema may be unsaved: hand the helper its current text
    const suffix =
      schemaDoc.languageId === 'cedarschema' ? '.cedarschema' : '.json';
    tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'vscode-cedar-'));
    const schemaPath = path.join(tmpDir, `schema${suffix}`);
    await fs.promises.writeFile(schemaPath, schemaDoc.getText(), 'utf8');
    const env = { ...process.env };
    if (settings.cvc5Path) {
      env.CVC5 = settings.cvc5Path;
    }
    const stdout = await new Promise<string>((resolve, reject) => {
      const child = execFile(
        settings.command,
        ['lint', '--schema', schemaPath, '--json'],
        { env, timeout: TIMEOUT_MS, maxBuffer: 16 * 1024 * 1024 },
        (error, stdout, stderr) => {
          if (error) {
            const spawnFailure =
              (error as NodeJS.ErrnoException).code === 'ENOENT';
            reject(
              Object.assign(new Error(stderr.trim() || error.message), {
                spawnFailure,
              })
            );
          } else {
            resolve(stdout);
          }
        }
      );
      child.stdin?.end(policyText);
    });
    return parseSimplifierOutput(stdout);
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    const spawnFailure =
      typeof e === 'object' &&
      e !== null &&
      (e as { spawnFailure?: boolean }).spawnFailure === true;
    if (spawnFailure) {
      if (!reportedSpawnFailure) {
        reportedSpawnFailure = true;
        vscode.window.showWarningMessage(
          `Cedar policy simplifier: cannot run \`${settings.command}\` (${reason}). ` +
            'Install the Cedar CLI built with the `analyze` feature (`cedar lint`) and cvc5, set cedar.policySimplifier.command, ' +
            'or turn off cedar.policySimplifier.enabled. Reported once per session.'
        );
      }
    } else if (/^the @semantics /.test(reason)) {
      // A semantic assumption in the schema is rejected by the helper: it does
      // not parse, does not typecheck in some request environment, or the set
      // is unsatisfiable. Every such helper message starts with `the
      // @semantics` and names the annotation's declaration.
      console.error(`Cedar policy simplifier: ${reason}`);
      if (!reportedSemanticsFailure) {
        reportedSemanticsFailure = true;
        vscode.window.showWarningMessage(
          `Cedar policy simplifier: ${reason} Fix the @semantics annotation in the schema ` +
            '(see the README, "Semantic assumptions"). Reported once per session.'
        );
      }
    } else {
      console.error(`Cedar policy simplifier failed: ${reason}`);
      if (!reportedAnalysisFailure) {
        reportedAnalysisFailure = true;
        vscode.window.showWarningMessage(
          `Cedar policy simplifier failed: ${reason}. Further failures are logged to the console.`
        );
      }
    }
    return [];
  } finally {
    if (tmpDir) {
      await fs.promises.rm(tmpDir, { recursive: true, force: true });
    }
  }
};
