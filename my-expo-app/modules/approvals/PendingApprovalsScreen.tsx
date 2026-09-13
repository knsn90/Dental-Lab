import { localeTag } from '../../core/i18n';
import { autoT } from '../../core/i18n/autoTranslate';
/**
 * PendingApprovalsScreen — Patterns design language
 *
 * Hekim kayıt onayları + geçmiş (onaylanan/reddedilen geri alınabilir).
 * Supabase realtime ile güncellenir.
 * DS tokens, DISPLAY typography, inline styles.
 */
import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, Pressable, Platform,
  ActivityIndicator, RefreshControl, Alert, useWindowDimensions,
} from 'react-native';
import {
  UserCheck, Clock, Phone, Building2, X, Check,
  Undo2, CheckCircle2, XCircle, History, ChevronDown,
} from '../../core/ui/icons';
import { toast } from '../../core/ui/Toast';
import { supabase } from '../../core/api/supabase';
import { Profile } from '../../lib/types';
import { DS } from '../../core/theme/dsTokens';
import { useInkUI } from '../../core/theme/inkScale';
import { useMobileTokens } from '../../core/theme/mobileDesignTokens';
import { useThemeModeStore } from '../../core/store/themeModeStore';

const DISPLAY: any = { fontFamily: DS.font.display, fontWeight: '300' };
const R = { sm: 8, md: 12, lg: 16, xl: 18, pill: 999 };
const makeCard = (isDark: boolean, T: ReturnType<typeof useMobileTokens>) => ({
  backgroundColor: 'transparent' as const,
  borderRadius: R.lg,
  borderWidth: 1,
  borderColor: isDark ? 'rgba(255,255,255,0.10)' : T.hairline,
  // @ts-ignore web
  boxShadow: isDark ? 'none' : '0 1px 3px rgba(15,23,42,0.04)',
});

