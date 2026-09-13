/**
 * OrderAiSummaryCard — sipariş detayında "Simanty özeti" kartı.
 *
 * Buton Simanty penceresini hazır istemle açar; özet orada yazılır ve
 * `order_ai_reports`'a kaydedilir. Kart, kaydedilmiş SON özeti gösterir →
 * sipariş ikinci kez açıldığında yeniden üretmeye gerek kalmaz.
 *
 * Özet kaydın yerine geçmez: altındaki kaynak satırı neyin üstünden yazıldığını
 * söyler, mesaj/dosya hâlâ kendi yerinde durur.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, Platform } from 'react-native';
import { RotateCcw } from '../../../core/ui/icons';
import { ColorOrb } from './ColorOrb';

import { autoT } from '../../../core/i18n/autoTranslate';
import { useMobileTokens } from '../../../core/theme/mobileDesignTokens';
import { useThemeModeStore } from '../../../core/store/themeModeStore';
import { useDentyStore } from '../store/dentyStore';
import { useAuthStore } from '../../../core/store/authStore';
import { fetchLatestReport, reportIntoPanel, type OrderReport } from '../orderReport';

function fmt(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return ''; }
}

export function OrderAiSummaryCard({ orderId, accent }: { orderId: string; accent: string }) {
  const T = useMobileTokens();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const userType = useAuthStore(s => (s.profile as any)?.user_type as string | undefined);
  const audience: 'lab' | 'clinic' =
    (userType === 'lab' || userType === 'admin') ? 'lab' : 'clinic';
  const busy = useDentyStore(s => s.busy);
  const panelOpen = useDentyStore(s => s.isOpen);

  const [report, setReport] = useState<OrderReport | null>(null);

  const load = useCallback(async () => {
    try { setReport(await fetchLatestReport(orderId)); } catch { /* özet yoksa sessiz */ }
  }, [orderId]);

  useEffect(() => { void load(); }, [load]);
  // Simanty penceresi kapanınca yeni özet yazılmış olabilir → tazele.
  useEffect(() => { if (!panelOpen) void load(); }, [panelOpen, load]);

  const src = report?.sources ?? null;
  const srcLine = src
    ? [
        src.messages ? `${src.messages} ${autoT('mesaj')}` : null,
        src.files ? `${src.files} ${autoT('dosya')}` : null,
        src.linked ? `${src.linked} ${autoT('bağlı iş')}` : null,
        src.history ? `${src.history} ${autoT('geçmiş iş')}` : null,
      ].filter(Boolean).join(' · ')
    : '';

  return (
    <View className="bg-white dark:bg-[#1B1916] rounded-3xl border border-black/[0.06] dark:border-white/10 p-5">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        {/* Simanty kimliği: lucide ikon yerine asistanın kendi orbu */}
        <ColorOrb size={16} />
        <Text className="text-[11px] font-semibold uppercase text-ink-400 dark:text-white/45" style={{ letterSpacing: 1.1 }}>
          {autoT('Simanty özeti')}
        </Text>
        <View style={{ flex: 1 }} />
        <Pressable
          onPress={() => { void reportIntoPanel(orderId, audience); }}
          disabled={busy}
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 5,
            paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999,
            backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : `${accent}1A`,
            opacity: busy ? 0.5 : 1,
            ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
          }}
        >
          {report ? <RotateCcw size={11} color={accent} strokeWidth={2} /> : null}
          <Text style={{ fontSize: 11.5, fontWeight: '600', color: accent }}>
            {report ? autoT('Yeniden üret') : autoT('Özet çıkar')}
          </Text>
        </Pressable>
      </View>

      {report ? (
        <View style={{ gap: 6 }}>
          <Text style={{ fontSize: 12.5, lineHeight: 19, color: T.ink }}>{report.body}</Text>
          <Text style={{ fontSize: 10.5, color: T.ink3 }}>
            {fmt(report.created_at)}
            {report.created_by_name ? ` · ${report.created_by_name}` : ''}
            {srcLine ? ` · ${autoT('kaynak')}: ${srcLine}` : ''}
          </Text>
        </View>
      ) : (
        <Text style={{ fontSize: 12, color: T.ink3, lineHeight: 18 }}>
          {autoT('Simanty bu vakanın mesajlarını, dosyalarını ve geçmiş işlerini okuyup kısa bir özet çıkarabilir.')}
        </Text>
      )}
    </View>
  );
}
