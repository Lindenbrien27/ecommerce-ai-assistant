

const REQUIRED_ENV_VARS = ['DATABASE_URL', 'JWT_SECRET'];

function getMissingRequiredEnvVars(env = process.env) {
  return REQUIRED_ENV_VARS.filter((key) => !env[key]);
}

module.exports = { REQUIRED_ENV_VARS, getMissingRequiredEnvVars };
