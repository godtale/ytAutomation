// Read credentials only from the process environment. Never load or write secrets files.
export function elevenLabsKey(env = process.env) {
  const name = Object.keys(env).find(key => key.toLowerCase() === 'elevenlabs_api_key');
  return name ? env[name] : undefined;
}

export function openAIKey(env = process.env) {
  const name = Object.keys(env).find(key => key.toLowerCase() === 'openai_api_key');
  return name ? env[name] : undefined;
}
