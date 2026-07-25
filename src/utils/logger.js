// Logs only an error's message and stack trace - never the raw error
// object. Some HTTP client libraries attach extra debug properties to
// thrown errors (request config, headers, etc.); blindly console.error-ing
// the whole object risks printing an Authorization header or API key into
// server logs. .message and .stack are always plain strings describing
// what happened and where, never a dump of arbitrary object properties.
function logError(label, err) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`${label}: ${message}`);

  if (err instanceof Error && err.stack) {
    console.error(err.stack);
  }
}

module.exports = { logError };
