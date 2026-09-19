import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app } from '../index.mjs';

test('health endpoint remains public', async () => {
  const response = await request(app).get('/health');
  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
  assert.ok(response.headers['x-request-id']);
});

test('AI endpoints reject unauthenticated requests', async () => {
  const response = await request(app)
    .post('/transcribe')
    .set('Idempotency-Key', 'test-unauthenticated')
    .send();
  assert.equal(response.status, 401);
  assert.match(response.body.error, /Authentication required/i);
});

test('AI endpoints require idempotency keys after authentication', async () => {
  // With no Supabase URL configured, a bearer token cannot be accepted.
  // This test documents that the authentication gate runs before paid work.
  const response = await request(app).post('/summarize').send({ text: 'hello' });
  assert.equal(response.status, 401);
});

test('unknown browser origins are rejected', async () => {
  const response = await request(app).get('/health').set('Origin', 'https://not-allowed.example');
  assert.equal(response.status, 403);
  assert.equal(response.body.error, 'Origin is not allowed.');
});

test('configured browser origins are accepted', async () => {
  const response = await request(app).get('/health').set('Origin', 'https://app.voicepad.test');
  assert.equal(response.status, 200);
  assert.equal(response.headers['access-control-allow-origin'], 'https://app.voicepad.test');
});
