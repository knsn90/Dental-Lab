// modules/orders/components/StageActionPanel.tsx
// Stage-aware aksiyon paneli — WorkflowCard'ın sadeleşmiş halefi.
//
// Mantık: Her aşamada SADECE o aşamaya uygun aksiyonlar gözükür.
//   - alindi / atama_bekleniyor:   Rota Oluştur (birincil) + QR + Yazdır
//   - asamada:                       Aktif Aşama Yönet (birincil) + Rota Düzenle
//   - kalite_kontrol:               Onayla / Reddet (birincil) + QR
//   - teslimata_hazir:              Fatura + Teslimat Fişi (birincil) + QR
//   - teslim_edildi:                 Fatura (kesilmediyse) + Makbuz + QR
//
// Fatura ve Teslimat Fişi ASLA ilk 3 aşamada görünmez (UX/muhasebe akışı).

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { AppIcon } from '../../../core/ui/AppIcon';
import { STATUS_CONFIG } from '../constants';
import { useCaseSteps } from '../../production/hooks/useCaseSteps';
import type { WorkOrder } from '../types';

interface StageActionPanelProps {
  order:             WorkOrder;
  profile:           any;
  accentColor?:      string;
  onShowQR?:         () => void;
  onPrint?:          () => void;
  onCreateInvoice?:  () => void;
  onPrintReceipt?:   () => void;
  onRefresh?:        () => void;
}

