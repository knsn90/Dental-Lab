/**
 * InvoiceActionsCard — fatura detayının sağ kolonundaki belge işlemleri.
 *
 * ÖNCE: üç ayrı gölgeli kart (not · ödeme linki · e-fatura), aralarında
 * numaralı rozetler ve bir chevron bağlaç. Üç kart üç ayrı tasarım dili
 * kullanıyordu (mobil token'lar, ham slate/blue hex'leri, pastel kutular) ve
 * kolonu gereksiz uzatıyordu.
 *
 * SONRA: TEK kart, içinde numaralı bölümler. Kart sayfanın geri kalanıyla
 * aynı yüzeyden (`useInkUI().cardSolid`) beslenir; vurgu rengi LACİVERT.
 *
 * Bölüm başlığı (`ActionSectionHead`) buradan dışa açılır: ödeme ve e-fatura
 * panelleri de aynı başlığı kullanır, böylece üç bölüm birebir aynı ölçüde
 * durur. Panellerin ikisi de yalnız bu kart tarafından kullanılır.
 */
import React from 'react';
import { View, Text, TextInput, Pressable, Platform } from 'react-native';
import { useInkUI } from '../../../core/theme/inkScale';
import { autoT } from '../../../core/i18n/autoTranslate';
import { EFaturaPanel } from '../../efatura/components/EFaturaPanel';
import { WorkBreakdownPdfButton } from './WorkBreakdownPdfButton';
import { isWorkBreakdownStatus } from '../lib/workBreakdown';
import { PaymentLinkPanel } from '../../payments/components/PaymentLinkPanel';
import type { EFaturaStatus } from '../../efatura/types';

/** Bölümlerin ortak vurgu rengi — panel accent'inden bağımsız, sabit lacivert. */
export const ACTION_NAVY = '#314F7E';

/** Lacivertin koyu temada okunur tonu + yumuşak zemini. */
export function navyTones(isDark: boolean) {
  return {
    ink:  isDark ? '#A8C6EA' : ACTION_NAVY,
    soft: isDark ? 'rgba(168,198,234,0.14)' : 'rgba(49,79,126,0.08)',
    line: isDark ? 'rgba(168,198,234,0.28)' : 'rgba(49,79,126,0.18)',
  };
}

/** Kart içindeki bölümlerin ortak yatay dolgusu. */
export const SECTION_PAD = 18;

export function ActionSectionHead({
  step, title, hint, right,
}: {
  step?: number;
  title: string;
  hint?: string | null;
  right?: React.ReactNode;
}) {
  const U = useInkUI();
  const navy = navyTones(U.isDark);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      {step ? (
        <View style={{
          width: 24, height: 24, borderRadius: 8,
          alignItems: 'center', justifyContent: 'center',
          backgroundColor: navy.soft, borderWidth: 1, borderColor: navy.line,
        }}>
          <Text style={{ fontSize: 11, fontWeight: '700', color: navy.ink }}>{step}</Text>
        </View>
      ) : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ fontSize: 13.5, fontWeight: '700', color: U.ink[900] }}>
          {title}
        </Text>
        {hint ? (
          <Text numberOfLines={1} style={{ fontSize: 11, color: U.ink[400], marginTop: 1 }}>
            {hint}
          </Text>
        ) : null}
      </View>
      {right}
    </View>
  );
}

/** Lacivert dolu birincil kapsül — kartın tek baskın düğme biçimi. */
export function NavyButton({
  label, icon, onPress, disabled, block,
}: {
  label: string;
  icon?: React.ReactNode;
  onPress: () => void;
  disabled?: boolean;
  block?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => ({
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
        paddingHorizontal: 16, paddingVertical: 10, borderRadius: 9999,
        backgroundColor: ACTION_NAVY,
        alignSelf: block ? 'stretch' : 'flex-start',
        opacity: disabled ? 0.45 : pressed ? 0.85 : 1,
        ...(Platform.OS === 'web' ? { cursor: disabled ? 'default' : 'pointer' } as any : {}),
      })}
    >
      {icon}
      <Text style={{ fontSize: 13, fontWeight: '700', color: '#FFFFFF' }}>{label}</Text>
    </Pressable>
  );
}

