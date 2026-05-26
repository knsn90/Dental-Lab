// CORS_ALLOWED_ORIGINS env var production'da sadece gerçek domain ile set edilmeli:
//   supabase secrets set CORS_ALLOWED_ORIGINS=https://lab.esenkim.com
const envOrigins = Deno.env.get('CORS_ALLOWED_ORIGINS');
const ALLOWED_ORIGINS: string[] = envOrigins
  ? envOrigins.split(',').map(s => s.trim())
  : [
      'https://lab.esenkim.com',
      'http://localhost:3000',
      'http://localhost:8081',
      'http://localhost:19006',
    ];

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') ?? '';
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : null;
  return {
    'Access-Control-Allow-Origin': allowedOrigin ?? 'null',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}
