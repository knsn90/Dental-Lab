/**
 * PermissionsScreen — Yetkiler Yönetim Paneli (Patterns Design Language)
 *
 * Left: role selector (admin, lab_manager, technician, courier, clinic_admin, doctor)
 * Right: grouped toggle permissions
 * Desktop sidebar + content, mobile stacked.
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, Pressable, Switch,
  ActivityIndicator, useWindowDimensions, Platform,
} from 'react-native';
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
  usePermissionStore,
} from '../../../core/store/permissionStore';
import {
  Shield, Users, Wrench, Stethoscope, Building2, Truck,
  Check, Save, RotateCcw,
} from 'lucide-react-native';

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
const ROLE_CONFIG: { key: RoleKey; icon: React.ComponentType<any>; accent: string }[] = [
  { key: 'lab_manager',  icon: Users,     accent: '#2563EB' },
  { key: 'technician',   icon: Wrench,    accent: '#6366F1' },
  { key: 'doctor',       icon: Stethoscope, accent: '#059669' },
  { key: 'clinic_admin', icon: Building2, accent: '#D97706' },
  { key: 'courier',      icon: Truck,     accent: '#0EA5E9' },
];

// ═════════════════════════════════════════════════════════════
interface PermissionsScreenProps {
  /** When true, skip own sidebar/title — parent (SettingsHub) provides those */
  embedded?: boolean;
  accentColor?: string;
}

export function PermissionsSection(props: PermissionsScreenProps) {
  return <PermissionsScreen {...props} />;
}

