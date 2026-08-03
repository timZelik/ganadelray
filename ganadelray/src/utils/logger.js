// src/utils/logger.js
//
// One-line structured logging. Tim reads these in Vercel/Actions logs, so they
// stay human-scannable rather than JSON-blob-shaped.

function stamp() {
  return new Date().toISOString();
}

function fmt(level, scope, message, meta) {
  const base = `${stamp()} ${level} [${scope}] ${message}`;
  if (!meta || Object.keys(meta).length === 0) return base;
  return `${base} ${JSON.stringify(meta)}`;
}

function make(scope) {
  return {
    info: (message, meta) => console.log(fmt('INFO ', scope, message, meta)),
    warn: (message, meta) => console.warn(fmt('WARN ', scope, message, meta)),
    error: (message, meta) => console.error(fmt('ERROR', scope, message, meta)),
    // table() exists so step-3 ranking output is eyeballable in a log stream.
    table: (title, rows) => {
      console.log(fmt('INFO ', scope, title));
      console.table(rows);
    },
  };
}

module.exports = { logger: make('app'), makeLogger: make };
