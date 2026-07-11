/**
 * ScanB6Mobile — Variant B B6 full-bleed camera scan.
 * Animated scanline · L-corner reticle · sliding bottom sheet result.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, Pressable, StyleSheet, Animated, Easing, Platform, Linking, } from 'react-native';
import { X, Check, ChevronRight, Camera as CameraIcon, AlertCircle } from 'lucide-react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
// expo-camera sadece native'de import edilsin (web bundle'a girmesin / hatasız patlasın)
const isWeb = Platform.OS === 'web';
const _cam: any = isWeb ? { CameraView: () => null, useCameraPermissions: () => [null, () => {}] } : require('expo-camera');
const CameraView = _cam.CameraView;
const useCameraPermissions = _cam.useCameraPermissions as () => [null | { granted: boolean; canAskAgain: boolean }, () => Promise<any>];
import { supabase } from '../../../core/api/supabase';
import { DS } from '../../../core/theme/dsTokens';
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
function WebQrScanner({ onScan, paused }: { onScan: (code: string) => void; paused: boolean }) {
  const videoRef = useRef<any>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const rafRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const pausedRef = useRef(paused);
  useEffect(() => { pausedRef.current = paused; }, [paused]);

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

        const tick = async () => {
          if (cancelled) return;
          const v = videoRef.current;
          if (v && v.readyState === 4 && !pausedRef.current) {
            try {
              if (detector) {
                const codes = await detector.detect(v);
                if (codes && codes[0]?.rawValue) {
                  onScan(String(codes[0].rawValue));
                  return;
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
                      onScan(result.data);
                      return;
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
  }, [onScan]);

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
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState<ScanResult | null>(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Scanline animation ────────────────────────────────────────────
  const scanlineY = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scanlineY, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(scanlineY, { toValue: 0, duration: 1400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [scanlineY]);

  // ── Bottom sheet animation ───────────────────────────────────────
  const sheetY = useRef(new Animated.Value(1)).current; // 1 = hidden offset
  useEffect(() => {
    Animated.timing(sheetY, {
      toValue: scanned ? 0 : 1,
      duration: 400,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start();
  }, [scanned, sheetY]);

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

  return (
    <View style={styles.root}>
      {/* Camera or permission UI */}
      {isWeb ? (
        <WebQrScanner onScan={handleQr} paused={!!scanned || scanning} />
      ) : permission?.granted ? (
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          onBarcodeScanned={scanned ? undefined : ({ data }: { data: string }) => handleQr(data)}
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.fallbackBg]}>
          {permission == null ? (
            <View style={styles.permWrap}>
              <ActivityIndicator color={theme.primary} />
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
                style={[styles.permBtn, { backgroundColor: theme.primary }]}
              >
                <Text style={styles.permBtnText}>
                  {permission.canAskAgain ? 'İzin Ver' : 'Ayarları Aç'}
                </Text>
              </Pressable>
              {error && (
                <Text style={{ marginTop: 12, color: '#F87171', fontSize: 13 }}>{error}</Text>
              )}
            </View>
          )}
        </View>
      )}

      {/* Vignette overlays */}
      <View style={styles.vignetteTop} pointerEvents="none" />
      <View style={styles.vignetteBottom} pointerEvents="none" />

      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        {/* Top header — explicit insets.top so dynamic island / status bar
            don't overlap with X button even in fullScreen modal presentation. */}
        <View style={[styles.topRow, { paddingTop: Math.max(insets.top, 12) + 8 }]}>
          <Pressable onPress={onClose} style={styles.ghostCircle} hitSlop={16}>
            <X size={22} color="#FFF" strokeWidth={2.2} />
          </Pressable>
          <View style={styles.modePill}>
            <View style={[styles.modePillDot, { backgroundColor: theme.primary }]} />
            <Text style={styles.modePillText}>OTOMATIK TARA</Text>
          </View>
          <View style={styles.ghostCircle} />
        </View>

        {/* Reticle area */}
        <View style={styles.reticleWrap} pointerEvents="none">
          {!scanned ? (
            <View style={styles.reticle}>
              {/* L-corner brackets */}
              {(['tl', 'tr', 'bl', 'br'] as const).map(corner => (
                <CornerBracket key={corner} corner={corner} color={theme.primary} />
              ))}
              {/* Scanline */}
              <Animated.View
                style={[
                  styles.scanline,
                  {
                    backgroundColor: theme.primary,
                    transform: [{
                      translateY: scanlineY.interpolate({ inputRange: [0, 1], outputRange: [12, 240] }),
                    }],
                    ...(Platform.OS === 'web'
                      ? ({ boxShadow: `0 0 24px ${theme.primary}` } as any)
                      : {
                          shadowColor: theme.primary,
                          shadowOpacity: 0.9,
                          shadowRadius: 18,
                          shadowOffset: { width: 0, height: 0 },
                        }),
                  },
                ]}
              />
            </View>
          ) : (
            <View style={[styles.successBurst, {
              backgroundColor: theme.success ?? '#2D9A6B',
              ...(Platform.OS === 'web'
                ? ({ boxShadow: `0 0 40px ${theme.success ?? '#2D9A6B'}99` } as any)
                : { shadowColor: theme.success ?? '#2D9A6B', shadowOpacity: 0.6, shadowRadius: 28, shadowOffset: { width: 0, height: 0 } }),
            }]}>
              <Check size={36} color="#FFF" strokeWidth={2.6} />
            </View>
          )}
        </View>

        {/* Permission denied banner */}
        {permission && !permission.granted && (
          <View style={styles.permBanner}>
            <Text style={styles.permTitle}>Kamera izni gerekli</Text>
            <Text style={styles.permSub}>QR kod taramak için kamera erişimine izin verin.</Text>
            <Pressable
              onPress={() => requestPermission()}
              style={[styles.permBtn, { backgroundColor: theme.primary }]}
            >
              <Text style={[styles.permBtnText, { color: theme.accent }]}>İzin ver</Text>
            </Pressable>
          </View>
        )}

        {/* Error toast */}
        {error && (
          <View style={styles.errorToast}>
            <Text style={styles.errorToastText}>{error}</Text>
          </View>
        )}
      </SafeAreaView>

      {/* Bottom sheet */}
      <Animated.View
        style={[
          styles.sheet,
          {
            transform: [{
              translateY: sheetY.interpolate({ inputRange: [0, 1], outputRange: [0, 220] }),
            }],
            opacity: sheetY.interpolate({ inputRange: [0, 1], outputRange: [1, 0.5] }),
          },
        ]}
      >
        {scanned ? (
          <>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetEyebrow}>VAKA BULUNDU</Text>
            <Text style={styles.sheetHeadline} numberOfLines={2}>{scanned.workType}</Text>
            <Text style={styles.sheetMeta}>{scanned.clinic} · #{scanned.orderNumber}</Text>

            <View style={styles.sheetActions}>
              <Pressable
                onPress={() => onOpenOrder(scanned.workOrderId)}
                style={[styles.primaryBtn, { backgroundColor: theme.accent }]}
              >
                <Text style={styles.primaryBtnText}>Vakayı aç</Text>
                <ChevronRight size={16} color="#FFF" strokeWidth={2} />
              </Pressable>
              {onUpdateStatus && (
                <Pressable
                  onPress={() => onUpdateStatus(scanned.workOrderId)}
                  style={styles.surfaceBtn}
                >
                  <Text style={styles.surfaceBtnText}>Durum güncelle</Text>
                </Pressable>
              )}
            </View>
          </>
        ) : (
          <>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetEyebrow}>HAZIR</Text>
            <Text style={styles.sheetHint}>QR kodu çerçeveye tutun…</Text>
          </>
        )}
      </Animated.View>
    </View>
  );
}

