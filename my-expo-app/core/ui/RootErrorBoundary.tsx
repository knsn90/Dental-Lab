// RootErrorBoundary — JS render error olursa boş beyaz ekran yerine
// hatanın metnini gösterir. iOS 26.4 beta debug için kritik: native crash
// fix'inden sonra geride kalan JS error'larını teşhis etmek için.
//
// Aynı dosyada global ErrorUtils handler de set ediliyor (async/non-React
// errors için).

import React from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { reportError } from '../observability/reportError';

// ── Chunk-load kurtarma ───────────────────────────────────────────────
// Deploy sonrası açık kalan sekmeler ESKİ entry'yi çalıştırır; o entry artık
// silinmiş (404) eski chunk hash'ini yüklemeye çalışır → "Loading module …
// failed" / AsyncRequireError. Bir kez reload edince yeni entry + yeni chunk
// gelir ve hata kaybolur. Kullanıcı korkutan hata ekranını hiç görmez.
const CHUNK_ERR_RE = /AsyncRequireError|Loading module .* failed|ChunkLoadError|error loading dynamically imported module|Importing a module script failed|_expo\/static\/js/i;

export function isChunkLoadError(err: any): boolean {
  if (!err) return false;
  const msg = String(err?.message ?? err ?? '');
  const name = String(err?.name ?? '');
  return name === 'AsyncRequireError' || name === 'ChunkLoadError' || CHUNK_ERR_RE.test(msg);
}

// Tek seferlik reload — true dönerse reload tetiklendi (UI göstermeye gerek yok).
// Sonsuz döngü koruması: son 20 sn içinde zaten denendiyse tekrar etmez
// (kalıcı bozuk chunk durumunda hata ekranı gösterilir, döngüye girmez).
export function maybeReloadOnChunkError(err: any): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  if (!isChunkLoadError(err)) return false;
  try {
    const KEY = 'nx_chunk_reload_at';
    const last = Number(window.sessionStorage?.getItem(KEY) || 0);
    const now = Date.now();
    if (last && now - last < 20000) return false;
    window.sessionStorage?.setItem(KEY, String(now));
    // eslint-disable-next-line no-console
    console.warn('[chunk-reload] Bayat chunk algılandı — sayfa yenileniyor…');
    window.location.reload();
    return true;
  } catch {
    return false;
  }
}

interface State {
  hasError: boolean;
  error: Error | null;
  info: string;
}

