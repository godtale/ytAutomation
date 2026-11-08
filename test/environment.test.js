import test from 'node:test';
import assert from 'node:assert/strict';
import { elevenLabsKey } from '../src/environment.js';

test('reads the user-provided environment variable spelling and standard alias', () => {
  assert.equal(elevenLabsKey({ Elevenlabs_Api_Key: 'test-key' }), 'test-key');
  assert.equal(elevenLabsKey({ ELEVENLABS_API_KEY: 'test-key' }), 'test-key');
  assert.equal(elevenLabsKey({}), undefined);
  assert.equal(elevenLabsKey({ UNRELATED_KEY: 'test-key' }), undefined);
});
