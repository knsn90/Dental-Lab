// modules/hr/lib/leaveActions.ts — izin silme/iptal kararları (0b, 2026-10-25).
// RLS izin vermediği satırı hata vermeden süzer: update/delete 0 satır döner ve
// istemci "başarılı" sanır. Sorgular .select('id') ile döner, sonuç burada sınanır.

export function rowsChanged(data: readonly unknown[] | null | undefined): boolean {
  return Array.isArray(data) && data.length > 0;
}

/** el_delete ile aynı kural: onaylayan her izni, diğerleri yalnız bekleyen/iptal izni siler. */
export function canDeleteLeave(status: string, canApprove: boolean): boolean {
  return canApprove || status === 'bekliyor' || status === 'iptal';
}
