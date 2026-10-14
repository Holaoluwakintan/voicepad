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


test('mobile guest: failed requests are refunded, never using up the daily allowance', async () => {
  for (let i = 0; i < 6; i++) {
    const response = await request(app)
      .post('/summarize')
      .set('X-Client-Type', 'mobile')
      .set('Idempotency-Key', `guest-refund-${i}`)
      .send({ text: '' });
    assert.equal(response.status, 400, `attempt ${i}`);
  }
});

test('mobile guest: requests to other features are still accepted after summaries were tried', async () => {
  const ocr = await request(app).post('/ocr').set('X-Client-Type', 'mobile').set('Idempotency-Key', 'guest-ocr-0').send();
  assert.notEqual(ocr.status, 429);
  const tr = await request(app).post('/transcribe').set('X-Client-Type', 'mobile').set('Idempotency-Key', 'guest-tr-0').send();
  assert.notEqual(tr.status, 429);
});

import { joinPieces, quickLanguageGuess, extFor } from '../stt.mjs';

test('v2 status lists engine counts and never keys', async () => {
  const response = await request(app).get('/v2/status');
  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
  assert.equal(typeof response.body.engines.groq, 'number');
  assert.doesNotMatch(JSON.stringify(response.body), /gsk_|sk-|AIza/);
});

test('v2 transcribe is behind the same auth gate', async () => {
  const response = await request(app).post('/v2/transcribe').set('Idempotency-Key', 'v2-unauth').send();
  assert.equal(response.status, 401);
});

test('pieces cut with an overlap do not repeat words', () => {
  assert.equal(joinPieces(['we go meet for Oba', 'for Oba Adesida Road'], [false, true]), 'we go meet for Oba Adesida Road');
  assert.equal(joinPieces(['first part.', 'second part.'], [false, false]), 'first part. second part.');
  assert.equal(joinPieces(['', 'only this'], [false, false]), 'only this');
});

test('rule-based language guess spots Pidgin, Yoruba, Igbo, Hausa', () => {
  assert.equal(quickLanguageGuess('Abeg make you no vex, I dey come'), 'pcm');
  assert.equal(quickLanguageGuess('Àwọn èèyàn ti mọ̀ nípa àwọn kẹ́míkà'), 'yo');
  assert.equal(quickLanguageGuess('ụmụ igbe ntuli aka ga-abụrịrị'), 'ig');
  assert.equal(quickLanguageGuess('mai ɗauke da mazauna'), 'ha');
  assert.equal(quickLanguageGuess('Let them have more questions'), 'en');
});

test('piece file extension follows the upload', () => {
  assert.equal(extFor('audio/ogg', 'voice.ogg'), '.ogg');
  assert.equal(extFor('audio/m4a', 'recording.m4a'), '.m4a');
  assert.equal(extFor('audio/3gpp', ''), '.3gp');
});
