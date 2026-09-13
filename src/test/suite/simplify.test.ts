// Copyright Cedar Contributors
// SPDX-License-Identifier: Apache-2.0

import * as assert from 'assert';
import * as vscode from 'vscode';
import {
  byteOffsetToCharOffset,
  parseSimplifierOutput,
  simplifierDiagnostics,
  SIMPLIFIER_CODE,
} from '../../simplify';

suite('Policy Simplifier Test Suite', () => {
  const policy =
    'permit(principal, action, resource) when {\n' +
    '  (principal.a && principal.b) || (principal.a && !principal.a)\n' +
    '};\n';

  test('parses the helper output', () => {
    // recorded from `cedar-symcc-simplify` on the policy above: the `a`
    // inside `!a`
    const findings = parseSimplifierOutput(
      '[{"offset":94,"length":11,"kind":"never-false","message":"this expression is always true in every request environment, given what is evaluated before it"}]'
    );
    assert.strictEqual(findings.length, 1);
    assert.strictEqual(findings[0].kind, 'never-false');
    assert.strictEqual(policy.substring(94, 94 + 11), 'principal.a');
    assert.strictEqual(policy.charAt(93), '!');
  });

  test('converts byte offsets to character offsets', () => {
    const text = 'permit(principal, action, resource) when { "ééé" == "ééé" && principal.a };';
    // `principal.a` starts at UTF-16 index 61; the helper counts UTF-8 bytes
    const charOffset = text.indexOf('principal.a');
    const byteOffset = Buffer.from(text.substring(0, charOffset), 'utf8').length;
    assert.notStrictEqual(byteOffset, charOffset);
    assert.strictEqual(byteOffsetToCharOffset(text, byteOffset), charOffset);
    assert.strictEqual(byteOffsetToCharOffset(text, 0), 0);
    assert.strictEqual(
      byteOffsetToCharOffset(text, 10_000),
      text.length
    );
  });

  test('rejects malformed output', () => {
    assert.throws(() => parseSimplifierOutput('{"not": "an array"}'));
    assert.throws(() => parseSimplifierOutput('[{"offset": "x"}]'));
    assert.throws(() => parseSimplifierOutput('not json'));
  });

  test('converts findings into warnings on the document', async () => {
    const document = await vscode.workspace.openTextDocument({
      language: 'cedar',
      content: policy,
    });
    const diagnostics = simplifierDiagnostics(document, [
      {
        offset: 94,
        length: 11,
        kind: 'never-false',
        message: 'always true',
      },
    ]);
    assert.strictEqual(diagnostics.length, 1);
    const d = diagnostics[0];
    assert.strictEqual(d.severity, vscode.DiagnosticSeverity.Warning);
    assert.strictEqual(d.code, SIMPLIFIER_CODE);
    assert.strictEqual(d.source, 'Cedar');
    assert.strictEqual(d.range.start.line, 1);
    assert.strictEqual(document.getText(d.range), 'principal.a');
  });
});
