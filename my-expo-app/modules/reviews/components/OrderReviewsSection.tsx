import { localeTag } from '../../../core/i18n';
// OrderReviewsSection — lab/admin tarafı: bir işe gelen değerlendirmeleri salt-okunur gösterir (Faz 4).
import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, Image } from 'react-native';
import { Star, CornerDownRight, CornerDownLeft } from '../../../core/ui/icons';
import { isRTL } from '../../../core/i18n';
import { DS } from '../../../core/theme/dsTokens';
import { hexA } from '../../../core/theme/stationPalette';
import { useMobileTokens } from '../../../core/theme/mobileDesignTokens';
import { useInkUI } from '../../../core/theme/inkScale';
import { REVIEW_DIMENSIONS } from '../constants';
import { listReviewsForOrder, setLabReply, signReviewPhotos } from '../api';
import type { OrderReview } from '../types';

function Stars({ value, color, size = 14 }: { value: number; color: string; size?: number }) {
  const T = useMobileTokens();
  return (
    <View style={{ flexDirection: 'row', gap: 2 }}>
      {[1, 2, 3, 4, 5].map(n => (
        <Star key={n} size={size} strokeWidth={1.6} color={value >= n ? color : (T.ink3 as string)} fill={value >= n ? color : 'transparent'} />
      ))}
    </View>
  );
}

function fmtWhen(d: string): string {
  try { return new Date(d).toLocaleDateString(localeTag(), { day: '2-digit', month: 'short', year: 'numeric' }); }
  catch { return ''; }
}

