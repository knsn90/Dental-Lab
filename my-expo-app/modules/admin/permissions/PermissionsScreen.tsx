/**
 * PermissionsScreen — Yetkiler Yönetim Paneli (Patterns Design Language)
 *
 * Left: role selector (admin, lab_manager, technician, courier, clinic_admin, doctor)
 * Right: grouped toggle permissions
 * Desktop sidebar + content, mobile stacked.
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, Pressable, TextInput,
  useWindowDimensions, Platform,
} from 'react-native';

// ── Toggle (NotificationsSection ile aynı stil) ─────────────────────────
const THUMB_SHADOW = Platform.select({
  web: { boxShadow: '0 1px 2px rgba(0,0,0,0.15), 0 1px 3px rgba(0,0,0,0.08)' } as any,
  default: { shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
});
function Toggle({ on, disabled, onPress, accentColor }: { on: boolean; disabled?: boolean; onPress: () => void; accentColor: string }) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={{
        width: 44, height: 24, borderRadius: 999,
        backgroundColor: on ? accentColor : 'rgba(0,0,0,0.12)',
        padding: 2, justifyContent: 'center',
        opacity: disabled ? 0.45 : 1,
        ...(Platform.OS === 'web' ? { cursor: disabled ? 'not-allowed' : 'pointer' } as any : {}),
      }}
    >
      <View
        style={{
          width: 20, height: 20, borderRadius: 10, backgroundColor: '#FFF',
          alignSelf: on ? 'flex-end' : 'flex-start',
          ...THUMB_SHADOW,
        }}
      />
    </Pressable>
  );
}
import { supabase } from '../../../core/api/supabase';
import { DS } from '../../../core/theme/dsTokens';
import { usePageTitleStore } from '../../../core/store/pageTitleStore';
import {
  type RoleKey,
  type PermissionKey,
  ROLE_LABELS,
  PERMISSION_CATEGORIES,
  PERMISSION_GROUPS,
  PERMISSION_LABELS,
  FEATURES,
  usePermissionStore,
} from '../../../core/store/permissionStore';
import {
  Shield, Users, Wrench, Stethoscope, Building2, Truck,
  Check, Save, RotateCcw, Lock, User as UserIcon, Search, X, ChevronDown,
  ChevronRight, AlertTriangle,
} from 'lucide-react-native';
import { useAuthStore } from '../../../core/store/authStore';
import { toast } from '../../../core/ui/Toast';
import { ActivityIndicator } from '../../../core/ui/teethCompat';
import { CenteredLoader } from '../../../core/ui/CenteredLoader';

// ─── Patterns Tokens ─────────────────────────────────────────
const DISPLAY = {
  fontFamily: 'Inter Tight, Inter, system-ui, sans-serif',
  fontWeight: '300' as const,
};

const cardSolid: any = {
  backgroundColor: '#FFF',
  borderRadius: 24,
  padding: 22,
  ...(Platform.OS === 'web' ? { boxShadow: '0 1px 2px rgba(0,0,0,0.03), 0 4px 16px rgba(0,0,0,0.04)' } : {}),
};

const CHIP_TONES = {
  success: { bg: 'rgba(45,154,107,0.12)', fg: '#1F6B47' },
  warning: { bg: 'rgba(232,155,42,0.15)', fg: '#9C5E0E' },
  danger:  { bg: 'rgba(217,75,75,0.12)',  fg: '#9C2E2E' },
  info:    { bg: 'rgba(74,143,201,0.12)', fg: '#1F5689' },
};

// ─── Role config ─────────────────────────────────────────────
// Admin is excluded — admin always has full access, no need to manage
// Renkler panel `accentColor` prop'undan gelir; her rol için sadece ikon farklı.
const ROLE_CONFIG: { key: RoleKey; icon: React.ComponentType<any> }[] = [
  { key: 'lab_manager',  icon: Users      },
  { key: 'technician',   icon: Wrench     },
  { key: 'doctor',       icon: Stethoscope },
  { key: 'clinic_admin', icon: Building2  },
  { key: 'courier',      icon: Truck      },
];

// ═════════════════════════════════════════════════════════════
// ── Kritik yetki rozeti ──────────────────────────────────────────────────
// Yanlış verildiğinde parasal/hukuki sonucu olan yetkiler (para görünürlüğü,
// özlük verisi, yetki/ayar değiştirme) katalogda `critical` ile işaretli.
function CriticalBadge() {
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', gap: 3,
      paddingHorizontal: 6, paddingVertical: 1.5, borderRadius: 999,
      backgroundColor: 'rgba(232,155,42,0.14)',
    }}>
      <AlertTriangle size={9} color="#9C5E0E" strokeWidth={2.4} />
      <Text style={{ fontSize: 9, fontWeight: '800', color: '#9C5E0E', letterSpacing: 0.3 }}>KRİTİK</Text>
    </View>
  );
}

// ── İlerleme çubuğu ──────────────────────────────────────────────────────
function MiniBar({ value, total, color }: { value: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <View style={{ width: 64, height: 4, borderRadius: 2, backgroundColor: 'rgba(0,0,0,0.07)', overflow: 'hidden' }}>
      <View style={{ width: `${pct}%`, height: '100%', borderRadius: 2, backgroundColor: color }} />
    </View>
  );
}

/**
 * Yetki kategorisi — rol bazlı ve kullanıcı bazlı modda AYNI bileşen.
 * (Eskiden iki yerde birebir kopyalanmıştı; biri değişince diğeri kalıyordu.)
 *
 * Katlanabilir: 13 kategori × ~4 satır aynı anda açık olunca ekran okunmuyordu.
 * Kolonlar sabit genişlikte hizalanır (Özellik | Görme | Yönetme).
 */
