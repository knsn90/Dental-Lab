// modules/delivery/proof/ProofRow.tsx
// Siparişin Lojistik kartında teslim satırının altındaki kanıt satırı (spec 4.7). Türü proofKindOf'tan:
// kendi kurye (küçük fotoğraf + imza), imza alınamadı, BanaBiKurye (ad + varış), BanaBiKurye boş,
// kanıtsız kapatıldı. Basınca görüntüleyici küçük resmin olduğu yerden büyüyerek açılır.
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, Image, Platform } from 'react-native';
import { ChevronLeft, ChevronRight } from '../../../core/ui/icons';
import { GlassTooltip } from '../../../core/ui/GlassTooltip';
import { autoT } from '../../../core/i18n/autoTranslate';
import { isRTL, localeTag } from '../../../core/i18n';
import { useInkUI } from '../../../core/theme/inkScale';
import { proofKindOf, needsSignature, type ProofLegFields } from './proofModel';
import { signProofUrls } from './api';
import { measureOrigin, type OriginRect } from './useAnchoredSpring';
import { PAPER } from './signatureInk';
import { demoPhoto } from './ProofPhotoField';

export type ProofLeg = ProofLegFields & {
  id: string;
  recipient_name?: string | null;
  recipient_title?: string | null;
  proof_photo_path?: string | null;
  signature_path?: string | null;
  proof_captured_at?: string | null;
  proof_override_reason?: string | null;
  proof_override_by_name?: string | null;
  proof_override_at?: string | null;
  delivered_at?: string | null;
  external_provider?: string | null;
  ext_courier_name?: string | null;
  courier?: { full_name?: string | null } | null;
};

export const hhmm = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleTimeString(localeTag(), { hour: '2-digit', minute: '2-digit' }) : '';

/** Kanıt dosyalarının imzalı bağlantıları (1 saat). */
export function useProofUrls(paths: (string | null | undefined)[]) {
  const key = paths.filter(Boolean).join('|');
  const [urls, setUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!key) { setUrls({}); return; }
    let alive = true;
    // demo: yolları ağsız çözülür (yalnız /dev/delivery-proof)
    const all = key.split('|');
    const demo: Record<string, string> = {};
    for (const k of all) if (k.startsWith('demo:')) demo[k] = k === 'demo:photo' ? demoPhoto().uri : '';
    const real = all.filter((k) => !k.startsWith('demo:'));
    if (!real.length) { setUrls(demo); return; }
    void signProofUrls(real).then((u) => { if (alive) setUrls({ ...demo, ...u }); });
    return () => { alive = false; };
  }, [key]);
  return urls;
}

export function ProofRow({ leg, onOpen }: { leg: ProofLeg; onOpen: (origin: OriginRect | null) => void }) {
  const U = useInkUI();
  const ref = useRef<any>(null);
  const kind = proofKindOf(leg);
  const urls = useProofUrls(kind === 'none' || kind === 'override' || kind === 'provider_empty' ? [] : [leg.proof_photo_path, leg.signature_path]);
  if (kind === 'none') return null;

  if (kind === 'provider_empty') {
    return (
      <View style={{ marginTop: 10, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 14, backgroundColor: U.surfaceSoft }}>
        <Text style={{ fontSize: 12, color: U.ink[500] }}>{autoT('BanaBiKurye bu teslim için kanıt göndermedi.')}</Text>
      </View>
    );
  }

  if (kind === 'override') {
    const tone = U.chipTones.warning;
    return (
      <View style={{ marginTop: 10, padding: 12, borderRadius: 14, backgroundColor: tone.bg }}>
        <Text style={{ fontSize: 12.5, color: tone.fg, lineHeight: 18 }}>
          <Text style={{ fontWeight: '700' }}>{autoT('Kanıtsız kapatıldı')}</Text>
          {leg.proof_override_by_name ? ` · ${autoT('Yönetici')}: ${leg.proof_override_by_name}` : ''}
        </Text>
        {leg.proof_override_reason ? (
          <Text style={{ fontSize: 12.5, color: tone.fg, lineHeight: 18, marginTop: 2 }}>
            {`${autoT('Neden')}: ${leg.proof_override_reason}`}
          </Text>
        ) : null}
      </View>
    );
  }

  const photo = leg.proof_photo_path ? urls[leg.proof_photo_path] : undefined;
  const sig = leg.signature_path ? urls[leg.signature_path] : undefined;
  const toLab = !needsSignature(leg.direction) && (leg.direction === 'clinic_to_lab' || leg.direction === 'other_to_lab');

  let line1: string;
  let line2: string;
  let warn = false;
  if (kind === 'nosig') {
    line1 = autoT('İmza alınamadı'); warn = true;
    line2 = `${leg.signature_skipped_reason ? autoT(leg.signature_skipped_reason) : ''} · ${autoT('fotoğraf var')}`;
  } else if (kind === 'provider') {
    line1 = leg.recipient_name ? `${autoT('Teslim alan')}: ${leg.recipient_name}` : autoT('Teslim edildi');
    line2 = `${autoT("BanaBiKurye'den")} · ${autoT('varış')} ${hhmm(leg.proof_captured_at ?? leg.delivered_at)}`;
  } else if (!needsSignature(leg.direction)) {
    line1 = toLab ? autoT("Lab'a teslim edildi") : autoT('Teslim edildi');
    line2 = autoT('Fotoğraf');
  } else {
    line1 = leg.recipient_name ? `${autoT('Teslim alan')}: ${leg.recipient_name}` : autoT('Teslim edildi');
    line2 = `${autoT('Fotoğraf')} · ${autoT('imza')}`;
  }

  const thumb = { width: 44, height: 44, borderRadius: 11 } as const;
  return (
    <GlassTooltip title={autoT('Teslim kanıtı')} text={autoT('Fotoğrafı, imzayı ve teslim alanı gösterir')} placement="top">
      <Pressable
        ref={ref}
        onPress={() => measureOrigin(ref.current, onOpen)}
        accessibilityRole="button"
        accessibilityLabel={autoT('Teslim kanıtı')}
        style={({ pressed, hovered }: any) => ({
          flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10, padding: 10, borderRadius: 14,
          backgroundColor: hovered ? U.rowHover : U.surfaceSoft,
          transform: [{ scale: pressed ? 0.985 : 1 }],
          ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : null),
        })}
      >
        {leg.proof_photo_path ? (
          photo ? <Image source={{ uri: photo }} style={thumb} resizeMode="cover" /> : <View style={[thumb, { backgroundColor: U.chipNeutral }]} />
        ) : null}
        {leg.signature_path && kind !== 'nosig' ? (
          <View style={[thumb, { backgroundColor: PAPER, borderWidth: 1, borderColor: U.hairline, overflow: 'hidden' }]}>
            {sig ? <Image source={{ uri: sig }} style={{ width: '100%', height: '100%' }} resizeMode="contain" /> : null}
          </View>
        ) : null}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontSize: 13, fontWeight: '600', color: warn ? U.chipTones.warning.fg : U.ink[900] }} numberOfLines={1}>{line1}</Text>
          <Text style={{ fontSize: 11.5, color: U.ink[500], marginTop: 2, fontVariant: ['tabular-nums'] }} numberOfLines={1}>{line2}</Text>
        </View>
        {isRTL() ? <ChevronLeft size={14} color={U.ink[400]} strokeWidth={2} /> : <ChevronRight size={14} color={U.ink[400]} strokeWidth={2} />}
      </Pressable>
    </GlassTooltip>
  );
}
