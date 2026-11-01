// Tekerlek (wheel) saat seçici — kullanıcı: "saat girişi yazmalı olmasın, seçmeli wheel tarzı olsun".
// İki sütun: saat (00–23) ve dakika (minuteStep adımlı). Kaydırınca en yakın değere oturur (native: snapToInterval,
// web: CSS scroll-snap + kaydırma bitince yuvarlama), dokununca o değere kayar. Ortada seçim şeridi, üst/alt solma.
// Dış değer değişince (ör. öneri seçildi) tekerlek yumuşakça o değere döner. Token'lar useInkUI (koyu tema).
// TimeField: tekerlek alanın ALTINDA değil İÇİNDE açılır (kullanıcı: "inputun içinde açılsın") — kutu yerinde
// üç satırlık tekerleğe büyür; ortadaki satıra ya da sağdaki onaya dokununca kapanır.
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, Pressable, Platform } from 'react-native';
import { useInkUI } from '../../../core/theme/inkScale';
import { autoT } from '../../../core/i18n/autoTranslate';
import { hhmm } from '../scanModel';
import { Check } from '../../../core/ui/icons';
import { GlassTooltip } from '../../../core/ui/GlassTooltip';
import { FieldLabel, WEB_PTR, pressScale, DISPLAY_FONT } from './ui';

const ROW = 36;          // satır yüksekliği
const VISIBLE = 5;       // görünen satır (ortadaki seçili)

