// Hata kaydına (client_errors.route) yazılan yoldan jetonları siler. Saf; node testli.
// Jetonlu public rotalar: /s/<jeton> (ön ekstre onayı), /doctor-approval/<jeton>.

const TOKEN_ROUTES = ['s', 'doctor-approval'];

export function maskRoute(path: string | null): string | null {
  if (!path) return path;
  for (const seg of TOKEN_ROUTES) {
    if (path.startsWith(`/${seg}/`)) return `/${seg}/:token`;
  }
  return path;
}
