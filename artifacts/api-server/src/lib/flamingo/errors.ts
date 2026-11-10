export class AppError extends Error {
  constructor(public status: number, message: string, public retryAfter?: number) {
    super(message);
  }
}

export function requireConfigured(value: unknown, service: string): asserts value {
  if (!value) throw new AppError(503, `${service} is not connected. Add its credentials in project Secrets, then restart the app. No external action was performed.`);
}