export function OrderReviewsSection({ workOrderId, accent }: { workOrderId: string; accent: string }) {
  const T = useMobileTokens();
  const [reviews, setReviews] = useState<OrderReview[]>([]);
  const [signed, setSigned] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await listReviewsForOrder(workOrderId);
      if (cancelled) return;
      setReviews(data); setLoaded(true);
      const paths = data.flatMap(r => [...(r.clinical_photos ?? []), ...(r.photos ?? [])]);
      if (paths.length) { const s = await signReviewPhotos(paths); if (!cancelled) setSigned(s); }
    })();
    return () => { cancelled = true; };
  }, [workOrderId]);

  if (!loaded) return null;

  return (
    <View style={{ backgroundColor: T.card, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: hexA(accent, 0.18), gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Star size={16} color={accent} strokeWidth={2} />
        <Text style={{ flex: 1, fontSize: 14, fontWeight: '700', color: T.ink }}>Değerlendirme</Text>
      </View>

      {reviews.length === 0 ? (
        <Text style={{ fontSize: 13, color: T.ink3 }}>Henüz değerlendirilmedi.</Text>
      ) : reviews.map((r, i) => (
        <View key={r.id} style={{ gap: 10, paddingTop: i === 0 ? 0 : 12, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: T.hairline }}>
          {/* Genel + kim/ne zaman */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Stars value={r.overall} color="#E89B2A" size={16} />
            <Text style={{ fontSize: 13, fontWeight: '700', color: T.ink }}>{r.overall.toFixed(1)}</Text>
            <View style={{ flex: 1 }} />
            <Text style={{ fontSize: 11, color: T.ink3 }}>
              {r.rater_role === 'clinic' ? 'Klinik' : 'Hekim'} · {fmtWhen(r.created_at)}
            </Text>
          </View>

          {/* Boyut kırılımı */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {REVIEW_DIMENSIONS.map(d => {
              const v = (r as any)[d.key] as number | null;
              if (v == null) return null;
              return (
                <View key={d.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: T.cardSoft, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 }}>
                  <Text style={{ fontSize: 11, color: T.ink2 }}>{d.label}</Text>
                  <Star size={10} color="#E89B2A" strokeWidth={1.8} fill="#E89B2A" />
                  <Text style={{ fontSize: 11, fontWeight: '700', color: T.ink2 }}>{v}</Text>
                </View>
              );
            })}
          </View>

          {/* Yorum */}
          {r.comment ? (
            <Text style={{ fontSize: 13, color: T.ink2, lineHeight: 18 }}>{r.comment}</Text>
          ) : null}

          {/* Ağız içi (klinik) fotoğraflar — lab için değerli, vurgulu */}
          {(r.clinical_photos?.length ?? 0) > 0 && (
            <View style={{ gap: 6 }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: accent, textTransform: 'uppercase', letterSpacing: 0.4 }}>Ağız İçi Fotoğrafı</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {r.clinical_photos.map(p => (
                  <View key={p} style={{ width: 80, height: 80, borderRadius: 12, overflow: 'hidden', backgroundColor: T.cardSoft, borderWidth: 1.5, borderColor: hexA(accent, 0.3) }}>
                    {signed[p] ? <Image source={{ uri: signed[p] }} style={{ width: '100%', height: '100%' }} resizeMode="cover" /> : null}
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Diğer fotoğraflar */}
          {(r.photos?.length ?? 0) > 0 && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {r.photos.map(p => (
                <View key={p} style={{ width: 72, height: 72, borderRadius: 10, overflow: 'hidden', backgroundColor: T.cardSoft }}>
                  {signed[p] ? <Image source={{ uri: signed[p] }} style={{ width: '100%', height: '100%' }} resizeMode="cover" /> : null}
                </View>
              ))}
            </View>
          )}

          {/* Lab yanıtı (Faz 5) */}
          <LabReplyBlock review={r} accent={accent} onUpdated={(u) => setReviews(list => list.map(x => x.id === u.id ? u : x))} />
        </View>
      ))}
    </View>
  );
}

/** Lab yanıtı — mevcut yanıtı gösterir; düzenle/yaz. */
function LabReplyBlock({ review, accent, onUpdated }: { review: OrderReview; accent: string; onUpdated: (r: OrderReview) => void }) {
  const U = useInkUI();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(review.lab_reply ?? '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (saving) return;
    setSaving(true);
    const { data } = await setLabReply(review.id, text);
    setSaving(false);
    if (data) { onUpdated(data); setEditing(false); }
  };

  if (!editing) {
    return (
      <View style={{ backgroundColor: hexA(accent, 0.06), borderRadius: 10, padding: 10, gap: 6 }}>
        {review.lab_reply ? (
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {isRTL()
              ? <CornerDownLeft size={14} color={accent} strokeWidth={1.8} style={{ marginTop: 1 }} />
              : <CornerDownRight size={14} color={accent} strokeWidth={1.8} style={{ marginTop: 1 }} />}
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: accent, marginBottom: 2 }}>Lab yanıtı</Text>
              <Text style={{ fontSize: 13, color: U.ink[700], lineHeight: 18 }}>{review.lab_reply}</Text>
            </View>
          </View>
        ) : null}
        <Pressable onPress={() => { setText(review.lab_reply ?? ''); setEditing(true); }} style={{ alignSelf: 'flex-start', cursor: 'pointer' as any }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: accent }}>{review.lab_reply ? 'Yanıtı düzenle' : 'Yanıtla'}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{ gap: 8 }}>
      <TextInput
        value={text}
        onChangeText={setText}
        placeholder="Lab yanıtın…"
        placeholderTextColor={U.ink[400]}
        multiline
        style={{
          minHeight: 60, fontSize: 13, color: U.ink[900], textAlignVertical: 'top',
          backgroundColor: U.ink[50], borderRadius: 10, padding: 10,
          borderWidth: 1, borderColor: U.ink[100],
          // @ts-ignore web
          outline: 'none',
        }}
      />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Pressable onPress={() => setEditing(false)} style={{ paddingHorizontal: 14, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: U.isDark ? U.plainBtn.bg : DS.ink[100], ...(U.isDark ? { borderWidth: 1, borderColor: U.plainBtn.border } : {}), cursor: 'pointer' as any }}>
          <Text style={{ fontSize: 13, fontWeight: '600', color: U.isDark ? U.plainBtn.fg : DS.ink[700] }}>Vazgeç</Text>
        </Pressable>
        <Pressable onPress={save} disabled={saving} style={{ paddingHorizontal: 16, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: accent, cursor: 'pointer' as any }}>
          {saving ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={{ fontSize: 13, fontWeight: '700', color: '#FFFFFF' }}>Kaydet</Text>}
        </Pressable>
      </View>
    </View>
  );
}
