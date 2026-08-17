import assert from 'node:assert/strict';
import test from 'node:test';
import { reconcileAuthoritativeFullSync } from '../services/manualSyncReconciliation.js';

const transaction = (id, isSynced = true, amount = 100) => ({
  id: String(id),
  isSynced,
  amount,
  date: '2026-08-17T00:00:00.000Z',
});

test('manual full sync removes a locally cached row that the authoritative server snapshot deleted', () => {
  const result = reconcileAuthoritativeFullSync(
    [transaction('100'), transaction('101')],
    [transaction('100'), transaction('101'), transaction('102')]
  );

  assert.deepEqual(result.map(item => item.id), ['100', '101']);
});

test('manual full sync removes every confirmed row from a bulk deletion', () => {
  const result = reconcileAuthoritativeFullSync(
    [transaction('100')],
    [transaction('100'), transaction('101'), transaction('102'), transaction('103')]
  );

  assert.deepEqual(result.map(item => item.id), ['100']);
});

test('manual full sync keeps unsynced offline additions until replay succeeds', () => {
  const result = reconcileAuthoritativeFullSync(
    [transaction('100')],
    [transaction('100'), transaction('temp_offline_add', false, 250)]
  );

  assert.deepEqual(result.map(item => item.id), ['100', 'temp_offline_add']);
});

test('manual full sync uses the server version for an already-synced edit', () => {
  const result = reconcileAuthoritativeFullSync(
    [transaction('100', true, 900)],
    [transaction('100', true, 250)]
  );

  assert.equal(result.length, 1);
  assert.equal(result[0].amount, 900);
});

test('manual full sync handles an empty authoritative dataset without resurrecting synced local rows', () => {
  const result = reconcileAuthoritativeFullSync(
    [],
    [transaction('100'), transaction('101')]
  );

  assert.deepEqual(result, []);
});