export function PermissionsScreen({ embedded = false, accentColor }: PermissionsScreenProps = {}) {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1024;
  const { setTitle, clear } = usePageTitleStore();
  const { fetchPermissions: refreshMyPerms } = usePermissionStore();

  useEffect(() => {
    if (!embedded) {
      setTitle('Yetkiler', '');
      return clear;
    }
  }, [embedded]);

  const [activeRole, setActiveRole] = useState<RoleKey>('lab_manager');
  const [rolePerms, setRolePerms] = useState<Set<string>>(new Set());
  const [originalPerms, setOriginalPerms] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

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
      if (next.has(key)) next.delete(key);
      else next.add(key);
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
      if (!error) {
        setOriginalPerms(new Set(rolePerms));
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
        // Re-fetch current user's permissions so sidebar updates immediately
        refreshMyPerms();
      }
    } catch {}
    setSaving(false);
  };

  const handleReset = () => {
    setRolePerms(new Set(originalPerms));
    setSaved(false);
  };

  const toggleAll = (category: string, keys: PermissionKey[]) => {
    const allOn = keys.every(k => rolePerms.has(k));
    setSaved(false);
    setRolePerms(prev => {
      const next = new Set(prev);
      for (const k of keys) {
        if (allOn) next.delete(k);
        else next.add(k);
      }
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
          <View style={{ width: 3, height: 16, borderRadius: 2, backgroundColor: r.accent, marginLeft: -6, marginRight: 4 }} />
        )}
        <View style={{
          width: 28, height: 28, borderRadius: 8,
          backgroundColor: isActive ? r.accent + '14' : 'transparent',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <RIcon size={15} strokeWidth={isActive ? 2 : 1.6} color={isActive ? r.accent : '#9A9A9A'} />
        </View>
        <Text style={{ fontSize: 13, fontWeight: isActive ? '600' : '400', color: isActive ? '#0A0A0A' : '#6B6B6B', flex: 1 }}>
          {ROLE_LABELS[r.key]}
        </Text>
        {isActive && <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: r.accent }} />}
      </Pressable>
    );
  };

  // ── Permission groups content ──
  const renderPermissions = () => {
    if (loading) {
      return <ActivityIndicator size="large" color={activeConfig.accent} style={{ marginTop: 60 }} />;
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
                backgroundColor: hasChanges ? activeConfig.accent : DS.ink[200],
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

        {/* Permission groups */}
        {PERMISSION_GROUPS.map(group => {
          const catLabel = PERMISSION_CATEGORIES[group.category] ?? group.category;
          const allOn = group.keys.every(k => rolePerms.has(k));
          const someOn = group.keys.some(k => rolePerms.has(k));
          const activeCount = group.keys.filter(k => rolePerms.has(k)).length;

          return (
            <View key={group.category} style={cardSolid}>
              {/* Category header */}
              <Pressable
                onPress={() => toggleAll(group.category, group.keys)}
                style={{
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                  marginBottom: 14,
                  ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: DS.ink[900] }}>{catLabel}</Text>
                  <View style={{
                    paddingHorizontal: 6, paddingVertical: 1, borderRadius: 9999,
                    backgroundColor: allOn ? CHIP_TONES.success.bg : someOn ? CHIP_TONES.warning.bg : DS.ink[100],
                  }}>
                    <Text style={{
                      fontSize: 10, fontWeight: '700',
                      color: allOn ? CHIP_TONES.success.fg : someOn ? CHIP_TONES.warning.fg : DS.ink[400],
                    }}>
                      {activeCount}/{group.keys.length}
                    </Text>
                  </View>
                </View>
                <Text style={{ fontSize: 11, color: DS.ink[400] }}>
                  {allOn ? 'Tumunu Kapat' : 'Tumunu Ac'}
                </Text>
              </Pressable>

              {/* Permissions */}
              {group.keys.map((key, idx) => {
                const isOn = rolePerms.has(key);
                return (
                  <View
                    key={key}
                    style={{
                      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                      paddingVertical: 10,
                      borderTopWidth: idx > 0 ? 1 : 0,
                      borderTopColor: 'rgba(0,0,0,0.04)',
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: '500', color: DS.ink[900] }}>
                        {PERMISSION_LABELS[key] ?? key}
                      </Text>
                      <Text style={{ fontSize: 11, color: DS.ink[400], marginTop: 1 }}>
                        {key}
                      </Text>
                    </View>
                    <Switch
                      value={isOn}
                      onValueChange={() => togglePerm(key)}
                      trackColor={{ false: DS.ink[200], true: activeConfig.accent + '80' }}
                      thumbColor={isOn ? activeConfig.accent : '#f4f3f4'}
                      style={Platform.OS === 'web' ? { transform: [{ scale: 0.8 }] } : undefined}
                    />
                  </View>
                );
              })}
            </View>
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
        contentContainerStyle={{ padding: 20, paddingBottom: 60 }}
        showsVerticalScrollIndicator={false}
      >
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
                    backgroundColor: isActive ? r.accent : 'transparent',
                    // @ts-ignore web
                    cursor: 'pointer',
                  }}
                >
                  <RIcon size={12} strokeWidth={isActive ? 2.2 : 1.8} color={isActive ? '#FFF' : r.accent} />
                  <Text style={{ fontSize: 11, fontWeight: isActive ? '700' : '600', color: isActive ? '#FFF' : DS.ink[500] }}>
                    {ROLE_LABELS[r.key]}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
        {renderPermissions()}
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
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 2, paddingHorizontal: 10 }}>
              {ROLE_CONFIG.map(renderRoleItem)}
            </ScrollView>
          </View>

          {/* Content */}
          <View style={{ flex: 1, borderRadius: 16, overflow: 'hidden' }}>
            <View style={{ paddingHorizontal: 28, paddingTop: 16, paddingBottom: 8 }}>
              <Text style={{ ...DISPLAY, fontSize: 24, letterSpacing: -0.5, color: '#0A0A0A', marginBottom: 4 }}>
                {ROLE_LABELS[activeRole]}
              </Text>
              <Text style={{ fontSize: 13, color: '#9A9A9A', lineHeight: 19 }}>
                Bu rol icin izin verilen yetkileri yonetin
              </Text>
            </View>
            <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 8, paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
              {renderPermissions()}
            </ScrollView>
          </View>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
          {/* Mobile role selector */}
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
                      backgroundColor: isActive ? r.accent : 'transparent',
                    }}
                  >
                    <RIcon size={12} strokeWidth={isActive ? 2.2 : 1.8} color={isActive ? '#FFF' : r.accent} />
                    <Text style={{ fontSize: 11, fontWeight: isActive ? '700' : '600', color: isActive ? '#FFF' : DS.ink[500] }}>
                      {ROLE_LABELS[r.key]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
          {renderPermissions()}
        </ScrollView>
      )}
    </View>
  );
}
