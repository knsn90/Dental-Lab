/**
 * LogsSection — Ayarlar > Loglar sekmesi (admin/lab only)
 * ────────────────────────────────────────────────────────
 * activity_logs tablosunu okur, aranabilir liste gösterir.
 * Patterns cardSolid stiline uygun.
 */
import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, Pressable,
  ActivityIndicator, RefreshControl, TextInput, Platform,
} from 'react-native';
import {
  Search, RefreshCw, PlusCircle, UserCheck, Trash2, ArrowLeftRight,
  Pencil, Info, XCircle,
} from 'lucide-react-native';
import { supabase } from '../../../core/api/supabase';

// ── Types ───────────────────────────────────────────────────────────────
type LogTab = 'all' | 'users' | 'doctors';

interface ActivityLog {
  id: string;
  actor_id: string | null;
  actor_name: string;
  actor_type: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  entity_label: string | null;
  metadata: Record<string, any> | null;
  created_at: string;
}

// ── Helpers ─────────────────────────────────────────────────────────────
function timeAgo(dateStr: string): string {
  const now  = new Date();
  const date = new Date(dateStr);
  const diff = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (diff < 60)     return 'Az önce';
  if (diff < 3600)   return `${Math.floor(diff / 60)} dk önce`;
  if (diff < 86400)  return `${Math.floor(diff / 3600)} saat önce`;
  if (diff < 172800) return 'Dün ' + date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  if (diff < 604800) return `${Math.floor(diff / 86400)} gün önce`;
  return date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' });
}

function actionIcon(action: string): { Icon: any; color: string; bg: string } {
  if (action.includes('oluşturdu') || action.includes('oluşturuldu'))
    return { Icon: PlusCircle,      color: '#059669', bg: '#D1FAE5' };
  if (action.includes('aktif edildi'))
    return { Icon: UserCheck,       color: '#059669', bg: '#D1FAE5' };
  if (action.includes('pasif edildi') || action.includes('silindi'))
    return { Icon: Trash2,          color: '#DC2626', bg: '#FEF2F2' };
  if (action.includes('→') || action.includes('Durumu'))
    return { Icon: ArrowLeftRight,  color: '#7C3AED', bg: '#EDE9FE' };
  if (action.includes('güncelledi') || action.includes('güncellendi'))
    return { Icon: Pencil,          color: '#0F172A', bg: '#F1F5F9' };
  return   { Icon: Info,            color: '#64748B', bg: '#F1F5F9' };
}

