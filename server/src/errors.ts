export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export const notFound = (what: string) => new AppError(404, 'NOT_FOUND', `${what} не найден`);
export const conflict = (message: string) => new AppError(409, 'CONFLICT', message);
export const badRequest = (message: string) => new AppError(400, 'BAD_REQUEST', message);
