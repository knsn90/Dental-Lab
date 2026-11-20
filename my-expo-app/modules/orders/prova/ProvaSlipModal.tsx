/**
 * ProvaSlipModal — "Prova fişi" penceresi: lab notu yazılır, A5 önizleme canlı
 * güncellenir, Yazdır önizleme iframe'ini basar. Yalnız web (yazdırma web'de).
 * Prova popup'ı ve İş Kağıdı popup'ı aynı pencereyi açar.
 * Yazdır'a basınca not değiştiyse provanın lab_notes alanına yazılır; sıradaki prova
 * henüz kayıtlı değilse önce planlanan prova açılır (sonraki "Gönderildi" onu gönderir).
 */
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, Modal, Platform, TextInput, ActivityIndicator, useWindowDimensions } from 'react-native';
import { autoT } from '../../../core/i18n/autoTranslate';
import { useInkUI } from '../../../core/theme/inkScale';
import { useMobileTokens } from '../../../core/theme/mobileDesignTokens';
import { useThemeModeStore } from '../../../core/store/themeModeStore';
import { GlassTooltip } from '../../../core/ui/GlassTooltip';
import { Printer, X } from '../../../core/ui/icons';
import type { WorkOrder } from '../types';
import { buildProvaSlipDoc } from '../lib/buildProvaSlipDoc';
import { provaCreate, provaSetLabNote } from './api';

const FRAME_ID = 'prova-slip-iframe';

