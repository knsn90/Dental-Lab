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

/**
 * Yayınlanmış hukuki doküman sürümü — onay kaydına BU değer yazılır
 * (`user_consents.document_version`), yani kullanıcının hangi metne onay
 * verdiğinin kanıtı. siman-legal içeriği değişince burayı artır.
 * v2.0 (2026-07-23): tüm alıcılar + yurt dışı aktarım + AI + KVKK m.11.
 */
export const LEGAL_DOC_VERSION = '2.0';
