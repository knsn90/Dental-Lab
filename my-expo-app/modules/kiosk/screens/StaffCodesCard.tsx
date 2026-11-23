// modules/kiosk/screens/StaffCodesCard.tsx
// Tablet Girişi → "Personel kodları" kartı (yalnız kiosk_can_manage).
// Liste tabletteki kişi listesiyle aynı kuralı izler (kiosk_list_users): aktif + onaylı
// lab personeli/admin. Kodu olmayan kişi tablette görünmez. Yönetici kodu göremez,
// yalnız sıfırlayabilir (staff_reset_code → kod pasifleşir, kilit kalkar).
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, Platform, useWindowDimensions } from 'react-native';
import { AlertCircle, RefreshCw, Lock } from '../../../core/ui/icons';
import { listStaffCodes, resetStaffCode, type StaffCodeRow } from '../api';
import { ConfirmDialog, type ConfirmState } from '../../../core/ui/ConfirmDialog';
import { toast } from '../../../core/ui/Toast';
import { useMobileTokens } from '../../../core/theme/mobileDesignTokens';
import { useInkUI } from '../../../core/theme/inkScale';
import { useThemeModeStore } from '../../../core/store/themeModeStore';
import { autoT } from '../../../core/i18n/autoTranslate';
import { localeTag } from '../../../core/i18n';
import { relTime } from './LabDevicesSection';

const ptr = Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : {};
const DANGER = '#DC2626';
const DANGER_DARK = '#F87171';

function roleLabel(r: StaffCodeRow): string {
  if (r.user_type === 'admin') return autoT('Yönetici');
  switch (r.role) {
    case 'manager': return autoT('Lab müdürü');
    case 'technician': return autoT('Teknisyen');
    case 'courier': return autoT('Kurye');
    default: return autoT('Personel');
  }
}

export function StaffCodesCard({ labId, accentColor = '#3563A8', onSummary }: {
  labId: string; accentColor?: string;
  onSummary?: (withCode: number, total: number) => void;
}) {
  const T = useMobileTokens();
  const U = useInkUI();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const danger = isDark ? DANGER_DARK : DANGER;
  const compact = useWindowDimensions().width < 600;

  const [rows, setRows] = useState<StaffCodeRow[] | null>(null);
  const [loadErr, setLoadErr] = useState(false);
  const [rowErr, setRowErr] = useState<Record<string, string>>({});
  const [rowBusy, setRowBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);

  const refresh = useCallback(async () => {
    const res = await listStaffCodes(labId);
    setLoadErr(!res.ok);
    setRows(res.rows);
    onSummary?.(res.rows.filter(r => r.hasCode).length, res.rows.length);
  }, [labId, onSummary]);
  useEffect(() => { refresh(); }, [refresh]);

  const askReset = (r: StaffCodeRow) => {
    setConfirm({
      title: autoT('Kodu sıfırla'),
      message: `${r.full_name} — ${autoT('kodu silinir ve kilidi kalkar. Kişi tablette görünmez; kendi hesabından Ayarlar › Tablet Girişi bölümünde yeni kod belirlemesi gerekir.')}`,
      label: autoT('Sıfırla'),
      variant: 'warning',
      onConfirm: async () => {
        setConfirm(null);
        setRowErr(e => ({ ...e, [r.user_id]: '' }));
        setRowBusy(r.user_id);
        const res = await resetStaffCode(r.user_id);
        setRowBusy(null);
        if (!res.ok) { setRowErr(e => ({ ...e, [r.user_id]: autoT('Kod sıfırlanamadı.') })); return; }
        toast.success(autoT('Kod sıfırlandı.'));
        refresh();
      },
    });
  };

  if (rows === null) return <ActivityIndicator color={isDark ? '#9BC6EC' : accentColor} style={{ marginVertical: 12 }} />;
  if (loadErr) {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <AlertCircle size={13} color={danger} strokeWidth={2} />
        <Text style={{ fontSize: 13, color: danger }}>Personel listesi yüklenemedi.</Text>
      </View>
    );
  }
  if (rows.length === 0) return <Text style={{ fontSize: 13, color: T.ink3 }}>Aktif personel yok.</Text>;

  // Kodu olanlar üstte; kilitli olanlar en üstte (dikkat gerektirir).
  const ordered = [...rows].sort((a, b) => {
    const rank = (r: StaffCodeRow) => (r.lockedUntil ? 0 : r.hasCode ? 1 : 2);
    return rank(a) - rank(b) || a.full_name.localeCompare(b.full_name, localeTag());
  });

  return (
    <View>
      {ordered.map((r, i) => {
        const tone = r.lockedUntil ? U.chipTones.warning : r.hasCode ? U.chipTones.success : U.chipTones.neutral;
        const label = r.lockedUntil
          ? `${autoT('Kilitli')} · ${new Date(r.lockedUntil).toLocaleTimeString(localeTag(), { hour: '2-digit', minute: '2-digit' })}`
          : r.hasCode ? autoT('Tablette görünür') : autoT('Kod yok');
        const err = rowErr[r.user_id];
        const chip = (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: tone.bg }}>
            {r.lockedUntil ? <Lock size={11} color={tone.fg} strokeWidth={2.2} /> : null}
            <Text style={{ fontSize: 11, fontWeight: '700', color: tone.fg }}>{label}</Text>
          </View>
        );
        const initial = r.full_name.charAt(0).toLocaleUpperCase(localeTag());
        return (
          <View key={r.user_id} style={{ paddingVertical: 10, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: T.hairline, gap: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ width: 34, height: 34, borderRadius: 999, backgroundColor: U.chipNeutral as any, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: T.ink2 }}>{initial}</Text>
              </View>
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: T.ink }} numberOfLines={1}>{r.full_name}</Text>
                <Text style={{ fontSize: 11.5, color: T.ink3 }} numberOfLines={1}>
                  {r.hasCode && r.updatedAt ? `${roleLabel(r)} · ${autoT('Kod')}: ${relTime(r.updatedAt)}` : roleLabel(r)}
                </Text>
                {compact && <View style={{ flexDirection: 'row', marginTop: 2 }}>{chip}</View>}
              </View>
              {!compact && chip}
              {r.hasCode ? (
                <Pressable
                  onPress={() => askReset(r)}
                  disabled={rowBusy === r.user_id}
                  accessibilityRole="button"
                  accessibilityLabel={`${r.full_name} ${autoT('kodu sıfırla')}`}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 5, height: 32, paddingHorizontal: 11, borderRadius: 999, backgroundColor: U.plainBtn.bg, borderWidth: 1, borderColor: U.plainBtn.border, ...ptr }}
                >
                  {rowBusy === r.user_id ? <ActivityIndicator size="small" color={U.plainBtn.fg} /> : <RefreshCw size={12} color={U.plainBtn.fgMuted} strokeWidth={2} />}
                  <Text style={{ fontSize: 12, fontWeight: '600', color: U.plainBtn.fgMuted }}>Sıfırla</Text>
                </Pressable>
              ) : compact ? null : (
                <View style={{ width: 82 }} />
              )}
            </View>
            {!!err && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 46 }}>
                <AlertCircle size={13} color={danger} strokeWidth={2} />
                <Text style={{ fontSize: 12, color: danger }}>{err}</Text>
              </View>
            )}
          </View>
        );
      })}
      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </View>
  );
}
