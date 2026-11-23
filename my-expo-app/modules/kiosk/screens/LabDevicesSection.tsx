// modules/kiosk/screens/LabDevicesSection.tsx
// Tablet Girişi → "Tabletler" kartı (yalnız kiosk_can_manage). Kendi ScrollView'i yok;
// sayfayı TabletAccessSection kurar.
//
// Eşleştirme kuralı (edge fn kiosk-pair): kod YALNIZ henüz eşleşmemiş cihazda geçerli,
// 15 dk yaşar. Eşleşmiş cihaza yeni kod üretmek işe yaramaz → orada düğme yok; tablet
// değişecekse kayıt iptal edilip yenisi eklenir.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, Platform } from 'react-native';
import { Tablet, Plus, RefreshCw, Trash2, Copy, Check, AlertCircle, ChevronDown, ChevronRight, X } from '../../../core/ui/icons';
import { listLabDevices, createLabDevice, repairLabDevice, revokeLabDevice, type LabDevice } from '../api';
import { ConfirmDialog, type ConfirmState } from '../../../core/ui/ConfirmDialog';
import { GlassTooltip } from '../../../core/ui/GlassTooltip';
import { toast } from '../../../core/ui/Toast';
import { useMobileTokens } from '../../../core/theme/mobileDesignTokens';
import { useInkUI } from '../../../core/theme/inkScale';
import { useThemeModeStore } from '../../../core/store/themeModeStore';
import { autoT } from '../../../core/i18n/autoTranslate';
import { localeTag } from '../../../core/i18n';

const WEB = Platform.OS === 'web';
const ptr = WEB ? ({ cursor: 'pointer' } as any) : {};
const DANGER = '#DC2626';
const DANGER_DARK = '#F87171';
const STALE_DAYS = 30;

type Pairing = { name: string; code: string; expires: string };

/** "3 gün önce" / "az önce" — yerel dilde, göreli. */
export function relTime(iso: string | null): string {
  if (!iso) return '—';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '—';
  const s = Math.round((t - Date.now()) / 1000);
  const abs = Math.abs(s);
  try {
    const rtf = new Intl.RelativeTimeFormat(localeTag(), { numeric: 'auto' });
    if (abs < 60) return rtf.format(0, 'second');
    if (abs < 3600) return rtf.format(Math.round(s / 60), 'minute');
    if (abs < 86400) return rtf.format(Math.round(s / 3600), 'hour');
    if (abs < 86400 * 30) return rtf.format(Math.round(s / 86400), 'day');
    if (abs < 86400 * 365) return rtf.format(Math.round(s / (86400 * 30)), 'month');
    return rtf.format(Math.round(s / (86400 * 365)), 'year');
  } catch {
    return new Date(iso).toLocaleDateString(localeTag());
  }
}

function useNow(active: boolean) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

