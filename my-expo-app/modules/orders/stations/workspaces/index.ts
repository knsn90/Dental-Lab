// modules/orders/stations/workspaces/index.ts
// İstasyon-spesifik workspace bileşen kayıt defteri.
// Kind → component map. Yeni workspace eklerken burayı genişlet.

import type { ComponentType } from 'react';
import type { StationKind } from '../registry';
import type { StageWorkspaceProps } from './types';
import { QcWorkspace } from './QcWorkspace';

export const STATION_WORKSPACES: Partial<Record<StationKind, ComponentType<StageWorkspaceProps>>> = {
  QC: QcWorkspace,
  // İleride: SCAN, CAD, MILLING, PORCELAIN ...
};

export function getStationWorkspace(kind: StationKind): ComponentType<StageWorkspaceProps> | null {
  return STATION_WORKSPACES[kind] ?? null;
}

export type { StageWorkspaceProps } from './types';
