import assert from 'node:assert/strict';
import test from 'node:test';
import { canvasCardSchema } from '@/core/commands/schema';
import { planGroupRun, groupRunFingerprint } from './group-run';

const draft = (id: string, refs: string[] = []) =>
  canvasCardSchema.parse({
    id,
    kind: 'generation',
    type: 'image',
    name: id,
    modelId: 'gpt-image-2.5-flare',
    prompt: 'test',
    referenceCardIds: refs,
  });
test('group run orders live dependencies once and ignores concrete historical outputs', () => {
  const a = draft('a'),
    b = draft('b', ['a', 'old-output']);
  assert.deepEqual(planGroupRun({ a, b }, ['b', 'a', 'b']), ['a', 'b']);
});
test('group run rejects cycles and active jobs before submitting anything', () => {
  assert.throws(
    () =>
      planGroupRun({ a: draft('a', ['b']), b: draft('b', ['a']) }, ['a', 'b']),
    /cycle/
  );
  assert.throws(
    () => planGroupRun({ a: { ...draft('a'), status: 'processing' } }, ['a']),
    /busy/
  );
  assert.throws(() => planGroupRun({}, []), /empty/);
});
test('group run detects input edits without treating a new output pin as an input edit', () => {
  const a = draft('a');
  assert.equal(
    groupRunFingerprint(a),
    groupRunFingerprint({ ...a, pinnedOutputId: 'new' })
  );
  assert.notEqual(
    groupRunFingerprint(a),
    groupRunFingerprint({ ...a, prompt: 'changed' })
  );
});