function Wheel({ items, index, onIndex, label, width, visible = VISIBLE, onPressSelected }: {
  items: string[]; index: number; onIndex: (i: number) => void; label: string; width: number;
  visible?: number; onPressSelected?: () => void;
}) {
  const PAD = ROW * Math.floor(visible / 2);
  const U = useInkUI();
  const ref = useRef<ScrollView>(null);
  const [live, setLive] = useState(index);     // kaydırırken ortadaki satır (anında vurgu)
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userScroll = useRef(false);

  // dış değer → tekerleği o satıra getir
  useEffect(() => {
    setLive(index);
    if (!userScroll.current) ref.current?.scrollTo({ y: index * ROW, animated: true });
    userScroll.current = false;
  }, [index]);
  useEffect(() => {
    const t = setTimeout(() => ref.current?.scrollTo({ y: index * ROW, animated: false }), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const commit = (y: number) => {
    const i = Math.max(0, Math.min(items.length - 1, Math.round(y / ROW)));
    if (Platform.OS === 'web') ref.current?.scrollTo({ y: i * ROW, animated: true });
    userScroll.current = true;
    if (i !== index) onIndex(i); else userScroll.current = false;
  };

  return (
    <View style={{ width, height: ROW * visible }} accessibilityRole="adjustable" accessibilityLabel={label}
      accessibilityValue={{ text: items[index] }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => {
        const d = e.nativeEvent.actionName === 'increment' ? 1 : -1;
        onIndex(Math.max(0, Math.min(items.length - 1, index + d)));
      }}>
      <ScrollView
        ref={ref}
        showsVerticalScrollIndicator={false}
        snapToInterval={ROW}
        decelerationRate="fast"
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingVertical: PAD }}
        style={Platform.OS === 'web' ? ({ scrollSnapType: 'y mandatory' } as any) : undefined}
        onScroll={(e) => {
          const y = e.nativeEvent.contentOffset.y;
          setLive(Math.max(0, Math.min(items.length - 1, Math.round(y / ROW))));
          if (Platform.OS === 'web') {
            if (settle.current) clearTimeout(settle.current);
            settle.current = setTimeout(() => commit(y), 140);
          }
        }}
        onMomentumScrollEnd={(e) => commit(e.nativeEvent.contentOffset.y)}
        onScrollEndDrag={(e) => { if (!(e.nativeEvent as any).velocity?.y) commit(e.nativeEvent.contentOffset.y); }}
      >
        {items.map((t, i) => {
          const d = Math.abs(i - live);
          return (
            <Pressable key={t + i} onPress={() => {
              if (i === index && onPressSelected) { onPressSelected(); return; }   // seçili satıra dokunmak = tamam
              ref.current?.scrollTo({ y: i * ROW, animated: true }); userScroll.current = true; onIndex(i);
            }}
              accessibilityRole="button" accessibilityLabel={t}
              style={{ height: ROW, alignItems: 'center', justifyContent: 'center', ...(Platform.OS === 'web' ? ({ scrollSnapAlign: 'center' } as any) : {}), ...WEB_PTR }}>
              <Text style={{
                fontSize: d === 0 ? 22 : 19, fontWeight: d === 0 ? '500' : '300', fontFamily: DISPLAY_FONT,
                color: d === 0 ? U.ink[900] : d === 1 ? U.ink[400] : U.ink[300], fontVariant: ['tabular-nums'],
                opacity: d > Math.floor(visible / 2) ? 0 : 1,
              }}>{t}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

/** Saat + dakika tekerleği; value = günün dakikası */
export function WheelTimePicker({ value, onChange, minuteStep = 5, rows = VISIBLE, bare, bg, onDone }: {
  value: number; onChange: (min: number) => void; minuteStep?: number;
  /** görünen satır sayısı (tek sayı) */ rows?: number;
  /** alan içinde: kendi kartı/kenarlığı yok, zemin `bg` */ bare?: boolean; bg?: string;
  /** seçili satıra dokununca */ onDone?: () => void;
}) {
  const U = useInkUI();
  const PAD = ROW * Math.floor(rows / 2);
  const fill = bg ?? U.surfaceSoft;
  const hours = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
  const mins = Array.from({ length: Math.floor(60 / minuteStep) }, (_, i) => String(i * minuteStep).padStart(2, '0'));
  const h = Math.floor(value / 60);
  const mi = Math.round((value % 60) / minuteStep) % mins.length;
  return (
    <View style={bare
      ? { backgroundColor: fill, paddingHorizontal: 4 }
      : { alignSelf: 'flex-start', borderRadius: 18, backgroundColor: fill, borderWidth: 1, borderColor: U.hairline, paddingHorizontal: 10 }}>
      {/* seçim şeridi */}
      <View pointerEvents="none" style={{ position: 'absolute', left: bare ? 4 : 8, right: bare ? 4 : 8, top: PAD, height: ROW, borderRadius: 10, backgroundColor: U.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }} />
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Wheel items={hours} index={h} width={bare ? 48 : 64} visible={rows} label={autoT('Saat')} onPressSelected={onDone} onIndex={(i) => onChange(i * 60 + mi * minuteStep)} />
        <Text style={{ fontSize: 22, color: U.ink[400], marginHorizontal: 2 }}>:</Text>
        <Wheel items={mins} index={mi} width={bare ? 48 : 64} visible={rows} label={autoT('Dakika')} onPressSelected={onDone} onIndex={(i) => onChange(h * 60 + i * minuteStep)} />
      </View>
      {/* üst/alt solma (kenarda öğeler kaybolur) */}
      {Platform.OS === 'web' ? (
        <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, borderRadius: bare ? 0 : 18,
          backgroundImage: `linear-gradient(${fill} 0%, transparent 34%, transparent 66%, ${fill} 100%)` } as any} />
      ) : null}
    </View>
  );
}

/** Etiketli saat alanı: dokununca kutu yerinde tekerleğe dönüşür (yazma yok) */
export function TimeField({ label, value, onChange, fallback, open, onToggle, minuteStep = 5 }: {
  label: string; value: number | null; onChange: (min: number) => void; fallback: number;
  open: boolean; onToggle: () => void; minuteStep?: number;
}) {
  const U = useInkUI();
  const fieldBg = (U.inputStyle as any).backgroundColor as string;
  if (open) {
    return (
      <View>
        <FieldLabel>{label}</FieldLabel>
        <View style={{ height: ROW * 3 + 2, borderRadius: 14, borderWidth: 1, borderColor: U.ink[900], backgroundColor: fieldBg,
          overflow: 'hidden', flexDirection: 'row', alignItems: 'center' }}>
          <WheelTimePicker bare rows={3} bg={fieldBg} value={value ?? fallback} onChange={onChange} minuteStep={minuteStep} onDone={onToggle} />
          <View style={{ flex: 1 }} />
          <GlassTooltip title={autoT('Tamam')} text={autoT('Seçilen saati onaylar')}>
            <Pressable onPress={onToggle} accessibilityRole="button" accessibilityLabel={autoT('Tamam')}
              style={({ pressed }: any) => ({ width: 34, height: 34, borderRadius: 12, marginRight: 8, alignItems: 'center', justifyContent: 'center',
                backgroundColor: U.plainBtn.bg, borderWidth: 1, borderColor: U.plainBtn.border, ...pressScale(pressed), ...WEB_PTR })}>
              <Check size={16} color={U.plainBtn.fg} strokeWidth={2} />
            </Pressable>
          </GlassTooltip>
        </View>
      </View>
    );
  }
  return (
    <View>
      <FieldLabel>{label}</FieldLabel>
      <Pressable
        onPress={() => { if (!open && value == null) onChange(fallback); onToggle(); }}
        accessibilityRole="button"
        accessibilityLabel={`${label} ${value != null ? hhmm(value) : ''}`}
        style={({ pressed }: any) => ({ ...U.inputStyle, flexDirection: 'row', alignItems: 'center', ...pressScale(pressed), ...WEB_PTR })}
      >
        <Text style={{ flex: 1, fontSize: 16, fontVariant: ['tabular-nums'], color: value != null ? U.ink[900] : U.ink[400] }}>
          {value != null ? hhmm(value) : autoT('Saat seçin')}
        </Text>
      </Pressable>
    </View>
  );
}
