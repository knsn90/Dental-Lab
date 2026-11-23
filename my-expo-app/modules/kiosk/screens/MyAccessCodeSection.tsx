// modules/kiosk/screens/MyAccessCodeSection.tsx
// Ayarlar → "Giriş Kodum": kullanıcı tablet giriş kodunu (6 haneli PIN) belirler/kaldırır.
// Lab ekibi + teknisyen/kurye görür (hekim/klinik değil) — tablette kişi seçilip bu kodla
// giriş yapılır. Başlık hub'dan gelir (sekme + üst başlık) → burada tekrar yazılmaz.
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, Platform, ScrollView } from 'react-native';
import { myCodeStatus, setMyCode, clearMyCode, isWeakCode, type MyCodeStatus } from '../api';
import { confirmAsync } from '../../../core/util/confirm';
import { toast } from '../../../core/ui/Toast';
import { useMobileTokens } from '../../../core/theme/mobileDesignTokens';
import { useThemeModeStore } from '../../../core/store/themeModeStore';
import { useInkUI } from '../../../core/theme/inkScale';
import { PAGE_PADDING } from '../../../core/ui/pageMetrics';
import { autoT } from '../../../core/i18n/autoTranslate';
import { localeTag } from '../../../core/i18n';
import { Info, Lock, RefreshCw } from '../../../core/ui/icons';
import { accentInk, onAccentFg } from '../../settings/sections/GeneralSection';

const DANGER = '#DC2626';
const DANGER_DARK = '#F87171';
const webPointer = Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : {};

type Field = 'old' | 'new' | 'confirm';

function fmtDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(localeTag(), { day: 'numeric', month: 'long', year: 'numeric' });
}
function fmtTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString(localeTag(), { hour: '2-digit', minute: '2-digit' });
}

/** 6 haneli kod alanı. Web'de type=password KULLANILMAZ: tarayıcı kodu site şifresi
 *  sanıp kaydetmeyi önerir / giriş şifresinin üstüne yazabilirdi → CSS ile maskelenir. */
function CodeInput({ label, value, onChange, bad, accent, onSubmit, autoFocus }: {
  label: string; value: string; onChange: (v: string) => void; bad: boolean; accent: string;
  onSubmit?: () => void; autoFocus?: boolean;
}) {
  const T = useMobileTokens();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const [focused, setFocused] = useState(false);
  const danger = isDark ? DANGER_DARK : DANGER;
  const border = bad ? danger : focused ? accent : (isDark ? (T.hairline as string) : '#D4DAE3');
  const isWeb = Platform.OS === 'web';
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontSize: 13, fontWeight: '600', color: isDark ? (T.ink as string) : '#0F172A' }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={(t) => onChange(t.replace(/[^0-9]/g, '').slice(0, 6))}
        keyboardType="number-pad"
        inputMode="numeric"
        maxLength={6}
        secureTextEntry={!isWeb}
        autoComplete="off"
        autoCorrect={false}
        textContentType="oneTimeCode"
        autoFocus={autoFocus}
        accessibilityLabel={label}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onSubmitEditing={onSubmit}
        style={{
          borderWidth: 1, borderColor: border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
          fontSize: 20, letterSpacing: 8, textAlign: 'center', color: isDark ? (T.ink as string) : '#0F172A',
          width: '100%', maxWidth: 220,
          backgroundColor: isDark ? (T.cardSoft as string) : '#FFFFFF',
          ...(isWeb ? ({ fontFamily: 'monospace', WebkitTextSecurity: 'disc', outlineStyle: 'none' } as any) : {}),
        }}
      />
    </View>
  );
}

