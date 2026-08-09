/**
 * ClinicLogoPicker — klinik logosu seçimi (önizleme + Simanty ile bul + cihazdan yükle).
 *
 * Klinik kendi profilinden logo ekleyebiliyordu; lab/admin tarafında "Kurumu
 * düzenle" modalinde bu yol yoktu. Bu bileşen o akışı taşınabilir hale getirir.
 *
 * Yükleme SERVER-SIDE yapılır (clinic-logo-search edge function): CORS yok,
 * yetki caller'ın RLS'i ile doğrulanır ve dönen URL SÜRÜM DAMGALIDIR — aynı
 * storage yoluna upsert edildiği için damgasız URL'de CDN eski görseli servis
 * ediyordu.
 */
import React, { useState } from 'react';
import {
  View, Text, Pressable, Modal, TextInput, ScrollView, Image, Platform,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Search, Building2, X, Camera } from 'lucide-react-native';
import { supabase } from '../../../core/api/supabase';
import { toast } from '../../../core/ui/Toast';
import { ActivityIndicator } from '../../../core/ui/teethCompat';
import { useMobileTokens } from '../../../core/theme/mobileDesignTokens';
import { ColorOrb } from '../../denty/components/ColorOrb';

interface Candidate { url: string; domain?: string; name?: string }