interface Props {
  invoiceId: string;
  balance: number;
  notes?: string | null;
  readOnly?: boolean;
  noteDraft: string;
  onNoteChange: (v: string) => void;
  onSaveNote: () => void;
  savingNote?: boolean;
  efatura: {
    status?: EFaturaStatus | null;
    uuid?: string | null;
    type?: 'e_fatura' | 'e_arsiv' | null;
    provider?: string | null;
    error?: string | null;
    number?: string | null;
  };
  /** Siman fatura durumu — taslak/iptal iken e-fatura akışı kilitli */
  invoiceStatus?: string | null;
  /** "Faturayı kes" (taslak → kesildi) — e-fatura bölümündeki kilit butonu */
  onIssueInvoice?: () => Promise<void> | void;
  /** "Faturayı kes" başarısızsa butonun altında gösterilen hata (yoksa hiçbir şey çizilmez) */
  issueInvoiceError?: string | null;
  /** Klinik e-faturaya hazır değil → eksikler (autoT'lenmiş) + düzenleme kısayolu */
  clinicGaps?: string[];
  onEditClinic?: () => void;
  onChanged: () => void;
  /** Verilirse e-fatura bölümünün altında "İş dökümü PDF" (yalnız kesinleşmiş faturada çizilir) */
  workBreakdown?: { invoiceNumber: string; clinicName?: string | null };
}

export function InvoiceActionsCard({
  invoiceId, balance, notes, readOnly, noteDraft, onNoteChange, onSaveNote, savingNote,
  efatura, invoiceStatus, onIssueInvoice, issueInvoiceError, clinicGaps, onEditClinic, onChanged, workBreakdown,
}: Props) {
  const U = useInkUI();
  const noteDirty = noteDraft.trim() !== (notes ?? '');

  // Klinik tarafında yalnız not görünür; akış (ödeme linki → e-fatura)
  // laboratuvara özeldir, dolayısıyla numaralandırma da orada anlamlı.
  const flow = !readOnly;
  const divider = <View style={{ height: 1, backgroundColor: U.hairline }} />;

  return (
    <View style={{ width: '100%', ...U.cardSolid, padding: 0, overflow: 'hidden' }}>
      <View style={{ paddingHorizontal: SECTION_PAD, paddingTop: 16, paddingBottom: 4 }}>
        <Text style={{
          fontSize: 9, fontWeight: '700', letterSpacing: 1,
          textTransform: 'uppercase', color: U.ink[400],
        }}>
          {flow ? autoT('Belge işlemleri') : autoT('Fatura notu')}
        </Text>
      </View>

      {/* ── 1 · Not ── */}
      <View style={{ paddingHorizontal: SECTION_PAD, paddingVertical: 14, gap: 10 }}>
        {flow ? (
          <ActionSectionHead
            step={1}
            title={autoT('Kliniğe gösterilecek not')}
            hint={autoT('Fatura çıktısında ve klinik ekranında görünür')}
          />
        ) : null}
        {readOnly ? (
          <Text style={{ fontSize: 13, color: U.ink[700], lineHeight: 20 }}>{notes}</Text>
        ) : (
          <>
            <TextInput
              value={noteDraft}
              onChangeText={onNoteChange}
              multiline
              placeholder={autoT('Örn. Bu faturaya klinik indirimi uygulanmıştır.')}
              placeholderTextColor={U.ink[400]}
              textAlignVertical="top"
              style={{
                minHeight: 74, paddingHorizontal: 12, paddingVertical: 10,
                borderRadius: 14, borderWidth: 1, borderColor: U.fieldBorder,
                backgroundColor: U.isDark ? '#141312' : '#FFFFFF',
                fontSize: 13, lineHeight: 20, color: U.ink[800],
                ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}),
              }}
            />
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
              <NavyButton
                label={savingNote ? autoT('Kaydediliyor…') : autoT('Notu Kaydet')}
                onPress={onSaveNote}
                disabled={!!savingNote || !noteDirty}
              />
            </View>
          </>
        )}
      </View>

      {flow ? (
        <>
          {divider}
          <PaymentLinkPanel step={2} invoiceId={invoiceId} balance={balance} onChanged={onChanged} />
          {divider}
          <EFaturaPanel
            step={3}
            invoiceId={invoiceId}
            status={efatura.status ?? 'pending'}
            uuid={efatura.uuid ?? null}
            type={efatura.type ?? null}
            provider={efatura.provider ?? null}
            error={efatura.error ?? null}
            number={efatura.number ?? null}
            invoiceStatus={invoiceStatus ?? null}
            onIssueInvoice={readOnly ? undefined : onIssueInvoice}
            issueInvoiceError={readOnly ? null : issueInvoiceError}
            clinicGaps={clinicGaps}
            onEditClinic={readOnly ? undefined : onEditClinic}
            onChanged={onChanged}
          />
          {workBreakdown && isWorkBreakdownStatus(invoiceStatus) ? (
            <View style={{ paddingHorizontal: SECTION_PAD, paddingBottom: 16 }}>
              <WorkBreakdownPdfButton
                invoiceId={invoiceId}
                invoiceNumber={workBreakdown.invoiceNumber}
                invoiceStatus={invoiceStatus}
                clinicName={workBreakdown.clinicName ?? null}
              />
            </View>
          ) : null}
        </>
      ) : null}
    </View>
  );
}