/** embedded: Tablet Girişi sayfasında kart gövdesi olarak çizilir (kendi ScrollView'i ve sayfa dolgusu yok). */
export function MyAccessCodeSection({ accentColor = '#3563A8', embedded = false }: { accentColor?: string; embedded?: boolean }) {
  const T = useMobileTokens();
  const U = useInkUI();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const ink = isDark ? (T.ink as string) : '#0F172A';
  const muted = isDark ? (T.ink3 as string) : '#64748B';
  const danger = isDark ? DANGER_DARK : DANGER;
  const accentText = accentInk(accentColor, isDark);
  const fieldAccent = isDark ? accentText : accentColor;

  const [status, setStatus] = useState<MyCodeStatus | null>(null);
  const [oldCode, setOldCode] = useState('');
  const [code, setCode] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [errField, setErrField] = useState<Field | null>(null);

  const refresh = useCallback(() => {
    setStatus(null);
    myCodeStatus().then(setStatus);
  }, []);
  useEffect(refresh, [refresh]);

  const hasCode = !!status?.hasCode;
  const locked = !!status?.lockedUntil;

  const fail = (field: Field | null, msg: string) => { setErrField(field); setErr(msg); };
  const clearErr = () => { if (err) { setErr(''); setErrField(null); } };

  const save = async () => {
    if (busy || locked) return;
    clearErr();
    if (hasCode && oldCode.length !== 6) return fail('old', autoT('Mevcut kodunuzu girin.'));
    if (!/^[0-9]{6}$/.test(code)) return fail('new', autoT('Kod 6 haneli (rakam) olmalı.'));
    if (isWeakCode(code)) return fail('new', autoT('Bu kod tahmin edilmesi kolay. Sıralı ya da tekrarlanan rakamlar kullanmayın.'));
    if (code !== confirm) return fail('confirm', autoT('Kodlar eşleşmiyor.'));
    setBusy(true);
    const res = await setMyCode(code, hasCode ? oldCode : undefined);
    setBusy(false);
    if (!res.ok) {
      if (res.error === 'old_code_mismatch') { setOldCode(''); return fail('old', autoT('Mevcut kod yanlış.')); }
      if (res.error === 'weak_code') return fail('new', autoT('Bu kod tahmin edilmesi kolay. Sıralı ya da tekrarlanan rakamlar kullanmayın.'));
      if (res.error === 'locked') { refresh(); return; }
      return fail(null, autoT('Kaydedilemedi. Tekrar deneyin.'));
    }
    setOldCode(''); setCode(''); setConfirm('');
    toast.success(autoT('Giriş kodunuz kaydedildi.'));
    refresh();
  };

  const remove = async () => {
    const ok = await confirmAsync(
      autoT('Kodu kaldır'),
      autoT('Tablet giriş kodunuz kaldırılsın mı? Tabletlerde kodla giriş yapamazsınız.'),
      { confirmText: autoT('Kaldır'), destructive: true },
    );
    if (!ok) return;
    setBusy(true);
    const res = await clearMyCode();
    setBusy(false);
    if (res.ok) {
      setOldCode(''); setCode(''); setConfirm(''); clearErr();
      toast.success(autoT('Kod kaldırıldı.'));
      refresh();
    } else {
      toast.error(autoT('Kod kaldırılamadı. Tekrar deneyin.'));
    }
  };

  const pad = embedded ? {} : { paddingHorizontal: PAGE_PADDING, paddingTop: 8, paddingBottom: 120 };

  if (status === null) {
    return <View style={{ padding: 24 }}><ActivityIndicator color={accentText} /></View>;
  }
  if (!status.ok) {
    return (
      <View style={{ ...pad, gap: 12, alignItems: 'flex-start' }}>
        <Text style={{ color: danger, fontSize: 13 }}>Kod durumu yüklenemedi.</Text>
        <Pressable onPress={refresh} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: U.plainBtn.bg, borderWidth: 1, borderColor: U.plainBtn.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 9, ...webPointer }}>
          <RefreshCw size={14} color={U.plainBtn.fg} strokeWidth={1.8} />
          <Text style={{ color: U.plainBtn.fg, fontWeight: '600', fontSize: 13 }}>Tekrar dene</Text>
        </Pressable>
      </View>
    );
  }

  const Wrap: any = embedded ? View : ScrollView;
  const ready = (!hasCode || oldCode.length === 6) && code.length === 6 && confirm.length === 6;
  const canSave = ready && !busy && !locked;
  const okTone = isDark
    ? { bg: 'rgba(45,154,107,0.18)', fg: '#74E1A8', dot: '#32BB78' }
    : { bg: 'rgba(45,154,107,0.10)', fg: '#0F6E50', dot: '#2D9A6B' };
  const warnTone = isDark
    ? { bg: 'rgba(232,155,42,0.18)', fg: '#FCD34D' }
    : { bg: 'rgba(232,155,42,0.12)', fg: '#92400E' };

  return (
    <Wrap {...(embedded
      ? { style: { gap: 18, width: '100%' } }
      : { style: { flex: 1 }, keyboardShouldPersistTaps: 'handled', showsVerticalScrollIndicator: false, contentContainerStyle: { ...pad, gap: 18, width: '100%', maxWidth: 520 + PAGE_PADDING * 2 } })}>
      <Text style={{ fontSize: 13, color: muted, lineHeight: 19 }}>
        Lab tabletlerinde e-posta ve şifre yerine adınızı seçip bu 6 haneli kodla giriş yaparsınız. Kodu yalnız siz bilirsiniz; yönetici yalnız sıfırlayabilir.
      </Text>

      {hasCode && !locked && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: okTone.bg, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: okTone.dot }} />
          <Text style={{ fontSize: 13, color: okTone.fg, fontWeight: '600', flexShrink: 1 }}>
            {status.updatedAt
              ? `${autoT('Giriş kodunuz tanımlı')} · ${fmtDate(status.updatedAt)}`
              : autoT('Giriş kodunuz tanımlı.')}
          </Text>
        </View>
      )}

      {locked && (
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: warnTone.bg, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 }}>
          <Lock size={15} color={warnTone.fg} strokeWidth={1.9} style={{ marginTop: 2 }} />
          <Text style={{ fontSize: 13, color: warnTone.fg, fontWeight: '600', flexShrink: 1, lineHeight: 19 }}>
            {`${autoT('Çok fazla hatalı deneme. Kodu değiştirmek için bekleyin')}: ${fmtTime(status.lockedUntil)}`}
          </Text>
        </View>
      )}

      <View style={{ gap: 14 }}>
        {hasCode && (
          <CodeInput
            label={autoT('Mevcut kod')}
            value={oldCode}
            onChange={(v) => { setOldCode(v); clearErr(); }}
            bad={errField === 'old'}
            accent={fieldAccent}
          />
        )}
        <CodeInput
          label={hasCode ? autoT('Yeni kod') : autoT('Kod belirle')}
          value={code}
          onChange={(v) => { setCode(v); clearErr(); }}
          bad={errField === 'new'}
          accent={fieldAccent}
        />
        <CodeInput
          label={autoT('Yeni kodu tekrar girin')}
          value={confirm}
          onChange={(v) => { setConfirm(v); clearErr(); }}
          bad={errField === 'confirm'}
          accent={fieldAccent}
          onSubmit={save}
        />
        <Text style={{ fontSize: 12, color: muted, lineHeight: 17 }}>
          6 rakam. 123456, 000000, 121212 gibi kolay kodlar kabul edilmez.
        </Text>
      </View>

      {err ? <Text accessibilityLiveRegion="polite" style={{ color: danger, fontSize: 13, marginTop: -6 }}>{err}</Text> : null}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        <Pressable
          onPress={save}
          disabled={!canSave}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canSave, busy }}
          style={{
            backgroundColor: accentColor, borderRadius: 12, paddingHorizontal: 22, paddingVertical: 12, minWidth: 104,
            alignItems: 'center', opacity: canSave ? 1 : 0.45, ...(canSave ? webPointer : {}),
          }}
        >
          {busy ? <ActivityIndicator color={onAccentFg(accentColor)} /> : (
            <Text style={{ color: onAccentFg(accentColor), fontWeight: '700' }}>{hasCode ? autoT('Kodu değiştir') : autoT('Kaydet')}</Text>
          )}
        </Pressable>
        {hasCode && (
          <Pressable
            onPress={remove}
            disabled={busy}
            accessibilityRole="button"
            style={{ backgroundColor: U.plainBtn.bg, borderWidth: 1, borderColor: U.plainBtn.border, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 12, ...webPointer }}
          >
            <Text style={{ color: danger, fontWeight: '600' }}>Kodu kaldır</Text>
          </Pressable>
        )}
      </View>

      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start', backgroundColor: isDark ? (T.cardSoft as string) : '#F4F6F9', borderWidth: 1, borderColor: isDark ? (T.hairline as string) : '#E6EAF0', borderRadius: 12, padding: 12 }}>
        <Info size={15} color={muted} strokeWidth={1.8} style={{ marginTop: 2 }} />
        <Text style={{ fontSize: 12, color: isDark ? (T.ink2 as string) : '#475569', lineHeight: 18, flexShrink: 1 }}>
          Tablette 10 dakika işlem yapılmazsa oturum kendiliğinden kapanır. Aynı kişi için 5 hatalı denemede kod 15 dakika kilitlenir.
        </Text>
      </View>
    </Wrap>
  );
}