// ─── Corner bracket ──────────────────────────────────────────────────────────
function CornerBracket({ corner, color }: { corner: 'tl' | 'tr' | 'bl' | 'br'; color: string }) {
  const SIZE = 50;
  const STROKE = 3;
  const RADIUS = 14;
  const positionStyle = {
    tl: { top: 0, left: 0,    borderTopWidth: STROKE, borderLeftWidth: STROKE, borderTopLeftRadius: RADIUS },
    tr: { top: 0, right: 0,   borderTopWidth: STROKE, borderRightWidth: STROKE, borderTopRightRadius: RADIUS },
    bl: { bottom: 0, left: 0, borderBottomWidth: STROKE, borderLeftWidth: STROKE, borderBottomLeftRadius: RADIUS },
    br: { bottom: 0, right: 0, borderBottomWidth: STROKE, borderRightWidth: STROKE, borderBottomRightRadius: RADIUS },
  }[corner];
  return (
    <View style={[
      { position: 'absolute', width: SIZE, height: SIZE, borderColor: color },
      positionStyle,
    ]} />
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0A0A0A',
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
  permBody: {
    fontSize: 13, color: '#9A9A9A', lineHeight: 19,
    textAlign: 'center' as const,
  },

  vignetteTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 200,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  vignetteBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 280,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },

  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    // Dynamic island bölgesinden uzaklaştır — X butonu rahat tıklanabilsin.
    paddingTop: 16,
    paddingBottom: 4,
  },
  ghostCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  modePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  modePillDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  modePillText: {
    color: '#FFF',
    fontFamily: MFONT.uiSemibold,
    fontSize: 10,
    letterSpacing: 1.0,
  },

  reticleWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reticle: {
    width: 260,
    height: 260,
    position: 'relative',
  },
  scanline: {
    position: 'absolute',
    left: 8,
    right: 8,
    height: 2,
  },

  successBurst: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Permission banner
  permBanner: {
    position: 'absolute',
    top: 80,
    left: 24,
    right: 24,
    padding: 18,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
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
  permBtn: {
    alignSelf: 'flex-start',
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 14,
  },
  permBtnText: {
    fontFamily: MFONT.uiSemibold,
    fontSize: 13,
  },

  // Error toast
  errorToast: {
    position: 'absolute',
    top: 100,
    alignSelf: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 999,
    backgroundColor: 'rgba(217,75,75,0.9)',
  },
  errorToastText: {
    color: '#FFF',
    fontFamily: MFONT.uiSemibold,
    fontSize: 12,
  },

  // Bottom sheet
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 12,
    paddingHorizontal: 24,
    paddingBottom: Platform.OS === 'ios' ? 32 : 22,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: '#FFFFFF',
    ...(Platform.OS === 'web'
      ? ({ boxShadow: '0 -8px 24px rgba(0,0,0,0.18)' } as any)
      : {
          shadowColor: '#000',
          shadowOpacity: 0.18,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: -8 },
          elevation: 12,
        }),
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(0,0,0,0.10)',
    marginBottom: 14,
  },
  sheetEyebrow: {
    fontFamily: MFONT.uiMedium,
    fontSize: 11,
    color: DS.ink[500],
    letterSpacing: 0.66,
  },
  sheetHeadline: {
    fontFamily: MFONT.uiLight,
    fontWeight: '300',
    fontSize: 24,
    color: DS.ink[900],
    letterSpacing: -0.84,
    lineHeight: 28,
    marginTop: 4,
  },
  sheetHint: {
    fontFamily: MFONT.uiLight,
    fontWeight: '300',
    fontSize: 18,
    color: DS.ink[700],
    letterSpacing: -0.45,
    lineHeight: 24,
    marginTop: 4,
  },
  sheetMeta: {
    fontFamily: MFONT.uiRegular,
    fontSize: 13,
    color: DS.ink[500],
    marginTop: 6,
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
    borderRadius: 14,
  },
  primaryBtnText: {
    color: '#FFF',
    fontFamily: MFONT.uiSemibold,
    fontSize: 14,
    letterSpacing: -0.2,
  },
  surfaceBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  surfaceBtnText: {
    fontFamily: MFONT.uiSemibold,
    fontSize: 14,
    color: DS.ink[900],
    letterSpacing: -0.2,
  },
});
