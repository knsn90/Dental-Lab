/**
 * Ön ekstre — arama + iş türü süzgeci (çok işli klinik, plan 4 Task 7).
 *
 * Süzme YALNIZ görünümdür: onay RPC'si sunucuda klinik+dönem başınadır, onay düğmeleri hep tam
 * listeyle çalışır. Süzme açıkken bunu söyleyen uyarı çıkar.
 */

import React, { useCallback, useDeferredValue, useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, Platform } from 'react-native';
import { Search, X, AlertTriangle } from '../../../core/ui/icons';
import { autoT } from '../../../core/i18n/autoTranslate';
import { useInkUI } from '../../../core/theme/inkScale';
import { filterPreStatement, workTypes } from '../../invoices/lib/preStatement';
import type { PreStatementInvoice } from '../../invoices/types';

export interface StatementView {
  text: string;
  setText: (v: string) => void;
  work: string | null;
  setWork: (v: string | null) => void;
  active: boolean;
  clear: () => void;
  /** Süzülmüş fatura listesi (kalemler süzülü, fatura toplamları aynen) */
  shown: PreStatementInvoice[];
  works: string[];
  /** Fatura açık mı: kullanıcı dokunmadıysa süzme açıkken açık, değilse kapalı */
  isOpen: (id: string) => boolean;
  toggle: (id: string) => void;
}

export function useStatementView(invoices: PreStatementInvoice[]): StatementView {
  const [text, setText] = useState('');
  const [work, setWork] = useState<string | null>(null);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const deferred = useDeferredValue(text);
  const works = useMemo(() => workTypes(invoices), [invoices]);
  // Seçili iş türü tazelenen veride kalmadıysa süzme "boş" sayılır.
  const workOk = work && works.includes(work) ? work : null;
  const shown = useMemo(() => filterPreStatement(invoices, { text: deferred, work: workOk }), [invoices, deferred, workOk]);
  const active = !!(deferred.trim() || workOk);
  const clear = useCallback(() => { setText(''); setWork(null); }, []);
  // touched[id] = kullanıcının varsayılanı çevirdiği fatura
  // Anahtar süzme durumunu içerir: süzme açılıp kapanınca varsayılana dönülür.
  const k = (id: string) => `${active ? 1 : 0}:${id}`;
  const isOpen = useCallback((id: string) => (touched[k(id)] ? !active : active), [touched, active]);
  const toggle = useCallback((id: string) => setTouched(t => ({ ...t, [k(id)]: !t[k(id)] })), [active]);
  return { text, setText, work: workOk, setWork, active, clear, shown, works, isOpen, toggle };
}

export function StatementFilterBar({ view }: { view: StatementView }) {
  const U = useInkUI();
  const { works, work, setWork, text, setText, active, clear } = view;
  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ flex: 1, minWidth: 0, justifyContent: 'center' }}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder={autoT('Hasta baş harfi veya sipariş no ara')}
            placeholderTextColor={U.ink[400]}
            autoCapitalize="none"
            autoCorrect={false}
            style={[U.inputStyle, { paddingLeft: 38, paddingRight: 38 }]}
          />
          <View pointerEvents="none" style={{ position: 'absolute', left: 13 }}>
            <Search size={16} color={U.ink[400]} strokeWidth={1.8} />
          </View>
          {text ? (
            <Pressable
              onPress={() => setText('')}
              accessibilityLabel={autoT('Süzmeyi temizle')}
              hitSlop={8}
              style={{ position: 'absolute', right: 12, ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}
            >
              <X size={16} color={U.ink[500]} strokeWidth={1.8} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {works.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, alignItems: 'center' }}>
          <Chip label={autoT('Tüm işler')} on={!work} onPress={() => setWork(null)} />
          {works.map(w => <Chip key={w} label={w} on={work === w} onPress={() => setWork(work === w ? null : w)} />)}
        </ScrollView>
      ) : null}

      {active ? (
        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap',
          paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14, backgroundColor: U.chipTones.warning.bg,
        }}>
          <AlertTriangle size={14} color={U.chipTones.warning.fg} strokeWidth={1.8} />
          <Text style={{ flex: 1, minWidth: 180, fontSize: 12.5, color: U.chipTones.warning.fg }}>
            {autoT('Süzülmüş görünüm — onay tüm faturayı kapsar')}
          </Text>
          <Pressable onPress={clear} hitSlop={6} style={Platform.OS === 'web' ? { cursor: 'pointer' } as any : undefined}>
            <Text style={{ fontSize: 12.5, fontWeight: '700', color: U.chipTones.warning.fg }}>{autoT('Süzmeyi temizle')}</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  const U = useInkUI();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      style={{
        paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999,
        backgroundColor: on ? U.ink[900] : U.chipNeutral,
        ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
      }}
    >
      <Text style={{ fontSize: 12, fontWeight: '600', color: on ? U.onDarkPill : U.ink[700] }} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

/** Süzme sonucu boşken liste yerine gösterilen satır. */
export function NoMatchLine({ view }: { view: StatementView }) {
  const U = useInkUI();
  return (
    <View style={{ ...U.cardSolid, alignItems: 'center', gap: 8 }}>
      <Text style={{ fontSize: 14, fontWeight: '600', color: U.ink[700] }}>{autoT('Eşleşen kalem yok')}</Text>
      <Pressable onPress={view.clear} hitSlop={6}>
        <Text style={{ fontSize: 12.5, fontWeight: '700', color: U.ink[900] }}>{autoT('Süzmeyi temizle')}</Text>
      </Pressable>
    </View>
  );
}