// ── Web-safe confirm dialog ──
function confirmAction(title: string, message: string): Promise<boolean> {
  if (Platform.OS === 'web') {
    return Promise.resolve(window.confirm(`${title}\n\n${message}`));
  }
  return new Promise(resolve => {
    Alert.alert(title, message, [
      { text: 'Vazgeç', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Evet', onPress: () => resolve(true) },
    ]);
  });
}

interface PendingDoctor extends Profile {
  email?: string | null;
}

export function PendingApprovalsScreen() {
  const U = useInkUI();
  const [pending, setPending]       = useState<PendingDoctor[]>([]);
  const [history, setHistory]       = useState<PendingDoctor[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(true);
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;
  const T = useMobileTokens();
  const isDark = useThemeModeStore(s => s.resolvedDark);

  const load = useCallback(async () => {
    // Load pending
    const { data: pendingData } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_type', 'doctor')
      .eq('approval_status', 'pending')
      .order('created_at', { ascending: false });
    setPending((pendingData ?? []) as PendingDoctor[]);

    // Load history (approved + rejected)
    const { data: historyData } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_type', 'doctor')
      .in('approval_status', ['approved', 'rejected'])
      .order('created_at', { ascending: false })
      .limit(30);
    setHistory((historyData ?? []) as PendingDoctor[]);

    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    load();
    const channel = supabase
      .channel('pending_approvals_screen')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, load)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load]);

  const handleApprove = async (profile: PendingDoctor) => {
    setActioningId(profile.id);
    const { error } = await supabase
      .from('profiles')
      .update({ is_active: true, approval_status: 'approved' })
      .eq('id', profile.id);
    if (error) {
      toast.error('Onaylama işlemi başarısız oldu.');
    } else {
      toast.success(`${profile.full_name} onaylandı.`);
      await load();
    }
    setActioningId(null);
  };

  const handleReject = async (profile: PendingDoctor) => {
    const ok = await confirmAction(
      'Reddet',
      `${profile.full_name} ${autoT('adlı hekimin kaydını reddetmek istediğinize emin misiniz?')}`,
    );
    if (!ok) return;

    setActioningId(profile.id);
    const { error } = await supabase
      .from('profiles')
      .update({ is_active: false, approval_status: 'rejected' })
      .eq('id', profile.id);
    if (error) {
      toast.error('Reddetme işlemi başarısız oldu.');
    } else {
      toast.success(`${profile.full_name} reddedildi.`);
      await load();
    }
    setActioningId(null);
  };

  const handleUndo = async (profile: PendingDoctor) => {
    const action = profile.approval_status === 'approved' ? 'onayı' : 'reddi';
    const ok = await confirmAction(
      'Geri Al',
      `${profile.full_name} için ${action} geri almak istediğinize emin misiniz?\nHekim tekrar "Onay bekliyor" durumuna geçecek.`,
    );
    if (!ok) return;

    setActioningId(profile.id);
    const { error } = await supabase
      .from('profiles')
      .update({ is_active: false, approval_status: 'pending' })
      .eq('id', profile.id);
    if (error) {
      toast.error('Geri alma işlemi başarısız oldu.');
    } else {
      toast.success(`${profile.full_name} tekrar onay bekliyor.`);
      await load();
    }
    setActioningId(null);
  };

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={U.ink[500]} />
      </View>
    );
  }

  const pendingCount = pending.length;
  const historyCount = history.length;

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={[]}
        renderItem={null}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); load(); }}
            tintColor={U.ink[500]}
          />
        }
        ListHeaderComponent={
          <View style={{ padding: isDesktop ? 24 : 12, paddingTop: 8, gap: 10 }}>
            {/* ── Pending section ── */}
            {pendingCount === 0 ? (
              /* Kesikli çerçeve "buraya bırak" anlamına gelir; burası bir bırakma
                 alanı değil, boş bir liste. Sayfa genişliğinde 200px'lik kesikli
                 kutu yerine ortalanmış, sınırlı genişlikte sakin bir yüzey. */
              /* Gölgeli, çerçeveli, 24 yarıçaplı kart + 56px yeşil daire —
                 sayfanın görsel olarak EN AĞIR öğesi "burada hiçbir şey yok"
                 mesajıydı. Boşluk kendini duyurmamalı: satır içi, çerçevesiz,
                 sakin. Yer açılınca gerçek içerik (Son İşlemler) öne çıkıyor. */
              <View style={{
                flexDirection: 'row', alignItems: 'center', gap: 10,
                paddingVertical: 18, paddingHorizontal: 2,
              }}>
                <UserCheck size={16} color={T.ink3} strokeWidth={1.8} />
                <Text style={{ fontSize: 13.5, color: T.ink2, fontWeight: '500' }}>
                  Bekleyen hekim kaydı yok
                </Text>
                <Text style={{ fontSize: 12.5, color: T.ink3, flexShrink: 1 }}>
                  · yeni kayıt geldiğinde burada görünür
                </Text>
              </View>
            ) : (
              <>
                {/* Section eyebrow */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 2 }}>
                  <View style={{
                    paddingHorizontal: 8, paddingVertical: 2,
                    borderRadius: R.pill, backgroundColor: 'rgba(232,155,42,0.14)',
                    flexDirection: 'row', alignItems: 'center', gap: 4,
                  }}>
                    <Clock size={10} color="#9C5E0E" strokeWidth={2} />
                    <Text style={{ fontSize: 10.5, fontWeight: '800', color: '#9C5E0E', letterSpacing: 0.4 }}>
                      {pendingCount} BEKLEYEN
                    </Text>
                  </View>
                  <Text style={{ fontSize: 10.5, fontWeight: '700', color: T.ink3, letterSpacing: 0.8, textTransform: 'uppercase' }}>
                    Hekim kaydı
                  </Text>
                </View>

                {/* Pending cards — desktop 3-col grid, mobile stack */}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                  {pending.map(doc => (
                    <View key={doc.id} style={{
                      width: isDesktop ? ('calc(33.333% - 7px)' as any) : '100%',
                      minWidth: isDesktop ? 280 : 0,
                    }}>
                      <DoctorCard
                        doctor={doc}
                        actioning={actioningId === doc.id}
                        onApprove={() => handleApprove(doc)}
                        onReject={() => handleReject(doc)}
                      />
                    </View>
                  ))}
                </View>
              </>
            )}

            {/* ── History section ── */}
            {historyCount > 0 && (
              <>
                <Pressable
                  onPress={() => setShowHistory(!showHistory)}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: showHistory }}
                  style={({ pressed }: any) => ({
                    flexDirection: 'row', alignItems: 'center', gap: 8,
                    marginTop: 10, paddingVertical: 10, paddingHorizontal: 4,
                    borderTopWidth: 1, borderTopColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.06)',
                    opacity: pressed ? 0.7 : 1,
                    ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                  })}
                >
                  <History size={12} color={T.ink3} strokeWidth={1.8} />
                  <Text style={{ fontSize: 10.5, fontWeight: '800', color: T.ink2, letterSpacing: 0.8, textTransform: 'uppercase', flex: 1 }}>
                    Son işlemler · {historyCount}
                  </Text>
                  {/* Metin "+/−" değil ikon: proje kuralı line ikon, glif değil. */}
                  <View style={{ transform: [{ rotate: showHistory ? '180deg' : '0deg' }] }}>
                    <ChevronDown size={14} color={T.ink3} strokeWidth={2} />
                  </View>
                </Pressable>

                {showHistory && (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {history.map(doc => (
                      <View key={doc.id} style={{
                        width: isDesktop ? ('calc(50% - 4px)' as any) : '100%',
                      }}>
                        <HistoryCard
                          doctor={doc}
                          actioning={actioningId === doc.id}
                          onUndo={() => handleUndo(doc)}
                        />
                      </View>
                    ))}
                  </View>
                )}
              </>
            )}
          </View>
        }
      />
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// DOCTOR CARD — pending (onayla/reddet)
// ═══════════════════════════════════════════════════════════════════════
function DoctorCard({
  doctor, actioning, onApprove, onReject,
}: {
  doctor: PendingDoctor;
  actioning: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  const U = useInkUI();
  const initial = doctor.full_name?.charAt(0)?.toUpperCase() ?? 'H';
  const T = useMobileTokens();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const CARD = makeCard(isDark, T);

  const dateStr = new Date(doctor.created_at).toLocaleDateString(localeTag(), {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });
  return (
    <View style={{ ...CARD, padding: 14, gap: 12 }}>
      {/* Top: avatar + info */}
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
        <View style={{
          width: 42, height: 42, borderRadius: 12,
          backgroundColor: DS.clinic.bg,
          alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <Text style={{ ...DISPLAY, fontSize: 18, letterSpacing: -0.4, color: DS.clinic.accent }}>
            {initial}
          </Text>
        </View>

        <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: T.ink, letterSpacing: -0.1, flex: 1 }} numberOfLines={1}>
              {doctor.full_name}
            </Text>
            <View style={{
              flexDirection: 'row', alignItems: 'center', gap: 3,
              paddingHorizontal: 7, paddingVertical: 2,
              borderRadius: R.pill, backgroundColor: 'rgba(232,155,42,0.14)',
            }}>
              <Clock size={9} color="#9C5E0E" strokeWidth={2} />
              <Text style={{ fontSize: 9.5, fontWeight: '800', color: '#9C5E0E', letterSpacing: 0.3 }}>BEKLİYOR</Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {doctor.clinic_name ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Building2 size={11} color={T.ink3} strokeWidth={1.6} />
                <Text style={{ fontSize: 11, color: T.ink2 }} numberOfLines={1}>{doctor.clinic_name}</Text>
              </View>
            ) : null}
            {doctor.phone ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Phone size={11} color={T.ink3} strokeWidth={1.6} />
                <Text style={{ fontSize: 11, color: T.ink3 }}>{doctor.phone}</Text>
              </View>
            ) : null}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Clock size={11} color={T.ink3} strokeWidth={1.6} />
              <Text style={{ fontSize: 10.5, color: T.ink3 }}>{dateStr}</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Actions row — kompakt */}
      <View style={{ flexDirection: 'row', gap: 6 }}>
        <Pressable
          onPress={onReject}
          disabled={actioning}
          style={({ hovered }: any) => ({
            flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
            height: 32, borderRadius: R.pill,
            borderWidth: 1, borderColor: hovered ? '#DC2626' : 'rgba(220,38,38,0.25)',
            backgroundColor: hovered ? 'rgba(220,38,38,0.08)' : 'transparent',
            opacity: actioning ? 0.5 : 1,
            ...(Platform.OS === 'web' ? { cursor: actioning ? 'wait' : 'pointer' } as any : {}),
          })}
        >
          <X size={13} color="#DC2626" strokeWidth={2} />
          <Text style={{ fontSize: 12, fontWeight: '700', color: '#DC2626' }}>Reddet</Text>
        </Pressable>
        <Pressable
          onPress={onApprove}
          disabled={actioning}
          style={({ hovered }: any) => ({
            flex: 1.4, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
            height: 32, borderRadius: R.pill,
            backgroundColor: actioning ? U.ink[400] : (hovered ? U.ink[700] : U.ink[900]),
            opacity: actioning ? 0.6 : 1,
            ...(Platform.OS === 'web' ? { cursor: actioning ? 'wait' : 'pointer' } as any : {}),
          })}
        >
          {actioning ? <ActivityIndicator size="small" color="#FFF" /> : (
            <>
              <Check size={13} color="#FFFFFF" strokeWidth={2.4} />
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#FFFFFF' }}>Onayla</Text>
            </>
          )}
        </Pressable>
      </View>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// HISTORY CARD — approved/rejected (geri al)
