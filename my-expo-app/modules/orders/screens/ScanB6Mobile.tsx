/**
 * ScanB6Mobile — tüm panellerin QR tarayıcısı (iOS Kod Tarayıcısı düzeni).
 * Tam ekran kamera · dört yuvarlak köşe çerçevesi · altta fener · sonuç için koyu cam kart.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, Pressable, StyleSheet, Animated, Platform, Linking, useWindowDimensions, } from 'react-native';
import { X, Check, ChevronRight, ChevronLeft, Camera as CameraIcon, AlertCircle, Flashlight } from '../../../core/ui/icons';
import Svg, { Path } from 'react-native-svg';
import { BlurView } from 'expo-blur';
import { isRTL } from '../../../core/i18n';
import { autoT } from '../../../core/i18n/autoTranslate';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
// expo-camera sadece native'de import edilsin (web bundle'a girmesin / hatasız patlasın)
const isWeb = Platform.OS === 'web';
const _cam: any = isWeb ? { CameraView: () => null, useCameraPermissions: () => [null, () => {}] } : require('expo-camera');
const CameraView = _cam.CameraView;
const useCameraPermissions = _cam.useCameraPermissions as () => [null | { granted: boolean; canAskAgain: boolean }, () => Promise<any>];
import { supabase } from '../../../core/api/supabase';
import { MFONT, useMobileTheme } from '../../../core/theme/mobileTheme';
import { ActivityIndicator } from '../../../core/ui/teethCompat';

interface ScanResult {
  workOrderId: string;
  orderNumber: string;
  workType: string;
  clinic: string;
}

interface Props {
  onClose: () => void;
  onOpenOrder: (workOrderId: string) => void;
  onUpdateStatus?: (workOrderId: string) => void;
}

// ─── Web kamera scanner — Safari/Chrome PWA için getUserMedia + jsQR ────────
function WebQrScanner({ onScan, paused, torch, onTorchSupport, onError }: {
  onScan: (code: string) => void;
  paused: boolean;
  torch: boolean;
  onTorchSupport: (ok: boolean) => void;
  onError: () => void;
}) {
  const videoRef = useRef<any>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const rafRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const pausedRef = useRef(paused);
  useEffect(() => { pausedRef.current = paused; }, [paused]);
  // Callback'ler ref'te: ebeveyn yeniden çizilince (tarama/fener durumu) kamera akışı yeniden başlamasın.
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;
  const onTorchSupportRef = useRef(onTorchSupport);
  onTorchSupportRef.current = onTorchSupport;
  // Fener: yalnız torch yeteneği olan kameralarda (Android Chrome); iOS Safari'de yok.
  useEffect(() => {
    const track: any = streamRef.current?.getVideoTracks?.()[0];
    if (!track?.applyConstraints) return;
    track.applyConstraints({ advanced: [{ torch }] }).catch(() => {});
  }, [torch]);
  useEffect(() => { if (error) onError(); }, [error, onError]);

  useEffect(() => {
    let cancelled = false;
    let detector: any = null;
    let jsQR: any = null;

    (async () => {
      try {
        if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
          setError('Bu tarayıcı kamera desteklemiyor');
          return;
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        });
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        try {
          const caps: any = (stream.getVideoTracks()[0] as any)?.getCapabilities?.();
          if (caps?.torch) onTorchSupportRef.current(true);
        } catch { /* yetenek sorgusu desteklenmiyor */ }
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.setAttribute('playsinline', 'true');
          videoRef.current.setAttribute('autoplay', 'true');
          videoRef.current.setAttribute('muted', 'true');
          await videoRef.current.play().catch(() => {});
        }

        // BarcodeDetector varsa onu kullan (Chrome/Edge), yoksa jsQR
        if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
          // @ts-ignore
          detector = new (window as any).BarcodeDetector({ formats: ['qr_code'] });
        } else {
          jsQR = (await import('jsqr')).default;
        }

        // Okumadan sonra döngü DURMAZ (tekrar tara / "bulunamadı" sonrası yeniden okuyabilsin);
        // aynı kodu art arda göndermemek için kısa bekleme.
        let cooldownUntil = 0;
        const tick = async () => {
          if (cancelled) return;
          const v = videoRef.current;
          if (v && v.readyState === 4 && !pausedRef.current && Date.now() > cooldownUntil) {
            try {
              if (detector) {
                const codes = await detector.detect(v);
                if (codes && codes[0]?.rawValue) {
                  cooldownUntil = Date.now() + 1800;
                  onScanRef.current(String(codes[0].rawValue));
                }
              } else if (jsQR) {
                const w = v.videoWidth, h = v.videoHeight;
                if (w && h) {
                  if (!canvasRef.current) canvasRef.current = document.createElement('canvas');
                  const cnv = canvasRef.current;
                  cnv.width = w; cnv.height = h;
                  const ctx = cnv.getContext('2d', { willReadFrequently: true });
                  if (ctx) {
                    ctx.drawImage(v, 0, 0, w, h);
                    const imgData = ctx.getImageData(0, 0, w, h);
                    const result = jsQR(imgData.data, w, h, { inversionAttempts: 'dontInvert' });
                    if (result?.data) {
                      cooldownUntil = Date.now() + 1800;
                      onScanRef.current(result.data);
                    }
                  }
                }
              }
            } catch {}
          }
          rafRef.current = requestAnimationFrame(tick);
        };
        tick();
      } catch (e: any) {
        const msg = (e?.name === 'NotAllowedError')
          ? 'Kamera izni reddedildi'
          : (e?.message ?? 'Kamera açılamadı');
        setError(msg);
      }
    })();

    return () => {
      cancelled = true;
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    };
  }, []);

  if (error) {
    return (
      <View style={[StyleSheet.absoluteFill, { backgroundColor: '#0A0A0A', alignItems: 'center', justifyContent: 'center', padding: 32 }]}>
        <View style={{ width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(245,158,11,0.18)', marginBottom: 14 }}>
          <AlertCircle size={28} color="#F59E0B" strokeWidth={1.6} />
        </View>
        <Text style={{ fontSize: 16, fontWeight: '700', color: '#FAFAFA', textAlign: 'center', marginBottom: 6 }}>Kamera açılamadı</Text>
        <Text style={{ fontSize: 13, color: '#9A9A9A', textAlign: 'center', lineHeight: 19, maxWidth: 320 }}>{error}</Text>
        <Text style={{ fontSize: 12, color: '#9A9A9A', textAlign: 'center', marginTop: 12, lineHeight: 18 }}>
          Safari ayarlarından kamera erişimine izin verdiğine emin ol — Ayarlar → Safari → Kamera.
        </Text>
      </View>
    );
  }

  return React.createElement('video', {
    ref: videoRef,
    autoPlay: true,
    playsInline: true,
    muted: true,
    style: { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', backgroundColor: '#000' },
  } as any);
}

export function ScanB6Mobile({ onClose, onOpenOrder, onUpdateStatus }: Props) {
  const insets = useSafeAreaInsets();
  const theme = useMobileTheme();
  const { width: winW } = useWindowDimensions();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState<ScanResult | null>(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // iOS Kod Tarayıcısı düzeni: yalnız kamera + köşe çerçevesi + fener.
  const [torch, setTorch] = useState(false);
  const [webTorchOk, setWebTorchOk] = useState(false);
  const [webCamError, setWebCamError] = useState(false);

  const cameraLive = isWeb ? !webCamError : !!permission?.granted;
  const torchAvailable = isWeb ? webTorchOk : cameraLive;
  const RETICLE = Math.min(Math.round(winW * 0.62), 280);

  // ── Sonuç kartı + çerçeve animasyonu (tek değer, spring) ─────────
  const found = useRef(new Animated.Value(0)).current; // 0 = tarıyor, 1 = bulundu
  useEffect(() => {
    Animated.spring(found, {
      toValue: scanned ? 1 : 0,
      damping: 22, stiffness: 260, mass: 0.8,
      useNativeDriver: true,
    }).start();
  }, [scanned, found]);

  // ── Permission flow — sadece bir kez iste ────────────────────────
  const askedRef = useRef(false);
  useEffect(() => {
    if (!permission || askedRef.current) return;
    if (!permission.granted && permission.canAskAgain) {
      askedRef.current = true;
      requestPermission();
    }
  }, [permission, requestPermission]);

  // ── QR handler ────────────────────────────────────────────────────
  const handleQr = async (raw: string) => {
    if (scanning || scanned) return;
    setScanning(true);
    setError(null);
    try {
      // Detect check-in QR (workforce time tracking) — route to /checkin
      const checkinMatch = raw.match(/checkin\?token=([A-Za-z0-9_-]+)/i);
      if (checkinMatch) {
        const token = checkinMatch[1];
        onClose();
        // Imperatively navigate via router module (avoids useRouter inside callback)
        const { router } = require('expo-router');
        router.push({ pathname: '/checkin', params: { token } } as any);
        return;
      }

      // Accept either a full URL ending in /order/<id> or a bare UUID/order number
      let workOrderId = raw.trim();
      const m = raw.match(/order\/([a-f0-9-]{6,})/i);
      if (m) workOrderId = m[1];

      // Look up by id, fallback to order_number
      let { data, error } = await supabase
        .from('work_orders')
        .select('id, order_number, work_type, doctor:doctors(full_name, clinic:clinics(name))')
        .eq('id', workOrderId)
        .maybeSingle();

      if ((!data || error) && /^[A-Z0-9-]+$/i.test(raw)) {
        const r2 = await supabase
          .from('work_orders')
          .select('id, order_number, work_type, doctor:doctors(full_name, clinic:clinics(name))')
          .eq('order_number', raw)
          .maybeSingle();
        data = r2.data; error = r2.error;
      }

      if (!data) {
        setError('Vaka bulunamadı.');
        setScanning(false);
        // Re-enable scanning after a beat
        setTimeout(() => setError(null), 1600);
        return;
      }

      const doc = (data.doctor as any) ?? {};
      setScanned({
        workOrderId: data.id,
        orderNumber: data.order_number,
        workType: (data as any).work_type ?? 'Vaka',
        clinic: doc.clinic?.name ?? doc.full_name ?? '—',
      });
      setScanning(false);
    } catch (e: any) {
      setError(e?.message ?? 'Tarama hatası');
      setScanning(false);
      setTimeout(() => setError(null), 1600);
    }
  };

  const reticleScale = found.interpolate({ inputRange: [0, 1], outputRange: [1, 0.9] });
  const cardY = found.interpolate({ inputRange: [0, 1], outputRange: [40, 0] });

  return (
    <View style={styles.root}>
      {/* Camera or permission UI */}
      {isWeb ? (
        <WebQrScanner
          onScan={handleQr}
          paused={!!scanned || scanning}
          torch={torch}
          onTorchSupport={setWebTorchOk}
          onError={() => setWebCamError(true)}
        />
      ) : permission?.granted ? (
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          enableTorch={torch}
          onBarcodeScanned={scanned ? undefined : ({ data }: { data: string }) => handleQr(data)}
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.fallbackBg]}>
          {permission == null ? (
            <View style={styles.permWrap}>
              <ActivityIndicator color="#FFFFFF" />
              <Text style={styles.permSub}>Kamera hazırlanıyor…</Text>
            </View>
          ) : (
            <View style={styles.permWrap}>
              <View style={[styles.permIconBox, { backgroundColor: theme.primary + '22' }]}>
                {permission.canAskAgain
                  ? <CameraIcon size={28} color={theme.primary} strokeWidth={1.6} />
                  : <AlertCircle size={28} color="#F59E0B" strokeWidth={1.6} />}
              </View>
              <Text style={styles.permTitle}>
                {permission.canAskAgain ? 'Kamera izni gerekli' : 'Kamera izni reddedildi'}
              </Text>
              <Text style={styles.permBody}>
                {permission.canAskAgain
                  ? 'QR kod okutabilmek için kameraya erişim izni vermen gerekiyor.'
                  : 'Telefon ayarlarından Siman uygulamasına kamera izni vermelisin.'}
              </Text>
              <Pressable
                onPress={() => {
                  if (permission.canAskAgain) {
                    requestPermission();
                  } else {
                    Linking.openSettings().catch(() => {});
                  }
                }}
                style={styles.permBtn}
              >
                <Text style={styles.permBtnText}>
                  {permission.canAskAgain ? 'İzin Ver' : 'Ayarları Aç'}
                </Text>
              </Pressable>
            </View>
          )}
        </View>
      )}

      {/* Köşe çerçevesi — iOS Kod Tarayıcısı: yalnız dört yuvarlak köşe */}
      {cameraLive && (
        <View style={styles.reticleWrap} pointerEvents="none">
          <Animated.View style={{ width: RETICLE, height: RETICLE, transform: [{ scale: reticleScale }] }}>
            <ReticleCorners size={RETICLE} />
            <View style={styles.reticleCenter}>
              {scanning ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : scanned ? (
                <View style={styles.successBurst}>
                  <Check size={30} color="#0A0A0A" strokeWidth={2.6} />
                </View>
              ) : null}
            </View>
          </Animated.View>
          {error && (
            <View style={styles.errorToast}>
              <Text style={styles.errorToastText}>{error}</Text>
            </View>
          )}
        </View>
      )}

      {/* Kapat — dynamic island'dan uzak, güvenli alanın içinde */}
      <Pressable
        onPress={onClose}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel={autoT('Kapat')}
        style={[styles.closeBtn, { top: Math.max(insets.top, 12) + 8 }]}
      >
        <GlassFill />
        {/* Web'de absolute cam dolgusu statik svg'nin ÜSTÜNE boyanır (CSS istif
            sırası) → ikon kendi View'ında (RNW View = position:relative). */}
        <View><X size={20} color="#FFFFFF" strokeWidth={2.2} /></View>
      </Pressable>

      {/* Fener — altta ortada tek buton (sonuç kartı açıkken gizli) */}
      {cameraLive && torchAvailable && !scanned && (
        <Pressable
          onPress={() => setTorch(v => !v)}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={autoT(torch ? 'Feneri kapat' : 'Feneri aç')}
          accessibilityState={{ selected: torch }}
          style={[styles.torchBtn, { bottom: insets.bottom + 72 }, torch && styles.torchBtnOn]}
        >
          {!torch && <GlassFill />}
          <View><Flashlight size={22} color={torch ? '#0A0A0A' : '#FFFFFF'} strokeWidth={2} /></View>
        </Pressable>
      )}

      {/* Sonuç kartı — koyu cam, yalnız bir vaka bulununca */}
      {scanned && (
        <Animated.View
          style={[
            styles.resultCard,
            { bottom: insets.bottom + 16, opacity: found, transform: [{ translateY: cardY }] },
          ]}
        >
          <GlassFill radius={26} />
          <Text style={styles.sheetEyebrow}>VAKA BULUNDU</Text>
          <Text style={styles.sheetHeadline} numberOfLines={2}>{scanned.workType}</Text>
          <Text style={styles.sheetMeta}>{scanned.clinic} · #{scanned.orderNumber}</Text>

          <View style={styles.sheetActions}>
            <Pressable onPress={() => onOpenOrder(scanned.workOrderId)} style={styles.primaryBtn}>
              <Text style={styles.primaryBtnText}>Vakayı aç</Text>
              {isRTL()
                ? <ChevronLeft size={16} color="#0A0A0A" strokeWidth={2} />
                : <ChevronRight size={16} color="#0A0A0A" strokeWidth={2} />}
            </Pressable>
            {onUpdateStatus && (
              <Pressable onPress={() => onUpdateStatus(scanned.workOrderId)} style={styles.surfaceBtn}>
                <Text style={styles.surfaceBtnText}>Durum güncelle</Text>
              </Pressable>
            )}
          </View>
          <Pressable onPress={() => { setScanned(null); setError(null); }} hitSlop={8} style={styles.rescanBtn}>
            <Text style={styles.rescanText}>Tekrar tara</Text>
          </Pressable>
        </Animated.View>
      )}
    </View>
  );
}

// ─── Koyu cam dolgu — iOS sistem materyali (blur + gri tül) ──────────────────
function GlassFill({ radius = 999 }: { radius?: number }) {
  return (
    <View style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: 'hidden' }]} pointerEvents="none">
      <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(72,72,74,0.55)' }]} />
    </View>
  );
}

