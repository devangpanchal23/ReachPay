import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import process from 'node:process';

function runMigration(env) {
  return spawnSync(process.execPath, ['scripts/migrate-pos.js'], {
    encoding: 'utf8',
    timeout: 10_000,
    env: {
      ...process.env,
      ...env,
    },
  });
}

test('POS migration requires PostgreSQL in production', () => {
  const result = runMigration({ NODE_ENV: 'production', DATABASE_URL: '' });

  assert.equal(result.error, undefined, result.error?.message);
  assert.notEqual(result.status, 0, 'missing production database must not report success');
  assert.match(result.stderr, /DATABASE_URL is required in production/);
});

test('POS migration exits unsuccessfully when a configured PostgreSQL server is unavailable', () => {
  const result = runMigration({ NODE_ENV: 'test', DATABASE_URL: 'postgresql://reachpay:reachpay@127.0.0.1:1/reachpay_test' });

  assert.equal(result.error, undefined, result.error?.message);
  assert.notEqual(result.status, 0, 'migration failure must not report success');
  assert.match(result.stderr, /Migration failed/);
});