function mmss(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function DevicesCard({ accentColor = '#3563A8' }: { accentColor?: string }) {
  const T = useMobileTokens();
  const U = useInkUI();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const danger = isDark ? DANGER_DARK : DANGER;
  const accentText = isDark ? '#9BC6EC' : accentColor;

  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState(false);
  const [devices, setDevices] = useState<LabDevice[]>([]);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [addErr, setAddErr] = useState('');
  const [pairing, setPairing] = useState<Pairing | null>(null);
  const [copied, setCopied] = useState(false);
  const [rowErr, setRowErr] = useState<Record<string, string>>({});
  const [rowBusy, setRowBusy] = useState<string | null>(null);
  const [showRevoked, setShowRevoked] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);

  const refresh = useCallback(async () => {
    const d = await listLabDevices();
    setDevices(d);
    setLoadErr(false);
    setLoading(false);
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const live = devices.filter(d => d.active);
  const revoked = devices.filter(d => !d.active);
  const hasPending = live.some(d => !d.device_token_hash && d.pairing_expires_at);
  const now = useNow(!!pairing || hasPending);

  const pairingLeft = pairing ? new Date(pairing.expires).getTime() - now : 0;
  const pairingExpired = !!pairing && pairingLeft <= 0;

  const add = async () => {
    setAddErr('');
    const n = name.trim();
    if (!n) { setAddErr(autoT('Tablete bir ad verin (ör. Üretim Tableti 1).')); return; }
    setBusy(true);
    const res = await createLabDevice(n);
    setBusy(false);
    if (!res.ok) { setAddErr(autoT('Tablet eklenemedi. Tekrar deneyin.')); return; }
    setPairing({ name: n, code: res.pairing_code ?? '', expires: res.pairing_expires_at ?? '' });
    setCopied(false);
    setName('');
    refresh();
  };

  const newCode = async (d: LabDevice) => {
    setRowErr(e => ({ ...e, [d.id]: '' }));
    setRowBusy(d.id);
    const res = await repairLabDevice(d.id);
    setRowBusy(null);
    if (!res.ok) { setRowErr(e => ({ ...e, [d.id]: autoT('Yeni kod alınamadı.') })); return; }
    setPairing({ name: d.name, code: res.pairing_code ?? '', expires: res.pairing_expires_at ?? '' });
    setCopied(false);
    refresh();
  };

  const askRevoke = (d: LabDevice) => {
    setConfirm({
      title: autoT('Tableti kaldır'),
      message: `"${d.name}" — ${autoT('bu tablette kodla giriş hemen durur. Aynı tableti yeniden kullanmak için yeni tablet olarak ekleyip eşleştirmeniz gerekir.')}`,
      label: autoT('Kaldır'),
      variant: 'danger',
      onConfirm: async () => {
        setConfirm(null);
        setRowBusy(d.id);
        const res = await revokeLabDevice(d.id);
        setRowBusy(null);
        if (!res.ok) { setRowErr(e => ({ ...e, [d.id]: autoT('Tablet kaldırılamadı.') })); return; }
        if (pairing?.name === d.name) setPairing(null);
        toast.success(autoT('Tablet kaldırıldı.'));
        refresh();
      },
    });
  };

  const copyCode = async () => {
    if (!pairing?.code) return;
    try {
      if (WEB && (navigator as any)?.clipboard?.writeText) {
        await (navigator as any).clipboard.writeText(pairing.code);
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      }
    } catch { /* kod ekranda; elle yazılabilir */ }
  };

  const plainBtn = {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    height: 34, paddingHorizontal: 12, borderRadius: 999,
    backgroundColor: U.plainBtn.bg, borderWidth: 1, borderColor: U.plainBtn.border,
  } as const;

  const sorted = useMemo(() => [...live].sort((a, b) => {
    const rank = (d: LabDevice) => (d.device_token_hash ? 0 : 1);
    return rank(a) - rank(b) || a.name.localeCompare(b.name, localeTag());
  }), [live]);

  const row = (d: LabDevice) => {
    const paired = !!d.device_token_hash;
    const exp = d.pairing_expires_at ? new Date(d.pairing_expires_at).getTime() : 0;
    const waiting = !paired && exp > now;
    const expired = !paired && !waiting;
    const staleMs = d.last_seen_at ? now - new Date(d.last_seen_at).getTime() : Infinity;
    const stale = paired && staleMs > STALE_DAYS * 86400 * 1000;

    const tone = !d.active ? U.chipTones.neutral
      : paired ? (stale ? U.chipTones.warning : U.chipTones.success)
      : waiting ? U.chipTones.info : U.chipTones.warning;
    const label = !d.active ? autoT('Kaldırıldı')
      : paired ? (stale ? `${STALE_DAYS}+ ${autoT('gündür kullanılmadı')}` : autoT('Aktif'))
      : waiting ? `${autoT('Eşleşme bekliyor')} · ${mmss(exp - now)}`
      : autoT('Kodun süresi doldu');
    const meta = !d.active
      ? `${autoT('Kaldırıldı')} ${relTime(d.revoked_at)}`
      : paired ? `${autoT('Son kullanım')} ${relTime(d.last_seen_at)}`
      : `${autoT('Eklendi')} ${relTime(d.created_at)}`;
    const err = rowErr[d.id];

    return (
      <View key={d.id} style={{ paddingVertical: 12, borderTopWidth: 1, borderTopColor: T.hairline, gap: 6, opacity: d.active ? 1 : 0.7 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ width: 38, height: 38, borderRadius: 11, backgroundColor: isDark ? 'rgba(155,198,236,0.12)' : `${accentColor}14`, alignItems: 'center', justifyContent: 'center' }}>
            <Tablet size={19} color={accentText} strokeWidth={1.8} />
          </View>
          <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: T.ink }} numberOfLines={1}>{d.name}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: tone.bg }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: tone.fg, fontVariant: ['tabular-nums'] }}>{label}</Text>
              </View>
              <Text style={{ fontSize: 11.5, color: T.ink3 }}>{meta}</Text>
            </View>
          </View>
          {d.active && expired && (
            <Pressable onPress={() => newCode(d)} disabled={rowBusy === d.id} accessibilityRole="button" style={[plainBtn, ptr]}>
              {rowBusy === d.id ? <ActivityIndicator size="small" color={U.plainBtn.fg} /> : <RefreshCw size={13} color={U.plainBtn.fg} strokeWidth={2} />}
              <Text style={{ fontSize: 12.5, fontWeight: '600', color: U.plainBtn.fg }}>Yeni kod al</Text>
            </Pressable>
          )}
          {d.active && (
            <GlassTooltip title={autoT('Tableti kaldır')} text={autoT('Bu tablette kodla giriş durur')}>
              <Pressable onPress={() => askRevoke(d)} disabled={rowBusy === d.id} accessibilityRole="button" accessibilityLabel={autoT('Tableti kaldır')} hitSlop={4} style={{ width: 34, height: 34, borderRadius: 999, alignItems: 'center', justifyContent: 'center', ...ptr }}>
                <Trash2 size={16} color={danger} strokeWidth={1.8} />
              </Pressable>
            </GlassTooltip>
          )}
        </View>
        {!!err && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 50 }}>
            <AlertCircle size={13} color={danger} strokeWidth={2} />
            <Text style={{ fontSize: 12, color: danger }}>{err}</Text>
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={{ gap: 14 }}>
      {/* Eşleştirme kodu */}
      {pairing && (
        <View style={{ borderRadius: 14, padding: 16, gap: 8, backgroundColor: isDark ? 'rgba(155,198,236,0.08)' : `${accentColor}0D`, borderWidth: 1, borderColor: isDark ? 'rgba(155,198,236,0.25)' : `${accentColor}40` }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={{ flex: 1, fontSize: 11, fontWeight: '700', color: T.ink2, letterSpacing: 0.8, textTransform: 'uppercase' }} numberOfLines={1}>
              {`${autoT('Eşleştirme kodu')} · ${pairing.name}`}
            </Text>
            <Pressable onPress={() => setPairing(null)} accessibilityRole="button" accessibilityLabel={autoT('Kapat')} hitSlop={6} style={{ padding: 4, ...ptr }}>
              <X size={15} color={T.ink3} strokeWidth={2} />
            </Pressable>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <Text selectable style={{ fontSize: 34, fontWeight: '700', letterSpacing: 6, color: pairingExpired ? T.ink3 : T.ink, textDecorationLine: pairingExpired ? 'line-through' : 'none', fontFamily: WEB ? 'JetBrains Mono, ui-monospace, monospace' : undefined }}>
              {pairing.code}
            </Text>
            {WEB && !pairingExpired && (
              <Pressable onPress={copyCode} accessibilityRole="button" style={[plainBtn, ptr]}>
                {copied ? <Check size={13} color="#059669" strokeWidth={2.4} /> : <Copy size={13} color={U.plainBtn.fg} strokeWidth={1.9} />}
                <Text style={{ fontSize: 12.5, fontWeight: '600', color: copied ? '#059669' : U.plainBtn.fg }}>{copied ? autoT('Kopyalandı') : autoT('Kopyala')}</Text>
              </Pressable>
            )}
          </View>
          {pairingExpired ? (
            <Text style={{ fontSize: 12.5, color: U.chipTones.warning.fg }}>
              Kodun süresi doldu. Listeden "Yeni kod al" ile yeni kod üretin.
            </Text>
          ) : (
            <Text style={{ fontSize: 12.5, color: T.ink2, lineHeight: 18 }}>
              {`${autoT('Tablette siman.app/kiosk adresini açıp bu kodu girin. Kalan süre')}: `}
              <Text style={{ fontWeight: '700', color: T.ink, fontVariant: ['tabular-nums'] }}>{mmss(pairingLeft)}</Text>
            </Text>
          )}
        </View>
      )}

      {/* Yeni tablet */}
      <View style={{ gap: 6 }}>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <TextInput
            value={name}
            onChangeText={(v) => { setName(v); if (addErr) setAddErr(''); }}
            onSubmitEditing={add}
            placeholder={autoT('Tablet adı (ör. Üretim Tableti 1)')}
            placeholderTextColor={T.ink3}
            style={[U.inputStyle, { flex: 1, minWidth: 0 }, addErr ? { borderColor: danger } : null]}
          />
          <Pressable onPress={add} disabled={busy} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 42, paddingHorizontal: 16, borderRadius: 999, backgroundColor: accentColor, opacity: busy ? 0.6 : 1, ...ptr }}>
            {busy ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Plus size={15} color="#FFFFFF" strokeWidth={2.2} />}
            <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 13 }}>Tablet ekle</Text>
          </Pressable>
        </View>
        {!!addErr && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <AlertCircle size={13} color={danger} strokeWidth={2} />
            <Text style={{ fontSize: 12, color: danger }}>{addErr}</Text>
          </View>
        )}
      </View>

      {/* Liste */}
      {loading ? (
        <ActivityIndicator color={accentText} style={{ marginVertical: 12 }} />
      ) : loadErr ? (
        <Text style={{ fontSize: 13, color: danger }}>Tabletler yüklenemedi.</Text>
      ) : live.length === 0 ? (
        <Text style={{ fontSize: 13, color: T.ink3, paddingVertical: 8 }}>Henüz kayıtlı tablet yok.</Text>
      ) : (
        <View>{sorted.map(row)}</View>
      )}

      {revoked.length > 0 && (
        <View>
          <Pressable onPress={() => setShowRevoked(v => !v)} accessibilityRole="button" accessibilityState={{ expanded: showRevoked }} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, alignSelf: 'flex-start', ...ptr }}>
            {showRevoked ? <ChevronDown size={14} color={T.ink3} strokeWidth={2} /> : <ChevronRight size={14} color={T.ink3} strokeWidth={2} />}
            <Text style={{ fontSize: 12.5, fontWeight: '600', color: T.ink3 }}>{`${autoT('Kaldırılan tabletler')} (${revoked.length})`}</Text>
          </Pressable>
          {showRevoked && <View>{revoked.map(row)}</View>}
        </View>
      )}

      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </View>
  );
}
