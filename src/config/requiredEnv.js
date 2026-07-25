// ANTHROPIC_API_KEY is deliberately not required here: a missing/invalid
// key already degrades gracefully per-request (POST /api/chat returns a
// generic 500 instead of the app refusing to start), which lets the rest
// of the app run locally without an Anthropic account. DATABASE_URL and
// JWT_SECRET have no such fallback - nothing works without them.
const REQUIRED_ENV_VARS = ['DATABASE_URL', 'JWT_SECRET'];

function getMissingRequiredEnvVars(env = process.env) {
  return REQUIRED_ENV_VARS.filter((key) => !env[key]);
}

module.exports = { REQUIRED_ENV_VARS, getMissingRequiredEnvVars };