// ═══════════════════════════════════════════════════════════════════════
function HistoryCard({
  doctor, actioning, onUndo,
}: {
  doctor: PendingDoctor;
  actioning: boolean;
  onUndo: () => void;
}) {
  const U = useInkUI();
  const initial = doctor.full_name?.charAt(0)?.toUpperCase() ?? 'H';
  const isApproved = doctor.approval_status === 'approved';
  const T = useMobileTokens();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const CARD = makeCard(isDark, T);

  const statusCfg = isApproved
    ? { label: 'Onaylandı', bg: 'rgba(45,154,107,0.1)', color: '#1F6B47', Icon: CheckCircle2 }
    : { label: 'Reddedildi', bg: 'rgba(217,75,75,0.1)', color: '#9C2E2E', Icon: XCircle };

  return (
    <View style={{
      ...CARD,
      padding: 10,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    }}>
      <View style={{
        width: 34, height: 34, borderRadius: 11,
        backgroundColor: isApproved ? 'rgba(45,154,107,0.08)' : 'rgba(217,75,75,0.08)',
        alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <Text style={{
          ...DISPLAY, fontSize: 15, letterSpacing: -0.3,
          color: isApproved ? '#1F6B47' : '#9C2E2E',
        }}>
          {initial}
        </Text>
      </View>

      <View style={{ flex: 1, gap: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 12.5, fontWeight: '700', color: T.ink }} numberOfLines={1}>
          {doctor.full_name}
        </Text>
        {doctor.clinic_name ? (
          <Text style={{ fontSize: 10.5, color: T.ink3 }} numberOfLines={1}>{doctor.clinic_name}</Text>
        ) : null}
      </View>

      <View style={{
        flexDirection: 'row', alignItems: 'center', gap: 4,
        paddingHorizontal: 8, paddingVertical: 3,
        borderRadius: R.pill, backgroundColor: statusCfg.bg,
      }}>
        <statusCfg.Icon size={10} color={statusCfg.color} strokeWidth={2} />
        <Text style={{ fontSize: 10, fontWeight: '800', color: statusCfg.color, letterSpacing: 0.2 }}>
          {statusCfg.label.toLocaleUpperCase('tr-TR')}
        </Text>
      </View>

      <Pressable
        onPress={onUndo}
        disabled={actioning}
        accessibilityLabel="Geri al"
        style={({ hovered }: any) => ({
          width: 30, height: 30, borderRadius: 9,
          alignItems: 'center', justifyContent: 'center',
          backgroundColor: hovered ? U.ink[100] : 'transparent',
          borderWidth: 1, borderColor: hovered ? U.ink[300] : U.fieldBorder,
          opacity: actioning ? 0.5 : 1,
          ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
        })}
      >
        {actioning ? <ActivityIndicator size="small" color={U.ink[500]} /> : <Undo2 size={12} color={U.ink[500]} strokeWidth={1.8} />}
      </Pressable>
    </View>
  );
}
