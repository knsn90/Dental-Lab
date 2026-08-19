// ?trace=1 ile açılan ekran üstü ölçüm paneli. Amaç: kullanıcı konsoldan satır
// kopyalamak zorunda kalmasın — tek ekran görüntüsü tüm zaman çizelgesini versin.
// trace kapalıysa hiç render edilmez (normal kullanıcı asla görmez).
import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, Platform } from 'react-native';
import { bootLog, subscribeBootLog, isTraceOn, bootNumber } from './bootTrace';

export function BootTracePanel() {
  const [, force] = useState(0);
  const [hidden, setHidden] = useState(false);
  useEffect(() => subscribeBootLog(() => force((n) => n + 1)), []);
  if (!isTraceOn() || Platform.OS !== 'web' || hidden) return null;
  return (
    <View
      style={{
        position: 'fixed' as any, end: 8, bottom: 8, zIndex: 99999,
        maxWidth: 560, maxHeight: 340, overflow: 'hidden',
        backgroundColor: 'rgba(10,10,10,0.92)', borderRadius: 10, padding: 10,
      }}
    >
      <Pressable onPress={() => setHidden(true)} style={{ marginBottom: 6 }}>
        <Text style={{ color: '#7DD3FC', fontSize: 11, fontWeight: '700' }}>
          boot #{bootNumber()} · ölçüm paneli (kapatmak için dokun)
        </Text>
      </Pressable>
      {bootLog.map((l, i) => (
        <Text
          key={i}
          selectable
          style={{ color: '#E5E7EB', fontSize: 10, lineHeight: 14,
                   fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
        >
          {l}
        </Text>
      ))}
    </View>
  );
}