export function StageActionPanel({
  order,
  profile,
  accentColor    = '#2563EB',
  onShowQR,
  onPrint,
  onCreateInvoice,
  onPrintReceipt,
  onRefresh: _onRefresh,
}: StageActionPanelProps) {
  const router    = useRouter();
  const status    = order.status as string;
  const cfg       = STATUS_CONFIG[order.status];
  const isManager = profile?.role === 'manager' || profile?.user_type === 'admin';

  const { steps, loading } = useCaseSteps(order.id);
  const activeStep         = steps.find(s => s.status === 'active');

  // Aşama gruplandırması
  const isInitialStage   = status === 'alindi' || status === 'atama_bekleniyor' || status === 'kutu_atandi';
  const isProductionStage = status === 'uretimde' || status === 'asamada';
  const isQCStage        = status === 'kalite_kontrol';
  const isReadyStage     = status === 'teslimata_hazir';
  const isDeliveredStage = status === 'teslim_edildi';

  // Fatura/Teslimat ASLA ilk 3 aşamada yok
  const showInvoice  = isReadyStage || isDeliveredStage;
  const showReceipt  = isReadyStage || isDeliveredStage;

  return (
    <View style={[s.card, { borderColor: `${accentColor}22` }]}>

      {/* ── Aşama göstergesi (top header) ─────────────────────────────────────── */}
      <View style={[s.stageHeader, { backgroundColor: `${cfg.color}10`, borderColor: `${cfg.color}25` }]}>
        <View style={[s.stageDot, { backgroundColor: cfg.color }]} />
        <Text style={s.stageLabel}>AŞAMA</Text>
        <Text style={[s.stageName, { color: cfg.color }]}>{cfg.label}</Text>
        {loading && <ActivityIndicator size="small" color={cfg.color} style={{ marginLeft: 'auto' }} />}
      </View>

      {/* ── Birincil aksiyon bloğu (aşamaya göre) ─────────────────────────────── */}
      <View style={s.primaryBlock}>

        {/* — Alındı / Atama bekleniyor / Kutu atandı — */}
        {isInitialStage && (
          steps.length === 0 ? (
            <View style={s.emptyBlock}>
              <View style={[s.emptyIconWrap, { backgroundColor: `${accentColor}12` }]}>
                <AppIcon name={'map-marker-path' as any} size={28} color={accentColor} />
              </View>
              <Text style={s.emptyTitle}>Üretim Rotası Yok</Text>
              <Text style={s.emptyText}>
                İstasyonları ve teknisyenleri atayarak{'\n'}üretim rotasını tanımlayın.
              </Text>
              <TouchableOpacity
                style={[s.primaryBtn, { backgroundColor: accentColor }]}
                onPress={() => router.push(`/(lab)/order/route/${order.id}` as any)}
                activeOpacity={0.85}
              >
                <AppIcon name="plus" size={16} color="#FFFFFF" />
                <Text style={s.primaryBtnText}>Rota Oluştur</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={s.routeReadyBlock}>
              <Text style={s.blockHeading}>{steps.length} İstasyon Hazır</Text>
              <Text style={s.blockSubText}>Üretim başlatılmaya hazır.</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
                <TouchableOpacity
                  style={[s.primaryBtn, { backgroundColor: accentColor, flex: 1 }]}
                  onPress={() => router.push(`/(lab)/order/route/${order.id}` as any)}
                  activeOpacity={0.85}
                >
                  <AppIcon name={'pencil-outline' as any} size={15} color="#FFFFFF" />
                  <Text style={s.primaryBtnText}>Rotayı Düzenle</Text>
                </TouchableOpacity>
              </View>
            </View>
          )
        )}

        {/* — Üretimde / Aşamada — */}
        {isProductionStage && (
          <View>
            {activeStep ? (
              <View style={s.activeStageBlock}>
                <Text style={s.blockHeading}>Aktif İstasyon</Text>
                <Text style={s.activeStageName}>{activeStep.step_name}</Text>
                {activeStep.assignee?.full_name && (
                  <View style={s.assigneeRow}>
                    <AppIcon name="user" size={12} color="#64748B" />
                    <Text style={s.assigneeText}>{activeStep.assignee.full_name}</Text>
                  </View>
                )}
              </View>
            ) : (
              <View style={s.activeStageBlock}>
                <Text style={s.blockHeading}>Üretim devam ediyor</Text>
                <Text style={s.blockSubText}>{steps.filter(s => s.status === 'done').length} / {steps.length} istasyon tamamlandı</Text>
              </View>
            )}
            <TouchableOpacity
              style={[s.primaryBtn, { backgroundColor: accentColor, marginTop: 14 }]}
              onPress={() => router.push(`/(lab)/order/route/${order.id}` as any)}
              activeOpacity={0.85}
            >
              <AppIcon name={'sitemap-outline' as any} size={15} color="#FFFFFF" />
              <Text style={s.primaryBtnText}>Rota Yönet</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* — Kalite Kontrol — */}
        {isQCStage && (
          <View style={s.qcBlock}>
            <View style={[s.emptyIconWrap, { backgroundColor: '#7C3AED12' }]}>
              <AppIcon name={'shield-check-outline' as any} size={26} color="#7C3AED" />
            </View>
            <Text style={s.blockHeading}>Kalite Kontrolü Bekliyor</Text>
            <Text style={s.blockSubText}>
              Üretim tamamlandı. Sipariş kontrol için{'\n'}sıraya alındı.
            </Text>
          </View>
        )}

        {/* — Teslime Hazır — */}
        {isReadyStage && (
          <View style={s.readyBlock}>
            <View style={[s.emptyIconWrap, { backgroundColor: '#05966912' }]}>
              <AppIcon name={'check-circle' as any} size={28} color="#059669" />
            </View>
            <Text style={s.blockHeading}>Teslime Hazır</Text>
            <Text style={s.blockSubText}>
              Sipariş tamamlandı. Teslim ve faturalandırma işlemlerini gerçekleştirin.
            </Text>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
              {onPrintReceipt && (
                <TouchableOpacity style={[s.primaryBtn, { backgroundColor: '#059669', flex: 1 }]} onPress={onPrintReceipt} activeOpacity={0.85}>
                  <AppIcon name={'receipt' as any} size={15} color="#FFFFFF" />
                  <Text style={s.primaryBtnText}>Teslimat Fişi</Text>
                </TouchableOpacity>
              )}
              {onCreateInvoice && (
                <TouchableOpacity style={[s.primaryBtn, { backgroundColor: accentColor, flex: 1 }]} onPress={onCreateInvoice} activeOpacity={0.85}>
                  <AppIcon name={'file-text' as any} size={15} color="#FFFFFF" />
                  <Text style={s.primaryBtnText}>Fatura</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {/* — Teslim edildi — */}
        {isDeliveredStage && (
          <View style={s.readyBlock}>
            <View style={[s.emptyIconWrap, { backgroundColor: '#05966912' }]}>
              <AppIcon name={'check-circle' as any} size={28} color="#059669" />
            </View>
            <Text style={s.blockHeading}>Teslim Edildi</Text>
            <Text style={s.blockSubText}>İş tamamlandı. Fatura kesilmemişse keseniz olur.</Text>
            {onCreateInvoice && (
              <TouchableOpacity style={[s.primaryBtn, { backgroundColor: accentColor, marginTop: 14 }]} onPress={onCreateInvoice} activeOpacity={0.85}>
                <AppIcon name={'file-text' as any} size={15} color="#FFFFFF" />
                <Text style={s.primaryBtnText}>Fatura Oluştur</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>

      {/* ── Yardımcı aksiyonlar (her aşamada görünür) ─────────────────────────── */}
      <View style={s.utilityRow}>
        {onShowQR && (
          <TouchableOpacity style={s.utilityBtn} onPress={onShowQR} activeOpacity={0.7}>
            <AppIcon name={'qrcode' as any} size={15} color="#64748B" />
            <Text style={s.utilityText}>QR Kod</Text>
          </TouchableOpacity>
        )}
        {onPrint && (
          <TouchableOpacity style={s.utilityBtn} onPress={onPrint} activeOpacity={0.7}>
            <AppIcon name={'printer' as any} size={15} color="#64748B" />
            <Text style={s.utilityText}>Yazdır</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    flex:            1,
    backgroundColor: '#FFFFFF',
    borderRadius:    20,
    borderWidth:     1.5,
    overflow:        'hidden',
    shadowColor:     '#0F172A',
    shadowOffset:    { width: 0, height: 4 },
    shadowOpacity:   0.06,
    shadowRadius:    14,
    elevation:       3,
  },
  // Stage header
  stageHeader: {
    flexDirection:    'row',
    alignItems:       'center',
    gap:              8,
    paddingHorizontal: 14,
    paddingVertical:  10,
    borderBottomWidth: 1,
  },
  stageDot:    { width: 8, height: 8, borderRadius: 4 },
  stageLabel:  { fontSize: 9,  fontWeight: '700', color: '#94A3B8', letterSpacing: 0.8 },
  stageName:   { fontSize: 13, fontWeight: '700', letterSpacing: -0.1 },

  // Primary action area
  primaryBlock: {
    paddingHorizontal: 16,
    paddingVertical:  18,
    minHeight:        200,
    justifyContent:   'center',
  },

  // Empty (no route)
  emptyBlock:    { alignItems: 'center', gap: 8 },
  emptyIconWrap: {
    width: 56, height: 56, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: { fontSize: 15, fontWeight: '800', color: '#0F172A', letterSpacing: -0.2 },
  emptyText:  { fontSize: 12, color: '#64748B', textAlign: 'center', lineHeight: 18 },

  // Generic block heading
  blockHeading:    { fontSize: 14, fontWeight: '800', color: '#0F172A', letterSpacing: -0.2, textAlign: 'center' },
  blockSubText:    { fontSize: 12, color: '#64748B', lineHeight: 18, textAlign: 'center', marginTop: 4 },

  // Route-ready
  routeReadyBlock: { alignItems: 'center', gap: 4 },

  // Active stage
  activeStageBlock: { alignItems: 'center', gap: 4 },
  activeStageName:  { fontSize: 18, fontWeight: '800', color: '#0F172A', letterSpacing: -0.3, marginTop: 2 },
  assigneeRow:      { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6 },
  assigneeText:     { fontSize: 12, color: '#475569', fontWeight: '500' },

  // QC
  qcBlock: { alignItems: 'center', gap: 8 },

  // Ready
  readyBlock: { alignItems: 'center', gap: 8 },

  // Primary button
  primaryBtn: {
    flexDirection:    'row',
    alignItems:       'center',
    justifyContent:   'center',
    gap:              7,
    paddingHorizontal: 16,
    paddingVertical:  11,
    borderRadius:     12,
    minWidth:         140,
  },
  primaryBtnText: { fontSize: 13, fontWeight: '700', color: '#FFFFFF', letterSpacing: 0.1 },

  // Utility row (always visible)
  utilityRow: {
    flexDirection:   'row',
    borderTopWidth:  1,
    borderTopColor:  '#F1F5F9',
    backgroundColor: '#FAFBFC',
  },
  utilityBtn: {
    flex:           1,
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'center',
    gap:            6,
    paddingVertical: 11,
  },
  utilityText: { fontSize: 12, fontWeight: '600', color: '#64748B', letterSpacing: 0.1 },
});

export default StageActionPanel;
