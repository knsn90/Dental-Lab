// supabase/functions/_shared/bbkProof.ts
// BanaBiKurye (Borzo Business API 1.8) sipariş nesnesinden teslim kanıtı — saf, içe aktarma yok.
// Teslim noktası: dönüş noktası olmayan SON nokta. Alanlar: checkin.recipient_full_name /
// recipient_position, place_photo_url, sign_photo_url, courier_visit_datetime.
// 2026-10-27 doğrulaması: üretimde ad + varış dolu, fotoğraf/imza boş geliyor.

export interface BbkProof {
  recipientName: string | null;
  recipientTitle: string | null;
  visitAt: string | null;
  placePhotoUrl: string | null;
  signPhotoUrl: string | null;
}

const clean = (v: unknown): string | null => {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s : null;
};

export function extractBbkProof(order: unknown): BbkProof | null {
  const pts = (order as any)?.points;
  if (!Array.isArray(pts) || !pts.length) return null;
  const drops = pts.filter((p: any) => p && p.is_return_point !== true);
  const p: any = drops[drops.length - 1];
  if (!p) return null;
  const ck = p.checkin ?? {};
  return {
    recipientName: clean(ck.recipient_full_name),
    recipientTitle: clean(ck.recipient_position),
    visitAt: clean(p.courier_visit_datetime),
    placePhotoUrl: clean(p.place_photo_url),
    signPhotoUrl: clean(p.sign_photo_url),
  };
}

export function hasAnyProof(p: BbkProof | null): boolean {
  return !!p && !!(p.recipientName || p.recipientTitle || p.placePhotoUrl || p.signPhotoUrl);
}
