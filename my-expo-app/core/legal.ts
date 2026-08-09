/**
 * Hukuki doküman URL'leri — TEK KAYNAK.
 *
 * DNS hazır olduğunda (Vercel → siman-legal projesine `legal.siman.app` custom
 * domain eklenip CNAME kaydı verildiğinde) yalnızca `LEGAL_BASE` değiştirilir;
 * tüm uygulama (ConsentGate, ConsentGuard, Profil ekranları) otomatik güncellenir.
 *
 * Hedef (branded): https://legal.siman.app
 * Şimdilik (geçici): https://siman-legal.vercel.app
 */
export const LEGAL_BASE = 'https://siman-legal.vercel.app';

export const LEGAL_PRIVACY_URL = `${LEGAL_BASE}/`;
export const LEGAL_TERMS_URL   = `${LEGAL_BASE}/terms.html`;
