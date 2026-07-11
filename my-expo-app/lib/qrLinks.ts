// lib/qrLinks.ts
// QR short-link helper. QR'a uzun URL gömmek yerine bu helper'la kısa kod
// üretip /c/{code} URL'ini kullanırız.

import { supabase } from '../core/api/supabase';

const PUBLIC_BASE_URL = 'https://www.nexadent.net';

/**
 * Hedef için kısa kod üretir, /c/{code} formunda URL döner.
 * Hata olursa fallback URL (target sayfasına direkt) dönülür.
 */
export async function createQrShortUrl(
  targetType: 'work_order' | string,
  targetId: string,
  opts?: { expiresAt?: Date | string | null; fallbackOrderNumber?: string }
): Promise<string> {
  try {
    const { data, error } = await supabase.rpc('create_qr_link', {
      p_target_type: targetType,
      p_target_id: targetId,
      p_expires_at: opts?.expiresAt
        ? (typeof opts.expiresAt === 'string' ? opts.expiresAt : opts.expiresAt.toISOString())
        : null,
    });
    if (error || !data) {
      console.warn('[qr] create_qr_link failed, fallback to direct URL:', error?.message);
      // Fallback: work_order için order_number (human-readable) varsa onu, yoksa uuid
      const short = opts?.fallbackOrderNumber || targetId;
      if (targetType === 'work_order') return `${PUBLIC_BASE_URL}/order/${short}`;
      return PUBLIC_BASE_URL;
    }
    return `${PUBLIC_BASE_URL}/c/${data}`;
  } catch (e: any) {
    console.warn('[qr] create_qr_link exception:', e?.message);
    const short = opts?.fallbackOrderNumber || targetId;
    if (targetType === 'work_order') return `${PUBLIC_BASE_URL}/order/${short}`;
    return PUBLIC_BASE_URL;
  }
}

export async function revokeQrShortCode(shortCode: string): Promise<void> {
  await supabase.rpc('revoke_qr_link', { p_short_code: shortCode.toUpperCase() });
}