function PermissionCategory({
  catLabel, features, isOn, onToggle, onToggleAll,
  accentColor, isDesktop, expanded, onToggleExpanded, query, filter,
}: {
  catLabel: string;
  features: typeof FEATURES;
  isOn: (k: string) => boolean;
  onToggle: (k: string) => void;
  onToggleAll: (keys: string[], on: boolean) => void;
  accentColor: string;
  isDesktop: boolean;
  expanded: boolean;
  onToggleExpanded: () => void;
  query: string;
  filter: 'all' | 'on' | 'off' | 'critical';
}) {
  const q = query.trim().toLocaleLowerCase('tr-TR');

  const keysOf = (f: typeof FEATURES[number]) => {
    const out: string[] = [];
    if (f.hasView)   out.push(`view_${f.key}`);
    if (f.hasManage) out.push(`manage_${f.key}`);
    return out;
  };

  // Arama + filtre yalnız GÖRÜNÜMÜ daraltır; sayaç ve toplu işlem kategorinin
  // tamamı üzerinden çalışır (kullanıcı yanlışlıkla yarısını açmasın).
  const visible = features.filter(f => {
    if (q && !(`${f.label} ${f.desc ?? ''}`.toLocaleLowerCase('tr-TR').includes(q))) return false;
    if (filter === 'critical') return !!f.critical;
    if (filter === 'on')  return keysOf(f).some(k => isOn(k));
    if (filter === 'off') return keysOf(f).some(k => !isOn(k));
    return true;
  });
  if (visible.length === 0) return null;

  const allKeys = features.flatMap(keysOf);
  const activeCount = allKeys.filter(isOn).length;
  const allOn = activeCount === allKeys.length;
  const COL = isDesktop ? 84 : 60;

  return (
    <View style={cardSolid}>
      {/* Başlık: ad · oran · çubuk · toplu işlem */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Pressable
          onPress={onToggleExpanded}
          style={({ pressed }: any) => ({
            flexDirection: 'row', alignItems: 'center', gap: 9, flex: 1, minWidth: 0,
            opacity: pressed ? 0.7 : 1,
            ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
          })}
        >
          <View style={{ transform: [{ rotate: expanded ? '90deg' : '0deg' }] }}>
            <ChevronRight size={15} color={DS.ink[400]} strokeWidth={2.2} />
          </View>
          <Text style={{ fontSize: 15, fontWeight: '700', color: DS.ink[900], letterSpacing: -0.2 }}>{catLabel}</Text>
          <Text style={{ fontSize: 12, color: DS.ink[400] }}>{activeCount}/{allKeys.length}</Text>
          <MiniBar value={activeCount} total={allKeys.length} color={accentColor} />
        </Pressable>

        <Pressable
          onPress={() => onToggleAll(allKeys, !allOn)}
          style={({ pressed, hovered }: any) => ({
            paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999,
            backgroundColor: hovered ? 'rgba(0,0,0,0.04)' : 'transparent',
            opacity: pressed ? 0.6 : 1,
            ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
          })}
        >
          <Text style={{ fontSize: 11.5, fontWeight: '600', color: accentColor }}>
            {allOn ? 'Tümünü kapat' : 'Tümünü aç'}
          </Text>
        </Pressable>
      </View>

      {expanded && (
        <>
          {/* Kolon başlıkları — satırlarla aynı sabit genişlik */}
          <View style={{
            flexDirection: 'row', alignItems: 'center',
            paddingBottom: 8, marginTop: 14, marginBottom: 2,
            borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.06)',
          }}>
            <Text style={{ flex: 1, fontSize: 10, fontWeight: '700', color: DS.ink[400], letterSpacing: 0.5, textTransform: 'uppercase' }}>
              Yetki
            </Text>
            <Text style={{ width: COL, textAlign: 'center', fontSize: 10, fontWeight: '700', color: DS.ink[400], letterSpacing: 0.5, textTransform: 'uppercase' }}>
              Görüntüle
            </Text>
            <Text style={{ width: COL, textAlign: 'center', fontSize: 10, fontWeight: '700', color: DS.ink[400], letterSpacing: 0.5, textTransform: 'uppercase' }}>
              Yönet
            </Text>
          </View>

          {visible.map((f, idx) => (
            <View
              key={f.key}
              style={{
                flexDirection: 'row', alignItems: 'center',
                paddingVertical: 12,
                borderTopWidth: idx > 0 ? 1 : 0,
                borderTopColor: 'rgba(0,0,0,0.04)',
              }}
            >
              <View style={{ flex: 1, paddingRight: 12, gap: 2 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <Text style={{ fontSize: 13.5, fontWeight: '600', color: DS.ink[900] }}>{f.label}</Text>
                  {f.critical && <CriticalBadge />}
                </View>
                {!!f.desc && (
                  <Text style={{ fontSize: 11.5, color: DS.ink[400], lineHeight: 16 }}>{f.desc}</Text>
                )}
              </View>
              <View style={{ width: COL, alignItems: 'center' }}>
                {f.hasView
                  ? <Toggle on={isOn(`view_${f.key}`)} onPress={() => onToggle(`view_${f.key}`)} accentColor={accentColor} />
                  : <Text style={{ fontSize: 11, color: DS.ink[300] }}>—</Text>}
              </View>
              <View style={{ width: COL, alignItems: 'center' }}>
                {f.hasManage
                  ? <Toggle on={isOn(`manage_${f.key}`)} onPress={() => onToggle(`manage_${f.key}`)} accentColor={accentColor} />
                  : <Text style={{ fontSize: 11, color: DS.ink[300] }}>—</Text>}
              </View>
            </View>
          ))}
        </>
      )}
    </View>
  );
}

interface PermissionsScreenProps {
  /** When true, skip own sidebar/title — parent (SettingsHub) provides those */
  embedded?: boolean;
  accentColor?: string;
}

export function PermissionsSection(props: PermissionsScreenProps) {
  return <PermissionsScreen {...props} />;
}

export function PermissionsScreen({ embedded = false, accentColor = '#4771AB' }: PermissionsScreenProps = {}) {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1024;
  const { setTitle, clear } = usePageTitleStore();
  const { fetchPermissions: refreshMyPerms } = usePermissionStore();
  const { profile } = useAuthStore();

  // ── Admin-only gate — sadece admin user_type yetki yönetebilir ──
  // Lab manager, klinik admin, doctor vs. bu sayfayı açamasın bile.
  // RPC seviyesinde de korumalı (set_role_permissions admin check yapar) ama
  // UI'da da net feedback ver.
  const isAdmin = profile?.user_type === 'admin';

  useEffect(() => {
    if (!embedded) {
      setTitle('Yetkiler', '');
      return clear;
    }
  }, [embedded]);

  // Admin değilse — kilitli kart göster
  if (profile && !isAdmin) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 }}>
        <View style={{
          width: '100%', maxWidth: 460,
          backgroundColor: '#FFFFFF', borderRadius: 24, padding: 32,
          borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)',
          alignItems: 'center', gap: 16,
          ...(Platform.OS === 'web' ? { boxShadow: '0 8px 24px rgba(0,0,0,0.06)' } : {}),
        } as any}>
          <View style={{
            width: 56, height: 56, borderRadius: 28,
            backgroundColor: 'rgba(220,38,38,0.10)',
            alignItems: 'center', justifyContent: 'center',
          }}>
            <Lock size={26} color="#DC2626" strokeWidth={1.8} />
          </View>
          <Text style={{ ...DISPLAY, fontSize: 22, lineHeight: 26, letterSpacing: -0.4, color: DS.ink[900], textAlign: 'center' }}>
            Yetki yönetimi
          </Text>
          <Text style={{ fontSize: 14, color: DS.ink[500], textAlign: 'center', lineHeight: 20 }}>
            Rol bazlı izin atama yalnızca <Text style={{ fontWeight: '700', color: DS.ink[900] }}>admin</Text> kullanıcıları tarafından yapılabilir.
            Kullanıcı rollerini düzenlemek için <Text style={{ fontWeight: '600', color: DS.ink[800] }}>Ekip → Ekip → Düzenle</Text> sekmesine gidin.
          </Text>
        </View>
      </View>
    );
  }

  // ── Mode: 'role' (rol bazlı) | 'user' (kullanıcı bazlı override) ──
  const [mode, setMode] = useState<'role' | 'user'>('role');

  const [activeRole, setActiveRole] = useState<RoleKey>('lab_manager');
  const [rolePerms, setRolePerms] = useState<Set<string>>(new Set());
  const [originalPerms, setOriginalPerms] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // Arama + filtre + katlanmış kategoriler. Varsayılan: HEPSİ AÇIK değil —
  // 13 kategori × ~4 satır aynı anda ekranda okunmuyordu. İlk kategori açık.
  const [permQuery, setPermQuery] = useState('');
  const [permFilter, setPermFilter] = useState<'all' | 'on' | 'off' | 'critical'>('all');
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set(['orders']));
  const [saved, setSaved] = useState(false);

  // ── User mode state ──
  const [userSearch, setUserSearch] = useState('');
  const [userList, setUserList] = useState<Array<{ id: string; full_name: string; email: string | null; user_type: string; role: string | null }>>([]);
  const [activeUserId, setActiveUserId] = useState<string | null>(null);
  const [userPermsLoading, setUserPermsLoading] = useState(false);
  // permission_key → 'auto' (rol'den), 'on' (override grant), 'off' (override revoke)
  const [userPermStates, setUserPermStates] = useState<Record<string, 'auto' | 'on' | 'off'>>({});
  // Etkilenen (gerçekte aktif) izinler
  const [userEffective, setUserEffective] = useState<Set<string>>(new Set());
  // Yeni: pending değişiklikler (Kaydet butonuna basana kadar DB'ye gitmez)
  const [pendingUserPerms, setPendingUserPerms] = useState<Set<string>>(new Set());
  const [originalUserPerms, setOriginalUserPerms] = useState<Set<string>>(new Set());
  const [userRoleDefaults, setUserRoleDefaults] = useState<Set<string>>(new Set());
  const [userSaving, setUserSaving] = useState(false);
  const [userSaved, setUserSaved] = useState(false);
  // 2-dropdown picker: önce role filtresi, sonra kullanıcı
  const [userRoleFilter, setUserRoleFilter] = useState<RoleKey | null>(null);
  const [roleDropOpen, setRoleDropOpen] = useState(false);
  const [userDropOpen, setUserDropOpen] = useState(false);

  // Profile.role + user_type → RoleKey eşlemesi
  const profileToRoleKey = (p: { user_type: string; role: string | null }): RoleKey | null => {
    if (p.user_type === 'doctor')       return 'doctor';
    if (p.user_type === 'clinic_admin') return 'clinic_admin';
    if (p.user_type === 'lab' && p.role === 'technician') return 'technician';
    if (p.user_type === 'lab' && p.role === 'courier')    return 'courier';
    if (p.user_type === 'lab')          return 'lab_manager';
    return null;
  };

  // User listesi yükle
  useEffect(() => {
    if (mode !== 'user') return;
    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, email, user_type, role')
        .neq('user_type', 'admin')
        .eq('is_active', true)
        .order('full_name')
        .limit(200);
      if (Array.isArray(data)) setUserList(data as any);
    })();
  }, [mode]);

  // Kullanıcı seçilince state'i yükle
  const loadUserPerms = useCallback(async (userId: string) => {
    setUserPermsLoading(true);
    setUserSaved(false);
    try {
      const user = userList.find(u => u.id === userId);
      const roleKey = user ? profileToRoleKey(user) : null;
      const [{ data: eff }, { data: ovr }, { data: roleDef }] = await Promise.all([
        supabase.rpc('get_user_effective_permissions', { p_user_id: userId }),
        supabase.rpc('get_user_overrides', { p_user_id: userId }),
        roleKey ? supabase.rpc('get_role_permissions', { p_role: roleKey }) : Promise.resolve({ data: [] }),
      ]);
      const effective = new Set<string>((eff ?? []).map((r: any) => r.permission_key));
      const states: Record<string, 'auto' | 'on' | 'off'> = {};
      for (const o of (ovr ?? []) as any[]) {
        states[o.permission_key] = o.granted ? 'on' : 'off';
      }
      setUserEffective(effective);
      setUserPermStates(states);
      setPendingUserPerms(new Set(effective));
      setOriginalUserPerms(new Set(effective));
      setUserRoleDefaults(new Set<string>(Array.isArray(roleDef) ? (roleDef as string[]) : []));
    } catch {
      setUserEffective(new Set());
      setUserPermStates({});
      setPendingUserPerms(new Set());
      setOriginalUserPerms(new Set());
      setUserRoleDefaults(new Set());
    }
    setUserPermsLoading(false);
  }, [userList]);

  useEffect(() => {
    if (mode === 'user' && activeUserId) loadUserPerms(activeUserId);
  }, [mode, activeUserId, loadUserPerms]);

  // Pending toggle — sadece local state'i değiştirir, kaydetmez
  // Manage açılırsa View otomatik açılır; View kapanırsa Manage de kapanır
  const toggleUserPerm = (key: PermissionKey) => {
    setUserSaved(false);
    setPendingUserPerms(prev => {
      const next = new Set(prev);
      const k = key as string;
      const isOn = next.has(k);
      if (isOn) {
        next.delete(k);
        if (k.startsWith('view_')) {
          const manageKey = 'manage_' + k.slice('view_'.length);
          next.delete(manageKey);
        }
      } else {
        next.add(k);
        if (k.startsWith('manage_')) {
          const viewKey = 'view_' + k.slice('manage_'.length);
          next.add(viewKey);
        }
      }
      return next;
    });
  };

  // Kullanıcı yetkilerini Kaydet — pending vs role defaults farkına göre override yaz
  const handleUserSave = async () => {
    if (!activeUserId) return;
    setUserSaving(true);
    try {
      // Pending'da olup originalda olmayan veya tersi → değişti
      const allKeys = new Set<string>([...pendingUserPerms, ...originalUserPerms]);
      const ops: Promise<any>[] = [];
      for (const key of allKeys) {
        const desired = pendingUserPerms.has(key);
        const original = originalUserPerms.has(key);
        if (desired === original) continue; // değişmedi
        const roleDefault = userRoleDefaults.has(key);
        if (desired === roleDefault) {
          // Role default ile aynı → override gerekmez, mevcut override'ı temizle
          ops.push(Promise.resolve(supabase.rpc('clear_user_permission', { p_user_id: activeUserId, p_permission_key: key })));
        } else {
          // Role'den farklı → explicit override yaz
          ops.push(Promise.resolve(supabase.rpc('set_user_permission', {
            p_user_id: activeUserId,
            p_permission_key: key,
            p_granted: desired,
            p_note: null,
          })));
        }
      }
      const results = await Promise.all(ops);
      const firstErr = results.find((r: any) => r?.error);
      if (firstErr?.error) {
        toast.error('Yetkiler kaydedilemedi: ' + firstErr.error.message);
      } else {
        setOriginalUserPerms(new Set(pendingUserPerms));
        setUserEffective(new Set(pendingUserPerms));
        setUserSaved(true);
        setTimeout(() => setUserSaved(false), 3000);
        toast.success('Yetkiler kaydedildi');
        refreshMyPerms();
      }
    } catch (e: any) {
      toast.error('Yetki kaydı hatası: ' + (e?.message ?? 'bilinmeyen'));
    }
    setUserSaving(false);
  };

  const handleUserReset = () => {
    setPendingUserPerms(new Set(originalUserPerms));
    setUserSaved(false);
  };

  const userHasChanges = (() => {
    if (pendingUserPerms.size !== originalUserPerms.size) return true;
    for (const k of pendingUserPerms) if (!originalUserPerms.has(k)) return true;
    return false;
  })();

  /** Toplu aç/kapat (kullanıcı bazlı) — yön çağırandan gelir. */
  const setAllUserPerms = (keys: PermissionKey[], on: boolean) => {
    setUserSaved(false);
    setPendingUserPerms(prev => {
      const next = new Set(prev);
      for (const k of keys) { if (on) next.add(k); else next.delete(k); }
      return next;
    });
  };

  const filteredUsers = React.useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    if (!q) return userList;
    return userList.filter(u =>
      (u.full_name ?? '').toLowerCase().includes(q) ||
      (u.email ?? '').toLowerCase().includes(q)
    );
  }, [userList, userSearch]);

  const activeUser = userList.find(u => u.id === activeUserId);

  const activeConfig = ROLE_CONFIG.find(r => r.key === activeRole)!;

  // Load permissions for selected role
  const loadRolePerms = useCallback(async (role: RoleKey) => {
    setLoading(true);
    setSaved(false);
    try {
      const { data, error } = await supabase.rpc('get_role_permissions', { p_role: role });
      if (!error && Array.isArray(data)) {
        const set = new Set(data as string[]);
        setRolePerms(set);
        setOriginalPerms(new Set(set));
      } else {
        setRolePerms(new Set());
        setOriginalPerms(new Set());
      }
    } catch {
      setRolePerms(new Set());
      setOriginalPerms(new Set());
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadRolePerms(activeRole);
  }, [activeRole, loadRolePerms]);

  const togglePerm = (key: PermissionKey) => {
    setSaved(false);
    setRolePerms(prev => {
      const next = new Set(prev);
      const k = key as string;
      const isOn = next.has(k);
      if (isOn) {
        next.delete(k);
        // Görme kapatılırsa Yönetme de kapanır (manage implies view)
        if (k.startsWith('view_')) {
          const manageKey = 'manage_' + k.slice('view_'.length);
          next.delete(manageKey);
        }
      } else {
        next.add(k);
        // Yönetme açılırsa Görme de otomatik açılır
        if (k.startsWith('manage_')) {
          const viewKey = 'view_' + k.slice('manage_'.length);
          next.add(viewKey);
        }
      }
      return next;
    });
  };

  const hasChanges = (() => {
    if (rolePerms.size !== originalPerms.size) return true;
    for (const k of rolePerms) if (!originalPerms.has(k)) return true;
    return false;
  })();

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase.rpc('set_role_permissions', {
        p_role: activeRole,
        p_permissions: Array.from(rolePerms),
      });
      if (error) {
        toast.error('Yetkiler kaydedilemedi: ' + error.message);
      } else {
        setOriginalPerms(new Set(rolePerms));
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
        toast.success('Yetkiler kaydedildi');
        refreshMyPerms();
      }
    } catch (e: any) {
      toast.error('Yetki kaydı hatası: ' + (e?.message ?? 'bilinmeyen'));
    }
    setSaving(false);
  };

  const handleReset = () => {
    setRolePerms(new Set(originalPerms));
    setSaved(false);
  };

  /** Toplu aç/kapat — yön çağırandan gelir (eskiden kendi hesaplıyordu). */
  const setAllPerms = (keys: PermissionKey[], on: boolean) => {
    setSaved(false);
    setRolePerms(prev => {
      const next = new Set(prev);
      for (const k of keys) { if (on) next.add(k); else next.delete(k); }
      return next;
    });
  };

  // ── Role selector (shared between mobile/desktop) ──
  const renderRoleItem = (r: typeof ROLE_CONFIG[0]) => {
    const isActive = r.key === activeRole;
    const RIcon = r.icon;
    return (
      <Pressable
        key={r.key}
        onPress={() => setActiveRole(r.key)}
        style={{
          flexDirection: 'row', alignItems: 'center', gap: 10,
          paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12,
          backgroundColor: isActive ? '#FFFFFF' : 'transparent',
          // @ts-ignore web
          cursor: 'pointer',
        }}
      >
        {isActive && (
          <View style={{ width: 3, height: 16, borderRadius: 2, backgroundColor: accentColor, marginLeft: -6, marginRight: 4 }} />
        )}
        <View style={{
          width: 28, height: 28, borderRadius: 8,
          backgroundColor: isActive ? accentColor + '14' : 'transparent',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <RIcon size={15} strokeWidth={isActive ? 2 : 1.6} color={isActive ? accentColor : '#9A9A9A'} />
        </View>
        <Text style={{ fontSize: 13, fontWeight: isActive ? '600' : '400', color: isActive ? '#0A0A0A' : '#6B6B6B', flex: 1 }}>
          {ROLE_LABELS[r.key]}
        </Text>
        {isActive && <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: accentColor }} />}
      </Pressable>
    );
  };

  // ── Permission groups content ──
  const renderPermissions = () => {
    if (loading) {
      return <ActivityIndicator size="large" color={accentColor} style={{ marginTop: 60 }} />;
    }

    return (
      <View style={{ gap: 16 }}>
        {/* Save bar */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={{ fontSize: 12, color: DS.ink[400] }}>
              {rolePerms.size} yetki aktif
            </Text>
            {hasChanges && (
              <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 9999, backgroundColor: CHIP_TONES.warning.bg }}>
                <Text style={{ fontSize: 10, fontWeight: '700', color: CHIP_TONES.warning.fg }}>Kaydedilmedi</Text>
              </View>
            )}
            {saved && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 9999, backgroundColor: CHIP_TONES.success.bg }}>
                <Check size={10} color={CHIP_TONES.success.fg} strokeWidth={2} />
                <Text style={{ fontSize: 10, fontWeight: '700', color: CHIP_TONES.success.fg }}>Kaydedildi</Text>
              </View>
            )}
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {hasChanges && (
              <Pressable
                onPress={handleReset}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 5,
                  paddingHorizontal: 12, paddingVertical: 7, borderRadius: 9999,
                  borderWidth: 1, borderColor: DS.ink[200],
                  ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
                }}
              >
                <RotateCcw size={13} color={DS.ink[500]} strokeWidth={1.6} />
                <Text style={{ fontSize: 12, fontWeight: '600', color: DS.ink[500] }}>Geri Al</Text>
              </Pressable>
            )}
            <Pressable
              onPress={handleSave}
              disabled={!hasChanges || saving}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 5,
                paddingHorizontal: 14, paddingVertical: 7, borderRadius: 9999,
                backgroundColor: hasChanges ? accentColor : DS.ink[200],
                opacity: saving ? 0.6 : 1,
                ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
              } as any}
            >
              <Save size={13} color="#FFFFFF" strokeWidth={1.8} />
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#FFFFFF' }}>
                {saving ? 'Kaydediliyor...' : 'Kaydet'}
              </Text>
            </Pressable>
          </View>
        </View>

        {/* Feature-row layout: her satır → özellik + Görme + Yönetme toggle */}
        {/* Rol özeti — kaç yetkinin kaçı açık, tek bakışta.
            Eskiden yalnız "60 yetki aktif" yazıyordu; paydası olmadan bunun
            çok mu az mı olduğu anlaşılmıyordu. */}
        {(() => {
          const total = FEATURES.reduce((n, f) => n + (f.hasView ? 1 : 0) + (f.hasManage ? 1 : 0), 0);
          const pct = total > 0 ? Math.round((rolePerms.size / total) * 100) : 0;
          return (
            <View style={[cardSolid, { gap: 10 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10 }}>
                <Text style={{ fontSize: 10.5, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', color: DS.ink[400], flex: 1 }}>
                  {ROLE_LABELS[activeRole] ?? activeRole}
                </Text>
                <Text style={{ ...DISPLAY, fontSize: 22, letterSpacing: -0.6, color: DS.ink[900] }}>{rolePerms.size}</Text>
                <Text style={{ fontSize: 13, color: DS.ink[400], marginBottom: 2 }}>/ {total} yetki</Text>
                <Text style={{ fontSize: 12, color: DS.ink[300], marginBottom: 2 }}>· %{pct}</Text>
              </View>
              <View style={{ height: 6, borderRadius: 3, backgroundColor: 'rgba(0,0,0,0.07)', overflow: 'hidden' }}>
                <View style={{ width: `${pct}%`, height: '100%', borderRadius: 3, backgroundColor: accentColor }} />
              </View>
            </View>
          );
        })()}

        {/* Arama + filtre — 73 yetkide gerekli */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 8,
            height: 36, paddingHorizontal: 12, borderRadius: 10, flex: 1, minWidth: 200,
            backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)',
          }}>
            <Search size={14} color={DS.ink[400]} strokeWidth={1.8} />
            <TextInput
              value={permQuery}
              onChangeText={setPermQuery}
              placeholder="Yetki ara…"
              placeholderTextColor={DS.ink[400]}
              style={{ flex: 1, fontSize: 13, color: DS.ink[900], ...(Platform.OS === 'web' ? { outline: 'none' } as any : {}) }}
            />
            {permQuery.length > 0 && (
              <Pressable onPress={() => setPermQuery('')}><X size={13} color={DS.ink[400]} strokeWidth={2} /></Pressable>
            )}
          </View>
          {([['all','Tümü'],['on','Açık'],['off','Kapalı'],['critical','Kritik']] as const).map(([k, lbl]) => {
            const on = permFilter === k;
            return (
              <Pressable
                key={k}
                onPress={() => setPermFilter(k)}
                style={({ pressed }: any) => ({
                  paddingHorizontal: 11, paddingVertical: 7, borderRadius: 999,
                  backgroundColor: on ? `${accentColor}14` : 'transparent',
                  borderWidth: 1, borderColor: on ? `${accentColor}55` : 'rgba(0,0,0,0.08)',
                  opacity: pressed ? 0.7 : 1,
                  ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
                })}
              >
                <Text style={{ fontSize: 11.5, fontWeight: on ? '700' : '500', color: on ? accentColor : DS.ink[500] }}>{lbl}</Text>
              </Pressable>
            );
          })}
        </View>

        {(Object.keys(PERMISSION_CATEGORIES) as Array<keyof typeof PERMISSION_CATEGORIES>).map(catKey => {
          const catFeatures = FEATURES.filter(f => f.category === catKey);
          if (catFeatures.length === 0) return null;
          return (
            <PermissionCategory
              key={catKey}
              catLabel={PERMISSION_CATEGORIES[catKey]}
              features={catFeatures}
              isOn={(k) => rolePerms.has(k)}
              onToggle={(k) => togglePerm(k as PermissionKey)}
              onToggleAll={(keys, on) => setAllPerms(keys as PermissionKey[], on)}
              accentColor={accentColor}
              isDesktop={isDesktop}
              expanded={expandedCats.has(catKey)}
              onToggleExpanded={() => setExpandedCats(prev => {
                const n = new Set(prev);
                if (n.has(catKey)) n.delete(catKey); else n.add(catKey);
                return n;
              })}
              query={permQuery}
              filter={permFilter}
            />
          );
        })}
      </View>
    );
  };

  // ── Mode tabs (Rol bazlı | Kullanıcı bazlı) ──
  const renderModeTabs = () => (
    <View style={{ flexDirection: 'row', gap: 3, padding: 3, backgroundColor: DS.ink[50], borderRadius: 9999, alignSelf: 'flex-start', marginBottom: 16 }}>
      <Pressable
        onPress={() => setMode('role')}
        style={{
          flexDirection: 'row', alignItems: 'center', gap: 6,
          paddingHorizontal: 14, paddingVertical: 7, borderRadius: 9999,
          backgroundColor: mode === 'role' ? accentColor : 'transparent',
          ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
        } as any}
      >
        <Shield size={13} color={mode === 'role' ? '#FFFFFF' : DS.ink[500]} strokeWidth={1.8} />
        <Text style={{ fontSize: 12, fontWeight: '700', color: mode === 'role' ? '#FFFFFF' : DS.ink[500] }}>
          Rol Bazlı
        </Text>
      </Pressable>
      <Pressable
        onPress={() => setMode('user')}
        style={{
          flexDirection: 'row', alignItems: 'center', gap: 6,
          paddingHorizontal: 14, paddingVertical: 7, borderRadius: 9999,
          backgroundColor: mode === 'user' ? accentColor : 'transparent',
          ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
        } as any}
      >
        <UserIcon size={13} color={mode === 'user' ? '#FFFFFF' : DS.ink[500]} strokeWidth={1.8} />
        <Text style={{ fontSize: 12, fontWeight: '700', color: mode === 'user' ? '#FFFFFF' : DS.ink[500] }}>
          Kullanıcı Bazlı
        </Text>
      </Pressable>
    </View>
  );

  // ── 2-Dropdown User picker (Role → User) ──
  const usersInRole = userList.filter(u => userRoleFilter ? profileToRoleKey(u) === userRoleFilter : false);
  const renderUserPicker = () => (
    <View style={{ marginBottom: 16, gap: 10, zIndex: 50 }}>
      <View style={{ flexDirection: isDesktop ? 'row' : 'column', gap: 10, zIndex: 50 }}>
        {/* Dropdown 1 — Role */}
        <View style={{ flex: 1, zIndex: 51 }}>
          <Text style={{ fontSize: 11, fontWeight: '700', color: DS.ink[500], letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 6 }}>1. Rol Seç</Text>
          <Pressable
            onPress={() => { setRoleDropOpen(o => !o); setUserDropOpen(false); }}
            style={{
              flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
              paddingHorizontal: 14, height: 44, borderRadius: 14,
              backgroundColor: '#FFFFFF', borderWidth: 1,
              borderColor: roleDropOpen ? accentColor : 'rgba(0,0,0,0.08)',
              ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
            } as any}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {userRoleFilter ? (() => {
                const cfg = ROLE_CONFIG.find(r => r.key === userRoleFilter);
                const RIcon = cfg?.icon ?? Shield;
                return (
                  <>
                    <RIcon size={14} color={accentColor} strokeWidth={1.8} />
                    <Text style={{ fontSize: 13, fontWeight: '600', color: DS.ink[900] }}>{ROLE_LABELS[userRoleFilter]}</Text>
                  </>
                );
              })() : (
                <Text style={{ fontSize: 13, color: DS.ink[400] }}>Rol seçin...</Text>
              )}
            </View>
            <ChevronDown size={14} color={DS.ink[400]} strokeWidth={1.8} style={{ transform: [{ rotate: roleDropOpen ? '180deg' : '0deg' }] }} />
          </Pressable>
          {roleDropOpen && (
            <View style={{
              position: 'absolute', top: 70, left: 0, right: 0,
              backgroundColor: '#FFFFFF', borderRadius: 12, padding: 4,
              borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)',
              zIndex: 100,
              ...(Platform.OS === 'web' ? { boxShadow: '0 8px 24px rgba(0,0,0,0.08)' } : {}),
            } as any}>
              {ROLE_CONFIG.map(r => {
                const RIcon = r.icon;
                const isSel = r.key === userRoleFilter;
                return (
                  <Pressable
                    key={r.key}
                    onPress={() => { setUserRoleFilter(r.key); setRoleDropOpen(false); setActiveUserId(null); }}
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: 8,
                      paddingHorizontal: 10, paddingVertical: 9, borderRadius: 8,
                      backgroundColor: isSel ? `${accentColor}14` : 'transparent',
                      ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
                    } as any}
                  >
                    <RIcon size={13} color={isSel ? accentColor : DS.ink[500]} strokeWidth={1.8} />
                    <Text style={{ fontSize: 13, fontWeight: isSel ? '700' : '500', color: isSel ? accentColor : DS.ink[800] }}>
                      {ROLE_LABELS[r.key]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>

        {/* Dropdown 2 — User (filtered by role) */}
        <View style={{ flex: 1, zIndex: 50 }}>
          <Text style={{ fontSize: 11, fontWeight: '700', color: DS.ink[500], letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 6 }}>2. Kullanıcı Seç</Text>
          <Pressable
            onPress={() => userRoleFilter && (setUserDropOpen(o => !o), setRoleDropOpen(false))}
            disabled={!userRoleFilter}
            style={{
              flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
              paddingHorizontal: 14, height: 44, borderRadius: 14,
              backgroundColor: userRoleFilter ? '#FFFFFF' : DS.ink[50],
              borderWidth: 1,
              borderColor: userDropOpen ? accentColor : 'rgba(0,0,0,0.08)',
              opacity: userRoleFilter ? 1 : 0.6,
              ...(Platform.OS === 'web' ? { cursor: userRoleFilter ? 'pointer' : 'not-allowed' } : {}),
            } as any}
          >
            {activeUserId ? (() => {
              const u = userList.find(x => x.id === activeUserId);
              return (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: accentColor, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: '#FFFFFF' }}>{(u?.full_name ?? '?').charAt(0).toUpperCase()}</Text>
                  </View>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: DS.ink[900] }} numberOfLines={1}>{u?.full_name ?? '—'}</Text>
                </View>
              );
            })() : (
              <Text style={{ fontSize: 13, color: DS.ink[400] }}>
                {userRoleFilter ? `${usersInRole.length} kullanıcı` : 'Önce rol seçin'}
              </Text>
            )}
            <ChevronDown size={14} color={DS.ink[400]} strokeWidth={1.8} style={{ transform: [{ rotate: userDropOpen ? '180deg' : '0deg' }] }} />
          </Pressable>
          {userDropOpen && (
            <View style={{
              position: 'absolute', top: 70, left: 0, right: 0,
              backgroundColor: '#FFFFFF', borderRadius: 12, padding: 4,
              borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)',
              zIndex: 100, maxHeight: 320,
              ...(Platform.OS === 'web' ? { boxShadow: '0 8px 24px rgba(0,0,0,0.08)' } : {}),
            } as any}>
              <ScrollView style={{ maxHeight: 312 }}>
                {usersInRole.length === 0 ? (
                  <Text style={{ fontSize: 12, color: DS.ink[400], textAlign: 'center', paddingVertical: 16 }}>
                    Bu rolde kullanıcı yok
                  </Text>
                ) : usersInRole.map(u => {
                  const isSel = u.id === activeUserId;
                  const initials = (u.full_name ?? '?').charAt(0).toUpperCase();
                  return (
                    <Pressable
                      key={u.id}
                      onPress={() => { setActiveUserId(u.id); setUserDropOpen(false); }}
                      style={{
                        flexDirection: 'row', alignItems: 'center', gap: 8,
                        paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8,
                        backgroundColor: isSel ? `${accentColor}14` : 'transparent',
                        ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
                      } as any}
                    >
                      <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: isSel ? accentColor : DS.ink[100], alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: isSel ? '#FFFFFF' : DS.ink[700] }}>{initials}</Text>
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={{ fontSize: 13, fontWeight: isSel ? '700' : '500', color: DS.ink[900] }} numberOfLines={1}>
                          {u.full_name ?? '(isimsiz)'}
                        </Text>
                        <Text style={{ fontSize: 10, color: DS.ink[400] }} numberOfLines={1}>{u.email ?? '—'}</Text>
                      </View>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          )}
        </View>
      </View>
    </View>
  );

  // ── User permissions render — rol bazlı ile aynı görünüm + Kaydet butonu ──
  const renderUserPermissions = () => {
    if (!activeUserId) {
      return (
        <View style={cardSolid}>
          <Text style={{ fontSize: 13, color: DS.ink[400], textAlign: 'center', paddingVertical: 40 }}>
            Yetkilerini düzenlemek için yukarıdan rol ve kullanıcı seçin.
          </Text>
        </View>
      );
    }
    if (userPermsLoading) {
      return <CenteredLoader color={accentColor} label="Yükleniyor…" />;
    }
    return (
      <View style={{ gap: 16 }}>
        {/* Save bar — aynı stil */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={{ fontSize: 12, color: DS.ink[400] }}>
              {pendingUserPerms.size} yetki aktif · {activeUser?.full_name ?? '—'}
            </Text>
            {userHasChanges && (
              <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 9999, backgroundColor: CHIP_TONES.warning.bg }}>
                <Text style={{ fontSize: 10, fontWeight: '700', color: CHIP_TONES.warning.fg }}>Kaydedilmedi</Text>
              </View>
            )}
            {userSaved && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 9999, backgroundColor: CHIP_TONES.success.bg }}>
                <Check size={10} color={CHIP_TONES.success.fg} strokeWidth={2} />
                <Text style={{ fontSize: 10, fontWeight: '700', color: CHIP_TONES.success.fg }}>Kaydedildi</Text>
              </View>
            )}
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {userHasChanges && (
              <Pressable
                onPress={handleUserReset}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 5,
                  paddingHorizontal: 12, paddingVertical: 7, borderRadius: 9999,
                  borderWidth: 1, borderColor: DS.ink[200],
                  ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
                }}
              >
                <RotateCcw size={13} color={DS.ink[500]} strokeWidth={1.6} />
                <Text style={{ fontSize: 12, fontWeight: '600', color: DS.ink[500] }}>Geri Al</Text>
              </Pressable>
            )}
            <Pressable
              onPress={handleUserSave}
              disabled={!userHasChanges || userSaving}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 5,
                paddingHorizontal: 14, paddingVertical: 7, borderRadius: 9999,
                backgroundColor: userHasChanges ? accentColor : DS.ink[200],
                opacity: userSaving ? 0.6 : 1,
                ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
              } as any}
            >
              <Save size={13} color="#FFFFFF" strokeWidth={1.8} />
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#FFFFFF' }}>
                {userSaving ? 'Kaydediliyor...' : 'Kaydet'}
              </Text>
            </Pressable>
          </View>
        </View>

        {/* Feature-row layout — kullanıcı bazlı */}
        {(Object.keys(PERMISSION_CATEGORIES) as Array<keyof typeof PERMISSION_CATEGORIES>).map(catKey => {
          const catFeatures = FEATURES.filter(f => f.category === catKey);
          if (catFeatures.length === 0) return null;
          return (
            <PermissionCategory
              key={catKey}
              catLabel={PERMISSION_CATEGORIES[catKey]}
              features={catFeatures}
              isOn={(k) => pendingUserPerms.has(k)}
              onToggle={(k) => toggleUserPerm(k as PermissionKey)}
              onToggleAll={(keys, on) => setAllUserPerms(keys as PermissionKey[], on)}
              accentColor={accentColor}
              isDesktop={isDesktop}
              expanded={expandedCats.has(catKey)}
              onToggleExpanded={() => setExpandedCats(prev => {
                const n = new Set(prev);
                if (n.has(catKey)) n.delete(catKey); else n.add(catKey);
                return n;
              })}
              query={permQuery}
              filter={permFilter}
            />
          );
        })}
      </View>
    );
  };

  // ── Embedded mode (inside SettingsHub) — no own sidebar/title ──
  if (embedded) {
    return (
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 20, paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      >
        {renderModeTabs()}

        {mode === 'role' ? (
          <>
            {/* Role selector — horizontal pills */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
              <View style={{ flexDirection: 'row', gap: 3, padding: 3, backgroundColor: DS.ink[50], borderRadius: 9999 }}>
                {ROLE_CONFIG.map(r => {
                  const isActive = r.key === activeRole;
                  const RIcon = r.icon;
                  return (
                    <Pressable
                      key={r.key}
                      onPress={() => setActiveRole(r.key)}
                      style={{
                        flexDirection: 'row', alignItems: 'center', gap: 5,
                        paddingHorizontal: 10, paddingVertical: 6, borderRadius: 9999,
                        backgroundColor: isActive ? accentColor : 'transparent',
                        // @ts-ignore web
                        cursor: 'pointer',
                      }}
                    >
                      <RIcon size={12} strokeWidth={isActive ? 2.2 : 1.8} color={isActive ? '#FFF' : accentColor} />
                      <Text style={{ fontSize: 11, fontWeight: isActive ? '700' : '600', color: isActive ? '#FFF' : DS.ink[500] }}>
                        {ROLE_LABELS[r.key]}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>
            {renderPermissions()}
          </>
        ) : (
          <>
            {renderUserPicker()}
            {renderUserPermissions()}
          </>
        )}
      </ScrollView>
    );
  }

  // ── Standalone mode — own sidebar + title ──
  return (
    <View style={{ flex: 1 }}>
      {isDesktop ? (
        <View style={{ flex: 1, flexDirection: 'row' }}>
          {/* Sidebar */}
          <View style={{ width: 220, paddingTop: 24, paddingBottom: 16 }}>
            {mode === 'role' ? (
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 2, paddingHorizontal: 10 }}>
                {ROLE_CONFIG.map(renderRoleItem)}
              </ScrollView>
            ) : (
              <View style={{ paddingHorizontal: 10 }}>
                {renderUserPicker()}
              </View>
            )}
          </View>

          {/* Content */}
          <View style={{ flex: 1, borderRadius: 16, overflow: 'hidden' }}>
            <View style={{ paddingHorizontal: 28, paddingTop: 16, paddingBottom: 8 }}>
              <Text style={{ ...DISPLAY, fontSize: 24, letterSpacing: -0.5, color: '#0A0A0A', marginBottom: 4 }}>
                {mode === 'role' ? ROLE_LABELS[activeRole] : (activeUser?.full_name ?? 'Kullanıcı Bazlı Yetki')}
              </Text>
              <Text style={{ fontSize: 13, color: '#9A9A9A', lineHeight: 19 }}>
                {mode === 'role'
                  ? 'Bu rol icin izin verilen yetkileri yonetin'
                  : 'Kullanıcıya özel ek izin / yasak override\'ları yönet'}
              </Text>
            </View>
            <View style={{ paddingHorizontal: 28, paddingTop: 8 }}>
              {renderModeTabs()}
            </View>
            <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 0, paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
              {mode === 'role' ? renderPermissions() : renderUserPermissions()}
            </ScrollView>
          </View>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
          {renderModeTabs()}
          {mode === 'role' ? (
            <>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
                <View style={{ flexDirection: 'row', gap: 3, padding: 3, backgroundColor: DS.ink[50], borderRadius: 9999 }}>
                  {ROLE_CONFIG.map(r => {
                    const isActive = r.key === activeRole;
                    const RIcon = r.icon;
                    return (
                      <Pressable
                        key={r.key}
                        onPress={() => setActiveRole(r.key)}
                        style={{
                          flexDirection: 'row', alignItems: 'center', gap: 5,
                          paddingHorizontal: 10, paddingVertical: 6, borderRadius: 9999,
                          backgroundColor: isActive ? accentColor : 'transparent',
                        }}
                      >
                        <RIcon size={12} strokeWidth={isActive ? 2.2 : 1.8} color={isActive ? '#FFF' : accentColor} />
                        <Text style={{ fontSize: 11, fontWeight: isActive ? '700' : '600', color: isActive ? '#FFF' : DS.ink[500] }}>
                          {ROLE_LABELS[r.key]}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </ScrollView>
              {renderPermissions()}
            </>
          ) : (
            <>
              {renderUserPicker()}
              {renderUserPermissions()}
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}
