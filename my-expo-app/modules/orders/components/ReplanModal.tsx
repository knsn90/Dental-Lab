// Yeniden Planla — triajlanmış ama üretimi başlamamış siparişte aşamaların
// SIRA + TEKNİSYEN'ini düzenle. İstasyon ekle/çıkar timeline'da yapılır.
import React, { useEffect, useMemo, useState } from 'react';
import { Modal, View, Text, Pressable, ScrollView, ActivityIndicator, Platform } from 'react-native';
import { AppIcon } from '../../../core/ui/AppIcon';
import { supabase } from '../../../lib/supabase';
import { replanOrder } from '../../triage/api';
import { useMobileTokens } from '../../../core/theme/mobileDesignTokens';
import { toast } from '../../../core/ui/Toast';

export interface ReplanStage {
  id: string;
  station: { id: string; name: string; color: string } | null;
  technician: { id: string; full_name: string } | null;
}

interface Props {
  visible: boolean;
  orderId: string;
  labId: string | null;
  stages: ReplanStage[];        // mevcut (başlamamış) aşamalar — sequence sırasında
  accentColor: string;
  onClose: () => void;
  onSaved: () => void;
}

type Row = { stageId: string; name: string; color: string; technicianId: string | null };

export function ReplanModal({ visible, orderId, labId, stages, accentColor, onClose, onSaved }: Props) {
  const T = useMobileTokens();
  const P = accentColor;
  const [rows, setRows] = useState<Row[]>([]);
  const [techs, setTechs] = useState<Array<{ id: string; full_name: string }>>([]);
  const [saving, setSaving] = useState(false);

  // SADECE modal açılışında mevcut aşamalardan satır kur.
  // Parent her saniye re-render olduğundan (canlı süre sayacı) `stages` prop'u
  // sürekli yeni referans alır; bunu deps'e koyarsak seçim her saniye sıfırlanır.
  // Bu yüzden yalnız `visible` false→true geçişinde hydrate ediyoruz.
  const wasVisible = React.useRef(false);
  useEffect(() => {
    if (visible && !wasVisible.current) {
      setRows(stages.map(s => ({
        stageId: s.id,
        name: s.station?.name ?? 'Aşama',
        color: s.station?.color ?? '#94A3B8',
        technicianId: s.technician?.id ?? null,
      })));
    }
    wasVisible.current = visible;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // Lab teknisyenleri
  useEffect(() => {
    if (!visible || !labId) return;
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name')
        .eq('lab_id', labId)
        .eq('user_type', 'lab')
        .eq('approval_status', 'approved')
        .order('full_name');
      if (alive) setTechs((data ?? []) as any);
    })();
    return () => { alive = false; };
  }, [visible, labId]);

  const move = (idx: number, dir: -1 | 1) => {
    setRows(prev => {
      const next = [...prev];
      const j = idx + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
  };

  const setTech = (idx: number, techId: string | null) => {
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, technicianId: techId } : r));
  };

  const save = async () => {
    setSaving(true);
    const lines = rows.map((r, i) => ({
      stage_id: r.stageId,
      sequence_order: i + 1,
      technician_id: r.technicianId,
    }));
    const res = await replanOrder(orderId, lines);
    setSaving(false);
    if (!res.ok) { toast.error(res.error ?? 'Yeniden planlama başarısız'); return; }
    toast.success('Plan güncellendi');
    onSaved();
  };

  const hairline = T.hairline;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <View style={{ width: '100%', maxWidth: 560, maxHeight: '88%', backgroundColor: T.card, borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: hairline }}>
          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: hairline }}>
            <View style={{ width: 32, height: 32, borderRadius: 9, backgroundColor: P + '18', alignItems: 'center', justifyContent: 'center' }}>
              <AppIcon name={'clipboard-text-outline' as any} size={18} color={P} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: T.ink }}>Yeniden Planla</Text>
              <Text style={{ fontSize: 11.5, color: T.ink3 }}>Sıra ve teknisyen düzenle · üretim başlamadan</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={8} style={{ width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: T.cardSoft }}>
              <AppIcon name={'close' as any} size={16} color={T.ink3} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ padding: 14, gap: 10 }} showsVerticalScrollIndicator={false}>
            {rows.length === 0 && (
              <Text style={{ fontSize: 12.5, color: T.ink3, textAlign: 'center', paddingVertical: 20 }}>
                Düzenlenebilir aşama yok.
              </Text>
            )}
            {rows.map((r, idx) => (
              <View key={r.stageId} style={{ borderWidth: 1, borderColor: hairline, borderRadius: 14, padding: 12, backgroundColor: T.cardSoft }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ width: 26, height: 26, borderRadius: 8, backgroundColor: r.color + '22', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 12, fontWeight: '800', color: r.color }}>{idx + 1}</Text>
                  </View>
                  <Text style={{ flex: 1, fontSize: 14, fontWeight: '600', color: T.ink }} numberOfLines={1}>{r.name}</Text>
                  <Pressable onPress={() => move(idx, -1)} disabled={idx === 0} hitSlop={6}
                    style={{ width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: T.card, borderWidth: 1, borderColor: hairline, opacity: idx === 0 ? 0.35 : 1 }}>
                    <AppIcon name={'chevron-up' as any} size={16} color={T.ink} />
                  </Pressable>
                  <Pressable onPress={() => move(idx, 1)} disabled={idx === rows.length - 1} hitSlop={6}
                    style={{ width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: T.card, borderWidth: 1, borderColor: hairline, opacity: idx === rows.length - 1 ? 0.35 : 1 }}>
                    <AppIcon name={'chevron-down' as any} size={16} color={T.ink} />
                  </Pressable>
                </View>

                {/* Teknisyen seçimi */}
                <Text style={{ fontSize: 10.5, fontWeight: '700', color: T.ink3, letterSpacing: 0.4, marginTop: 10, marginBottom: 6, textTransform: 'uppercase' }}>Teknisyen</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  <TechChip label="Atanmadı" active={!r.technicianId} color={P} onPress={() => setTech(idx, null)} T={T} />
                  {techs.map(t => (
                    <TechChip key={t.id} label={t.full_name} active={r.technicianId === t.id} color={P} onPress={() => setTech(idx, t.id)} T={T} />
                  ))}
                </View>
              </View>
            ))}
          </ScrollView>

          {/* Footer */}
          <View style={{ flexDirection: 'row', gap: 10, padding: 14, borderTopWidth: 1, borderTopColor: hairline }}>
            <Pressable onPress={onClose} style={{ flex: 1, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: hairline, backgroundColor: T.cardSoft }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: T.ink }}>İptal</Text>
            </Pressable>
            <Pressable onPress={save} disabled={saving || rows.length === 0}
              style={{ flex: 1.4, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: P, flexDirection: 'row', gap: 8, opacity: (saving || rows.length === 0) ? 0.6 : 1 }}>
              {saving ? <ActivityIndicator color="#fff" size="small" /> : <AppIcon name={'check' as any} size={16} color="#fff" />}
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff' }}>{saving ? 'Kaydediliyor…' : 'Planı Kaydet'}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function TechChip({ label, active, color, onPress, T }: { label: string; active: boolean; color: string; onPress: () => void; T: any }) {
  return (
    <Pressable onPress={onPress}
      style={{
        paddingHorizontal: 11, paddingVertical: 7, borderRadius: 999,
        borderWidth: 1,
        borderColor: active ? color : T.hairline,
        backgroundColor: active ? color + '16' : T.card,
        ...(Platform.OS === 'web' ? { cursor: 'pointer' as any } : {}),
      }}>
      <Text style={{ fontSize: 12.5, fontWeight: active ? '700' : '500', color: active ? color : T.ink2 ?? T.ink }}>{label}</Text>
    </Pressable>
  );
}