export function ClinicLogoPicker({
  clinicId, clinicName, logoUrl, accentColor, onChange, size = 64,
}: {
  clinicId: string;
  clinicName: string;
  logoUrl: string | null;
  accentColor: string;
  /** Yeni logo uygulandığında (sürümlü URL) çağrılır. */
  onChange: (url: string) => void;
  size?: number;
}) {
  const T = useMobileTokens();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [website, setWebsite] = useState('');
  const [results, setResults] = useState<Candidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [applyingUrl, setApplyingUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const runSearch = async (qArg?: string, wArg?: string) => {
    const q = (qArg ?? query).trim();
    const w = (wArg ?? website).trim();
    if ((!q && !w) || searching) return;
    setSearching(true); setSearched(false); setResults([]);
    try {
      const { data } = await supabase.functions.invoke('clinic-logo-search', { body: { q, website: w } });
      setResults((data?.candidates ?? []) as Candidate[]);
    } catch { setResults([]); }
    finally { setSearching(false); setSearched(true); }
  };

  const openFinder = () => {
    setQuery(clinicName ?? '');
    setWebsite(''); setResults([]); setSearched(false); setShowManual(false);
    setOpen(true);
    if (clinicName) runSearch(clinicName, '');
  };

  const applyCandidate = async (url: string) => {
    if (!clinicId || applyingUrl) return;
    setApplyingUrl(url);
    try {
      const { data, error } = await supabase.functions.invoke('clinic-logo-search', {
        body: { apply: true, url, clinicId },
      });
      if (error || !data?.logo_url) { toast.error(data?.error ?? error?.message ?? 'Logo uygulanamadı'); return; }
      onChange(data.logo_url);
      toast.success('Logo güncellendi');
      setOpen(false);
    } catch (e: any) {
      toast.error(e?.message ?? 'Logo uygulanamadı');
    } finally { setApplyingUrl(null); }
  };

  const pickFromDevice = async () => {
    if (!clinicId) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { toast.warning('Galeri erişimi için izin verin.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true, aspect: [1, 1], quality: 0.85, base64: true,
    });
    if (result.canceled || !result.assets[0]?.base64) return;
    const asset = result.assets[0];
    setUploading(true);
    try {
      const byteStr = atob(asset.base64!);
      const bytes = new Uint8Array(byteStr.length);
      for (let i = 0; i < byteStr.length; i++) bytes[i] = byteStr.charCodeAt(i);
      const mime = asset.mimeType ?? 'image/jpeg';
      const ext = mime.split('/')[1] ?? 'jpg';
      const path = `clinics/${clinicId}/logo.${ext}`;
      const { error: upErr } = await supabase.storage.from('avatars').upload(path, bytes, { upsert: true, contentType: mime });
      if (upErr) { toast.error(upErr.message); return; }
      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);
      // Sürüm damgası: yol sabit olduğu için CDN eski görseli servis ediyor
      const versioned = `${urlData.publicUrl}?v=${Date.now()}`;
      const { error: dbErr } = await supabase.from('clinics').update({ logo_url: versioned }).eq('id', clinicId);
      if (dbErr) { toast.error(dbErr.message); return; }
      onChange(versioned);
      toast.success('Logo güncellendi');
      setOpen(false);
    } finally { setUploading(false); }
  };

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      {/* Önizleme — tıklayınca cihazdan yükle */}
      <Pressable
        onPress={pickFromDevice}
        disabled={uploading}
        style={{
          width: size, height: size, borderRadius: 16, overflow: 'hidden',
          alignItems: 'center', justifyContent: 'center',
          backgroundColor: logoUrl ? '#FFFFFF' : `${accentColor}18`,
          borderWidth: 1, borderColor: logoUrl ? T.hairline : `${accentColor}30`,
          opacity: uploading ? 0.6 : 1,
          ...(Platform.OS === 'web' ? { cursor: uploading ? 'wait' : 'pointer' } as any : {}),
        }}
      >
        {logoUrl
          ? <Image source={{ uri: logoUrl }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
          : <Building2 size={26} color={accentColor} strokeWidth={1.6} />}
      </Pressable>

      <View style={{ flex: 1, gap: 6 }}>
        <Pressable
          onPress={openFinder}
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
            paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999,
            backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)',
            ...(Platform.OS === 'web' ? { cursor: 'pointer', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' } as any : {}),
          }}
        >
          <ColorOrb size={20} />
          <Text style={{ fontSize: 12, fontWeight: '700', color: '#0A0A0A' }}>Simanty ile logo bul</Text>
        </Pressable>
        <Pressable onPress={pickFromDevice} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
          <Camera size={12} color={T.ink3} strokeWidth={1.8} />
          <Text style={{ fontSize: 11, color: T.ink3 }}>veya cihazdan yükle</Text>
        </Pressable>
      </View>

      {/* ── Simanty logo bulucu ── */}
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(10,14,26,0.42)', justifyContent: 'center', alignItems: 'center', padding: 20, ...(Platform.OS === 'web' ? { backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' } as any : {}) }}>
          <View style={{ width: '100%', maxWidth: 460, maxHeight: '86%', backgroundColor: '#FFFFFF', borderRadius: 20, overflow: 'hidden' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 18, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: T.hairline }}>
              <ColorOrb size={24} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: T.ink }}>Simanty ile Logo</Text>
                <Text style={{ fontSize: 11, color: T.ink3, marginTop: 1 }}>İnternetten aday logolar — seçtiğin uygulanır</Text>
              </View>
              <Pressable onPress={() => setOpen(false)} hitSlop={8} style={{ ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
                <X size={20} color={T.ink3} strokeWidth={2} />
              </Pressable>
            </View>

            {(showManual || (searched && !searching && results.length === 0)) && (
              <View style={{ gap: 8, padding: 16, paddingBottom: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, height: 44, paddingHorizontal: 14, backgroundColor: T.cardSoft, borderRadius: 12, borderWidth: 1, borderColor: T.hairline }}>
                  <Building2 size={15} color={accentColor} strokeWidth={1.8} />
                  <TextInput
                    value={website} onChangeText={setWebsite} onSubmitEditing={() => runSearch()}
                    autoCapitalize="none" keyboardType="url"
                    placeholder="Web sitesi (örn. lunadente.com)" placeholderTextColor={T.ink3}
                    style={{ flex: 1, fontSize: 14, color: T.ink, ...(Platform.OS === 'web' ? { outline: 'none' } as any : {}) }}
                  />
                </View>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, height: 44, paddingHorizontal: 14, backgroundColor: T.cardSoft, borderRadius: 12, borderWidth: 1, borderColor: T.hairline }}>
                    <Search size={15} color={T.ink3} strokeWidth={1.8} />
                    <TextInput
                      value={query} onChangeText={setQuery} onSubmitEditing={() => runSearch()}
                      placeholder="veya marka adı" placeholderTextColor={T.ink3}
                      style={{ flex: 1, fontSize: 14, color: T.ink, ...(Platform.OS === 'web' ? { outline: 'none' } as any : {}) }}
                    />
                  </View>
                  <Pressable
                    onPress={() => runSearch()}
                    disabled={searching || (!query.trim() && !website.trim())}
                    style={{ paddingHorizontal: 18, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: (query.trim() || website.trim()) ? accentColor : T.hairline, ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}
                  >
                    {searching ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={{ fontSize: 14, fontWeight: '700', color: '#FFFFFF' }}>Ara</Text>}
                  </Pressable>
                </View>
              </View>
            )}

            <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 8 }} showsVerticalScrollIndicator={false}>
              {searching ? (
                <View style={{ alignItems: 'center', gap: 12, paddingVertical: 28 }}>
                  <ColorOrb size={44} state="thinking" />
                  <Text style={{ fontSize: 13, fontWeight: '600', color: T.ink }}>Simanty kurumun logosunu arıyor…</Text>
                  <Text style={{ fontSize: 11, color: T.ink3 }}>web sitesi bulunuyor, logolar çekiliyor</Text>
                </View>
              ) : results.length > 0 ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                  {results.map((c, i) => (
                    <Pressable key={c.url + i} onPress={() => applyCandidate(c.url)} disabled={!!applyingUrl}
                      style={{ width: 96, alignItems: 'center', gap: 6, ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
                      <View style={{ width: 96, height: 96, borderRadius: 14, backgroundColor: T.cardSoft, borderWidth: 1, borderColor: T.hairline, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                        <Image source={{ uri: c.url }} style={{ width: 76, height: 76 }} resizeMode="contain" />
                        {applyingUrl === c.url && (
                          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(255,255,255,0.7)', alignItems: 'center', justifyContent: 'center' }}>
                            <ActivityIndicator color={accentColor} />
                          </View>
                        )}
                      </View>
                      <Text style={{ fontSize: 10, color: T.ink3, textAlign: 'center' }} numberOfLines={1}>{c.domain || c.name}</Text>
                    </Pressable>
                  ))}
                  {!showManual && (
                    <View style={{ width: '100%', flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 8, paddingTop: 12, borderTopWidth: 1, borderTopColor: T.hairline }}>
                      <Text style={{ fontSize: 12, color: T.ink3 }}>Hiçbiri doğru değil mi?</Text>
                      <Pressable onPress={() => setShowManual(true)} style={{ ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: accentColor }}>Manuel ara</Text>
                      </Pressable>
                      <Text style={{ fontSize: 12, color: T.ink3 }}>·</Text>
                      <Pressable onPress={pickFromDevice} style={{ ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: accentColor }}>Cihazdan yükle</Text>
                      </Pressable>
                    </View>
                  )}
                </View>
              ) : searched ? (
                <Text style={{ fontSize: 13, color: T.ink3, textAlign: 'center', paddingVertical: 24 }}>
                  Otomatik bulunamadı. Yukarıya kurumun web sitesini yazıp tekrar deneyin ya da cihazdan yükleyin.
                </Text>
              ) : (
                <Text style={{ fontSize: 12, color: T.ink3, textAlign: 'center', paddingVertical: 24 }}>
                  Simanty kurumun logosunu otomatik arıyor…
                </Text>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}
