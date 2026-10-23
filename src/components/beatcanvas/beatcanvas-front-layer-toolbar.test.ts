import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(
  new URL('./beatcanvas-front-layer.tsx', import.meta.url),
  'utf8'
);

test('canvas toolbar stays at the bottom and hides while the composer is open', () => {
  assert.match(
    source,
    /\{!activeDraftCard \? \(\s*<div\s+className=\{cn\(\s*'pointer-events-auto absolute bottom-20 left-3/
  );
  assert.doesNotMatch(source, /activeComposerCardId \? 'top-4' : 'bottom-4'/);
});

test('canvas editing follows a single selected generation and never opens on hover alone', () => {
  assert.match(source, /selectedCardIds.length === 1/);
  assert.match(source, /isDraftCard\(card\)/);
  assert.doesNotMatch(source, /registerGenerationCardHoverCallback/);
  assert.match(source, /setSettingsOpen\(false\)/);
  assert.match(source, /editor.setSelectedShapes\(\[\]\)/);
});
