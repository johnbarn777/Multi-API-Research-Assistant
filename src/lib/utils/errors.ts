export class AppError extends Error {
  constructor(
    message: string,
    public readonly options: {
      code?: string;
      status?: number;
      retryAfterMs?: number;
      cause?: unknown;
    } = {}
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function buildErrorResponse(error: unknown) {
  if (error instanceof AppError) {
    return {
      code: error.options.code ?? "internal_error",
      message: error.message,
      retryAfterMs: error.options.retryAfterMs,
      status: error.options.status ?? 500
    };
  }

  return {
    code: "internal_error",
    message: "Unexpected server error",
    status: 500
  };
}
