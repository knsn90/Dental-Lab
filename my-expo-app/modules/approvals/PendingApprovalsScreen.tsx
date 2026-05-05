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
  Undo2, CheckCircle2, XCircle, History,
} from 'lucide-react-native';
import { toast } from '../../core/ui/Toast';
import { supabase } from '../../core/api/supabase';
import { Profile } from '../../lib/types';
import { DS } from '../../core/theme/dsTokens';

const DISPLAY: any = { fontFamily: DS.font.display, fontWeight: '300' };
const R = { sm: 8, md: 14, lg: 20, xl: 24, pill: 999 };
const CARD = {
  backgroundColor: '#FFFFFF',
  borderRadius: R.xl,
  borderWidth: 1,
  borderColor: 'rgba(0,0,0,0.05)',
} as const;

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
  const [pending, setPending]       = useState<PendingDoctor[]>([]);
  const [history, setHistory]       = useState<PendingDoctor[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(true);
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;

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
      `${profile.full_name} adlı hekimin kaydını reddetmek istediğinize emin misiniz?`,
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
        <ActivityIndicator size="large" color={DS.ink[500]} />
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
            tintColor={DS.ink[500]}
          />
        }
        ListHeaderComponent={
          <View style={{ padding: isDesktop ? 40 : 16, paddingTop: 16, gap: 14 }}>
            {/* ── Pending section ── */}
            {pendingCount === 0 ? (
              <View style={{
                alignItems: 'center', justifyContent: 'center',
                gap: 14, paddingVertical: 48,
              }}>
                <View style={{
                  width: 64, height: 64, borderRadius: 32,
                  backgroundColor: 'rgba(45,154,107,0.1)',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <UserCheck size={28} color="#1F6B47" strokeWidth={1.6} />
                </View>
                <Text style={{ ...DISPLAY, fontSize: 22, letterSpacing: -0.4, color: DS.ink[900] }}>
                  Bekleyen kayıt yok
                </Text>
                <Text style={{ fontSize: 13, color: DS.ink[400], textAlign: 'center', lineHeight: 20 }}>
                  Yeni hekim kaydı geldiğinde burada görünecek.
                </Text>
              </View>
            ) : (
              <>
                {/* Pending header */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <View style={{
                    paddingHorizontal: 8, paddingVertical: 3,
                    borderRadius: R.pill, backgroundColor: 'rgba(232,155,42,0.12)',
                  }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#9C5E0E' }}>
                      {pendingCount}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: DS.ink[700] }}>
                    Bekleyen kayıt
                  </Text>
                </View>

                {/* Pending cards */}
                {isDesktop ? (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
                    {pending.map(doc => (
                      <View key={doc.id} style={{ width: '48%' as any }}>
                        <DoctorCard
                          doctor={doc}
                          actioning={actioningId === doc.id}
                          onApprove={() => handleApprove(doc)}
                          onReject={() => handleReject(doc)}
                        />
                      </View>
                    ))}
                  </View>
                ) : (
                  <View style={{ gap: 14 }}>
                    {pending.map(doc => (
                      <DoctorCard
                        key={doc.id}
                        doctor={doc}
                        actioning={actioningId === doc.id}
                        onApprove={() => handleApprove(doc)}
                        onReject={() => handleReject(doc)}
                      />
                    ))}
                  </View>
                )}
              </>
            )}

            {/* ── History section ── */}
            {historyCount > 0 && (
              <>
                <Pressable
                  onPress={() => setShowHistory(!showHistory)}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 8,
                    marginTop: 16, paddingVertical: 8,
                    borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.06)',
                  }}
                >
                  <History size={15} color={DS.ink[400]} strokeWidth={1.8} />
                  <Text style={{ fontSize: 13, fontWeight: '600', color: DS.ink[500], flex: 1 }}>
                    Son işlemler
                  </Text>
                  <View style={{
                    paddingHorizontal: 8, paddingVertical: 3,
                    borderRadius: R.pill, backgroundColor: DS.ink[100],
                  }}>
                    <Text style={{ fontSize: 11, fontWeight: '600', color: DS.ink[500] }}>
                      {historyCount}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 18, color: DS.ink[400] }}>
                    {showHistory ? '−' : '+'}
                  </Text>
                </Pressable>

                {showHistory && (
                  isDesktop ? (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
                      {history.map(doc => (
                        <View key={doc.id} style={{ width: '48%' as any }}>
                          <HistoryCard
                            doctor={doc}
                            actioning={actioningId === doc.id}
                            onUndo={() => handleUndo(doc)}
                          />
                        </View>
                      ))}
                    </View>
                  ) : (
                    <View style={{ gap: 10 }}>
                      {history.map(doc => (
                        <HistoryCard
                          key={doc.id}
                          doctor={doc}
                          actioning={actioningId === doc.id}
                          onUndo={() => handleUndo(doc)}
                        />
                      ))}
                    </View>
                  )
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
  const initial = doctor.full_name?.charAt(0)?.toUpperCase() ?? 'H';

  return (
    <View style={{ ...CARD, padding: 24, gap: 16 }}>
      {/* Top: avatar + info */}
      <View style={{ flexDirection: 'row', gap: 14 }}>
        <View style={{
          width: 52, height: 52, borderRadius: 16,
          backgroundColor: DS.clinic.bg,
          alignItems: 'center', justifyContent: 'center',
        }}>
          <Text style={{ ...DISPLAY, fontSize: 24, letterSpacing: -0.5, color: DS.clinic.accent }}>
            {initial}
          </Text>
        </View>

        <View style={{ flex: 1, gap: 4 }}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: DS.ink[900], letterSpacing: -0.2 }}>
            {doctor.full_name}
          </Text>
          {doctor.clinic_name ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Building2 size={13} color={DS.ink[400]} strokeWidth={1.6} />
              <Text style={{ fontSize: 12, color: DS.ink[500] }}>{doctor.clinic_name}</Text>
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 2 }}>
            {doctor.phone ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Phone size={12} color={DS.ink[400]} strokeWidth={1.6} />
                <Text style={{ fontSize: 11, color: DS.ink[400] }}>{doctor.phone}</Text>
              </View>
            ) : null}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Clock size={12} color={DS.ink[300]} strokeWidth={1.6} />
              <Text style={{ fontSize: 11, color: DS.ink[300] }}>
                {new Date(doctor.created_at).toLocaleDateString('tr-TR', {
                  day: 'numeric', month: 'short', year: 'numeric',
                  hour: '2-digit', minute: '2-digit',
                })}
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* Status + actions */}
      <View style={{
        flexDirection: 'row', alignItems: 'center',
        borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.05)',
        paddingTop: 14, gap: 10,
      }}>
        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: 5,
          paddingHorizontal: 10, paddingVertical: 5,
          borderRadius: R.pill, backgroundColor: 'rgba(232,155,42,0.12)',
        }}>
          <Clock size={12} color="#9C5E0E" strokeWidth={1.8} />
          <Text style={{ fontSize: 11, fontWeight: '600', color: '#9C5E0E' }}>Onay bekliyor</Text>
        </View>

        <View style={{ flex: 1 }} />

        <Pressable
          onPress={onReject}
          disabled={actioning}
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 6,
            paddingHorizontal: 16, paddingVertical: 10,
            borderRadius: R.pill, borderWidth: 1.5,
            borderColor: 'rgba(217,75,75,0.2)',
            backgroundColor: 'rgba(217,75,75,0.06)',
            opacity: actioning ? 0.5 : 1,
          }}
        >
          <X size={14} color="#9C2E2E" strokeWidth={2} />
          <Text style={{ fontSize: 13, fontWeight: '600', color: '#9C2E2E' }}>Reddet</Text>
        </Pressable>

        <Pressable
          onPress={onApprove}
          disabled={actioning}
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 6,
            paddingHorizontal: 20, paddingVertical: 10,
            borderRadius: R.pill, backgroundColor: DS.ink[900],
            opacity: actioning ? 0.5 : 1,
          }}
        >
          {actioning ? (
            <ActivityIndicator size="small" color="#FFF" />
          ) : (
            <>
              <Check size={14} color="#FFFFFF" strokeWidth={2} />
              <Text style={{ fontSize: 13, fontWeight: '600', color: '#FFFFFF' }}>Onayla</Text>
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
  const initial = doctor.full_name?.charAt(0)?.toUpperCase() ?? 'H';
  const isApproved = doctor.approval_status === 'approved';

  const statusCfg = isApproved
    ? { label: 'Onaylandı', bg: 'rgba(45,154,107,0.1)', color: '#1F6B47', Icon: CheckCircle2 }
    : { label: 'Reddedildi', bg: 'rgba(217,75,75,0.1)', color: '#9C2E2E', Icon: XCircle };

  return (
    <View style={{
      ...CARD,
      padding: 18,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
    }}>
      {/* Avatar */}
      <View style={{
        width: 42, height: 42, borderRadius: 13,
        backgroundColor: isApproved ? 'rgba(45,154,107,0.08)' : 'rgba(217,75,75,0.08)',
        alignItems: 'center', justifyContent: 'center',
      }}>
        <Text style={{
          ...DISPLAY, fontSize: 18, letterSpacing: -0.3,
          color: isApproved ? '#1F6B47' : '#9C2E2E',
        }}>
          {initial}
        </Text>
      </View>

      {/* Info */}
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontSize: 14, fontWeight: '600', color: DS.ink[900] }}>
          {doctor.full_name}
        </Text>
        {doctor.clinic_name ? (
          <Text style={{ fontSize: 11, color: DS.ink[400] }}>{doctor.clinic_name}</Text>
        ) : null}
      </View>

      {/* Status badge */}
      <View style={{
        flexDirection: 'row', alignItems: 'center', gap: 5,
        paddingHorizontal: 10, paddingVertical: 5,
        borderRadius: R.pill, backgroundColor: statusCfg.bg,
      }}>
        <statusCfg.Icon size={12} color={statusCfg.color} strokeWidth={1.8} />
        <Text style={{ fontSize: 11, fontWeight: '600', color: statusCfg.color }}>
          {statusCfg.label}
        </Text>
      </View>

      {/* Undo button */}
      <Pressable
        onPress={onUndo}
        disabled={actioning}
        style={{
          flexDirection: 'row', alignItems: 'center', gap: 5,
          paddingHorizontal: 12, paddingVertical: 8,
          borderRadius: R.pill,
          borderWidth: 1.5, borderColor: DS.ink[200],
          backgroundColor: '#FFFFFF',
          opacity: actioning ? 0.5 : 1,
        }}
      >
        {actioning ? (
          <ActivityIndicator size="small" color={DS.ink[500]} />
        ) : (
          <>
            <Undo2 size={13} color={DS.ink[500]} strokeWidth={2} />
            <Text style={{ fontSize: 12, fontWeight: '600', color: DS.ink[500] }}>Geri Al</Text>
          </>
        )}
      </Pressable>
    </View>
  );
}