export function ProvaSlipModal({
  visible, onClose, order, provaLabel, qrUrl, provaId, initialNote, onSaved,
}: {
  visible: boolean;
  onClose: () => void;
  order: WorkOrder;
  provaLabel: string;
  qrUrl: string;
  /** Notun yazılacağı prova (klinikteki / planlanan). Yoksa yazdırırken açılır. */
  provaId: string | null;
  /** Provada kayıtlı lab notu — alan bununla açılır. */
  initialNote?: string | null;
  /** Not kaydedildikten sonra (prova verisini yenilemek için). */
  onSaved?: () => void;
}) {
  const U = useInkUI();
  const T = useMobileTokens();
  const isDark = useThemeModeStore((s) => s.resolvedDark);
  const { width, height } = useWindowDimensions();
  const [note, setNote] = useState('');
  const [html, setHtml] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const req = useRef(0);
  const savedNote = useRef('');

  useEffect(() => {
    if (visible) { const n = (initialNote ?? '').trim(); setNote(n); savedNote.current = n; }
    else { setNote(''); setHtml(null); setErr(null); setSaveErr(null); req.current++; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // Not yazıldıkça önizleme yeniden kurulur (kısa gecikmeyle).
  useEffect(() => {
    if (!visible) return;
    const r = ++req.current;
    const h = setTimeout(() => {
      setErr(null);
      buildProvaSlipDoc(order, { qrUrl, provaLabel, labNote: note, screenBg: isDark ? '#141312' : '#EEF0F3' })
        .then((out) => { if (r === req.current) setHtml(out); })
        .catch((e) => {
          console.error('prova slip build failed', e);
          if (r === req.current) setErr(autoT('Önizleme hazırlanamadı. Tekrar deneyin.'));
        });
    }, html ? 350 : 0);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, note, provaLabel, isDark]);

  // Not değiştiyse provaya yazar. Hata yazdırmayı engellemez; düğmenin yanında görünür.
  const saveNote = async () => {
    const n = note.trim();
    if (n === savedNote.current) return;
    setSaving(true); setSaveErr(null);
    let id = provaId;
    if (!id) {
      if (!n) { setSaving(false); return; }
      const c = await provaCreate(order.id);
      if (!c.ok || !c.data) { setSaving(false); setSaveErr(c.error ?? autoT('Not provaya kaydedilemedi')); return; }
      id = c.data;
    }
    const r = await provaSetLabNote(id, n);
    setSaving(false);
    if (!r.ok) { setSaveErr(r.error ?? autoT('Not provaya kaydedilemedi')); return; }
    savedNote.current = n;
    onSaved?.();
  };

  const print = () => {
    if (typeof document === 'undefined') return;
    void saveNote();
    const iframe = document.getElementById(FRAME_ID) as HTMLIFrameElement | null;
    const w = iframe?.contentWindow;
    if (!w) return;
    const fonts = (iframe?.contentDocument as any)?.fonts;
    Promise.resolve(fonts?.ready).catch(() => undefined).then(() => {
      try { w.focus(); w.print(); } catch (e) { console.error('print failed', e); }
    });
  };

  if (!visible || Platform.OS !== 'web') return null;
  const stage = isDark ? '#141312' : '#EEF0F3';

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={U.modalOverlay}>
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{
            ...U.modalCard, maxWidth: undefined, maxHeight: undefined,
            width: Math.min(Math.max(width * 0.55, 500), 680, width - 32),
            height: Math.min(height * 0.92, 940),
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: U.hairline }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontSize: 15, fontWeight: '600', color: U.ink[900] }} numberOfLines={1}>{autoT('Prova fişi')}</Text>
              <Text style={{ fontSize: 12, color: U.ink[400], marginTop: 1 }} numberOfLines={1}>
                {`#${order.order_number} · ${provaLabel}`}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {saveErr ? (
                <Text accessibilityRole="alert" numberOfLines={2} style={{ maxWidth: 220, fontSize: 11.5, fontWeight: '600', color: U.chipTones.danger.fg }}>{saveErr}</Text>
              ) : null}
              <GlassTooltip title={autoT('Yazdır')} text={autoT('Prova fişini A5 olarak yazdırır; lab notunu provaya kaydeder')} placement="bottom">
                <Pressable
                  onPress={print}
                  disabled={!html || saving}
                  accessibilityRole="button"
                  accessibilityLabel={autoT('Yazdır')}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999,
                    backgroundColor: U.ink[900], opacity: html ? 1 : 0.5, cursor: html ? 'pointer' : 'default',
                  } as any}
                >
                  <Printer size={14} color={U.onDarkPill} strokeWidth={1.8} />
                  <Text style={{ fontSize: 12, fontWeight: '600', color: U.onDarkPill }}>{autoT('Yazdır')}</Text>
                </Pressable>
              </GlassTooltip>
              <GlassTooltip title={autoT('Kapat')} text={autoT('Prova fişi penceresini kapatır')} placement="bottom">
                <Pressable
                  onPress={onClose}
                  accessibilityRole="button"
                  accessibilityLabel={autoT('Kapat')}
                  style={{
                    width: 32, height: 32, borderRadius: 999, alignItems: 'center', justifyContent: 'center',
                    backgroundColor: U.plainBtn.bg, borderWidth: 1, borderColor: U.plainBtn.border, cursor: 'pointer',
                  } as any}
                >
                  <X size={14} color={U.plainBtn.fgMuted} strokeWidth={1.8} />
                </Pressable>
              </GlassTooltip>
            </View>
          </View>

          <View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12, gap: 6, borderBottomWidth: 1, borderBottomColor: U.hairline }}>
            <Text style={{ fontSize: 10.5, fontWeight: '700', letterSpacing: 1.1, color: U.ink[500], textTransform: 'uppercase' }}>{autoT('Lab notu')}</Text>
            <TextInput
              value={note}
              onChangeText={setNote}
              multiline
              placeholder={autoT('Hekime not · ör. oklüzyonu ve kontakları kontrol edin')}
              placeholderTextColor={T.ink3}
              style={{
                minHeight: 64, maxHeight: 120, borderRadius: 14, borderWidth: 1, borderColor: T.hairline,
                backgroundColor: T.card, color: T.ink, fontSize: 13, padding: 12, outlineStyle: 'none',
              } as any}
            />
            <Text style={{ fontSize: 11.5, color: U.ink[400] }}>
              {autoT('Not yazdırınca provaya kaydedilir. Boş bırakırsanız fişte elle yazılacak çizgili alan kalır; hekim notu kutusu hekimin kalemle doldurması için boştur.')}
            </Text>
          </View>

          {html ? (
            React.createElement('iframe', {
              id: FRAME_ID,
              srcDoc: html,
              style: { flex: 1, width: '100%', height: '100%', border: 0, backgroundColor: stage },
              title: autoT('Prova fişi'),
            })
          ) : (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: stage }}>
              {err ? (
                <Text accessibilityRole="alert" style={{ fontSize: 13, color: U.chipTones.danger.fg, textAlign: 'center' }}>{err}</Text>
              ) : (
                <ActivityIndicator color={U.ink[500]} />
              )}
            </View>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
