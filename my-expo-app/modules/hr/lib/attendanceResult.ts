// modules/hr/lib/attendanceResult.ts — manual_attendance RPC sonucu (2026-10-25).
// Fonksiyon reddi hata olarak değil {ok:false, error} olarak döndürür; okunmazsa ekran
// "eklendi" der. Metinler toast'ta otomatik sözlükle çevrilir (auto.{en,de,fa}.json).

export const ATTENDANCE_SAVE_FAILED = 'Devam kaydı kaydedilemedi.';

const MESSAGES: Record<string, string> = {
  forbidden:          'Bu işlem için yetkiniz yok.',
  employee_not_found: 'Personel bulunamadı.',
  no_session:         'Oturum bulunamadı. Lütfen tekrar giriş yapın.',
};

/** null → kayıt yapıldı; metin → gösterilecek hata. */
export function manualAttendanceError(data: unknown): string | null {
  if (!data || typeof data !== 'object') return ATTENDANCE_SAVE_FAILED;
  const r = data as { ok?: unknown; error?: unknown };
  if (r.ok === true) return null;
  return MESSAGES[String(r.error ?? '')] ?? ATTENDANCE_SAVE_FAILED;
}
