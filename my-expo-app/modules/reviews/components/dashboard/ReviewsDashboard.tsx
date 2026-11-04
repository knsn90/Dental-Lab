/**
 * Değerlendirmeler ekranı (spec 2026-11-04 §7): beyaz hero + ay seçici, Klinikler
 * tablosu, klinik süzgeci seçiliyken o kliniğin ay değerlendirmeleri, değilse düşük
 * puanlar listesi. Veriyi `get_review_dashboard` RPC'si verir (yalnız lab yöneticisi).
 * Sayfa kenar dolgusu ekranın kabından gelir; burada yatay dolgu yok.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, ActivityIndicator, Platform } from 'react-native';
import { useRouter, useSegments } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { WhiteHero } from '../../../../core/ui/WhiteHero';
import { EmptyStateX } from '../../../../core/ui/EmptyStateX';
import { GlassTooltip } from '../../../../core/ui/GlassTooltip';
import { MobileTableX, MobileTableRowX, useMobileTableText } from '../../../../core/ui/MobileTableX';
import { ChevronLeft, ChevronRight, X } from '../../../../core/ui/icons';
import { CARD_GAP } from '../../../../core/ui/pageMetrics';
import { useInkUI } from '../../../../core/theme/inkScale';
import { usePanelTheme, onAccentInk } from '../../../../core/theme/usePanelTheme';
import { autoT } from '../../../../core/i18n/autoTranslate';
import { isRTL } from '../../../../core/i18n';
import { useAuthStore } from '../../../../core/store/authStore';
import { usePermissionStore } from '../../../../core/store/permissionStore';
import { useTurkeyOnlyFeatures } from '../../../../core/store/labSettingsStore';
import { avgDelta, formatAvg, shiftMonth, currentTrMonth, isFutureMonth, metaSep } from '../../dashboardRules';
import { getReviewDashboard } from '../../api';
import type { ReviewDashboard, ReviewCallState } from '../../types';
import { ReviewClinicsTable } from './ReviewClinicsTable';
import { ReviewRowSummary } from './ReviewRowSummary';
import { ReviewLowList } from './ReviewLowList';
import { PressScale, useReviewTones, useReducedMotion, fmtInt, fmtPct, monthLabel } from './dashboardUi';

type Query = { month: string | null; focus: string | null };

export function ReviewsDashboard({ focusWorkOrderId, scrollRef }: {
  focusWorkOrderId?: string | null;
  /** Ekranın dikey kaydırma kabı; native'de bildirim satırını görünür alana kaydırmak için. */
  scrollRef?: React.RefObject<any>;
}) {
  const U = useInkUI();
  const T = useMobileTableText();
  const tones = useReviewTones();
  const panel = usePanelTheme();
  const router = useRouter();
  const panelBase = String((useSegments() as string[])?.[0] ?? '(lab)');
  const { i18n } = useTranslation();
  const lang = i18n.language;

  const trOnly = useTurkeyOnlyFeatures();
  const isAdmin = useAuthStore(s => s.profile?.user_type) === 'admin';
  const permLoaded = usePermissionStore(s => s.loaded);
  const canManageSettings = usePermissionStore(s => s.permissions.has('manage_settings'));
  const canOpenSettings = trOnly && (isAdmin || !permLoaded || canManageSettings);

  const focus = focusWorkOrderId ?? null;
  const [query, setQuery] = useState<Query>({ month: null, focus });
  const [data, setData] = useState<ReviewDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [clinicFilter, setClinicFilter] = useState<{ key: string; name: string } | null>(null);
  const reqId = useRef(0);

  // Yeni bildirimden gelinirse ay sunucuya bırakılır (işin ayı açılır).
  useEffect(() => {
    setQuery(q => (q.focus === focus ? q : { month: null, focus }));
  }, [focus]);

  const load = useCallback(async (q: Query) => {
    const id = ++reqId.current;
    setLoading(true);
    setError(null);
    const { data: res, error: err } = await getReviewDashboard(q.month, q.focus);
    if (id !== reqId.current) return;
    setLoading(false);
    if (err || !res) { setError(autoT('Değerlendirmeler yüklenemedi')); return; }
    setData(res);
  }, []);

  useEffect(() => { load(query); }, [query, load]);

  // Arama kaydı kaydedilince satır yerinde güncellenir; hero sayıları değişmez.
  const onCallChanged = useCallback((workOrderId: string, state: ReviewCallState) => {
    setData(prev => (prev ? { ...prev, lows: prev.lows.map(l => (l.work_order_id === workOrderId ? { ...l, ...state } : l)) } : prev));
  }, []);

  const reduced = useReducedMotion();
  const revealFocus = useCallback((node: any) => {
    if (Platform.OS === 'web') {
      node?.scrollIntoView?.({ block: 'center', behavior: reduced ? 'auto' : 'smooth' });
      return;
    }
    const sv = scrollRef?.current;
    const inner = sv?.getInnerViewRef?.() ?? sv?.getInnerViewNode?.();
    if (!sv || !inner || !node?.measureLayout) return;
    node.measureLayout(inner, (_x: number, y: number) => sv.scrollTo({ y: Math.max(0, y - 8), animated: !reduced }), () => {});
  }, [scrollRef, reduced]);

  const now = new Date();
  const shownMonth = (data?.month ?? query.month ?? currentTrMonth(now)).slice(0, 7) + '-01';
  const nextDisabled = isFutureMonth(shiftMonth(shownMonth, 1), now);
  const goMonth = (delta: number) => {
    const next = shiftMonth(shownMonth, delta);
    if (isFutureMonth(next, now)) return;
    setQuery(q => ({ ...q, month: next }));
  };

  const errorBar = error ? (
    <View style={[U.cardSolid, { flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap', paddingVertical: 14 }]}>
      <Text style={{ fontSize: 13, color: tones.bad, flexShrink: 1 }}>{error}</Text>
      <PressScale
        onPress={() => load(query)}
        style={{ paddingHorizontal: 14, height: 34, borderRadius: 999, justifyContent: 'center', backgroundColor: U.plainBtn.bg, borderWidth: 1, borderColor: U.plainBtn.border }}
      >
        <Text style={{ fontSize: 13, fontWeight: '600', color: U.plainBtn.fg }}>{autoT('Yeniden dene')}</Text>
      </PressScale>
    </View>
  ) : null;

  if (!data) {
    return (
      <View style={{ gap: CARD_GAP }}>
        {errorBar}
        {loading ? (
          <View style={{ paddingVertical: 48, alignItems: 'center' }}>
            <ActivityIndicator color={panel.primary} />
          </View>
        ) : null}
      </View>
    );
  }

  if (!data.summary.has_any) {
    return (
      <View style={{ gap: CARD_GAP }}>
        {errorBar}
        <View style={U.cardSolid}>
          <EmptyStateX
            icon="star"
            title="Henüz değerlendirme yok"
            subtitle={canOpenSettings ? "WhatsApp puan isteğini Ayarlar > Entegrasyonlar'dan açabilirsiniz." : undefined}
            cta={canOpenSettings ? { label: 'Ayarlara git', onPress: () => router.push(`/${panelBase}/settings?tab=integrations` as any) } : undefined}
          />
        </View>
      </View>
    );
  }

  const s = data.summary;
  const hasMonth = s.count > 0;
  const d = avgDelta(s.avg, s.prev_avg);
  const diffText = !hasMonth || d == null ? null
    : d === 0 ? `${autoT('Geçen aya göre')} ${autoT('değişmedi')}.`
    : `${autoT('Geçen aya göre')} ${formatAvg(Math.abs(d), lang)} ${autoT(d < 0 ? 'düştü' : 'yükseldi')}.`;
  const countText = hasMonth ? `${fmtInt(s.count, lang)} ${autoT('işe puan verildi')}.` : null;
  const rateText = s.rate && s.rate.delivered > 0 ? fmtPct(s.rate.reviewed / s.rate.delivered, lang) : '—';
  // Süresi dolmamış teslimler yalnız bu ay ve geçen ayda olabilir; daha eski boş ay için ipucu yanıltır.
  const rateHint = rateText === '—' && shownMonth >= shiftMonth(currentTrMonth(now), -1);
  const monthText = monthLabel(shownMonth, lang);
  const rtl = isRTL(lang);
  const PrevIcon = rtl ? ChevronRight : ChevronLeft;
  const NextIcon = rtl ? ChevronLeft : ChevronRight;
  const arrowBtn = { width: 36, height: 36, borderRadius: 999, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: U.plainBtn.bg, borderWidth: 1, borderColor: U.plainBtn.border };

  const filteredReviews = clinicFilter ? data.reviews.filter(r => r.clinic_key === clinicFilter.key) : [];
  const accentInk = onAccentInk(panel.primary);

  return (
    <View style={{ gap: CARD_GAP, opacity: loading ? 0.6 : 1 }}>
      <WhiteHero
        kicker={`${autoT('Değerlendirmeler')}${metaSep(lang)}${monthText}`}
        title={hasMonth ? `${autoT('Ortalama')} ${formatAvg(s.avg, lang)}` : autoT('Bu ay puan yok')}
        description={[diffText, countText].filter(Boolean).join(' ') || undefined}
        stats={[
          { value: fmtInt(s.count, lang), label: autoT('Değerlendirme') },
          { value: fmtInt(s.low_count, lang), label: autoT('Düşük puan'), color: s.low_count > 0 ? tones.bad : undefined },
          { value: rateText, label: autoT('Puan alma') },
        ]}
        actions={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <GlassTooltip text={autoT('Önceki ay')}>
              <PressScale onPress={() => goMonth(-1)} style={arrowBtn} accessibilityLabel={autoT('Önceki ay')}>
                <PrevIcon size={16} color={U.plainBtn.fg} strokeWidth={1.8} />
              </PressScale>
            </GlassTooltip>
            <View style={{ paddingHorizontal: 16, height: 36, borderRadius: 999, justifyContent: 'center', backgroundColor: U.ink[900] }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: U.onDarkPill }}>{monthText}</Text>
            </View>
            <GlassTooltip text={autoT('Sonraki ay')} enabled={!nextDisabled}>
              <PressScale onPress={() => goMonth(1)} disabled={nextDisabled} style={arrowBtn} accessibilityLabel={autoT('Sonraki ay')}>
                <NextIcon size={16} color={U.plainBtn.fg} strokeWidth={1.8} />
              </PressScale>
            </GlassTooltip>
          </View>
        }
      >
        {rateHint ? (
          <Text style={{ fontSize: 12, color: U.isDark ? 'rgba(255,255,255,0.60)' : U.ink[400], marginTop: 10 }}>
            {`${autoT('Puan alma')}: ${autoT('Bu ayın teslimlerinin 14 günü henüz dolmadı')}`}
          </Text>
        ) : null}
      </WhiteHero>

      {errorBar}

      <ReviewClinicsTable
        rows={data.clinics}
        month={shownMonth}
        lang={lang}
        selectedKey={clinicFilter?.key ?? null}
        onSelect={key => {
          if (!key) { setClinicFilter(null); return; }
          const row = data.clinics.find(c => c.key === key);
          setClinicFilter({ key, name: row?.name ?? '—' });
        }}
      />

      {clinicFilter ? (
        <View style={{ gap: 8 }}>
          <View style={{ flexDirection: 'row' }}>
            <GlassTooltip text={autoT('Süzgeci kaldır')}>
              <PressScale
                onPress={() => setClinicFilter(null)}
                accessibilityLabel={autoT('Süzgeci kaldır')}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, height: 32, borderRadius: 999, backgroundColor: panel.primary }}
              >
                <Text style={{ fontSize: 12, fontWeight: '600', color: accentInk }} numberOfLines={1}>{clinicFilter.name}</Text>
                <X size={14} color={accentInk} strokeWidth={2} />
              </PressScale>
            </GlassTooltip>
          </View>
          <MobileTableX title={clinicFilter.name} subtitle={monthText} count={filteredReviews.length} countLabel="değerlendirme">
            {filteredReviews.length === 0 ? (
              <MobileTableRowX isLast>
                <Text style={T.sub}>{autoT('Bu ay puan yok')}</Text>
              </MobileTableRowX>
            ) : filteredReviews.map((r, i) => (
              <ReviewRowSummary
                key={r.work_order_id}
                row={r}
                lang={lang}
                isLast={i === filteredReviews.length - 1}
                highlighted={r.work_order_id === focus}
              />
            ))}
          </MobileTableX>
        </View>
      ) : (
        <ReviewLowList rows={data.lows} focusWorkOrderId={focus} onChanged={onCallChanged} onRevealFocus={revealFocus} />
      )}
    </View>
  );
}
