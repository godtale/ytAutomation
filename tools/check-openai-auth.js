import { openAIKey } from '../src/environment.js';

const key = openAIKey();
if (!key) throw new Error('OPENAI_API_KEY is not visible in this process.');
const response = await fetch('https://api.openai.com/v1/models', {
  headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(30000), redirect: 'error'
});
const data = await response.json().catch(() => ({}));
// Report only a status code; API messages can contain a masked credential.
const code = typeof data.error?.code === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(data.error.code) ? data.error.code : null;
console.log(JSON.stringify({ authenticated: response.ok, http_status: response.status, error_code: code }));
if (!response.ok) process.exitCode = 1;
