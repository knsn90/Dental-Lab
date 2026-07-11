// RootErrorBoundary — JS render error olursa boş beyaz ekran yerine
// hatanın metnini gösterir. iOS 26.4 beta debug için kritik: native crash
// fix'inden sonra geride kalan JS error'larını teşhis etmek için.
//
// Aynı dosyada global ErrorUtils handler de set ediliyor (async/non-React
// errors için).

import React from 'react';
import { Platform, Pressable, ScrollView, Text, View } from 'react-native';

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
    // eslint-disable-next-line no-console
    console.error('[RootErrorBoundary] caught:', error, errorInfo);
    this.setState({ info: errorInfo?.componentStack || '' });
  }

  reset = () => this.setState({ hasError: false, error: null, info: '' });

  render() {
    if (!this.state.hasError) return this.props.children;

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
      });
    } catch { /* */ }
  }
}
