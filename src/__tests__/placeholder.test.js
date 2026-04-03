import { test } from 'node:test';
import assert from 'node:assert';
import { db } from '../db.js';

test('users table exists and is queryable', () => {
  const rows = db.prepare('SELECT * FROM users').all();
  assert.ok(Array.isArray(rows), 'users query should return an array');
});

test('scores table exists and is queryable', () => {
  const rows = db.prepare('SELECT * FROM scores').all();
  assert.ok(Array.isArray(rows), 'scores query should return an array');
});

test('users table has expected columns', () => {
  const info = db.prepare('PRAGMA table_info(users)').all();
  const cols = info.map((c) => c.name);
  assert.ok(cols.includes('id'), 'users should have id column');
  assert.ok(cols.includes('username'), 'users should have username column');
  assert.ok(cols.includes('password_hash'), 'users should have password_hash column');
  assert.ok(cols.includes('created_at'), 'users should have created_at column');
});

test('scores table has expected columns', () => {
  const info = db.prepare('PRAGMA table_info(scores)').all();
  const cols = info.map((c) => c.name);
  assert.ok(cols.includes('id'), 'scores should have id column');
  assert.ok(cols.includes('user_id'), 'scores should have user_id column');
  assert.ok(cols.includes('game_id'), 'scores should have game_id column');
  assert.ok(cols.includes('score'), 'scores should have score column');
  assert.ok(cols.includes('created_at'), 'scores should have created_at column');
});
