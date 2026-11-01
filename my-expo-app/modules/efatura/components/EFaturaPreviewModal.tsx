/**
 * EFaturaPreviewModal — e-Fatura TASLAĞININ tam görünümü.
 *
 * Luca'nın taslak işlemi yok: gönderilen fatura anında GİB'e gider. Taslak Siman'da
 * tutulur: EFaturaPanel "Taslak oluştur"da sunucu önizlemesini (imzalı jetonla)
 * alır, bu pencere onu gösterir. Görülen ile kesilen birebir aynıdır (sunucu
 * jetonla doğrular). "Asıl faturayı oluştur" ile kesilir; kapatmak taslağı silmez.
 *
 * KONTROLLÜ bileşen: taslak verisi, yükleniyor/hata ve kesme durumu panelden gelir.
 * Kesme hatası pencereyi kapatmaz; buton satırının hemen üstünde görünür.
 */
import React from 'react';
import { Modal, Platform, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { useInkUI } from '../../../core/theme/inkScale';
import { autoT } from '../../../core/i18n/autoTranslate';
import { localeTag } from '../../../core/i18n';
import { formatMoney } from '../../../core/money/currency';
import { ActivityIndicator } from '../../../core/ui/teethCompat';
import { AlertCircle, CheckCircle2, RefreshCw, X as CloseX } from '../../../core/ui/icons';
import { NavyButton } from '../../invoices/components/InvoiceActionsCard';
import type { EFaturaPreview } from '../types';

interface Props {
  visible: boolean;
  /** Panelin taslağı (null → yükleniyor ya da hata) */
  preview: EFaturaPreview | null;
  loading: boolean;
  loadErr: string | null;
  issuing: boolean;
  issueErr: string | null;
  /** Taslağın süresi doldu → kesme kapalı, "Taslağı yenile" öne çıkar */
  expired: boolean;
  onClose: () => void;
  onRefresh: () => void;
  onIssue: () => void;
  /** Toplu e-Fatura: birleştirilen Siman faturası sayısı (Siman fatura no yerine gösterilir) */
  mergedCount?: number;
}

const money = (n: number, cur: string) => formatMoney(Number(n) || 0, (cur || 'TRY') as any);
const idLabel = (taxCode: string) => (taxCode.length === 11 ? 'TCKN' : 'VKN');

export function EFaturaPreviewModal({ visible, preview: p, loading, loadErr, issuing: sending, issueErr: sendErr, expired, onClose, onRefresh, onIssue, mergedCount }: Props) {
  const U = useInkUI();
  const { width } = useWindowDimensions();
  const wide = width >= 700;
  const close = () => { if (!sending) onClose(); };

  const cur = p?.currency ?? 'TRY';
  const kindText = !p ? ''
    : p.kind === 'e_fatura'
      ? `e-Fatura · ${autoT(p.scenario === 'TICARIFATURA' ? 'Ticari' : 'Temel')}`
      : `e-Arşiv · ${autoT(p.sendingType === 'ELEKTRONIK' ? 'Elektronik (e-posta ile)' : 'Kağıt')}`;
  const dateText = p ? new Date(`${p.issueDate}T00:00:00`).toLocaleDateString(localeTag()) : '';

  const label = (s: string) => (
    <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 0.7, textTransform: 'uppercase', color: U.ink[400] }}>{s}</Text>
  );
  const fact = (k: string, v: string, mono = false) => (
    <View style={{ gap: 2, minWidth: 110 }}>
      {label(k)}
      <Text style={{ fontSize: 13, fontWeight: '600', color: U.ink[900], ...(mono ? { fontFamily: 'monospace' as any } : {}) }}>{v}</Text>
    </View>
  );
  const party = (title: string, x: { name: string; taxCode: string; taxOffice: string | null; address: string; email?: string | null }) => (
    <View style={{
      flex: wide ? 1 : undefined, gap: 6, padding: 14, borderRadius: 16,
      backgroundColor: U.surfaceSoft, borderWidth: 1, borderColor: U.hairlineSoft,
    }}>
      {label(title)}
      <Text style={{ fontSize: 14, fontWeight: '700', color: U.ink[900] }}>{x.name || '—'}</Text>
      <Text style={{ fontSize: 12, color: U.ink[700] }}>
        {`${idLabel(x.taxCode)} ${x.taxCode}`}{x.taxOffice ? ` · ${autoT('Vergi dairesi')}: ${x.taxOffice}` : ''}
      </Text>
      {x.address ? <Text style={{ fontSize: 12, color: U.ink[500], lineHeight: 17 }}>{x.address}</Text> : null}
      {x.email ? <Text style={{ fontSize: 12, color: U.ink[500] }}>{x.email}</Text> : null}
    </View>
  );
  const totalRow = (k: string, v: string, strong = false) => (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
      <Text style={{ fontSize: strong ? 14 : 12.5, fontWeight: strong ? '700' : '500', color: strong ? U.ink[900] : U.ink[500] }}>{k}</Text>
      <Text style={{ fontSize: strong ? 17 : 13, fontWeight: strong ? '800' : '600', color: U.ink[900] }}>{v}</Text>
    </View>
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <Pressable style={U.modalOverlay} onPress={close}>
        <Pressable onPress={e => e.stopPropagation()} style={{ ...U.modalCard, maxWidth: 680 }}>
          {/* Başlık */}
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 22, paddingTop: 18, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: U.hairline }}>
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={{ fontSize: 17, fontWeight: '700', color: U.ink[900] }}>
                {p?.kind === 'e_arsiv' ? 'e-Arşiv taslağı' : 'e-Fatura taslağı'}
              </Text>
              <Text style={{ fontSize: 12.5, color: U.ink[500] }}>
                Bilgileri kontrol edin. Asıl fatura bu bilgilerle birebir kesilir.
              </Text>
            </View>
            <Pressable
              onPress={close}
              accessibilityRole="button"
              accessibilityLabel={autoT('Kapat')}
              style={{
                width: 32, height: 32, borderRadius: 999, alignItems: 'center', justifyContent: 'center',
                backgroundColor: U.plainBtn.bg, borderWidth: 1, borderColor: U.plainBtn.border,
                ...(Platform.OS === 'web' ? { cursor: sending ? 'default' : 'pointer' } as any : {}),
              }}
            >
              <CloseX size={14} color={U.plainBtn.fgMuted} strokeWidth={1.8} />
            </Pressable>
          </View>

          <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ padding: 22, gap: 18 }}>
            {loading ? (
              <View style={{ paddingVertical: 40, alignItems: 'center', gap: 10 }}>
                <ActivityIndicator color={U.ink[500]} />
                <Text style={{ fontSize: 12.5, color: U.ink[500] }}>Alıcı GİB'de sorgulanıyor, fatura hazırlanıyor…</Text>
              </View>
            ) : loadErr ? (
              <View accessibilityRole="alert" style={{ gap: 10, padding: 14, borderRadius: 14, backgroundColor: U.chipTones.danger.bg }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <AlertCircle size={15} strokeWidth={1.9} color={U.chipTones.danger.fg} />
                  <Text style={{ flex: 1, fontSize: 13, fontWeight: '600', color: U.chipTones.danger.fg }}>{loadErr}</Text>
                </View>
                <Text style={{ fontSize: 12, color: U.chipTones.danger.fg }}>
                  Bu haliyle gönderilemez. Eksik bilgiyi tamamlayıp tekrar deneyin.
                </Text>
                <Pressable
                  onPress={onRefresh}
                  style={{
                    alignSelf: 'flex-start', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999,
                    backgroundColor: U.plainBtn.bg, borderWidth: 1, borderColor: U.plainBtn.border,
                    ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                  }}
                >
                  <Text style={{ fontSize: 12, fontWeight: '700', color: U.plainBtn.fg }}>Tekrar dene</Text>
                </Pressable>
              </View>
            ) : p ? (
              <>
                {p.env === 'test' ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 12, backgroundColor: U.chipTones.warning.bg }}>
                    <AlertCircle size={14} strokeWidth={1.9} color={U.chipTones.warning.fg} />
                    <Text style={{ flex: 1, fontSize: 12, fontWeight: '600', color: U.chipTones.warning.fg }}>
                      Test ortamı: fatura Luca test sistemine gider, gerçek GİB'e gitmez.
                    </Text>
                  </View>
                ) : null}

                {/* Tür + tarih + para birimi */}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 18 }}>
                  {fact(autoT('Tür'), kindText)}
                  {fact(autoT('Tarih'), dateText)}
                  {mergedCount
                    ? fact(autoT('Birleştirilen fatura'), `${mergedCount} ${autoT('fatura')}`)
                    : fact(autoT('Siman fatura no'), p.invoiceNumber, true)}
                  {fact(autoT('Para birimi'), p.crossRate ? `${p.currency} · ${autoT('kur')} ${p.crossRate}` : p.currency)}
                </View>
                {p.receiver.inboxTag ? (
                  <View style={{ gap: 2 }}>
                    {label(autoT('Alıcı posta kutusu'))}
                    <Text style={{ fontSize: 12, fontFamily: 'monospace' as any, color: U.ink[700] }}>{p.receiver.inboxTag}</Text>
                  </View>
                ) : null}

                {/* Satıcı / Alıcı */}
                <View style={{ flexDirection: wide ? 'row' : 'column', gap: 12 }}>
                  {party(autoT('Satıcı'), p.seller)}
                  {party(autoT('Alıcı'), p.receiver)}
                </View>

                {/* Kalemler */}
                <View style={{ gap: 2 }}>
                  {label(autoT('Kalemler'))}
                  {p.lines.map((l, i) => (
                    <View key={i} style={{
                      flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10,
                      borderBottomWidth: i === p.lines.length - 1 ? 0 : 1, borderBottomColor: U.hairlineSoft,
                    }}>
                      <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
                        <Text style={{ fontSize: 13, fontWeight: '600', color: U.ink[900] }}>{l.name}</Text>
                        <Text style={{ fontSize: 11.5, color: U.ink[500] }}>
                          {l.note ? `${l.note} · ` : ''}
                          {`${l.quantity} × ${money(l.unitPrice, cur)}`}
                          {l.discount > 0 ? ` · ${autoT('İskonto')} ${money(l.discount, cur)}` : ''}
                          {` · ${autoT('KDV')} %${l.vatRate}`}
                        </Text>
                      </View>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: U.ink[900] }}>{money(l.net, cur)}</Text>
                    </View>
                  ))}
                </View>

                {/* Toplamlar */}
                <View style={{ gap: 7, padding: 14, borderRadius: 16, backgroundColor: U.surfaceSoft, borderWidth: 1, borderColor: U.hairlineSoft }}>
                  {totalRow(autoT('Mal / hizmet toplamı'), money(p.totals.net, cur))}
                  {p.totals.discount > 0 ? totalRow(autoT('Toplam iskonto'), money(p.totals.discount, cur)) : null}
                  {totalRow(autoT('KDV'), money(p.totals.vat, cur))}
                  <View style={{ height: 1, backgroundColor: U.hairline, marginVertical: 2 }} />
                  {totalRow(autoT('Ödenecek tutar'), money(p.totals.payable, cur), true)}
                  {p.totals.payableTry != null ? totalRow(autoT('TL karşılığı'), money(p.totals.payableTry, 'TRY')) : null}
                </View>

                {p.notes.length > 0 ? (
                  <View style={{ gap: 4 }}>
                    {label(autoT('Notlar'))}
                    {p.notes.map((n, i) => (
                      <Text key={i} style={{ fontSize: 12, color: U.ink[700], lineHeight: 17 }}>{n}</Text>
                    ))}
                  </View>
                ) : null}
              </>
            ) : null}
          </ScrollView>

          {/* Alt çubuk — hata BUTONUN YANINDA görünür */}
          <View style={{ paddingHorizontal: 22, paddingVertical: 14, gap: 10, borderTopWidth: 1, borderTopColor: U.hairline }}>
            {sendErr ? (
              <View accessibilityRole="alert" style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 12, backgroundColor: U.chipTones.danger.bg }}>
                <AlertCircle size={14} strokeWidth={1.9} color={U.chipTones.danger.fg} />
                <Text style={{ flex: 1, fontSize: 12, fontWeight: '600', color: U.chipTones.danger.fg }}>{sendErr}</Text>
              </View>
            ) : null}
            <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
              <Text style={{ flex: 1, minWidth: 180, fontSize: 11.5, color: expired ? U.chipTones.warning.fg : U.ink[500] }}>
                {expired
                  ? autoT('Taslağın süresi doldu — yenileyin')
                  : p?.env === 'test'
                    ? autoT('Test ortamı: fatura gerçek GİB\'e gitmez.')
                    : autoT('Asıl fatura GİB\'e iletilir ve geri alınamaz.')}
              </Text>
              <Pressable
                onPress={close}
                disabled={sending}
                style={({ pressed }) => ({
                  paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999,
                  backgroundColor: U.plainBtn.bg, borderWidth: 1, borderColor: U.plainBtn.border,
                  opacity: sending ? 0.5 : pressed ? 0.85 : 1,
                  ...(Platform.OS === 'web' ? { cursor: sending ? 'default' : 'pointer' } as any : {}),
                })}
              >
                <Text style={{ fontSize: 13, fontWeight: '700', color: U.plainBtn.fg }}>{expired ? autoT('Kapat') : autoT('Taslak olarak bırak')}</Text>
              </Pressable>
              {expired ? (
                <NavyButton
                  label={loading ? autoT('Taslak hazırlanıyor…') : autoT('Taslağı yenile')}
                  icon={loading ? <ActivityIndicator size={16} color="#FFFFFF" /> : <RefreshCw size={13} strokeWidth={1.9} color="#FFFFFF" />}
                  onPress={onRefresh}
                  disabled={loading}
                />
              ) : (
                <NavyButton
                  label={sending ? autoT('Fatura kesiliyor…') : autoT('Asıl faturayı oluştur')}
                  icon={sending
                    ? <ActivityIndicator size={16} color="#FFFFFF" />
                    : <CheckCircle2 size={13} strokeWidth={1.9} color="#FFFFFF" />}
                  onPress={onIssue}
                  disabled={!p || loading || sending}
                />
              )}
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
