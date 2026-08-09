// core/ui/mobile/NativeImageViewer.tsx
//
// Native (iOS/Android) uygulama-içi görsel önizleyici. Web'deki ImageLightbox
// (window.addEventListener/keydown + HTML) native'de çalışmadığı için ayrı.
// - Yatay swipe ile görseller arası geçiş (pagingEnabled FlatList)
// - Pinch-zoom: iOS ScrollView maximumZoomScale (ekstra lib gerekmez)
// - Üstte dosya adı + kapat; birden çok görselde "n / toplam" göstergesi
//
// Bir <Modal> içine yerleştirilir (çağıran taraf sarmalar), ImageLightbox ile
// aynı prop arayüzü → drop-in native karşılık.

import React, { useRef, useState } from 'react';
import { View, Text, Pressable, Image, ScrollView, FlatList, useWindowDimensions } from 'react-native';

export function NativeImageViewer({
  images,
  index = 0,
  topInset = 0,
  onClose,
  onIndexChange,
}: {
  images: { url: string; name: string }[];
  index?: number;
  topInset?: number;
  onClose: () => void;
  onIndexChange?: (i: number) => void;
}) {
  const { width, height } = useWindowDimensions();
  const [cur, setCur] = useState(index);
  const listRef = useRef<FlatList>(null);

  return (
    <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.94)' }}>
      <FlatList
        ref={listRef}
        data={images}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        initialScrollIndex={Math.min(index, Math.max(0, images.length - 1))}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        keyExtractor={(it, i) => `${it.url}-${i}`}
        onMomentumScrollEnd={(e) => {
          const i = Math.round(e.nativeEvent.contentOffset.x / width);
          if (i !== cur) { setCur(i); onIndexChange?.(i); }
        }}
        renderItem={({ item }) => (
          <ScrollView
            style={{ width, height }}
            contentContainerStyle={{ width, height, alignItems: 'center', justifyContent: 'center' }}
            maximumZoomScale={4}
            minimumZoomScale={1}
            centerContent
            showsVerticalScrollIndicator={false}
            showsHorizontalScrollIndicator={false}
          >
            <Image source={{ uri: item.url }} style={{ width, height: height * 0.82 }} resizeMode="contain" />
          </ScrollView>
        )}
      />

      {/* Üst bar: ad + kapat */}
      <View style={{
        position: 'absolute', top: topInset + 8, left: 0, right: 0,
        flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 12,
      }}>
        <Text style={{ flex: 1, color: '#FFFFFF', fontSize: 14, fontWeight: '600' }} numberOfLines={1}>
          {images[cur]?.name ?? ''}
        </Text>
        <Pressable
          onPress={onClose}
          hitSlop={12}
          style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' }}
        >
          <Text style={{ color: '#FFFFFF', fontSize: 20, lineHeight: 22 }}>×</Text>
        </Pressable>
      </View>

      {/* Alt: sayfa göstergesi */}
      {images.length > 1 && (
        <View style={{
          position: 'absolute', bottom: 34, alignSelf: 'center',
          backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999,
        }}>
          <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '600' }}>{cur + 1} / {images.length}</Text>
        </View>
      )}
    </View>
  );
}

export default NativeImageViewer;
