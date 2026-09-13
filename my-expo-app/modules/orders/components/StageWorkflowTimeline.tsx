// modules/orders/components/StageWorkflowTimeline.tsx
// AŞAMA DETAYLARI zaman çizelgesi — OrderDetailScreenV2 (desktop) ile mobil
// (OrderDetailMobileHandoff) TEK KAYNAKTAN render edilsin diye çıkarıldı.
// JSX gövdesi V2'deki orijinalle BİREBİR aynı; sadece bağımlılıklar prop olarak alınır.
import React from 'react';
import { isRTL } from '../../../core/i18n';
import { View, Text, Pressable, Platform, useWindowDimensions } from 'react-native';
import {
  ChevronUp, ChevronDown, CircleCheck, Circle, AlertTriangle,
  Play, Pencil, SkipForward, RotateCcw, Trash2, Check, Plus, Clock, Truck, User, MoreHorizontal,
} from '../../../core/ui/icons';
import { confirmAsync } from '../../../core/util/confirm';
import { forceActivateStage, revertStage, updateDeliveryStatus, advanceOrderStatus } from '../api';
import { toast } from '../../../core/ui/Toast';
import type { WorkOrderStatus } from '../../../lib/types';

export function StageWorkflowTimeline(p: any) {
  const {
    combinedStages, displayStages, stagesExpanded, setStagesExpanded,
    stageMenuOpen, setStageMenuOpen, completedCount, order, profile, isManager,
    panelAccent, panelTheme,
    handleCompleteProductionStage, handleAdminCompleteStage, handleAdminActivateStage,
    handleAdminSkipStage, handleRemoveStage, setReassignOpen, openReassign, setAddStageOpen,
    refetch, refetchStages, fmtDate, isLaneOpen, toggleLane,
    activeDelivery, setDeliveryModalOpen, stageCompleting,
  } = p;
  // Dar ekran (mobil): kompakt satırı 2 satıra aç — isim kırpılmasın.
  const { width } = useWindowDimensions();
  const isNarrow = width < 768;
  return (
    <>
            {/* Aşama Detayları — collapse trigger (siyah kart içinde) */}
            {combinedStages.length > 0 && (
              <>
                <Pressable
                  onPress={() => setStagesExpanded((v: boolean) => !v)}
                  /* NOT: obje-stil ZORUNLU — NativeWind v4'te fonksiyon-stilli
                     Pressable native'de stili düşürüp satırı column'a çeviriyor;
                     "12/12" rozeti tam-genişlik bar oluyordu (web'de sorun yok). */
                  style={{
                    paddingHorizontal: isNarrow ? 14 : 24, paddingVertical: 14,
                    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)',
                    flexDirection: 'row', alignItems: 'center', gap: 8,
                    ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                  }}
                >
                  <Text className="text-[10px] font-semibold uppercase" style={{ letterSpacing: 1.2, color: 'rgba(255,255,255,0.55)' }}>
                    Aşama Detayları
                  </Text>
                  <View className="flex-1" />
                  <View style={{
                    paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999,
                    backgroundColor: panelAccent + '22',
                    borderWidth: 1, borderColor: panelAccent + '40',
                  }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: panelAccent }}>
                      {combinedStages.filter((s: any) => s.status === 'tamamlandi' || s.status === 'onaylandi').length}/{combinedStages.length}
                    </Text>
                  </View>
                  {stagesExpanded
                    ? <ChevronUp size={15} color="rgba(255,255,255,0.7)" strokeWidth={2} />
                    : <ChevronDown size={15} color="rgba(255,255,255,0.7)" strokeWidth={2} />}
                </Pressable>

                {stagesExpanded && (
                  <View style={{
                    paddingHorizontal: isNarrow ? 14 : 24, paddingTop: 8, paddingBottom: 22,
                    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)',
                  }}>
                    {displayStages.map((stg: any, i: number) => {
                      // Faz 4b: şerit grup başlığı (çok-şerit) — diş etiketi + ilerleme + collapse
                      if (stg.__laneHeader) {
                        const open = stg.lane != null ? isLaneOpen(stg.lane) : true;
                        return (
                          <Pressable key={stg.id}
                            onPress={stg.lane != null ? () => toggleLane(stg.lane) : undefined}
                            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, marginTop: i === 0 ? 0 : 6, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: 'rgba(255,255,255,0.06)', ...(Platform.OS === 'web' && stg.lane != null ? { cursor: 'pointer' } as any : {}) }}>
                            {stg.lane != null && (
                              <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: panelAccent + '26' }}>
                                <Text style={{ fontSize: 11.5, fontWeight: '800', color: panelAccent, fontFamily: Platform.OS === 'web' ? 'monospace' : undefined }}>{stg.teeth}</Text>
                              </View>
                            )}
                            <Text numberOfLines={1} style={{ flex: 1, color: '#FFFFFF', fontSize: 13, fontWeight: '700' }}>
                              {stg.lane == null ? stg.teeth : (stg.workType || (stg.done >= stg.total ? 'Tamamlandı' : ''))}
                            </Text>
                            <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11.5, fontWeight: '700' }}>{stg.done}/{stg.total}</Text>
                            {stg.lane != null && (
                              open
                                ? <ChevronUp size={15} color="rgba(255,255,255,0.6)" strokeWidth={2} />
                                : <ChevronDown size={15} color="rgba(255,255,255,0.6)" strokeWidth={2} />
                            )}
                          </Pressable>
                        );
                      }
                      const isCompleted = stg.status === 'onaylandi' || stg.status === 'tamamlandi';
                      const isActive    = stg.status === 'aktif';
                      const isPending   = stg.status === 'bekliyor';
                      const isRejected  = stg.status === 'reddedildi';
                      const stationName = stg.station?.name ?? `Aşama ${i + 1}`;
                      const stationColor = stg.station?.color ?? panelAccent;
                      const techName = stg.technician?.full_name;
                      // Aktif aşamada geçen süre (lab yöneticileri sürekli bakar) — ⏱ chip.
                      const elapsedMin = isActive && stg.started_at
                        ? Math.max(0, Math.floor((Date.now() - new Date(stg.started_at).getTime()) / 60000))
                        : null;
                      const elapsedLabel = elapsedMin == null ? null
                        : elapsedMin < 60 ? `${elapsedMin} dk`
                        : `${Math.floor(elapsedMin / 60)} sa ${elapsedMin % 60} dk`;
                      // Sonraki öğe bir grup başlığıysa (veya son) timeline çizgisi çizilmez.
                      const isLast = i === displayStages.length - 1 || !!displayStages[i + 1]?.__laneHeader;

                      // DENSITY: yalnız AKTİF (ve sanal) aşama büyük kart; tamamlanan/bekleyen ince satır.
                      const compact = !isActive && !stg.is_virtual;
                      // İnce satırın sağındaki değerli bilgi: tamamlanan→bitiş zamanı, bekleyen→"Bekliyor".
                      const rightLabel = isCompleted && stg.completed_at ? fmtDate(stg.completed_at)
                        : isPending ? 'Bekliyor'
                        : null;
                      // Durum sunumu — bekleyen NÖTR rozet (zayıf düz metin yerine), tamamlanan tabular saat.
                      const statusNode = isPending ? (
                        <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' }}>
                          <Text style={{ fontSize: 9.5, fontWeight: '700', color: 'rgba(255,255,255,0.55)', letterSpacing: 0.3 }}>Bekliyor</Text>
                        </View>
                      ) : (isCompleted && stg.completed_at) ? (
                        <Text style={{ fontSize: 10.5, fontWeight: '600', color: 'rgba(255,255,255,0.45)', fontVariant: ['tabular-nums'] }}>{fmtDate(stg.completed_at)}</Text>
                      ) : null;

                      // Aşama aksiyon menüsü (tek yerde kurulur; hem aktif split-buton'da hem ince satır ▼'inde kullanılır).
                      const canComplete = !isCompleted && (isActive || isManager);
                      const doComplete = isActive
                        ? () => handleCompleteProductionStage(stg.id)
                        : () => handleAdminCompleteStage(stg);
                      const menu: { icon: any; label: string; color: string; run: () => void }[] = [];
                      if (isManager && !stg.is_virtual) {
                        if (isPending) menu.push({ icon: Play, label: 'Teknisyene gönder', color: 'rgba(255,255,255,0.85)', run: async () => { const r = await forceActivateStage(stg.id); if (!r.ok) { alert(`Aktif edilemedi: ${r.error ?? ''}`); return; } refetch(); refetchStages(); } });
                        else if (!isActive && !isCompleted) menu.push({ icon: Play, label: 'Teknisyene gönder', color: 'rgba(255,255,255,0.85)', run: () => handleAdminActivateStage(stg) });
                        // Devret: tamamlanmamış HER aşamada (aktif + bekleyen + duraklamış).
                        // Pasife alınan teknisyene atanmış bekleyen aşama böylece aktif
                        // bir teknisyene devredilebilir. Seçili aşamayı hedefler.
                        if (!isCompleted) menu.push({ icon: Pencil, label: 'Düzenle (devret)', color: 'rgba(255,255,255,0.85)', run: () => { if (openReassign) openReassign(stg); else setReassignOpen(true); } });
                        if (!isCompleted) menu.push({ icon: SkipForward, label: 'Aşamayı atla', color: '#FCD34D', run: () => handleAdminSkipStage(stg) });
                        if (isActive && completedCount > 0) menu.push({ icon: RotateCcw, label: 'Önceki aşamaya dön', color: 'rgba(255,255,255,0.85)', run: async () => { if (!order) return; const ok = await confirmAsync('Önceki Aşamaya Dön', 'Bir önceki aşamaya dönülsün mü? Şu anki aşama "bekliyor"a, önceki aşama "aktif"e çevrilir.', { confirmText: 'Geri Al', destructive: true }); if (!ok) return; const r = await revertStage(order.id); if (!r.ok) { alert(`Geri alınamadı: ${r.error}`); return; } refetch(); refetchStages(); } });
                        menu.push({ icon: Trash2, label: 'Aşamayı sil', color: '#FCA5A5', run: () => handleRemoveStage(stg) });
                      }
                      // İnce (pasif) satırda "Tamamla" da menüye girer; aktif kartta ayrı split-buton olur.
                      if (canComplete && !isActive && !stg.is_virtual) {
                        menu.unshift({ icon: Check, label: 'Tamamla', color: '#6EE7B7', run: doComplete });
                      }
                      const menuOpen = stageMenuOpen === stg.id;
                      // Son satırlarda menü AŞAĞI açılırsa alttaki karta girip kırpılıyor →
                      // üstünde satır varsa (i>0) yukarı aç.
                      const openUp = i > 0 && i >= displayStages.length - 2;
                      const dropShadow = Platform.OS === 'web'
                        ? { boxShadow: '0 10px 28px rgba(0,0,0,0.5)' }
                        : { shadowColor: '#000', shadowOpacity: 0.45, shadowRadius: 16, shadowOffset: { width: 0, height: 8 } };
                      // Açılır menü paneli — panele uygun lacivert; ince satırda sağa, aktif kartta sola hizalı.
                      const renderDropdown = (alignRight: boolean) => (menuOpen && menu.length > 0) ? (
                        <View style={{
                          // RTL: tetikleyici aynalandığı için hizayı da çevir; yoksa menü
                          // karşı tarafa açılıp kapsayıcının dışında kırpılıyor.
                          position: 'absolute',
                          ...(openUp ? { bottom: '100%', marginBottom: 5 } : { top: '100%', marginTop: 5 }),
                          ...((alignRight !== isRTL()) ? { right: 0 } : { left: 0 }),
                          minWidth: 184, zIndex: 50, borderRadius: 9, overflow: 'hidden',
                          backgroundColor: (panelTheme === 'clinic' || panelTheme === 'doctor') ? '#3A3D4C' : '#2A3B57',
                          borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)', ...dropShadow,
                        } as any}>
                          {menu.map((it, mi) => {
                            const Icon = it.icon;
                            return (
                              <Pressable
                                key={mi}
                                onPress={() => { setStageMenuOpen(null); it.run(); }}
                                style={{
                                  flexDirection: 'row', alignItems: 'center', gap: 8,
                                  paddingHorizontal: 11, paddingVertical: 8,
                                  borderTopWidth: mi === 0 ? 0 : 1, borderTopColor: 'rgba(255,255,255,0.07)',
                                  ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                                }}
                              >
                                <Icon size={13} color={it.color} strokeWidth={1.9} />
                                <Text style={{ fontSize: 11.5, fontWeight: '600', color: it.color }}>{it.label}</Text>
                              </Pressable>
                            );
                          })}
                        </View>
                      ) : null;
                      // İnce satır sağındaki kompakt overflow (⋯) — metin yerine standart taşma ikonu.
                      const compactMenuNode = menu.length === 0 ? null : (
                        <View style={{ position: 'relative', zIndex: menuOpen ? 30 : 1 }}>
                          <Pressable
                            onPress={() => setStageMenuOpen(menuOpen ? null : stg.id)}
                            accessibilityLabel="İşlemler menüsü"
                            style={{
                              width: 26, height: 26, borderRadius: 7, alignItems: 'center', justifyContent: 'center',
                              backgroundColor: menuOpen ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.05)',
                              borderWidth: 1, borderColor: menuOpen ? 'rgba(255,255,255,0.20)' : 'rgba(255,255,255,0.12)',
                              ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                            }}
                          >
                            <MoreHorizontal size={15} color="rgba(255,255,255,0.6)" strokeWidth={2} />
                          </Pressable>
                          {renderDropdown(true)}
                        </View>
                      );

                      return (
                        <View key={stg.id} className="flex-row" style={{ position: 'relative', zIndex: stageMenuOpen === stg.id ? 40 : undefined }}>
                          {/* Timeline rail — SEMANTİK: tamamlanan yeşil✔ · aktif mavi● · bekleyen gri○ */}
                          <View className="items-center" style={{ width: 32 }}>
                            <View
                              className="w-6 h-6 rounded-full items-center justify-center"
                              style={{
                                backgroundColor: isCompleted ? '#22C55E'
                                  : isActive   ? 'rgba(59,130,246,0.18)'
                                  : isRejected ? '#DC262633'
                                  : 'rgba(255,255,255,0.05)',
                                borderWidth: isActive ? 2 : isPending ? 1.5 : 0,
                                borderColor: isActive ? '#3B82F6' : isPending ? 'rgba(255,255,255,0.22)' : 'transparent',
                              }}
                            >
                              {isCompleted && <CircleCheck size={14} color="#FFF" strokeWidth={2.4} />}
                              {isActive    && <Circle size={9} color="#3B82F6" strokeWidth={0} fill="#3B82F6" />}
                              {isRejected  && <AlertTriangle size={12} color="#FCA5A5" strokeWidth={2} />}
                              {isPending   && <Circle size={6} color="rgba(255,255,255,0.28)" strokeWidth={0} fill="rgba(255,255,255,0.28)" />}
                            </View>
                            {!isLast && (
                              <View style={{
                                width: 2, flex: 1,
                                backgroundColor: isCompleted ? 'rgba(34,197,94,0.45)' : 'rgba(255,255,255,0.08)',
                                borderRadius: 1,
                              }} />
                            )}
                          </View>

                          {/* Content — DENSITY: AKTİF/sanal = büyük kart; tamamlanan/bekleyen = ince tek satır */}
                          {compact && isNarrow ? (
                            /* MOBİL kompakt: 2 satır — isim (tam) + rozet/Detay üstte · teknisyen + durum altta */
                            <View className={`flex-1 ms-2.5 ${isLast ? '' : 'pb-2.5'}`} style={{ paddingTop: 1, gap: 3 }}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                                <Text numberOfLines={1} style={{ flex: 1, fontSize: 12.5, fontWeight: '700', color: isCompleted ? 'rgba(255,255,255,0.82)' : isRejected ? '#FCA5A5' : 'rgba(255,255,255,0.55)' }}>{stationName}</Text>
                                {isRejected ? (<View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5, backgroundColor: 'rgba(220,38,38,0.20)' }}><Text style={{ fontSize: 9, fontWeight: '800', color: '#FCA5A5', letterSpacing: 0.5 }}>RED</Text></View>) : null}
                                {stg.is_critical ? (<View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5, backgroundColor: 'rgba(245,158,11,0.20)' }}><Text style={{ fontSize: 9, fontWeight: '800', color: '#FCD34D', letterSpacing: 0.5 }}>KRİTİK</Text></View>) : null}
                                {(isManager || stg.technician?.id === profile?.id) ? compactMenuNode : null}
                              </View>
                              {(techName || statusNode) ? (
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                                  {techName ? <Text numberOfLines={1} style={{ fontSize: 11, fontWeight: '500', color: 'rgba(255,255,255,0.45)', flexShrink: 1 }}>{techName}</Text> : null}
                                  {statusNode}
                                </View>
                              ) : null}
                            </View>
                          ) : compact ? (
                            <View className={`flex-1 ms-2.5 ${isLast ? '' : 'pb-2.5'}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 28 }}>
                              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', columnGap: 6 }}>
                                <Text numberOfLines={1} style={{ fontSize: 12.5, fontWeight: '700', color: isCompleted ? 'rgba(255,255,255,0.82)' : isRejected ? '#FCA5A5' : 'rgba(255,255,255,0.52)', flexShrink: 1 }}>{stationName}</Text>
                                {techName ? <Text numberOfLines={1} style={{ fontSize: 11, fontWeight: '500', color: 'rgba(255,255,255,0.45)', flexShrink: 1 }}>· {techName}</Text> : null}
                              </View>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, flexShrink: 0 }}>
                                {statusNode}
                                {isRejected ? (<View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5, backgroundColor: 'rgba(220,38,38,0.20)' }}><Text style={{ fontSize: 9, fontWeight: '800', color: '#FCA5A5', letterSpacing: 0.5 }}>RED</Text></View>) : null}
                                {stg.is_critical ? (<View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5, backgroundColor: 'rgba(245,158,11,0.20)' }}><Text style={{ fontSize: 9, fontWeight: '800', color: '#FCD34D', letterSpacing: 0.5 }}>KRİTİK</Text></View>) : null}
                                {(isManager || stg.technician?.id === profile?.id) ? compactMenuNode : null}
                              </View>
                            </View>
                          ) : (
                          <View
                            className={`flex-1 ms-2.5 ${isLast && !isActive ? '' : 'pb-4'}`}
                            style={isActive ? {
                              backgroundColor: 'rgba(255,255,255,0.08)',
                              borderRadius: 12,
                              borderWidth: 1,
                              borderColor: 'rgba(255,255,255,0.10)',
                              paddingVertical: 11,
                              paddingHorizontal: 13,
                              marginBottom: isLast ? 0 : 12,
                              ...(Platform.OS === 'web'
                                ? { boxShadow: '0 2px 10px rgba(0,0,0,0.14)' } as any
                                : { shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } }),
                            } : undefined}
                          >
                            {/* Başlık satırı — ad solda, rozetler SAĞDA (sağ boşluk dolar) */}
                            <View className="flex-row items-center justify-between gap-2">
                              <Text numberOfLines={1} style={{
                                flexShrink: 1,
                                fontSize: isActive ? 14 : 13, fontWeight: '700',
                                color: isActive ? '#FFFFFF' : isCompleted ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.50)',
                              }}>
                                {stationName}
                              </Text>
                              <View className="flex-row items-center gap-1.5" style={{ flexShrink: 0 }}>
                                {isActive && elapsedLabel && (
                                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5, backgroundColor: 'rgba(59,130,246,0.16)' }}>
                                    <Clock size={10} color="#93C5FD" strokeWidth={2} />
                                    <Text style={{ fontSize: 9.5, fontWeight: '700', color: '#93C5FD' }}>{elapsedLabel}</Text>
                                  </View>
                                )}
                                {isActive && (
                                  <View style={{
                                    paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5,
                                    backgroundColor: stationColor + '33',
                                    borderWidth: 1, borderColor: stationColor + '66',
                                  }}>
                                    <Text style={{ fontSize: 9, fontWeight: '800', color: stationColor, letterSpacing: 0.5 }}>AKTİF</Text>
                                  </View>
                                )}
                                {isRejected && (
                                  <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5, backgroundColor: 'rgba(220,38,38,0.20)' }}>
                                    <Text style={{ fontSize: 9, fontWeight: '800', color: '#FCA5A5', letterSpacing: 0.5 }}>RED</Text>
                                  </View>
                                )}
                                {stg.is_critical && (
                                  <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5, backgroundColor: 'rgba(245,158,11,0.20)' }}>
                                    <Text style={{ fontSize: 9, fontWeight: '800', color: '#FCD34D', letterSpacing: 0.5 }}>KRİTİK</Text>
                                  </View>
                                )}
                              </View>
                            </View>

                            {/* Row 2 — DENGE: teknisyen SOLDA, birincil aksiyon (split-buton) SAĞDA.
                                Böylece kartın sağı dolar; sol ağır / sağ boş görüntüsü kalkar. */}
                            {(techName || isActive || (!stg.is_virtual && (isManager || stg.technician?.id === profile?.id) && (canComplete || menu.length > 0))) && (
                              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 9, position: 'relative', zIndex: menuOpen ? 30 : 1 }}>
                                {/* sol: teknisyen (avatar + ad) — flex:1 → ad boşluğu kullanır, buton sağda kalır */}
                                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                  {techName ? (
                                    <>
                                      <View style={{ width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: stationColor + '2E' }}>
                                        <Text style={{ fontSize: 9.5, fontWeight: '800', color: isActive ? '#FFFFFF' : stationColor }}>
                                          {String(techName).trim().split(/\s+/).slice(0, 2).map((pp: string) => pp[0]?.toUpperCase() ?? '').join('') || '?'}
                                        </Text>
                                      </View>
                                      <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: '600', color: isActive ? '#FFFFFF' : 'rgba(255,255,255,0.72)', flexShrink: 1 }}>{techName}</Text>
                                    </>
                                  ) : isActive ? (
                                    <>
                                      <View style={{ width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.10)' }}>
                                        <User size={12} color="rgba(255,255,255,0.6)" strokeWidth={1.9} />
                                      </View>
                                      <Text style={{ fontSize: 12.5, fontWeight: '500', color: 'rgba(255,255,255,0.55)', fontStyle: 'italic' }}>Atanmadı</Text>
                                    </>
                                  ) : null}
                                </View>
                                {/* sağ: birincil aksiyon — SPLIT-BUTON [✓ Tamamla | ▼] tek komponent, hafif */}
                                {!stg.is_virtual && (isManager || stg.technician?.id === profile?.id) && (canComplete || menu.length > 0) ? (
                                  canComplete ? (
                                    <View style={{ flexDirection: 'row', alignItems: 'stretch', borderRadius: 9999, borderWidth: 1, borderColor: 'rgba(34,197,94,0.55)', backgroundColor: 'rgba(34,197,94,0.10)', overflow: 'hidden', opacity: stageCompleting ? 0.5 : 1, flexShrink: 0 }}>
                                      <Pressable
                                        onPress={doComplete}
                                        disabled={stageCompleting}
                                        style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingStart: 13, paddingEnd: menu.length > 0 ? 9 : 13, paddingVertical: 8, ...(Platform.OS === 'web' ? { cursor: stageCompleting ? 'wait' : 'pointer' } as any : {}) }}
                                      >
                                        <Check size={14} color="#4ADE80" strokeWidth={2.6} />
                                        <Text style={{ fontSize: 12.5, fontWeight: '700', color: '#4ADE80' }}>Tamamla</Text>
                                      </Pressable>
                                      {menu.length > 0 && (
                                        <>
                                          <View style={{ width: 1, backgroundColor: 'rgba(34,197,94,0.30)' }} />
                                          <Pressable
                                            onPress={() => setStageMenuOpen(menuOpen ? null : stg.id)}
                                            accessibilityLabel="Diğer işlemler"
                                            style={{ alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8, ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}
                                          >
                                            {menuOpen
                                              ? <ChevronUp size={14} color="#4ADE80" strokeWidth={2.4} />
                                              : <ChevronDown size={14} color="#4ADE80" strokeWidth={2.4} />}
                                          </Pressable>
                                        </>
                                      )}
                                    </View>
                                  ) : compactMenuNode
                                ) : null}
                                {renderDropdown(true)}
                              </View>
                            )}

                            {/* Sanal aşamada zaman bilgisi (aktifte ⏱ zaten var; burada yalnız sanal/kurye için) */}
                            {!isActive && (stg.started_at || stg.completed_at) && (
                              <View className="flex-row gap-3 mt-1">
                                {stg.started_at && (
                                  <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.40)' }}>
                                    Başladı: {fmtDate(stg.started_at)}
                                  </Text>
                                )}
                                {stg.completed_at && (
                                  <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.40)' }}>
                                    Bitti: {fmtDate(stg.completed_at)}
                                  </Text>
                                )}
                              </View>
                            )}

                            {stg.technician_note && (
                              <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', marginTop: 6, fontStyle: 'italic' }}>
                                "{stg.technician_note}"
                              </Text>
                            )}

                            {/* Sanal Kurye aşaması — "Kuryeye Gönder" (üst hero ile aynı modal/akış) */}
                            {isManager && stg.station?.id === '__courier' && !activeDelivery && (
                              <View className="flex-row gap-2 mt-2 flex-wrap">
                                <Pressable
                                  onPress={() => setDeliveryModalOpen(true)}
                                  style={{
                                    flexDirection: 'row', alignItems: 'center', gap: 5,
                                    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 9999,
                                    backgroundColor: panelAccent,
                                    ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                                  }}
                                >
                                  <Truck size={11} color="#0A0A0A" strokeWidth={2.2} />
                                  <Text style={{ fontSize: 10, fontWeight: '700', color: '#0A0A0A' }}>Kuryeye Gönder</Text>
                                </Pressable>
                              </View>
                            )}

                            {/* Müdür/admin: sanal Kurye/Teslim aşamasını ilerlet.
                                Bunlar order_stages satırı değil (deliveries'ten türetilir),
                                o yüzden aşama RPC'leri işlemez — teslimat durumu üzerinden
                                ilerletilir. Kurye kaydı varsa onu 'teslim edildi' yapar,
                                yoksa siparişin statüsünü doğrudan taşır. */}
                            {isManager && stg.is_virtual && !isCompleted && (
                              <View className="flex-row mt-2">
                                <Pressable
                                  onPress={async () => {
                                    const label = stg?.station?.name ?? 'Aşama';
                                    const ok = await confirmAsync(
                                      `${label} aşamasını tamamla`,
                                      activeDelivery && activeDelivery.status !== 'teslim_edildi'
                                        ? 'Kurye teslimatı "teslim edildi" olarak işaretlenecek. Emin misin?'
                                        : 'Sipariş "teslim edildi" olarak işaretlenecek. Emin misin?',
                                      { confirmText: 'Tamamla' },
                                    );
                                    if (!ok) return;
                                    if (activeDelivery && activeDelivery.status !== 'teslim_edildi') {
                                      const r = await updateDeliveryStatus(activeDelivery.id, 'teslim_edildi');
                                      if (!r.ok) { toast.error(r.error ?? 'Teslimat güncellenemedi'); return; }
                                    } else {
                                      const { error } = await advanceOrderStatus(
                                        order.id, 'teslim_edildi' as WorkOrderStatus, profile?.id ?? '',
                                      );
                                      if (error) { toast.error((error as any).message ?? 'Statü güncellenemedi'); return; }
                                    }
                                    toast.success(`"${label}" tamamlandı.`);
                                    refetch(); refetchStages();
                                  }}
                                  style={{
                                    flexDirection: 'row', alignItems: 'center', gap: 5,
                                    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 9999,
                                    backgroundColor: 'rgba(45,154,107,0.18)',
                                    borderWidth: 1, borderColor: 'rgba(45,154,107,0.40)',
                                    ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                                  }}
                                >
                                  <Check size={11} color="#6EE7B7" strokeWidth={2.2} />
                                  <Text style={{ fontSize: 10, fontWeight: '600', color: '#6EE7B7' }}>Tamamla</Text>
                                </Pressable>
                              </View>
                            )}

                          </View>
                          )}
                        </View>
                      );
                    })}

                    {/* Müdür/admin: sona / araya yeni aşama ekle */}
                    {isManager && (
                      <Pressable
                        onPress={() => setAddStageOpen(true)}
                        style={{
                          flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                          marginTop: 10, paddingVertical: 9, borderRadius: 12,
                          borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)', borderStyle: 'dashed',
                          backgroundColor: 'rgba(255,255,255,0.06)',
                          ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                        }}
                      >
                        <Plus size={13} color="rgba(255,255,255,0.85)" strokeWidth={2.2} />
                        <Text style={{ fontSize: 11.5, fontWeight: '700', color: 'rgba(255,255,255,0.85)' }}>Aşama ekle</Text>
                      </Pressable>
                    )}
                  </View>
                )}
              </>
            )}
    </>
  );
}
