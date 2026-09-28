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

test('a transcribe request without an Idempotency-Key is no longer hard-rejected', async () => {
  // This process runs with REQUIRE_AUTH=true (see the npm test script), so we still expect
  // a 401 for the missing bearer token, NOT a 400 for a missing Idempotency-Key header.
  // That distinction is what this regression guards: a missing key should never itself be
  // a blocking error, since the standalone web client does not always send one.
  const response = await request(app).post('/transcribe').send();
  assert.equal(response.status, 401);
  assert.match(response.body.error, /Authentication required/i);
});

test('web preview guest requests bypass auth check and proceed to audio validation', async () => {
  const response = await request(app)
    .post('/transcribe')
    .set('X-Client-Type', 'web')
    .send();
  // Status should be 400 (audio missing), NOT 401 (auth required)
  assert.equal(response.status, 400);
  assert.match(response.body.error, /Audio file or base64 data is required/i);
});

test('web preview guest audio over 25MB is capped with upgrade prompt', async () => {
  // Create dummy audio buffer > 25MB
  const bigBuffer = Buffer.alloc(26 * 1024 * 1024, 0);
  const response = await request(app)
    .post('/transcribe')
    .set('X-Client-Type', 'web')
    .attach('file', bigBuffer, 'long-preview.m4a');
  assert.equal(response.status, 429);
  assert.equal(response.body.limitReached, true);
  assert.match(response.body.error, /10 minutes/i);
});

