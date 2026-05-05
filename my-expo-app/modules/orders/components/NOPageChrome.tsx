/**
 * NOPageChrome — Full page shell composition
 * ────────────────────────────────────────────
 * Content area + NOActionBar. Krem (#F5F2EA) background.
 */
import React from 'react';
import { View, Text, Pressable, Platform, useWindowDimensions } from 'react-native';
import { ArrowLeft, ArrowRight, Check, Loader } from 'lucide-react-native';
import { NO } from './NOTokens';
import { NOActionBar, NOActionBarProps } from './NOActionBar';

export interface NOPageChromeProps {
  /** Current step (1-4) */
  step: number;
  /** Top bar context */
  hekim?: string;
  hasta?: string;
  toothCount?: number;
  onCancel?: () => void;
  /** Stepper navigation */
  onStepPress?: (step: number) => void;
  /** Action bar */
  onBack?: () => void;
  onNext?: () => void;
  nextLabel?: string;
  actionPrimary?: NOActionBarProps['primary'];
  loading?: boolean;
  savedTime?: string;
  /** Step 4 right panel */
  rightPanel?: React.ReactNode;
  /** Page title shown above step content */
  title?: string;
  /** Main step content */
  children: React.ReactNode;
}

const PANEL_BREAKPOINT = 768;

export function NOPageChrome({
  step,
  onBack,
  onNext,
  nextLabel,
  actionPrimary,
  loading,
  savedTime,
  rightPanel,
  title,
  children,
}: NOPageChromeProps) {
  const { width } = useWindowDimensions();
  const showPanel = width >= PANEL_BREAKPOINT;

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: NO.bgStage,
        flexDirection: 'column',
        ...(Platform.OS === 'web' ? { overflow: 'hidden' as any } : {}),
      }}
    >
      {/* Main area: content + optional right panel */}
      <View
        style={{
          flex: 1,
          flexDirection: 'row',
          ...(Platform.OS === 'web' ? { overflow: 'hidden' as any } : {}),
        }}
      >
        {/* Step content */}
        <View
          style={{
            flex: 1,
            ...(Platform.OS === 'web'
              ? { overflow: 'auto' as any }
              : {}),
          }}
        >
          <View style={{ paddingHorizontal: 16, paddingTop: 0, paddingBottom: 80 }}>
            {children}
          </View>
        </View>

        {/* Right panel (Step 4 live summary) */}
        {rightPanel && showPanel && (
          <View
            style={{
              width: 360,
              borderLeftWidth: 1,
              borderLeftColor: NO.borderSoft,
              backgroundColor: NO.bgStage,
              ...(Platform.OS === 'web'
                ? { overflow: 'auto' as any }
                : {}),
            }}
          >
            {rightPanel}
          </View>
        )}
      </View>

      {/* Floating action buttons + draft status */}
      <View
        style={{
          position: 'absolute',
          bottom: 24,
          left: 0,
          right: 0,
          paddingHorizontal: 16,
          flexDirection: 'row',
          alignItems: 'center',
          pointerEvents: 'box-none',
        }}
      >
        {savedTime && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, pointerEvents: 'auto' }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: NO.success }} />
            <Text style={{ fontSize: 11, color: NO.inkSoft }}>
              Taslak kaydedildi · {savedTime}
            </Text>
          </View>
        )}
        <View style={{ flex: 1 }} />
        {onBack && (
          <Pressable
            onPress={onBack}
            style={{
              paddingVertical: 10,
              paddingHorizontal: 18,
              borderRadius: 12,
              backgroundColor: '#FFFFFF',
              borderWidth: 1,
              borderColor: NO.borderMedium,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              marginRight: 8,
            }}
          >
            <ArrowLeft size={15} color={NO.inkStrong} strokeWidth={2} />
            <Text style={{ fontSize: 13, fontWeight: '500', color: NO.inkStrong }}>Geri</Text>
          </Pressable>
        )}
        {onNext && (
          <Pressable
            onPress={loading ? undefined : onNext}
            style={{
              paddingVertical: 10,
              paddingHorizontal: 22,
              borderRadius: 12,
              backgroundColor:
                actionPrimary === 'success' ? NO.success
                : actionPrimary === 'saffron' ? NO.saffron
                : NO.inkStrong,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? (
              <Loader size={15} color={actionPrimary === 'saffron' ? NO.inkStrong : '#FFFFFF'} strokeWidth={2} />
            ) : null}
            <Text
              style={{
                fontSize: 13,
                fontWeight: '500',
                color: actionPrimary === 'saffron' ? NO.inkStrong : '#FFFFFF',
              }}
            >
              {nextLabel ?? 'İleri'}
            </Text>
            {!loading && (
              actionPrimary === 'success'
                ? <Check size={15} color="#FFFFFF" strokeWidth={2.5} />
                : <ArrowRight size={15} color={actionPrimary === 'saffron' ? NO.inkStrong : '#FFFFFF'} strokeWidth={2} />
            )}
          </Pressable>
        )}
      </View>
    </View>
  );
}