export class RootErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  state: State = { hasError: false, error: null, info: '' };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, info: '' };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    // Bayat chunk hatası → korkutan ekran yerine tek seferlik otomatik reload.
    if (maybeReloadOnChunkError(error)) return;
    // eslint-disable-next-line no-console
    console.error('[RootErrorBoundary] caught:', error, errorInfo);
    // Havuza da yaz — console'a yazmak üretimde kimseye ulaşmıyor.
    reportError('boundary', error, { componentStack: errorInfo?.componentStack, fatal: true });
    this.setState({ info: errorInfo?.componentStack || '' });
  }

  reset = () => this.setState({ hasError: false, error: null, info: '' });

  render() {
    if (!this.state.hasError) return this.props.children;

    // Chunk-load hatası: reload zaten tetiklendi (veya kullanıcı elle
    // yenileyecek) — kırmızı teşhis ekranı yerine nötr "güncelleniyor" durumu.
    if (isChunkLoadError(this.state.error)) {
      return (
        <View style={{ flex: 1, backgroundColor: '#F7F9FC', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <ActivityIndicator color="#4771AB" />
          <Text style={{ fontSize: 15, fontWeight: '600', color: '#172235', marginTop: 16 }}>
            Uygulama güncelleniyor…
          </Text>
          <Text style={{ fontSize: 12.5, color: '#8494AD', marginTop: 6, textAlign: 'center' }}>
            Yeni sürüm yükleniyor. Birkaç saniye içinde otomatik yenilenecek.
          </Text>
          {Platform.OS === 'web' ? (
            <Pressable
              onPress={() => { try { (window as any).location.reload(); } catch { /* */ } }}
              style={{ marginTop: 18, backgroundColor: '#4771AB', paddingVertical: 10, paddingHorizontal: 20, borderRadius: 999 }}>
              <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 13.5 }}>Şimdi yenile</Text>
            </Pressable>
          ) : null}
        </View>
      );
    }

    const e = this.state.error;
    const msg = e?.message || String(e);
    const stack = e?.stack || '';

    return (
      <View
        style={{
          flex: 1,
          backgroundColor: '#FEF2F2',
          paddingTop: 60,
          paddingHorizontal: 16,
          paddingBottom: 40,
        }}
      >
        <Text style={{ fontSize: 20, fontWeight: '700', color: '#991B1B', marginBottom: 12 }}>
          Uygulama Hatası
        </Text>
        <Text style={{ fontSize: 12, color: '#7F1D1D', marginBottom: 16 }}>
          Aşağıdaki hatayı yetkililere iletin.
        </Text>
        <ScrollView
          style={{
            flex: 1,
            backgroundColor: '#FFFFFF',
            borderRadius: 8,
            padding: 12,
            borderWidth: 1,
            borderColor: '#FCA5A5',
          }}
        >
          <Text style={{ fontSize: 13, fontWeight: '700', color: '#991B1B', marginBottom: 8 }}>
            {msg}
          </Text>
          {stack ? (
            <Text style={{ fontSize: 10, color: '#374151', fontFamily: Platform.select({ ios: 'Courier', default: 'monospace' }) }}>
              {stack}
            </Text>
          ) : null}
          {this.state.info ? (
            <>
              <Text style={{ fontSize: 11, fontWeight: '600', color: '#991B1B', marginTop: 12, marginBottom: 4 }}>
                Component stack:
              </Text>
              <Text style={{ fontSize: 10, color: '#374151', fontFamily: Platform.select({ ios: 'Courier', default: 'monospace' }) }}>
                {this.state.info}
              </Text>
            </>
          ) : null}
        </ScrollView>
        <Pressable
          onPress={this.reset}
          style={{
            backgroundColor: '#DC2626',
            paddingVertical: 12,
            borderRadius: 8,
            marginTop: 12,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: '#FFFFFF', fontWeight: '600' }}>Tekrar Dene</Text>
        </Pressable>
      </View>
    );
  }
}

// Global handler — async/promise/non-React errors yakalanır, console'a yazılır.
// Bu, ErrorBoundary'nin görmediği error'ları (örn. setTimeout içindeki throw)
// loglar. App crash etmez.
let globalHandlerInstalled = false;
export function installGlobalErrorHandler() {
  if (globalHandlerInstalled) return;
  globalHandlerInstalled = true;
  const g: any = global;
  if (g && typeof g.ErrorUtils?.setGlobalHandler === 'function') {
    const prev = g.ErrorUtils.getGlobalHandler ? g.ErrorUtils.getGlobalHandler() : null;
    g.ErrorUtils.setGlobalHandler((err: any, isFatal: boolean) => {
      // eslint-disable-next-line no-console
      console.error('[GlobalErrorHandler]', isFatal ? 'FATAL' : 'non-fatal', err?.message ?? err, err?.stack);
      reportError('global', err, { fatal: isFatal });
      // prev'i çağır (default RN behavior — production'da app yine de yaşar)
      if (prev) {
        try { prev(err, false); } catch { /* */ }
      }
    });
  }
  // Unhandled promise rejection
  if (typeof g.HermesInternal !== 'undefined' && g.process?.on) {
    try {
      g.process.on('unhandledRejection', (reason: any) => {
        // eslint-disable-next-line no-console
        console.error('[UnhandledRejection]', reason?.message ?? reason, reason?.stack);
        reportError('rejection', reason);
      });
    } catch { /* */ }
  }
  // Web: React ağacı dışında oluşan chunk-load hataları (async import, script
  // yükleme) — bunlar ErrorBoundary'ye düşmez. Bir kez otomatik reload et.
  if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    try {
      window.addEventListener('unhandledrejection', (ev: any) => {
        if (maybeReloadOnChunkError(ev?.reason)) return;   // chunk → reload, raporlama
        reportError('rejection', ev?.reason);
      });
      window.addEventListener('error', (ev: any) => {
        const err = ev?.error ?? ev?.message;
        if (maybeReloadOnChunkError(err)) return;
        reportError('global', err);
      });
    } catch { /* */ }
  }
}
