import assert from 'node:assert/strict';
import test from 'node:test';

import {
  resolveAnchoredComposerPosition,
  resolveNodeComposerWidth,
  resolveComposerFocusLayout,
} from './beatcanvas-composer-utils';

test('resizing a wide media node keeps its composer equally wide and aligned', () => {
  for (const frameWidth of [600, 840, 1000]) {
    const width = resolveNodeComposerWidth(frameWidth, 1400);
    assert.equal(width, frameWidth);
    const position = resolveAnchoredComposerPosition({
      frame: { left: 100, top: 40, width: frameWidth, height: 240 },
      viewportWidth: 1400,
      preferredWidth: width,
      gap: 0,
    });
    assert.equal(position.left, 100);
    assert.equal(position.top, 280);
  }
});

test('composer stays usable for small nodes and within the canvas after sidebar resize', () => {
  assert.equal(resolveNodeComposerWidth(180, 1200), 360);
  assert.equal(resolveNodeComposerWidth(840, 640), 608);
  assert.equal(resolveNodeComposerWidth(840, 900), 840);
  assert.equal(resolveNodeComposerWidth(840, 300), 268);
});

test('anchors the composer directly below the active frame', () => {
  assert.deepEqual(
    resolveAnchoredComposerPosition({
      frame: { left: 300, top: 80, width: 240, height: 420 },
      viewportWidth: 1200,
    }),
    { left: 140, top: 514 }
  );
});

test('keeps the anchored composer inside the canvas horizontally', () => {
  assert.deepEqual(
    resolveAnchoredComposerPosition({
      frame: { left: 2, top: 40, width: 236, height: 420 },
      viewportWidth: 900,
    }),
    { left: 16, top: 474 }
  );
});

test('places the hover composer above a card when it would overflow below', () => {
  assert.deepEqual(
    resolveAnchoredComposerPosition({
      frame: { left: 300, top: 520, width: 240, height: 220 },
      viewportWidth: 1200,
      viewportHeight: 800,
      composerHeight: 240,
    }),
    { left: 140, top: 266 }
  );
});

test('reduces zoom only when the frame and composer do not fit vertically', () => {
  assert.deepEqual(
    resolveComposerFocusLayout({
      frameHeight: 420,
      viewportHeight: 576,
      composerHeight: 168,
      currentZoom: 1,
      zoomSteps: [0.2, 0.4, 0.6, 0.8, 1],
    }),
    { zoom: 0.8, verticalPageOffset: 96.25 }
  );

  assert.deepEqual(
    resolveComposerFocusLayout({
      frameHeight: 420,
      viewportHeight: 843,
      composerHeight: 168,
      currentZoom: 1,
      zoomSteps: [0.2, 0.4, 0.6, 0.8, 1],
    }),
    { zoom: 1, verticalPageOffset: 77 }
  );
});