const CARD_SHADOW = Platform.select({
  web: { boxShadow: '0 1px 2px rgba(0,0,0,0.03), 0 4px 16px rgba(0,0,0,0.04)' } as any,
  default: { shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 16, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
});

// ── LogRow ──────────────────────────────────────────────────────────────
function LogRow({ log, isLast }: { log: ActivityLog; isLast: boolean }) {
  const { Icon, color, bg } = actionIcon(log.action);
  const badge =
    log.actor_type === 'admin'  ? { label: 'Admin', bg: '#FEF3C7', text: '#92400E' } :
    log.actor_type === 'doctor' ? { label: 'Hekim', bg: '#DBEAFE', text: '#1D4ED8' } :
                                  { label: 'Lab',   bg: '#DCFCE7', text: '#166534' };
  return (
    <View className={`flex-row gap-3 px-4 py-3 ${isLast ? '' : 'border-b border-black/[0.03]'}`}>
      <View className="w-8 h-8 rounded-lg items-center justify-center" style={{ backgroundColor: bg }}>
        <Icon size={15} color={color} strokeWidth={1.8} />
      </View>
      <View className="flex-1">
        <View className="flex-row items-center gap-1.5 mb-0.5">
          <Text className="text-[13px] font-bold text-ink-900" numberOfLines={1}>{log.actor_name}</Text>
          <View className="px-1.5 py-0.5 rounded" style={{ backgroundColor: badge.bg }}>
            <Text className="text-[9px] font-bold" style={{ color: badge.text }}>{badge.label}</Text>
          </View>
          <Text className="text-[11px] text-ink-300 ml-auto">{timeAgo(log.created_at)}</Text>
        </View>
        <Text className="text-[13px] text-ink-500">{log.action}</Text>
        {log.entity_label ? (
          <Text className="text-[11px] text-ink-300 mt-0.5">{log.entity_label}</Text>
        ) : null}
      </View>
    </View>
  );
}

// ── Props ───────────────────────────────────────────────────────────────
interface Props { accentColor?: string; }

// ── Component ──────────────────────────────────────────────────────────
export function LogsSection({ accentColor = '#E97757' }: Props) {
  const [logs,     setLogs]     = useState<ActivityLog[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab,      setTab]      = useState<LogTab>('all');
  const [search,   setSearch]   = useState('');
  const [searchOpen, setSearchOpen] = useState(false);

  const loadLogs = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const { data, error } = await supabase
        .from('activity_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(2000);
      if (!error && data) setLogs(data as ActivityLog[]);
    } catch (_) {}
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { loadLogs(); }, [loadLogs]);

  // Realtime
  useEffect(() => {
    const ch = supabase
      .channel('activity_logs_settings')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activity_logs' }, (p) => {
        setLogs(prev => [p.new as ActivityLog, ...prev].slice(0, 2000));
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const q = search.trim().toLowerCase();
  const filtered = logs.filter(l => {
    if (tab === 'users'   && l.actor_type === 'doctor') return false;
    if (tab === 'doctors' && l.actor_type !== 'doctor') return false;
    if (!q) return true;
    return l.actor_name.toLowerCase().includes(q) || l.action.toLowerCase().includes(q) || l.entity_label?.toLowerCase().includes(q);
  });

  const TABS: { key: LogTab; label: string }[] = [
    { key: 'all',     label: 'Tümü' },
    { key: 'users',   label: 'Kullanıcılar' },
    { key: 'doctors', label: 'Hekimler' },
  ];

  return (
    <View className="flex-1">
      {/* Toolbar */}
      <View className="flex-row items-center gap-2 px-7 pb-3">
        {TABS.map(t => (
          <Pressable
            key={t.key}
            onPress={() => setTab(t.key)}
            className="px-3.5 py-1.5 rounded-lg"
            style={{ backgroundColor: tab === t.key ? `${accentColor}18` : 'transparent' }}
          >
            <Text
              className="text-[12px] font-semibold"
              style={{ color: tab === t.key ? accentColor : '#9A9A9A' }}
            >
              {t.label}
            </Text>
          </Pressable>
        ))}
        <View className="ml-auto flex-row items-center gap-1.5">
          <Pressable
            onPress={() => setSearchOpen(v => !v)}
            className="w-8 h-8 rounded-lg items-center justify-center"
            style={{ backgroundColor: searchOpen ? `${accentColor}14` : 'transparent' }}
          >
            <Search size={15} color={searchOpen ? accentColor : '#9A9A9A'} strokeWidth={1.8} />
          </Pressable>
          <Pressable
            onPress={() => loadLogs(true)}
            className="w-8 h-8 rounded-lg items-center justify-center"
          >
            {refreshing
              ? <ActivityIndicator size={14} color="#9A9A9A" />
              : <RefreshCw size={15} color="#9A9A9A" strokeWidth={1.8} />}
          </Pressable>
        </View>
      </View>

      {/* Search bar */}
      {searchOpen && (
        <View className="px-7 pb-3">
          <View className="flex-row items-center gap-2 border border-black/[0.06] rounded-xl bg-ink-50 px-3 h-10">
            <Search size={14} color="#9A9A9A" strokeWidth={1.8} />
            <TextInput
              className="flex-1 text-[13px] text-ink-900"
              value={search} onChangeText={setSearch}
              placeholder="İsim, aksiyon veya kayıt ara..."
              placeholderTextColor="#C0C0C8"
              autoFocus
              // @ts-ignore web
              style={{ outlineWidth: 0 }}
            />
            {search.length > 0 && (
              <Pressable onPress={() => { setSearch(''); setSearchOpen(false); }}>
                <XCircle size={14} color="#C0C0C8" strokeWidth={1.8} />
              </Pressable>
            )}
          </View>
        </View>
      )}

      {/* Content */}
      {loading ? (
        <View className="flex-1 items-center justify-center gap-3 pt-20">
          <ActivityIndicator size="large" color={accentColor} />
          <Text className="text-[13px] text-ink-300">Loglar yükleniyor…</Text>
        </View>
      ) : (
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingHorizontal: 28, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadLogs(true)} tintColor={accentColor} />}
        >
          {filtered.length === 0 ? (
            <View className="items-center pt-16 gap-3">
              <Info size={40} color="#C0C0C8" strokeWidth={1.2} />
              <Text className="text-[15px] font-semibold text-ink-700">Henüz log yok</Text>
              <Text className="text-[13px] text-ink-300 text-center">
                {q ? `"${q}" ile eşleşen kayıt bulunamadı` : 'Eylemler gerçekleştikçe burada görünecek'}
              </Text>
            </View>
          ) : (
            <View className="bg-white rounded-[24px] overflow-hidden" style={CARD_SHADOW}>
              <View className="flex-row items-center px-4 py-2.5 border-b border-black/[0.03]" style={{ backgroundColor: '#FAFAF8' }}>
                <Text className="text-[10px] font-bold tracking-wider uppercase text-ink-300">Aktivite</Text>
                <Text className="text-[10px] font-bold tracking-wider uppercase text-ink-300 ml-auto">
                  {filtered.length} kayıt
                </Text>
              </View>
              {filtered.map((log, i) => (
                <LogRow key={log.id} log={log} isLast={i === filtered.length - 1} />
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}