// ─── Köşe çerçevesi — yuvarlak uçlu, geniş yarıçaplı dört köşe ────────────────
function ReticleCorners({ size }: { size: number }) {
  const S = 5;                        // çizgi kalınlığı
  const h = S / 2;                    // çizgi yarısı — kenardan taşmasın
  const arm = Math.round(size * 0.2); // köşe kolu
  const r = Math.round(arm * 0.62);   // köşe yarıçapı
  const e = size - h;
  const paths = [
    `M ${h} ${arm} L ${h} ${h + r} A ${r} ${r} 0 0 1 ${h + r} ${h} L ${arm} ${h}`,
    `M ${size - arm} ${h} L ${e - r} ${h} A ${r} ${r} 0 0 1 ${e} ${h + r} L ${e} ${arm}`,
    `M ${e} ${size - arm} L ${e} ${e - r} A ${r} ${r} 0 0 1 ${e - r} ${e} L ${size - arm} ${e}`,
    `M ${arm} ${e} L ${h + r} ${e} A ${r} ${r} 0 0 1 ${h} ${e - r} L ${h} ${size - arm}`,
  ];
  return (
    <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
      {paths.map((d, i) => (
        <Path key={i} d={d} stroke="#FFFFFF" strokeWidth={S} strokeLinecap="round" fill="none" />
      ))}
    </Svg>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000000',
  },
  fallbackBg: {
    backgroundColor: '#0A0A0A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  permWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    maxWidth: 400,
    gap: 14,
  },
  permIconBox: {
    width: 72, height: 72, borderRadius: 36,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 4,
  },
  permTitle: {
    color: '#FFF',
    fontFamily: MFONT.uiSemibold,
    fontSize: 16,
  },
  permSub: {
    color: 'rgba(255,255,255,0.70)',
    fontFamily: MFONT.uiRegular,
    fontSize: 13,
    marginTop: 6,
    lineHeight: 18,
  },
  permBody: {
    fontSize: 13, color: '#9A9A9A', lineHeight: 19,
    textAlign: 'center' as const,
  },
  permBtn: {
    marginTop: 4,
    paddingVertical: 12,
    paddingHorizontal: 22,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
  },
  permBtnText: {
    fontFamily: MFONT.uiSemibold,
    fontSize: 14,
    color: '#0A0A0A',
  },

  reticleWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reticleCenter: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successBurst: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },

  closeBtn: {
    position: 'absolute',
    start: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  torchBtn: {
    position: 'absolute',
    alignSelf: 'center',
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  torchBtnOn: {
    backgroundColor: '#FFFFFF',
  },

  // Hata — çerçevenin hemen altında küçük hap
  errorToast: {
    marginTop: 28,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 999,
    backgroundColor: 'rgba(217,75,75,0.92)',
  },
  errorToastText: {
    color: '#FFF',
    fontFamily: MFONT.uiSemibold,
    fontSize: 13,
  },

  // Sonuç kartı — koyu cam (kamera üstünde her iki temada aynı)
  resultCard: {
    position: 'absolute',
    start: 16,
    end: 16,
    paddingTop: 18,
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderRadius: 26,
    overflow: 'hidden',
  },
  sheetEyebrow: {
    fontFamily: MFONT.uiSemibold,
    fontSize: 11,
    color: 'rgba(255,255,255,0.60)',
    letterSpacing: 1.1,
  },
  sheetHeadline: {
    fontFamily: MFONT.uiLight,
    fontWeight: '300',
    fontSize: 24,
    color: '#FFFFFF',
    letterSpacing: -0.6,
    lineHeight: 29,
    marginTop: 4,
  },
  sheetMeta: {
    fontFamily: MFONT.uiRegular,
    fontSize: 13,
    color: 'rgba(255,255,255,0.72)',
    marginTop: 4,
  },
  sheetActions: {
    marginTop: 16,
    flexDirection: 'row',
    gap: 8,
  },
  primaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
  },
  primaryBtnText: {
    color: '#0A0A0A',
    fontFamily: MFONT.uiSemibold,
    fontSize: 14,
    letterSpacing: -0.2,
  },
  surfaceBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  surfaceBtnText: {
    fontFamily: MFONT.uiSemibold,
    fontSize: 14,
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  rescanBtn: {
    alignSelf: 'center',
    marginTop: 10,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  rescanText: {
    fontFamily: MFONT.uiSemibold,
    fontSize: 13,
    color: 'rgba(255,255,255,0.72)',
  },
});
