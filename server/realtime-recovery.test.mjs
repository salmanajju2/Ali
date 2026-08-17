import test from 'node:test';
import assert from 'node:assert/strict';
import { getRealtimeRecoveryDelay } from '../services/realtimeRecovery.js';

test('foreground recovery runs immediately when outside the debounce interval', () => {
  assert.equal(getRealtimeRecoveryDelay(10_000, 7_000, 1_500), 0);
});

test('foreground recovery retains a trailing refresh during rapid app switching', () => {
  assert.equal(getRealtimeRecoveryDelay(10_000, 9_250, 1_500), 750);
  assert.equal(getRealtimeRecoveryDelay(10_000, 10_000, 1_500), 1_500);
});
