export class HttpError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export function unauthorized(msg = 'Yetkisiz erişim')  { return new HttpError(msg, 401); }
export function forbidden(msg = 'Bu işlem için yetkiniz yok') { return new HttpError(msg, 403); }
export function badRequest(msg: string)                { return new HttpError(msg, 400); }

export function errorResponse(err: unknown, headers: Record<string, string>): Response {
  const status = err instanceof HttpError ? err.status : 500;
  const message = err instanceof Error ? err.message : 'Sunucu hatası';
  return new Response(
    JSON.stringify({ error: message }),
    { status, headers: { ...headers, 'Content-Type': 'application/json' } }
  );
}
