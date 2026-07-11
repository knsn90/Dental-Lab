/**
 * Mali İşlemler — Online POS
 * Mevcut ödeme bağlantılarını listele, durum chip'i, kopyala/aç butonları.
 */

import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, Platform } from 'react-native';
import { CreditCard, Link2, ExternalLink, Copy, Sparkles } from 'lucide-react-native';

import { DS } from '../../../core/theme/dsTokens';
import { usePanelTheme } from '../../../core/theme/usePanelTheme';
import { fetchPaymentLinks, type PaymentLinkRow } from '../api';
import {
  DISPLAY, TRY, M, fmtDate, PAGE_PADDING,
  ErrorBar, Loader, Card, SecHeader, EmptyCard, StatusChip, PillButton,
} from '../components/atoms';
import { useRates } from '../../../core/money/rateCache';

type Props = { clinicId: string };

const baseUrl = (): string => {
  if (typeof window !== 'undefined') return window.location.origin;
  return 'https://nexadent.net';
};

export function OnlinePosScreen({ clinicId }: Props) {
  const TH = usePanelTheme();
  useRates();
  const [items, setItems] = useState<PaymentLinkRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setItems(await fetchPaymentLinks(clinicId)); }
    catch (e: any) { setError(String(e?.message ?? e)); }
    finally { setLoading(false); }
  }, [clinicId]);
  useEffect(() => { load(); }, [load]);

  const handleCopy = (token: string, id: string) => {
    const url = `${baseUrl()}/pay/${token}`;
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(url).then(() => {
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 1500);
      });
    }
  };

  const handleOpen = (token: string) => {
    const url = `${baseUrl()}/pay/${token}`;
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.open(url, '_blank');
    }
  };

  if (loading) return <Loader />;
  if (error)   return <View style={{ padding: PAGE_PADDING }}><ErrorBar message={error} /></View>;

  const succeeded = items.filter(i => i.status === 'paid' || i.status === 'authorized').length;
  const pending   = items.filter(i => i.status === 'pending' || i.status === 'awaiting_3ds').length;
  const failed    = items.filter(i => i.status === 'failed' || i.status === 'expired' || i.status === 'cancelled').length;

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: PAGE_PADDING, paddingBottom: 48, gap: 16 }}
      showsVerticalScrollIndicator={false}
    >
      <SecHeader
        eyebrow="Online POS"
        title="Kart ile Ödeme"
        desc={
          items.length === 0
            ? 'Mevcut ödeme bağlantınız yok. Bekleyen sekmesinden bir fatura için bağlantı oluşturabilirsiniz.'
            : `${items.length} bağlantı · ${succeeded} ödendi · ${pending} bekliyor${failed > 0 ? ` · ${failed} başarısız` : ''}`
        }
      />

      {/* Bilgi kartı */}
      <View style={{
        flexDirection: 'row', alignItems: 'flex-start', gap: 12,
        backgroundColor: TH.bg, borderRadius: 14, padding: 14,
      }}>
        <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.6)', alignItems: 'center', justifyContent: 'center' }}>
          <Sparkles size={16} color={TH.primary} strokeWidth={2} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 13, fontWeight: '600', color: DS.ink[900], marginBottom: 4 }}>
            Hızlı ödeme — kart, banka veya 3D Secure
          </Text>
          <Text style={{ fontSize: 11, color: DS.ink[700], lineHeight: 16 }}>
            Bağlantıyı paylaşın veya doğrudan açın. Ödeme tamamlandığında fatura otomatik kapanır.
          </Text>
        </View>
      </View>

      {/* Liste */}
      {items.length === 0 ? (
        <EmptyCard
          icon={CreditCard}
          title="Henüz ödeme bağlantısı yok"
          description="Bekleyen sekmesinden bir fatura seçip ödeme bağlantısı oluşturabilirsiniz."
        />
      ) : (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          {items.map((p, i) => (
            <View
              key={p.id}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 12,
                paddingHorizontal: 16, paddingVertical: 14,
                borderBottomWidth: i < items.length - 1 ? 1 : 0,
                borderBottomColor: DS.ink[100],
              }}
            >
              <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: TH.bgSoft, alignItems: 'center', justifyContent: 'center' }}>
                <Link2 size={16} color={TH.primary} strokeWidth={2} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: DS.ink[900] }} numberOfLines={1}>
                    Fatura {p.invoice_no ?? '—'}
                  </Text>
                  <StatusChip status={p.status} />
                </View>
                <Text style={{ fontSize: 11, color: DS.ink[500], marginTop: 2 }}>
                  Oluşturuldu {fmtDate(p.created_at)}
                  {p.paid_at ? ` · ödendi ${fmtDate(p.paid_at)}` : ''}
                </Text>
              </View>
              <Text style={{ ...DISPLAY, fontSize: 18, color: DS.ink[900], letterSpacing: -0.5 }}>
                {M(p.amount, p.currency)}
              </Text>
              {p.status === 'pending' ? (
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  <Pressable
                    onPress={() => handleCopy(p.token, p.id)}
                    style={({ pressed }) => ({
                      width: 32, height: 32, borderRadius: 10,
                      backgroundColor: copiedId === p.id ? 'rgba(45,154,107,0.16)' : DS.ink[100],
                      alignItems: 'center', justifyContent: 'center',
                      opacity: pressed ? 0.7 : 1,
                    })}
                  >
                    <Copy size={14} color={copiedId === p.id ? '#1F6B47' : DS.ink[700]} />
                  </Pressable>
                  <Pressable
                    onPress={() => handleOpen(p.token)}
                    style={({ pressed }) => ({
                      width: 32, height: 32, borderRadius: 10,
                      backgroundColor: DS.ink[900],
                      alignItems: 'center', justifyContent: 'center',
                      opacity: pressed ? 0.7 : 1,
                    })}
                  >
                    <ExternalLink size={14} color="#FFF" />
                  </Pressable>
                </View>
              ) : null}
            </View>
          ))}
        </Card>
      )}
    </ScrollView>
  );
}
