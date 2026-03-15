type LogContext = Record<string, unknown> | undefined;

function timestamp() {
  return new Date().toISOString();
}

function buildRef(prefix: 'ERR' | 'LOG') {
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${random}`;
}

function errorToObject(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }
  return {
    message: String(error),
  };
}

export function logInfo(event: string, context?: LogContext) {
  const ref = buildRef('LOG');
  console.info(`[${timestamp()}][INFO][${event}][${ref}]`, context ?? {});
  return ref;
}

export function logError(event: string, error: unknown, context?: LogContext) {
  const ref = buildRef('ERR');
  console.error(`[${timestamp()}][ERROR][${event}][${ref}]`, {
    context: context ?? {},
    error: errorToObject(error),
  });
  return ref;
}
