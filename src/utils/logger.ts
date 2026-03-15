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
    const withCode = error as Error & { code?: unknown; details?: unknown };
    return {
      name: error.name,
      message: error.message,
      code: typeof withCode.code === 'string' ? withCode.code : undefined,
      details: typeof withCode.details === 'string' ? withCode.details : undefined,
      stack: error.stack,
    };
  }
  if (typeof error === 'object' && error !== null) {
    const candidate = error as { code?: unknown; message?: unknown; details?: unknown; name?: unknown };
    return {
      name: typeof candidate.name === 'string' ? candidate.name : 'UnknownError',
      code: typeof candidate.code === 'string' ? candidate.code : undefined,
      message:
        typeof candidate.message === 'string'
          ? candidate.message
          : typeof candidate.details === 'string'
            ? candidate.details
            : JSON.stringify(error),
      details: typeof candidate.details === 'string' ? candidate.details : undefined,
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
