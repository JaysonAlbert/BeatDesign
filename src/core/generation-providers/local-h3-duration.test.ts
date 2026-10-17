import assert from 'node:assert/strict';
import test from 'node:test';
import { LOCAL_H3_DURATIONS, getLocalH3Timing, requireLocalH3Timing } from './local-h3-duration';

test('local H3 duration presets cover the trained native frame grid and retain the old default', () => {
  assert.equal(LOCAL_H3_DURATIONS.length, 15);
  assert.equal(requireLocalH3Timing().frames, 158);
  assert.equal(requireLocalH3Timing('6.583s').frames, 158);
  for (const [index, duration] of LOCAL_H3_DURATIONS.entries()) {
    const timing = requireLocalH3Timing(duration);
    assert.equal(timing.frames, 124 + index * 17);
    assert.equal(timing.frames % 17, 5);
    assert.equal(timing.fps, 24);
    assert.ok(Math.abs(parseFloat(duration) - timing.durationSeconds) < 0.000501);
  }
});

test('local H3 rejects unadvertised or approximate durations rather than silently snapping them', () => {
  for (const value of ['4s', '5s', '10s', '15s', '16s', 362, null, '', NaN]) {
    assert.equal(getLocalH3Timing(value), null);
    assert.throws(() => requireLocalH3Timing(value), /Unsupported local H3 duration/);
  }
});
