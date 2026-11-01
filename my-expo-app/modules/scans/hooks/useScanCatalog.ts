// Tarama ekranlarının ortak kataloğu: lab saat dilimi, tarama ayarları, hizmetler, cihazlar,
// teknisyen havuzu ve klinikler. Bir kez yüklenir; reload() ayar değişince tazeler.
import { useCallback, useEffect, useState } from 'react';
import { useAuthStore } from '../../../core/store/authStore';
import { parseScanSettings, type ScanSettings } from '../scanModel';
import {
  fetchScanSettings, fetchScanServices, fetchScanDevices, fetchScanTechnicians, fetchScanPool,
  fetchScanClinics, fetchLabTz, type ScanClinicOption,
} from '../api';
import type { ScanServiceOption, ScanDeviceOption, ScanTechnicianOption } from '../types';

export interface ScanCatalog {
  ready: boolean;
  labId: string | null;
  tz: string;
  settings: ScanSettings;
  services: ScanServiceOption[];
  devices: ScanDeviceOption[];
  techs: ScanTechnicianOption[];
  clinics: ScanClinicOption[];
  reload: () => void;
}

export function useScanCatalog(): ScanCatalog {
  const labId = useAuthStore((s) => s.profile?.lab_id ?? null);
  const [tick, setTick] = useState(0);
  const [st, setSt] = useState<Omit<ScanCatalog, 'reload' | 'labId'>>({
    ready: false, tz: 'Europe/Istanbul', settings: parseScanSettings(null),
    services: [], devices: [], techs: [], clinics: [],
  });
  useEffect(() => {
    if (!labId) return;
    let alive = true;
    (async () => {
      const pool = await fetchScanPool(labId);
      const [tz, settings, services, devices, techs, clinics] = await Promise.all([
        fetchLabTz(labId), fetchScanSettings(labId), fetchScanServices(labId), fetchScanDevices(labId),
        fetchScanTechnicians(labId, pool), fetchScanClinics(labId),
      ]);
      if (alive) setSt({ ready: true, tz, settings, services, devices, techs, clinics });
    })();
    return () => { alive = false; };
  }, [labId, tick]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { ...st, labId, reload };
}
