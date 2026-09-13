/**
 * ProfileMenu — Mobile sağ üst profil butonuna basılınca açılan dropdown.
 * İçindekiler: tema modu seçici (Otomatik/Açık/Koyu) · Profil · Çıkış Yap.
 * TopActionBar ve TechnicianMobileDashboard tarafından paylaşılır.
 */
import React from 'react';
import { View, Text, Pressable, Platform, StyleSheet, Modal } from 'react-native';
import { User as UserIcon, LogOut, ChevronRight, ChevronLeft, Monitor, Sun, Moon, KeyRound } from '../icons';
import { isRTL } from '../../i18n';
import { autoT } from '../../i18n/autoTranslate';
import { useThemeModeStore } from '../../store/themeModeStore';
import { usePanelTheme } from '../../theme/usePanelTheme';
import { useAccentTones } from '../HeroGlow';

export interface ProfileMenuProps {
  visible: boolean;
  anchorTop: number;
  onClose: () => void;
  onProfile: () => void;
  onLogout: () => void;
  /** Verilirse "Giriş Kodum" (tablet PIN) satırı gösterilir. */
  onAccessCode?: () => void;
}

export function ProfileMenu({ visible, anchorTop, onClose, onProfile, onLogout, onAccessCode }: ProfileMenuProps) {
  const rtl = isRTL();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const mode    = useThemeModeStore(s => s.mode);
  const setMode = useThemeModeStore(s => s.setMode);
  // Seçili tema dairesi panel accent'iyle dolar (koyuda derin karşılığı).
  const { fill: accentFill } = useAccentTones(usePanelTheme().primary);

  const surface = isDark ? '#1B1916' : '#FFFFFF';
  const ink     = isDark ? '#F7F2E9' : '#0E0E0E';
  const ink2    = isDark ? 'rgba(247,242,233,0.72)' : 'rgba(20,16,12,0.7)';
  const ink3    = isDark ? 'rgba(247,242,233,0.45)' : 'rgba(20,16,12,0.5)';
  const hairline = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(20,16,12,0.06)';
  const segBg    = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(20,16,12,0.05)';

  const themeOptions: Array<{ value: 'system' | 'light' | 'dark'; icon: any; label: string }> = [
    // Sabit dizideki label alanı JSX değil → autoT() şart
    { value: 'system', icon: Monitor, label: autoT('Otomatik') },
    { value: 'light',  icon: Sun,     label: autoT('Açık') },
    { value: 'dark',   icon: Moon,    label: autoT('Koyu') },
  ];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose}>
        <View
          style={{
            position: 'absolute',
            top: anchorTop,
            // `end:` inline stili bu projede güvenilir değil → yönü açıkça seç
            ...(rtl ? { left: 12 } : { right: 12 }),
            width: 260,
            borderRadius: 16,
            backgroundColor: surface,
            borderWidth: 1,
            borderColor: hairline,
            overflow: 'hidden',
            ...(Platform.OS === 'web'
              ? ({
                  boxShadow: isDark
                    ? '0 12px 32px rgba(0,0,0,0.55)'
                    : '0 12px 32px rgba(15,23,42,0.18)',
                } as any)
              : {
                  shadowColor: '#000',
                  shadowOpacity: isDark ? 0.45 : 0.18,
                  shadowRadius: 18,
                  shadowOffset: { width: 0, height: 8 },
                  elevation: 10,
                }),
          }}
        >
          {/* Theme mode segmented control */}
          <View style={{ paddingHorizontal: 10, paddingTop: 10, paddingBottom: 8 }}>
            {/* Toggle tarzı: kapsül ray + seçili olan DOLU accent daire
                (profil kartıyla aynı dil). */}
            <View style={{
              flexDirection: 'row',
              alignItems: 'center',
              alignSelf: 'flex-start',
              backgroundColor: segBg,
              borderRadius: 999,
              padding: 3,
              gap: 2,
            }}>
              {themeOptions.map(opt => {
                const Icon = opt.icon;
                const isActive = mode === opt.value;
                return (
                  <Pressable
                    key={opt.value}
                    onPress={() => setMode(opt.value)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: isActive }}
                    accessibilityLabel={opt.label}
                  >
                    {({ pressed }: any) => (
                      <View style={{
                        width: 30, height: 30, borderRadius: 15,
                        backgroundColor: isActive ? accentFill : 'transparent',
                        alignItems: 'center',
                        justifyContent: 'center',
                        opacity: pressed ? 0.75 : 1,
                      }}>
                        <Icon size={15} color={isActive ? '#FFFFFF' : ink2} strokeWidth={isActive ? 2.2 : 1.8} />
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: hairline }} />

          <Row
            icon={UserIcon}
            label={autoT('Profil')}
            iconColor={ink}
            labelColor={ink}
            ink3={ink3}
            onPress={onProfile}
            showDivider
            hairline={hairline}
            rtl={rtl}
          />
          {onAccessCode ? (
            <Row
              icon={KeyRound}
              label={autoT('Giriş Kodum')}
              iconColor={ink}
              labelColor={ink}
              ink3={ink3}
              onPress={onAccessCode}
              showDivider
              hairline={hairline}
              rtl={rtl}
            />
          ) : null}
          <Row
            icon={LogOut}
            label={autoT('Çıkış Yap')}
            iconColor="#DC2626"
            labelColor="#DC2626"
            ink3={ink3}
            onPress={onLogout}
            hairline={hairline}
            rtl={rtl}
          />
        </View>
      </Pressable>
    </Modal>
  );
}

function Row({
  icon: Icon, label, iconColor, labelColor, ink3, onPress, showDivider, hairline, rtl,
}: {
  icon: any;
  label: string;
  iconColor: string;
  labelColor: string;
  ink3: string;
  onPress: () => void;
  showDivider?: boolean;
  hairline: string;
  rtl?: boolean;
}) {
  // Satır sonu chevron'u yön bildirir → RTL'de aynalanır
  const Chevron = rtl ? ChevronLeft : ChevronRight;
  return (
    <Pressable onPress={onPress}>
      {({ pressed }: any) => (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 14,
            paddingVertical: 14,
            gap: 12,
            opacity: pressed ? 0.6 : 1,
            borderBottomWidth: showDivider ? StyleSheet.hairlineWidth : 0,
            borderBottomColor: hairline,
          }}
        >
          <Icon size={18} color={iconColor} strokeWidth={1.8} />
          <Text style={{ flex: 1, fontSize: 15, fontWeight: '500', color: labelColor }}>
            {label}
          </Text>
          <Chevron size={16} color={ink3} strokeWidth={1.8} />
        </View>
      )}
    </Pressable>
  );
}
