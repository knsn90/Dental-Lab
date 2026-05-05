/**
 * AdminApprovalsScreen — Patterns design language
 *
 * İki sekme: Hekim Kayıtları + Tasarım Onayları.
 * DS tokens, DISPLAY typography, inline pill tabs.
 */
import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, useWindowDimensions } from 'react-native';
import { Users, ClipboardCheck } from 'lucide-react-native';
import { PendingApprovalsScreen } from './PendingApprovalsScreen';
import { DesignApprovalsScreen } from './DesignApprovalsScreen';
import { usePendingApprovals as useDesignApprovals } from './hooks/usePendingApprovals';
import { usePageTitleStore } from '../../core/store/pageTitleStore';
import { DS } from '../../core/theme/dsTokens';

const DISPLAY: any = { fontFamily: DS.font.display, fontWeight: '300' };
const R = { sm: 8, md: 14, lg: 20, xl: 24, pill: 999 };

type Tab = 'doctors' | 'design';

export function AdminApprovalsScreen() {
  const [tab, setTab]     = useState<Tab>('doctors');
  const { approvals }     = useDesignApprovals();
  const designPending     = approvals.length;
  const { setTitle, clear } = usePageTitleStore();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;

  useEffect(() => {
    setTitle('Onaylar');
    return clear;
  }, []);

  const TABS: { key: Tab; label: string; icon: React.ComponentType<any>; count?: number }[] = [
    { key: 'doctors', label: 'Hekim Kayıtları', icon: Users },
    {
      key: 'design',
      label: 'Tasarım Onayları',
      icon: ClipboardCheck,
      count: designPending > 0 ? designPending : undefined,
    },
  ];

  return (
    <View style={{ flex: 1 }}>
      {/* ── Tab bar ── */}
      <View style={{ paddingHorizontal: isDesktop ? 40 : 16, paddingTop: isDesktop ? 28 : 16, paddingBottom: 8 }}>
        {/* Eyebrow + Title */}
        {/* Pill tabs */}
        <View style={{
          flexDirection: 'row', gap: 6,
          backgroundColor: 'rgba(0,0,0,0.04)',
          borderRadius: R.md, padding: 4,
        }}>
          {TABS.map(t => {
            const active = tab === t.key;
            const Icon   = t.icon;
            return (
              <Pressable
                key={t.key}
                onPress={() => setTab(t.key)}
                style={{
                  flex: 1, flexDirection: 'row', alignItems: 'center',
                  justifyContent: 'center', gap: 8,
                  paddingVertical: 10, borderRadius: 10,
                  backgroundColor: active ? '#FFFFFF' : 'transparent',
                  ...(active ? {
                    // @ts-ignore web shadow
                    boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
                  } : {}),
                }}
              >
                <Icon
                  size={15}
                  color={active ? DS.ink[900] : DS.ink[500]}
                  strokeWidth={active ? 2 : 1.6}
                />
                <Text style={{
                  fontSize: 13,
                  fontWeight: active ? '600' : '500',
                  color: active ? DS.ink[900] : DS.ink[500],
                }}>
                  {t.label}
                </Text>
                {t.count != null && (
                  <View style={{
                    backgroundColor: DS.lab.danger,
                    borderRadius: R.pill, minWidth: 18,
                    paddingHorizontal: 5, paddingVertical: 2,
                  }}>
                    <Text style={{
                      fontSize: 10, fontWeight: '700',
                      color: '#FFFFFF', textAlign: 'center',
                    }}>
                      {t.count}
                    </Text>
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* ── Content ── */}
      <View style={{ flex: 1 }}>
        {tab === 'doctors' ? <PendingApprovalsScreen /> : <DesignApprovalsScreen />}
      </View>
    </View>
  );
}
