/**
 * HubContext — bir ekran hub (tab container) içinde gömülü mü?
 *
 * Hub'lar bu context'i `true` ile sağlar.
 * Alt ekranlar useContext(HubContext) ile kontrol eder:
 *   - true  → SafeAreaView edges={['bottom']}  (hub top safe area'yı kendisi yönetir)
 *   - false → SafeAreaView edges={['top']}     (bağımsız sayfa, kendi top inset'ini alır)
 */
import React from 'react';

export const HubContext = React.createContext<boolean>(false);
