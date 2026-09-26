/**
 * edgeErrorMessage — Edge Function hatasından OKUNABİLİR mesaj çıkarır.
 *
 * NEDEN: supabase-js, fonksiyon 2xx dışında bir kod döndürürse gövdeyi ATAR ve
 * `error.message` olarak sabit "Edge Function returned a non-2xx status code"
 * verir. Fonksiyon `{ ok:false, message:'…' }` ile net bir sebep yazmış olsa
 * bile kullanıcı bunu görmez (ör. 403 tenant reddi). Gövde `error.context`
 * içindeki Response'ta durur — buradan okunur.
 */
export async function edgeErrorMessage(err: any, fallback: string): Promise<string> {
  const ctx: any = err?.context;
  // Response gövdesi TEK KULLANIMLIK — mümkünse kopya üzerinde oku.
  const res: any = typeof ctx?.clone === 'function' ? ctx.clone() : ctx;
  if (res && typeof res.json === 'function') {
    try {
      const b = await res.json();
      const m = b?.message ?? b?.error;
      if (m) return String(m);
    } catch { /* JSON değil → metne düş */ }
  }
  if (res && typeof res.text === 'function') {
    try {
      const t = (await res.text())?.trim();
      if (t) return t.slice(0, 300);
    } catch { /* gövde okunamadı */ }
  }
  return err?.message || fallback;
}
