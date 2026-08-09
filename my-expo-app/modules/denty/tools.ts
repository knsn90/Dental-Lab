/**
 * Denty araçları.
 *
 *   SALT-OKUNUR (onaysız): goturBeni, siparisAra
 *   YAZMA (onay kartı zorunlu): siparisOlustur, destekTalebiAc, mesajGonder
 *
 * Araçlar client'ta çalışır → kullanıcının kendi oturumu + RLS + izinleri geçerli.
 * Yazma araçları yalnızca kullanıcı onay kartında "Onayla" dediğinde çalıştırılır
 * (akış api.ts'te yönetilir).
 */
import { useCallback, useMemo } from 'react';
import { useRouter } from 'expo-router';
import { supabase } from '../../core/api/supabase';
import { sanitizeIlikeTerm } from '../../core/util/search';
import { useAuthStore } from '../../core/store/authStore';
import { usePermissionStore } from '../../core/store/permissionStore';
import {
  createWorkOrder, addOrderItem,
  isOrderPrePlanning, updateOrderClient, updateOrderAdmin, cancelOrderClient,
  type ClientOrderEditFields, type ClientOrderEditItem,
} from '../orders/api';
import { createChangeRequest } from '../orders/changeRequests';
import { adminCompleteStage, assignTechnician } from '../orders/api';
import { sendMessage as chatSendMessage } from '../orders/chatApi';
import { createTicket } from '../support/api';
import { fetchClinicBalancesByCurrency, createInvoiceFromOrder } from '../invoices/api';
import { formatMoney, type Currency } from '../../core/money/currency';
import { DENTY_DESTINATIONS, type DentyContext, type PanelGroup } from './context';
import { useDentyStore } from './store/dentyStore';
import { getActiveViewer } from '../viewer-3d/viewerBridge';
// DİKKAT: `describeOcclusion`'ı STATİK import ETME.
// occlusion.ts `import * as THREE from 'three'` + `three-mesh-bvh` çekiyor.
// Bu dosya giriş paketinde olduğu için statik import three.js'i (~0,83 MB,
// giriş paketinin %10'u) herkese indirtiyordu — üstelik viewer-3d diğer tüm
// çağrı yerlerinde (Viewer3DLazy, dinamik import) doğru şekilde lazy'ydi;
// bu tek satır o çabayı boşa çıkarıyordu.
// Aşağıda çağrı anında dinamik yükleniyor; o an görüntüleyici zaten açık
// olduğu için three zaten belleğe gelmiş olur, ek gecikme yok.
import type { ActionCard, ToolDef, ToolKit } from './types';

/** Onay (kullanıcı kartı) gerektiren yazma araçları. */
export const WRITE_TOOLS = new Set([
  'siparisOlustur', 'siparisDuzenle', 'siparisIptal', 'destekTalebiAc', 'mesajGonder',
  // Lab/yönetici yazma araçları — hepsi onay kartından geçer
  'asamaIlerlet', 'teknisyenAta', 'faturaKes', 'notEkle',
]);

/**
 * Genel salt-okunur sorgu için izin verilen tablolar (whitelist).
 * RLS, kullanıcının yalnızca görebildiği satırları döndürür — Denty yetki aşamaz.
 */
type ReadTable = { desc: string; search?: string; panels?: PanelGroup[] };

const LAB_SIDE: PanelGroup[] = ['(lab)', '(admin)'];

const READ_TABLES: Record<string, ReadTable> = {
  work_orders:      { desc: 'Siparişler / iş emirleri', search: 'patient_name' },
  invoices:         { desc: 'Faturalar', search: 'invoice_number' },
  payments:         { desc: 'Ödemeler' },
  v_clinic_balance: { desc: 'Cari hesap / bakiye özeti' },
  clinics:          { desc: 'Klinikler', search: 'name' },
  doctors:          { desc: 'Hekimler', search: 'full_name' },
  support_tickets:  { desc: 'Destek talepleri', search: 'subject' },
  order_messages:   { desc: 'Sipariş sohbet mesajları' },
  notifications:    { desc: 'Bildirimler' },
  order_stages:     { desc: 'Sipariş üretim aşamaları' },
  // ── Yalnız lab/yönetici tarafı ──────────────────────────────────────────
  order_items:      { desc: 'Sipariş kalemleri (iş tipi, diş, fiyat)', panels: LAB_SIDE },
  stock_items:      { desc: 'Stok kalemleri (miktar, kritik seviye)', search: 'name', panels: LAB_SIDE },
  lab_stations:     { desc: 'Üretim istasyonları', search: 'name', panels: LAB_SIDE },
  provas:           { desc: 'Prova randevuları', panels: LAB_SIDE },
  order_reviews:    { desc: 'Sipariş değerlendirmeleri (puan)', panels: LAB_SIDE },
  expenses:         { desc: 'Giderler', panels: ['(admin)'] },
  employees:        { desc: 'Personel kayıtları', search: 'full_name', panels: ['(admin)'] },
  deliveries:       { desc: 'Teslimatlar / kurye görevleri', panels: ['(lab)', '(admin)', '(courier)'] },
};

/** Panelde okunabilir tablolar — RLS zaten satır bazında kısıtlar; bu liste
 *  modele "neyi sorabilirsin"i anlatır ve alakasız tabloyu görmesini engeller. */
export function readTablesFor(panel: PanelGroup | null): Record<string, ReadTable> {
  const out: Record<string, ReadTable> = {};
  for (const [name, meta] of Object.entries(READ_TABLES)) {
    if (!meta.panels || (panel && meta.panels.includes(panel))) out[name] = meta;
  }
  return out;
}

export function readTableCatalog(panel: PanelGroup | null): string {
  return Object.entries(readTablesFor(panel)).map(([t, m]) => `${t} (${m.desc})`).join(', ');
}

export const READ_TABLE_CATALOG = Object.entries(READ_TABLES)
  .map(([t, m]) => `${t} (${m.desc})`)
  .join(', ');

const SUPPORT_CATEGORIES = new Set([
  'teknik_sorun', 'stl_dosya', 'uretim_sureci', 'kargo_teslimat',
  'faturalama', 'entegrasyon', 'ozellik_egitim', 'yazilim_hatasi',
]);
const SUPPORT_PRIORITIES = new Set(['dusuk', 'normal', 'yuksek', 'kritik', 'acil_mudahale']);

/** İş kalemi (diş grubu + iş tipi + koşullu detay) JSON şeması — sipariş oluştur & düzenle ortak. */
const IS_KALEMI_ITEMS_SCHEMA = {
  type: 'array' as const,
  description:
    'Sipariş kalemleri. Her kalem bir grup diş + tek iş tipi + o işe özel detaylar. ' +
    'Farklı iş tipleri/renkler için AYRI kalem ekle. Detayları iş tipine göre KOŞULLU doldur.',
  items: {
    type: 'object' as const,
    properties: {
      dis_numaralari: { type: 'array', items: { type: 'number' }, description: 'Bu kaleme ait FDI diş no, örn. [11,21].' },
      is_tipi: { type: 'string', description: 'İş tipi. Tercih edilen: "Zirkonyum Kron", "Zirkonyum Köprü", "Metal Destekli Porselen Kron", "Tam Seramik Kron (e.max)", "İmplant Üstü Kron (Zirkonyum)", "İmplant Üstü Kron (Metal-Seramik)", "İnley / Onley", "Veneer", "Geçici Kron (3D Baskı)", "Cerrahi Şablon", "Hareketli Bölümlü Protez", "Tam Protez", "Gece Plağı", "Diğer".' },
      renk: { type: 'string', description: 'Vita renk kodu (kron/köprü/veneer için), örn. A2.' },
      implant_sistem: { type: 'string', description: 'İmplant markası: Straumann, Nobel, Osstem, Zimmer, Dentsply, Megagen, Diğer.' },
      implant_tur: { type: 'string', description: 'İmplant türü: Bone Level, Tissue Level, Mini, Diğer.' },
      abutment: { type: 'string', description: 'Abutment: Anatomik, Düz, Açılı (Angled), Ti-base, Zirkonyum.' },
      vida: { type: 'string', description: 'Vida: Multi-unit, Tekli, Hex.' },
      materyal: { type: 'string', description: 'Hareketli protez materyali: Akrilik, Krom-Kobalt, Flexible (Valplast), Diğer.' },
      fiyat: { type: 'number', description: 'Kalem fiyatı (opsiyonel).' },
    },
    required: ['dis_numaralari', 'is_tipi'],
  },
};

const TOOL_DEFS: ToolDef[] = [
  {
    name: 'goturBeni',
    description: 'Kullanıcıyı uygulama içinde ilgili ekrana yönlendirir. hedef, context\'te listelenen geçerli hedef anahtarlarından biri olmalıdır.',
    input_schema: {
      type: 'object',
      properties: { hedef: { type: 'string', description: 'Hedef anahtarı (örn. yeni_siparis, siparisler, mesajlar).' } },
      required: ['hedef'],
    },
  },
  {
    name: 'siparisAra',
    description: 'Kullanıcının görebildiği siparişlerde salt-okunur arama yapar (hasta adı / sipariş no). Veri DEĞİŞTİRMEZ.',
    input_schema: {
      type: 'object',
      properties: { sorgu: { type: 'string', description: 'Hasta adı, sipariş no veya boş (son siparişler).' } },
      required: [],
    },
  },
  {
    name: 'veriOku',
    description:
      'Uygulamanın izin verilen tablolarından salt-okunur veri çeker (RLS ile kullanıcının görebildiği kadar). Özel araçların (cariDurum, siparisAra, hekimAra) kapsamadığı her şey için bunu kullan. Veri DEĞİŞTİRMEZ.',
    input_schema: {
      type: 'object',
      properties: {
        tablo: { type: 'string', description: `Okunacak tablo. İzinli tablolar: ${READ_TABLE_CATALOG}.` },
        ara: { type: 'string', description: 'Metin araması (tablonun arama kolonunda, örn. hasta adı / fatura no).' },
        esit_kolon: { type: 'string', description: 'Eşitlik filtresi kolonu (örn. status).' },
        esit_deger: { type: 'string', description: 'Eşitlik filtresi değeri.' },
        limit: { type: 'number', description: 'Maks. satır (varsayılan 10, en çok 15).' },
      },
      required: ['tablo'],
    },
  },
  {
    name: 'cariDurum',
    description: 'Kliniğin cari hesap / bakiye durumunu (borç bakiye, toplam faturalanan, ödenen, vadesi geçen tutar) salt-okunur getirir. "cari hesap", "bakiye", "borcum ne kadar", "ödemem var mı" gibi sorularda kullan.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'hekimAra',
    description: 'Kliniğin hekimlerini listeler/arar. KLİNİK hesabında sipariş açmadan önce hekimi seçmek için kullan; her hekimin id\'si döner, onu siparisOlustur\'a hekim_id olarak ver. Salt-okunur.',
    input_schema: {
      type: 'object',
      properties: { sorgu: { type: 'string', description: 'Hekim adı (kısmi) veya boş (tüm hekimler).' } },
      required: [],
    },
  },
  {
    name: 'kapanisAnalizi',
    description: 'Açık 3D görüntüleyicide üst↔alt çene KAPANIŞ (oklüzyon) analizini çalıştırır: alt çeneye temas/boşluk ısı haritası boyar ve özet (temas %, en sıkı/ortalama mesafe mm) döner. Yalnız 3D görüntüleyici AÇIKKEN ve üst+alt çene taraması varken. Salt-okunur.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'taramaTeshis',
    description: 'Açık 3D görüntüleyicideki taramaların kalite teşhisini döner: üçgen sayısı, açık (delik) kenar, non-manifold kenar, ters normal oranı. "bu taramada sorun/delik var mı, mesh-repair gerekir mi" sorularında kullan. Yalnız 3D görüntüleyici açıkken. Salt-okunur.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'gunlukOzet',
    description:
      'Laboratuvarın GÜNLÜK DURUM ÖZETİ: gecikmiş sipariş, bugün teslim edilecek, planlama bekleyen, kritik stok ve faturası kesilmemiş teslimat sayıları + ilk birkaç örnek. "bugün ne var", "durum nedir", "özet geç" sorularında ilk bunu çağır. Salt-okunur.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'asamaDurumu',
    description:
      'Bir siparişin ÜRETİM AŞAMALARINI döner (sıra, aşama adı, durum, atanan teknisyen). "hangi aşamada", "kimin üzerinde", "nerede kaldı" sorularında kullan. Sipariş no verilmezse açık siparişi kullanır. Salt-okunur.',
    input_schema: {
      type: 'object',
      properties: {
        siparis_no: { type: 'string', description: 'Sipariş numarası (örn. LAB-2026-0118). Boşsa açık sipariş kullanılır.' },
      },
      required: [],
    },
  },
  {
    name: 'istasyonYuku',
    description:
      'İstasyon başına BEKLEYEN/DEVAM EDEN iş sayısını döner — hangi istasyonun tıkalı olduğunu gösterir. "istasyonlarda kaç iş var", "nerede birikme var" sorularında kullan. Salt-okunur.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'stokDurumu',
    description:
      'Kritik seviyenin altındaki stok kalemlerini döner (kalan miktar / minimum). "stok durumu", "neyimiz bitiyor" sorularında kullan. Salt-okunur.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'siparisOlustur',
    description:
      'Yeni bir iş emri (sipariş) oluşturur — yeni-sipariş formundaki TÜM alanları kapsar. Hekim hesabında hekim otomatik kendisidir; KLİNİK hesabında önce hekimAra ile hekimi bul ve hekim_id ver. ' +
      'Çağırmadan ÖNCE bilgileri sohbetle topla: hasta (ad-soyad + mümkünse cinsiyet, TC/pasaport, doğum tarihi, uyruk, telefon), diş+iş kalemleri, ölçüm yöntemi & model tipi, teslim tarihi & yöntemi. ' +
      'İş kalemi detayını AKILLI/KOŞULLU sor: kron/köprü/veneer → renk (Vita); implant işleri → implant_sistem/abutment/vida; hareketli protez → materyal. Gereksiz alanı sorma. ' +
      'Çağırınca onay kartı gösterilir; kullanıcı onaylarsa sipariş oluşur.',
    input_schema: {
      type: 'object',
      properties: {
        // ── Hasta ──
        hasta_adi: { type: 'string', description: 'Hasta ADI (ön ad).' },
        hasta_soyadi: { type: 'string', description: 'Hasta SOYADI.' },
        cinsiyet: { type: 'string', enum: ['erkek', 'kadın'], description: 'Hasta cinsiyeti.' },
        tc_pasaport: { type: 'string', description: 'TC kimlik veya pasaport numarası.' },
        dogum_tarihi: { type: 'string', description: 'Hasta doğum tarihi YYYY-AA-GG.' },
        uyruk: { type: 'string', description: 'Hasta uyruğu, örn. "Türkiye".' },
        ikamet_ulke: { type: 'string', description: 'İkamet ülkesi.' },
        ikamet_sehir: { type: 'string', description: 'İkamet şehri.' },
        telefon: { type: 'string', description: 'Hasta telefonu.' },
        // ── İş kalemleri (tercih edilen: diş bazlı, detaylı) ──
        is_kalemleri: {
          type: 'array',
          description:
            'Sipariş kalemleri. Her kalem bir grup diş + tek iş tipi + o işe özel detaylar. ' +
            'Farklı iş tipleri/renkler için AYRI kalem ekle. Detayları iş tipine göre KOŞULLU doldur.',
          items: {
            type: 'object',
            properties: {
              dis_numaralari: { type: 'array', items: { type: 'number' }, description: 'Bu kaleme ait FDI diş no, örn. [11,21].' },
              is_tipi: { type: 'string', description: 'İş tipi. Tercih edilen değerler: "Zirkonyum Kron", "Zirkonyum Köprü", "Metal Destekli Porselen Kron", "Tam Seramik Kron (e.max)", "İmplant Üstü Kron (Zirkonyum)", "İmplant Üstü Kron (Metal-Seramik)", "İnley / Onley", "Veneer", "Geçici Kron (3D Baskı)", "Cerrahi Şablon", "Hareketli Bölümlü Protez", "Tam Protez", "Gece Plağı", "Diğer".' },
              renk: { type: 'string', description: 'Vita renk kodu (kron/köprü/veneer için), örn. A2, B1, 2M2.' },
              implant_sistem: { type: 'string', description: 'İmplant işlerinde marka/sistem: Straumann, Nobel, Osstem, Zimmer, Dentsply, Megagen, Diğer.' },
              implant_tur: { type: 'string', description: 'İmplant türü: Bone Level, Tissue Level, Mini, Diğer.' },
              abutment: { type: 'string', description: 'Abutment: Anatomik, Düz, Açılı (Angled), Ti-base, Zirkonyum.' },
              vida: { type: 'string', description: 'Vida: Multi-unit, Tekli, Hex.' },
              materyal: { type: 'string', description: 'Hareketli protez materyali: Akrilik, Krom-Kobalt, Flexible (Valplast), Diğer.' },
              fiyat: { type: 'number', description: 'Kalem fiyatı (opsiyonel).' },
            },
            required: ['dis_numaralari', 'is_tipi'],
          },
        },
        // ── Basit alternatif (tek iş tipi) — is_kalemleri verilmezse ──
        dis_numaralari: { type: 'array', items: { type: 'number' }, description: 'BASİT kullanım (is_kalemleri yoksa): FDI diş no, örn. [11,12,21].' },
        is_tipi: { type: 'string', description: 'BASİT kullanım: tek iş tipi.' },
        renk: { type: 'string', description: 'BASİT kullanım: Vita renk kodu.' },
        makine_tipi: { type: 'string', enum: ['milling', '3d_printing'], description: 'Üretim tipi. "3D baskı/geçici" → 3d_printing; frezeleme/zirkon/metal → milling. Emin değilsen boş bırak (iş tipinden çıkarılır).' },
        // ── Vaka detayları ──
        olcum_yontemi: { type: 'string', enum: ['manual', 'digital'], description: 'Ölçüm yöntemi: manual (silikon/aljinat/fiziksel) veya digital (ağız içi tarama/STL).' },
        model_tipi: { type: 'string', description: 'Model tipi. Manuel için: silikon_olcu, aljinat_olcu, fiziksel_model, baski_3d_model, mevcut_protez_referansi, wax_up, hibrit_olcu_stl. Dijital için: dijital_tarama, stl_dosyasi, cad_dosyasi, baski_3d_model.' },
        teslim_tarihi: { type: 'string', description: 'Teslim tarihi YYYY-AA-GG. Normal işlerde en erken bugün+3 gün, acilde bugün+1.' },
        teslim_yontemi: { type: 'string', enum: ['kurye', 'kargo', 'elden'], description: 'Teslim yöntemi.' },
        acil: { type: 'boolean', description: 'Acil vaka mı?' },
        tasarim_onayi: { type: 'boolean', description: 'Üretim öncesi tasarım (dizayn) hekim onayı istensin mi?' },
        notlar: { type: 'string', description: 'Hekim/lab notu (serbest metin).' },
        hekim_id: { type: 'string', description: 'KLİNİK hesabında zorunlu: hekimAra\'dan gelen hekim id\'si.' },
        hekim_adi: { type: 'string', description: 'Alternatif: hekim adı (klinik hesabında, id yoksa).' },
      },
      required: ['teslim_tarihi'],
    },
  },
  {
    name: 'siparisDuzenle',
    description:
      'Mevcut bir siparişi düzenler. YALNIZCA değişen alanları ver (kısmi güncelleme). ' +
      'KAPI KURALI: sipariş henüz üretim PLANLAMASINA GİRMEDİYSE değişiklik DOĞRUDAN uygulanır; PLANLAMAYA GİRDİYSE bir "değişiklik talebi" oluşur ve LABORATUVAR ONAYINDAN sonra uygulanır. Bu kararı sistem verir. Çağırmadan ÖNCE siparişin durumunu kontrol et (veriOku work_orders → triaged_at doluysa planlama başlamış) ve kullanıcıya hangi yolun işleyeceğini kısaca söyle. ' +
      'HANGİ SİPARİŞ: bir sipariş açıksa onu düzenler; değilse siparis_no ver. ' +
      'İŞ KALEMLERİ: kalemleri değiştiriyorsan is_kalemleri içinde TÜM kalemleri (değişmeyenler dâhil) ver — kısmi verirsen diğer kalemler SİLİNİR. is_kalemleri vermezsen kalemlere hiç dokunulmaz. ' +
      'Çağırınca onay kartı çıkar; kullanıcı "Onayla" derse uygulanır.',
    input_schema: {
      type: 'object',
      properties: {
        siparis_no: { type: 'string', description: 'Düzenlenecek sipariş numarası. Açık sipariş varsa boş bırakılabilir.' },
        siparis_id: { type: 'string', description: 'Alternatif: sipariş UUID (siparisAra/veriOku sonucundan).' },
        // ── Hasta (değişecekse) ──
        hasta_ad_soyad: { type: 'string', description: 'Hasta TAM ad-soyad (düzeltilmiş hali). Kısmi değil, tam ad ver.' },
        cinsiyet: { type: 'string', enum: ['erkek', 'kadın'], description: 'Hasta cinsiyeti.' },
        tc_pasaport: { type: 'string', description: 'TC kimlik / pasaport no.' },
        dogum_tarihi: { type: 'string', description: 'Doğum tarihi YYYY-AA-GG.' },
        uyruk: { type: 'string', description: 'Uyruk.' },
        ikamet_ulke: { type: 'string', description: 'İkamet ülkesi.' },
        ikamet_sehir: { type: 'string', description: 'İkamet şehri.' },
        // ── İş (değişecekse) ──
        is_kalemleri: IS_KALEMI_ITEMS_SCHEMA,
        renk: { type: 'string', description: 'Genel Vita renk kodu (is_kalemleri vermeyeceksen).' },
        model_tipi: { type: 'string', description: 'Model tipi.' },
        teslim_tarihi: { type: 'string', description: 'Teslim tarihi YYYY-AA-GG.' },
        teslim_yontemi: { type: 'string', enum: ['kurye', 'kargo', 'elden'], description: 'Teslim yöntemi.' },
        acil: { type: 'boolean', description: 'Acil mi?' },
        notlar: { type: 'string', description: 'Hekim/lab notu.' },
        degisiklik_notu: { type: 'string', description: 'Planlama SONRASI değişiklik talebinde lab için açıklama (opsiyonel).' },
      },
      required: [],
    },
  },
  {
    name: 'siparisIptal',
    description:
      'Bir siparişi iptal eder. YALNIZCA üretim PLANLAMASINA GİRMEMİŞ siparişler iptal edilebilir (klinik/hekim). Planlamaya girmişse iptal EDİLEMEZ — bunun yerine değişiklik talebi (siparisDuzenle) ya da lab ile mesajlaşmayı öner. Açık sipariş varsa onu, yoksa siparis_no verilen siparişi iptal eder. Çağırınca onay kartı çıkar.',
    input_schema: {
      type: 'object',
      properties: {
        siparis_no: { type: 'string', description: 'İptal edilecek sipariş numarası. Açık sipariş varsa boş bırakılabilir.' },
        siparis_id: { type: 'string', description: 'Alternatif: sipariş UUID.' },
      },
      required: [],
    },
  },
  {
    name: 'asamaIlerlet',
    description:
      'Bir siparişin AKTİF üretim aşamasını tamamlar ve sıradaki aşamayı başlatır (admin_complete_stage). Yalnız lab yöneticisi/admin. Aşama belirtilmezse aktif aşama kullanılır. YAZMA — onay kartı çıkar.',
    input_schema: {
      type: 'object',
      properties: {
        siparis_no: { type: 'string', description: 'Sipariş numarası. Boşsa açık sipariş kullanılır.' },
        asama_adi:  { type: 'string', description: 'Belirli bir aşamayı tamamlamak için aşama adı (opsiyonel).' },
      },
      required: [],
    },
  },
  {
    name: 'teknisyenAta',
    description:
      'Siparişi bir teknisyene atar (work_orders.assigned_to). Teknisyen adı kısmi verilebilir; birden çok eşleşirse liste döner ve işlem yapılmaz. YAZMA — onay kartı çıkar.',
    input_schema: {
      type: 'object',
      properties: {
        siparis_no:   { type: 'string', description: 'Sipariş numarası. Boşsa açık sipariş kullanılır.' },
        teknisyen_adi:{ type: 'string', description: 'Teknisyen adı (kısmi olabilir).' },
      },
      required: ['teknisyen_adi'],
    },
  },
  {
    name: 'faturaKes',
    description:
      'Teslim edilmiş bir siparişten fatura oluşturur (create_invoice_from_order). Sipariş teslim edilmemişse veya faturası zaten varsa uyarı döner. YAZMA — onay kartı çıkar.',
    input_schema: {
      type: 'object',
      properties: { siparis_no: { type: 'string', description: 'Sipariş numarası. Boşsa açık sipariş kullanılır.' } },
      required: [],
    },
  },
  {
    name: 'notEkle',
    description:
      'Siparişe LAB İÇİ not ekler (work_orders.lab_notes sonuna tarihli satır olarak eklenir; mevcut not silinmez). Hekime görünmez. YAZMA — onay kartı çıkar.',
    input_schema: {
      type: 'object',
      properties: {
        siparis_no: { type: 'string', description: 'Sipariş numarası. Boşsa açık sipariş kullanılır.' },
        not:        { type: 'string', description: 'Eklenecek not metni.' },
      },
      required: ['not'],
    },
  },
  {
    name: 'destekTalebiAc',
    description: 'Üretim/destek ekibine bir destek talebi açar. Çağırınca kullanıcıya onay kartı gösterilir.',
    input_schema: {
      type: 'object',
      properties: {
        baslik: { type: 'string', description: 'Kısa başlık.' },
        kategori: { type: 'string', enum: Array.from(SUPPORT_CATEGORIES) as string[], description: 'Talep kategorisi.' },
        oncelik: { type: 'string', enum: Array.from(SUPPORT_PRIORITIES) as string[], description: 'Öncelik (varsayılan normal).' },
        aciklama: { type: 'string', description: 'Sorunun adım adım açıklaması.' },
      },
      required: ['baslik', 'aciklama'],
    },
  },
  {
    name: 'mesajGonder',
    description: 'Açık olan siparişin sohbetine kullanıcı adına mesaj gönderir. Yalnızca bir sipariş açıkken kullanılabilir. Çağırınca onay kartı gösterilir.',
    input_schema: {
      type: 'object',
      properties: { mesaj: { type: 'string', description: 'Gönderilecek mesaj metni.' } },
      required: ['mesaj'],
    },
  },
];

/** Bir sipariş iş kalemi (diş grubu + iş tipi + koşullu detay). */
export interface DentyOrderItem {
  dis_numaralari: number[];
  is_tipi: string;
  renk?: string;
  implant_sistem?: string;
  implant_tur?: string;
  abutment?: string;
  vida?: string;
  materyal?: string;
  fiyat?: number;
}

/**
 * siparisOlustur girdisini tek tip iş-kalemi listesine indirger.
 * Tercih: input.is_kalemleri (detaylı). Yoksa basit alanlardan (dis_numaralari+is_tipi+renk)
 * tek kalem üretir. Diş numaralarını sayıya çevirip geçersizleri eler.
 */
export function normalizeOrderItems(input: any): DentyOrderItem[] {
  const cleanTeeth = (arr: any): number[] =>
    (Array.isArray(arr) ? arr : []).map(Number).filter((n: number) => Number.isFinite(n));

  const raw: any[] = Array.isArray(input?.is_kalemleri) && input.is_kalemleri.length
    ? input.is_kalemleri
    : (input?.is_tipi || Array.isArray(input?.dis_numaralari)
        ? [{ dis_numaralari: input?.dis_numaralari, is_tipi: input?.is_tipi, renk: input?.renk }]
        : []);

  return raw
    .map((it): DentyOrderItem => ({
      dis_numaralari: cleanTeeth(it?.dis_numaralari),
      is_tipi: String(it?.is_tipi ?? '').trim(),
      renk: it?.renk ? String(it.renk).trim() : undefined,
      implant_sistem: it?.implant_sistem ? String(it.implant_sistem).trim() : undefined,
      implant_tur: it?.implant_tur ? String(it.implant_tur).trim() : undefined,
      abutment: it?.abutment ? String(it.abutment).trim() : undefined,
      vida: it?.vida ? String(it.vida).trim() : undefined,
      materyal: it?.materyal ? String(it.materyal).trim() : undefined,
      fiyat: Number.isFinite(Number(it?.fiyat)) ? Number(it.fiyat) : undefined,
    }))
    .filter((it) => it.dis_numaralari.length > 0 && it.is_tipi.length > 0);
}

/**
 * İş kalemlerini order_items yüküne indirger (formdaki gruplama ile birebir):
 * aynı (iş tipi + renk + materyal + implant detayları) tek kalem, adet = diş sayısı,
 * detaylar notes'a (Marka/Tür/Abutment/Vida/Materyal/Renk) yazılır.
 */
function groupItemsForPayload(items: DentyOrderItem[]): ClientOrderEditItem[] {
  const groupMap = new Map<string, { rep: DentyOrderItem; teeth: number[]; count: number; price: number }>();
  for (const it of items) {
    const key = [it.is_tipi, it.renk, it.materyal, it.implant_sistem, it.implant_tur, it.abutment, it.vida].join('||');
    if (!groupMap.has(key)) groupMap.set(key, { rep: it, teeth: [], count: 0, price: it.fiyat || 0 });
    const g = groupMap.get(key)!;
    g.teeth.push(...it.dis_numaralari);
    g.count += it.dis_numaralari.length;
  }
  const out: ClientOrderEditItem[] = [];
  for (const g of groupMap.values()) {
    const noteParts: string[] = [];
    if (g.rep.implant_sistem) noteParts.push(`Marka: ${g.rep.implant_sistem}`);
    if (g.rep.implant_tur)   noteParts.push(`Tür: ${g.rep.implant_tur}`);
    if (g.rep.abutment)      noteParts.push(`Abutment: ${g.rep.abutment}`);
    if (g.rep.vida)          noteParts.push(`Vida: ${g.rep.vida}`);
    if (g.rep.materyal)      noteParts.push(`Materyal: ${g.rep.materyal}`);
    if (g.rep.renk)          noteParts.push(`Renk: ${g.rep.renk}`);
    out.push({
      name: g.rep.is_tipi,
      price: g.price,
      quantity: g.count,
      tooth_numbers: Array.from(new Set(g.teeth)).sort((a, b) => a - b),
      notes: noteParts.length ? noteParts.join(' · ') : undefined,
    });
  }
  return out;
}

/** siparisDuzenle girdisinden ClientOrderEditFields üretir — YALNIZ verilen alanlar. */
function buildEditFields(input: any, items: DentyOrderItem[] | null): ClientOrderEditFields {
  const f: ClientOrderEditFields = {};
  const str = (v: any) => (v != null && String(v).trim() ? String(v).trim() : null);
  if (str(input?.hasta_ad_soyad)) f.patient_name = titleCaseTr(String(input.hasta_ad_soyad));
  if (input?.cinsiyet === 'erkek' || input?.cinsiyet === 'kadın') f.patient_gender = input.cinsiyet;
  if (str(input?.tc_pasaport)) f.patient_id = str(input.tc_pasaport);
  if (str(input?.dogum_tarihi)) f.patient_dob = str(input.dogum_tarihi);
  if (str(input?.uyruk)) f.patient_nationality = str(input.uyruk);
  if (str(input?.ikamet_ulke)) f.patient_country = str(input.ikamet_ulke);
  if (str(input?.ikamet_sehir)) f.patient_city = str(input.ikamet_sehir);
  if (str(input?.renk)) f.shade = str(input.renk);
  if (str(input?.model_tipi)) f.model_type = str(input.model_tipi);
  if (['kurye', 'kargo', 'elden'].includes(input?.teslim_yontemi)) f.delivery_method = input.teslim_yontemi;
  if (str(input?.teslim_tarihi)) f.delivery_date = str(input.teslim_tarihi);
  if (typeof input?.acil === 'boolean') f.is_urgent = input.acil;
  if (input?.notlar != null) f.notes = String(input.notlar);
  if (items && items.length) {
    f.work_type = Array.from(new Set(items.map((it) => it.is_tipi))).join(', ');
    f.tooth_numbers = Array.from(new Set(items.flatMap((it) => it.dis_numaralari))).sort((a, b) => a - b);
    if (f.shade == null) {
      const firstShade = items.find((it) => it.renk)?.renk;
      if (firstShade) f.shade = firstShade;
    }
  }
  return f;
}

/** Türkçe basit başlık düzeni (ad/soyad). */
function titleCaseTr(s: string): string {
  return s
    .trim()
    .split(/\s+/)
    .map((w) => (w ? w.charAt(0).toLocaleUpperCase('tr-TR') + w.slice(1).toLocaleLowerCase('tr-TR') : w))
    .join(' ');
}

/** Onay kartı içeriğini üretir (saf fonksiyon — UI'da gösterilir). */
/** Lab yöneticisi mi? Yazma araçları için istemci tarafı ön kontrol —
 *  asıl yetki RPC'lerin içinde (_assert_stage_manager / is_lab_user) zorlanır. */
function isLabManager(ctx: DentyContext): boolean {
  if (ctx.userType === 'admin') return true;
  return ctx.userType === 'lab' && (ctx.role === 'manager' || ctx.role === 'admin');
}

export function describeAction(name: string, input: any): ActionCard {
  if (name === 'siparisOlustur') {
    const rows: { label: string; value: string }[] = [];
    const fullName = [input?.hasta_adi, input?.hasta_soyadi].filter(Boolean).join(' ').trim();
    if (fullName) rows.push({ label: 'Hasta', value: fullName });
    if (input?.cinsiyet) rows.push({ label: 'Cinsiyet', value: input.cinsiyet === 'kadın' ? 'Kadın' : 'Erkek' });
    if (input?.tc_pasaport) rows.push({ label: 'TC/Pasaport', value: String(input.tc_pasaport) });
    if (input?.dogum_tarihi) rows.push({ label: 'Doğum tarihi', value: String(input.dogum_tarihi) });
    if (input?.uyruk) rows.push({ label: 'Uyruk', value: String(input.uyruk) });
    if (input?.telefon) rows.push({ label: 'Telefon', value: String(input.telefon) });

    // İş kalemleri — detaylı liste (is_kalemleri) veya basit alan
    const items = normalizeOrderItems(input);
    if (items.length) {
      items.forEach((it, i) => {
        const label = items.length > 1 ? `Kalem ${i + 1}` : 'İş';
        const detail = [
          it.dis_numaralari.join(', '),
          it.is_tipi,
          it.renk ? `renk ${it.renk}` : '',
          it.implant_sistem ? `sistem ${it.implant_sistem}` : '',
          it.abutment ? `abutment ${it.abutment}` : '',
          it.vida ? `vida ${it.vida}` : '',
          it.materyal ? `materyal ${it.materyal}` : '',
        ].filter(Boolean).join(' · ');
        rows.push({ label, value: detail });
      });
    }

    rows.push({ label: 'Üretim', value: input?.makine_tipi === '3d_printing' ? '3D baskı' : 'Frezeleme' });
    if (input?.olcum_yontemi) rows.push({ label: 'Ölçüm', value: input.olcum_yontemi === 'digital' ? 'Dijital' : 'Manuel' });
    if (input?.model_tipi) rows.push({ label: 'Model', value: String(input.model_tipi) });
    if (input?.teslim_tarihi) rows.push({ label: 'Teslim', value: String(input.teslim_tarihi) });
    if (input?.teslim_yontemi) rows.push({ label: 'Teslim şekli', value: String(input.teslim_yontemi) });
    if (input?.acil) rows.push({ label: 'Aciliyet', value: 'Acil' });
    if (input?.tasarim_onayi) rows.push({ label: 'Tasarım onayı', value: 'İstensin' });
    if (input?.notlar) rows.push({ label: 'Not', value: String(input.notlar) });
    return { toolName: name, title: 'Yeni sipariş oluştur', rows };
  }
  // ── Lab/yönetici yazma araçları ──────────────────────────────────────────
  if (name === 'asamaIlerlet' || name === 'teknisyenAta' || name === 'faturaKes' || name === 'notEkle') {
    const ref = input?.siparis_no ? `#${String(input.siparis_no).replace(/^#/, '')}` : 'Açık sipariş';
    const rows: { label: string; value: string }[] = [{ label: 'Sipariş', value: ref }];
    if (name === 'asamaIlerlet') {
      rows.push({ label: 'Aşama', value: input?.asama_adi ? String(input.asama_adi) : 'Aktif aşama' });
      rows.push({ label: 'Sonuç', value: 'Tamamlanır, sıradaki aşama başlar' });
      return { toolName: name, title: 'Aşamayı ilerlet', rows };
    }
    if (name === 'teknisyenAta') {
      rows.push({ label: 'Teknisyen', value: String(input?.teknisyen_adi ?? '-') });
      return { toolName: name, title: 'Teknisyen ata', rows };
    }
    if (name === 'faturaKes') {
      rows.push({ label: 'İşlem', value: 'Teslim edilmiş siparişten fatura oluşturulur' });
      return { toolName: name, title: 'Fatura kes', rows };
    }
    rows.push({ label: 'Not', value: String(input?.not ?? '-') });
    rows.push({ label: 'Görünürlük', value: 'Yalnız lab içi' });
    return { toolName: name, title: 'Lab notu ekle', rows };
  }

  if (name === 'siparisDuzenle' || name === 'siparisIptal') {
    const ref = input?.siparis_no
      ? `#${String(input.siparis_no).replace(/^#/, '')}`
      : input?.siparis_id ? String(input.siparis_id).slice(0, 8) : 'Açık sipariş';
    if (name === 'siparisIptal') {
      return { toolName: name, title: 'Siparişi iptal et', rows: [{ label: 'Sipariş', value: ref }] };
    }
    const rows: { label: string; value: string }[] = [{ label: 'Sipariş', value: ref }];
    if (input?.hasta_ad_soyad) rows.push({ label: 'Hasta', value: String(input.hasta_ad_soyad) });
    if (input?.cinsiyet) rows.push({ label: 'Cinsiyet', value: input.cinsiyet === 'kadın' ? 'Kadın' : 'Erkek' });
    if (input?.tc_pasaport) rows.push({ label: 'TC/Pasaport', value: String(input.tc_pasaport) });
    if (input?.dogum_tarihi) rows.push({ label: 'Doğum tarihi', value: String(input.dogum_tarihi) });
    if (input?.uyruk) rows.push({ label: 'Uyruk', value: String(input.uyruk) });
    if (input?.ikamet_sehir) rows.push({ label: 'Şehir', value: String(input.ikamet_sehir) });
    const editItems = Array.isArray(input?.is_kalemleri) && input.is_kalemleri.length ? normalizeOrderItems(input) : [];
    editItems.forEach((it, i) => {
      const label = editItems.length > 1 ? `Kalem ${i + 1}` : 'İş kalemi';
      const detail = [
        it.dis_numaralari.join(', '), it.is_tipi,
        it.renk ? `renk ${it.renk}` : '',
        it.implant_sistem ? `sistem ${it.implant_sistem}` : '',
        it.materyal ? `materyal ${it.materyal}` : '',
      ].filter(Boolean).join(' · ');
      rows.push({ label, value: detail });
    });
    if (!editItems.length && input?.renk) rows.push({ label: 'Renk', value: String(input.renk) });
    if (input?.model_tipi) rows.push({ label: 'Model', value: String(input.model_tipi) });
    if (input?.teslim_tarihi) rows.push({ label: 'Teslim', value: String(input.teslim_tarihi) });
    if (input?.teslim_yontemi) rows.push({ label: 'Teslim şekli', value: String(input.teslim_yontemi) });
    if (typeof input?.acil === 'boolean') rows.push({ label: 'Aciliyet', value: input.acil ? 'Acil' : 'Normal' });
    if (input?.notlar) rows.push({ label: 'Not', value: String(input.notlar) });
    if (input?.degisiklik_notu) rows.push({ label: 'Değişiklik notu', value: String(input.degisiklik_notu) });
    return { toolName: name, title: 'Siparişi düzenle', rows };
  }
  if (name === 'destekTalebiAc') {
    const rows = [
      { label: 'Başlık', value: String(input?.baslik ?? '') },
      { label: 'Kategori', value: String(input?.kategori ?? 'teknik_sorun') },
      { label: 'Öncelik', value: String(input?.oncelik ?? 'normal') },
      { label: 'Açıklama', value: String(input?.aciklama ?? '') },
    ];
    return { toolName: name, title: 'Destek talebi aç', rows };
  }
  if (name === 'mesajGonder') {
    return { toolName: name, title: 'Mesaj gönder', rows: [{ label: 'Mesaj', value: String(input?.mesaj ?? '') }] };
  }
  return { toolName: name, title: 'İşlemi onayla', rows: [] };
}

/** work_orders.doctor_id FK -> doctors tablosu. Hekim profilinden doctors id çözer. */
async function resolveDoctorId(profileId: string): Promise<string> {
  const { data: existing } = await supabase.from('doctors').select('id').eq('id', profileId).maybeSingle();
  if ((existing as any)?.id) return (existing as any).id;

  const { data: prof } = await supabase
    .from('profiles')
    .select('id, full_name, phone, specialty, clinic_id')
    .eq('id', profileId)
    .maybeSingle();
  const p = prof as any;
  if (p?.full_name) {
    let q = supabase.from('doctors').select('id').ilike('full_name', p.full_name).limit(1);
    if (p.clinic_id) q = q.eq('clinic_id', p.clinic_id);
    const { data: match } = await q.maybeSingle();
    if ((match as any)?.id) return (match as any).id;

    const { data: created, error } = await supabase
      .from('doctors')
      .insert({ clinic_id: p.clinic_id ?? null, full_name: p.full_name, phone: p.phone ?? null, specialty: p.specialty ?? null, is_active: true })
      .select('id')
      .single();
    if (!error && (created as any)?.id) return (created as any).id;
    throw new Error(`Hekim kaydı çözülemedi${error ? ': ' + error.message : ''}`);
  }
  return profileId;
}

/**
 * Düzenlenecek/iptal edilecek siparişi çözer. Öncelik: siparis_id > siparis_no > açık sipariş.
 * RLS gereği yalnız kullanıcının görebildiği siparişler döner. Çok/eşleşmez durumları raporlar.
 */
async function resolveOrderRef(
  input: any,
  ctxOrderId: string | null,
): Promise<{ row: any } | { error: string }> {
  const id = String(input?.siparis_id ?? '').trim();
  const no = String(input?.siparis_no ?? '').replace(/^#/, '').trim();
  let q = supabase.from('work_orders').select('id, order_number, patient_name, status, triaged_at').limit(2);
  if (id) q = q.eq('id', id);
  else if (no) q = q.eq('order_number', no);
  else if (ctxOrderId) q = q.eq('id', ctxOrderId);
  else return { error: 'Hangi siparişi kastettiğini bilmiyorum — sipariş numarasını ver ya da önce siparişi aç.' };
  const { data, error } = await q;
  if (error) return { error: 'Sipariş bulunamadı: ' + error.message };
  if (!data || data.length === 0) return { error: 'Sipariş bulunamadı (yetkin dışında olabilir). Sipariş numarasını kontrol et.' };
  if (data.length > 1) return { error: 'Birden çok sipariş eşleşti — lütfen tam sipariş numarası ile netleştir.' };
  return { row: data[0] };
}


/**
 * Araç meta'sı — hangi panelde geçerli, hangi izni ister.
 * `panels` yoksa her panelde geçerlidir. Model YALNIZ geçerli araçları görür:
 * böylece klinik kullanıcıya lab aracı, teknisyene fatura aracı önerilmez ve
 * prompt boşuna şişmez. (Anthropic tool şemasına ek alan gönderilmez — bu tablo
 * yalnız istemci tarafında filtreleme içindir.)
 */
const TOOL_META: Record<string, { panels?: PanelGroup[]; requires?: 'orders' | 'support' | 'messages' }> = {
  // Her panelde
  goturBeni:      {},
  siparisAra:     {},
  veriOku:        {},
  kapanisAnalizi: {},
  taramaTeshis:   {},
  // Klinik tarafı
  cariDurum:      { panels: ['(clinic)', '(doctor)'] },
  hekimAra:       { panels: ['(clinic)', '(doctor)'] },
  siparisOlustur: { panels: ['(clinic)', '(doctor)', '(admin)', '(lab)'] },
  siparisDuzenle: { panels: ['(clinic)', '(doctor)', '(admin)', '(lab)'] },
  siparisIptal:   { panels: ['(clinic)', '(doctor)'] },
  // Lab / yönetici
  gunlukOzet:     { panels: ['(lab)', '(admin)'] },
  asamaDurumu:    { panels: ['(lab)', '(admin)', '(station)'] },
  istasyonYuku:   { panels: ['(lab)', '(admin)'] },
  stokDurumu:     { panels: ['(lab)', '(admin)'] },
  asamaIlerlet:   { panels: ['(lab)', '(admin)'] },
  teknisyenAta:   { panels: ['(lab)', '(admin)'] },
  faturaKes:      { panels: ['(lab)', '(admin)'] },
  notEkle:        { panels: ['(lab)', '(admin)'] },
  // İzin gerektirenler
  destekTalebiAc: { requires: 'support' },
  mesajGonder:    { requires: 'messages' },
};

/** Panele + izne göre modele tanıtılacak araçlar. */
export function toolDefsFor(ctx: DentyContext): ToolDef[] {
  return TOOL_DEFS.filter((d) => {
    const meta = TOOL_META[d.name];
    if (!meta) return true;
    if (meta.panels && (!ctx.panel || !meta.panels.includes(ctx.panel))) return false;
    if (meta.requires && !ctx.perms[meta.requires]) return false;
    return true;
  }).map((d) =>
    // veriOku'nun tablo listesi panele göre daralır
    d.name === 'veriOku'
      ? { ...d, input_schema: { ...d.input_schema, properties: { ...d.input_schema.properties,
          tablo: { ...d.input_schema.properties.tablo, description: `Okunacak tablo. İzinli tablolar: ${readTableCatalog(ctx.panel)}.` } } } }
      : d,
  );
}

export function useDentyToolkit(ctx: DentyContext): ToolKit {
  const router = useRouter();
  const profile = useAuthStore((s) => s.profile);
  const can = usePermissionStore((s) => s.can);

  // ── Salt-okunur ──────────────────────────────────────────────────────────
  const navigate = useCallback((hedef: string): string => {
    const dest = DENTY_DESTINATIONS[hedef];
    if (!dest) return `Bilinmeyen hedef: "${hedef}".`;
    if (!ctx.panel || !dest.panels.includes(ctx.panel)) return `"${dest.label}" bu panelde mevcut değil.`;
    const path = dest.path ? `/${ctx.panel}/${dest.path}` : `/${ctx.panel}`;
    try { router.push(path as any); return `Kullanıcı "${dest.label}" ekranına yönlendirildi.`; }
    catch (e: any) { return `Yönlendirme başarısız: ${e?.message ?? 'hata'}`; }
  }, [router, ctx.panel]);

  const search = useCallback(async (sorgu?: string): Promise<string> => {
    try {
      let q = supabase
        .from('work_orders')
        .select('id, order_number, patient_name, status, delivery_date, work_type')
        .order('created_at', { ascending: false })
        .limit(8);
      const term = sanitizeIlikeTerm(sorgu ?? ''); // .or() gramerini bozan , ( ) temizlenir
      if (term) q = q.or(`patient_name.ilike.%${term}%,order_number.ilike.%${term}%`);
      const { data, error } = await q;
      if (error) return `Arama yapılamadı: ${error.message}`;
      if (!data || data.length === 0) return 'Eşleşen sipariş bulunamadı.';
      return 'Bulunan siparişler:\n' + data
        .map((o: any) => `• #${o.order_number ?? o.id?.slice(0, 8)} — ${o.patient_name ?? 'isimsiz'} · ${o.work_type ?? '-'} · durum: ${o.status ?? '-'} · teslim: ${o.delivery_date ?? '-'}`)
        .join('\n');
    } catch (e: any) { return `Arama hatası: ${e?.message ?? String(e)}`; }
  }, []);

  // ── Salt-okunur: genel veri okuma (whitelist + RLS) ──────────────────────
  const readData = useCallback(async (input: any): Promise<string> => {
    const table = String(input?.tablo ?? '').trim();
    const allowed = readTablesFor(ctx.panel);
    const meta = allowed[table];
    if (!meta) return `"${table}" bu panelde okunamıyor. İzinli tablolar: ${Object.keys(allowed).join(', ')}.`;
    const limit = Math.min(Math.max(Number(input?.limit) || 10, 1), 15);
    let q = supabase.from(table).select('*').limit(limit);
    if (input?.esit_kolon && input?.esit_deger !== undefined && input?.esit_deger !== '') {
      q = q.eq(String(input.esit_kolon), input.esit_deger);
    }
    const ara = String(input?.ara ?? '').trim();
    if (ara && meta.search) q = q.ilike(meta.search, `%${ara}%`);
    const { data, error } = await q;
    if (error) return `Sorgu hatası (${table}): ${error.message}`;
    if (!data || data.length === 0) return `${table}: kayıt bulunamadı.`;
    const rows = data.map((r: any) => {
      const o: any = {};
      for (const k of Object.keys(r)) {
        let v = r[k];
        if (v == null || typeof v === 'object') continue;
        if (typeof v === 'string' && v.length > 80) v = v.slice(0, 80) + '…';
        o[k] = v;
      }
      return JSON.stringify(o);
    });
    return `${table} (${rows.length} kayıt):\n${rows.join('\n')}`;
  }, []);

  // ── Salt-okunur: cari hesap / bakiye durumu ──────────────────────────────
  const accountBalance = useCallback(async (): Promise<string> => {
    const clinicId = (profile as any)?.clinic_id ?? null;
    if (!clinicId) return 'Bu hesaba bağlı bir klinik/cari bulunamadı.';
    // Katı per-currency: her (klinik, para birimi) için ayrı satır, orijinal tutarda.
    // Baz-₺'ye çevrilmiş v_clinic_balance KULLANMA — yabancı para kliniklerde yanlış tutar+sembol verir.
    const { data, error } = await fetchClinicBalancesByCurrency();
    if (error) return `Cari durum alınamadı: ${(error as any)?.message ?? ''}`;
    const rows = (data ?? []).filter((r: any) => r.clinic_id === clinicId);
    if (rows.length === 0) return 'Henüz cari hareket görünmüyor (fatura/ödeme bulunamadı).';
    const fmt = (n: number, ccy: string) => formatMoney(Number(n ?? 0), (ccy as Currency) ?? 'TRY');
    const clinicName = (rows[0] as any).clinic_name ?? '';
    const multi = rows.length > 1;
    const out: string[] = [`Cari hesap — ${clinicName}`.trim()];
    for (const r of rows as any[]) {
      const ccy = r.currency ?? 'TRY';
      if (multi) out.push('', `— ${ccy} —`);
      out.push(
        `• Bakiye (borç): ${fmt(r.balance, ccy)}`,
        `• Toplam faturalanan: ${fmt(r.total_billed, ccy)}`,
        `• Ödenen: ${fmt(r.total_paid, ccy)}`,
        `• Vadesi geçen: ${fmt(r.overdue_amount, ccy)}${r.oldest_overdue_date ? ` (en eski vade: ${r.oldest_overdue_date})` : ''}`,
        `• Fatura sayısı: ${r.invoice_count ?? 0}`,
      );
    }
    return out.join('\n');
  }, [profile]);

  // ── Salt-okunur: hekim arama (klinik siparişinde hekim seçimi) ───────────
  const searchDoctors = useCallback(async (sorgu?: string): Promise<string> => {
    const clinicId = (profile as any)?.clinic_id ?? null;
    let q = supabase.from('doctors').select('id, full_name').eq('is_active', true).order('full_name').limit(10);
    if (clinicId) q = q.eq('clinic_id', clinicId);
    const term = (sorgu ?? '').trim();
    if (term) q = q.ilike('full_name', `%${term}%`);
    const { data, error } = await q;
    if (error) return `Hekim listesi alınamadı: ${error.message}`;
    if (!data || data.length === 0) return 'Hekim bulunamadı.';
    return 'Hekimler:\n' + data.map((d: any) => `• ${d.full_name} (id: ${d.id})`).join('\n');
  }, [profile]);

  // ── Yazma (onay sonrası çalışır) ─────────────────────────────────────────
  const createOrder = useCallback(async (input: any): Promise<string> => {
    // Klinik/hekim/admin her zaman açabilir; lab/istasyon manage_order_create ister
    const alwaysCreate = ['doctor', 'clinic_admin', 'clinic_secretary', 'admin'].includes(ctx.userType);
    if (!alwaysCreate && !can('manage_order_create')) return 'Sipariş oluşturma yetkin yok.';
    if (!profile?.id) return 'Oturum bulunamadı.';

    // İş kalemleri (detaylı is_kalemleri veya basit alanlar) → tek tip listeye indir.
    const items = normalizeOrderItems(input);
    if (!items.length) return 'En az bir geçerli iş kalemi gerekli (diş numaraları + iş tipi).';

    // Formla aynı türetimler: birleşik diş listesi, benzersiz iş tipi metni, ilk renk.
    const teeth = Array.from(new Set(items.flatMap((it) => it.dis_numaralari))).sort((a, b) => a - b);
    const workType = Array.from(new Set(items.map((it) => it.is_tipi))).join(', ');
    const firstShade = items.find((it) => it.renk)?.renk;

    const deliveryDate = String(input?.teslim_tarihi ?? '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(deliveryDate)) return 'Teslim tarihi YYYY-AA-GG formatında olmalı.';
    // Geçmiş tarih engeli — Denty göreli tarihi yanlış hesaplarsa sipariş "gecikmiş" oluşmasın
    const todayIso = new Date().toISOString().slice(0, 10);
    if (deliveryDate < todayIso) {
      return `Teslim tarihi (${deliveryDate}) bugünden (${todayIso}) önce görünüyor — yeni sipariş geçmiş tarihli olamaz. Lütfen kullanıcıdan ileri bir teslim tarihi al.`;
    }
    // Makine tipi: açıkça verildiyse onu kullan; yoksa iş tiplerinden çıkar
    // (herhangi bir kalem 3D baskı/geçici ise 3d_printing, aksi halde milling).
    let machine: 'milling' | '3d_printing';
    if (input?.makine_tipi === '3d_printing' || input?.makine_tipi === 'milling') {
      machine = input.makine_tipi;
    } else {
      machine = /3\s?d|bask[ıi]|print|ge[çc]ici/i.test(workType) ? '3d_printing' : 'milling';
    }

    // Ölçüm yöntemi — createCaseSteps'i etkiler (dijital vs manuel iş akışı).
    const measurementType: 'manual' | 'digital' = input?.olcum_yontemi === 'digital' ? 'digital' : 'manual';
    // Teslim yöntemi — yalnız geçerli değer verildiyse gönder.
    const deliveryMethod =
      ['kurye', 'kargo', 'elden'].includes(input?.teslim_yontemi) ? input.teslim_yontemi : undefined;
    // Hasta adı: ad + soyad → başlık düzeni.
    const patientName = titleCaseTr([input?.hasta_adi, input?.hasta_soyadi].filter(Boolean).join(' ')) || undefined;
    const gender = input?.cinsiyet === 'erkek' || input?.cinsiyet === 'kadın' ? input.cinsiyet : undefined;

    // doctor_id çözümü: hekim hesabı = kendisi · klinik hesabı = seçilen hekim
    let doctorId: string;
    if (ctx.userType === 'doctor') {
      try { doctorId = await resolveDoctorId(profile.id); }
      catch (e: any) { return e?.message ?? 'Hekim çözülemedi.'; }
    } else {
      const clinicId = (profile as any)?.clinic_id ?? null;
      // 1) hekim_id ile
      let resolved: string | null = null;
      if (input?.hekim_id) {
        const { data } = await supabase.from('doctors').select('id, clinic_id').eq('id', String(input.hekim_id)).maybeSingle();
        if ((data as any)?.id && (!clinicId || (data as any).clinic_id === clinicId)) resolved = (data as any).id;
      }
      // 2) hekim_adi ile
      if (!resolved && input?.hekim_adi) {
        let q = supabase.from('doctors').select('id, full_name').ilike('full_name', `%${String(input.hekim_adi).trim()}%`).limit(5);
        if (clinicId) q = q.eq('clinic_id', clinicId);
        const { data } = await q;
        if (data && data.length === 1) resolved = (data as any)[0].id;
        else if (data && data.length > 1) return `Birden çok hekim eşleşti: ${data.map((d: any) => d.full_name).join(', ')}. Hangisi? (hekimAra ile id seç)`;
      }
      if (!resolved) return 'Klinik hesabında sipariş için hekim gerekli. Önce hekimAra ile hekimi bul, hekim_id ile çağır.';
      doctorId = resolved;
    }

    const { data, error } = await createWorkOrder({
      doctor_id: doctorId,
      tooth_numbers: teeth,
      work_type: workType,
      machine_type: machine as any,
      delivery_date: deliveryDate,
      delivery_method: deliveryMethod as any,
      patient_name: patientName,
      patient_gender: gender,
      patient_id: input?.tc_pasaport || undefined,
      patient_dob: input?.dogum_tarihi || undefined,
      patient_phone: input?.telefon || undefined,
      patient_nationality: input?.uyruk || undefined,
      patient_country: input?.ikamet_ulke || undefined,
      patient_city: input?.ikamet_sehir || undefined,
      shade: firstShade || undefined,
      is_urgent: input?.acil || undefined,
      notes: input?.notlar || undefined,
      model_type: input?.model_tipi || undefined,
      measurement_type: measurementType,
      doctor_approval_required: input?.tasarim_onayi || undefined,
    });
    if (error || !data) return 'Sipariş oluşturulamadı: ' + ((error as any)?.message ?? 'bilinmeyen hata');
    const order: any = data;

    // İş kalemlerini order_items'a yaz — formdaki gruplama ile birebir:
    // aynı (iş tipi + renk + materyal + implant detayları) tek kalem, adet = diş sayısı,
    // detaylar item.notes'a (Marka/Tür/Abutment/Vida/Materyal/Renk) yazılır.
    const groupMap = new Map<string, { rep: DentyOrderItem; teeth: number[]; count: number; price: number }>();
    for (const it of items) {
      const key = [it.is_tipi, it.renk, it.materyal, it.implant_sistem, it.implant_tur, it.abutment, it.vida].join('||');
      if (!groupMap.has(key)) groupMap.set(key, { rep: it, teeth: [], count: 0, price: it.fiyat || 0 });
      const g = groupMap.get(key)!;
      g.teeth.push(...it.dis_numaralari);
      g.count += it.dis_numaralari.length;
    }
    for (const g of groupMap.values()) {
      const noteParts: string[] = [];
      if (g.rep.implant_sistem) noteParts.push(`Marka: ${g.rep.implant_sistem}`);
      if (g.rep.implant_tur)   noteParts.push(`Tür: ${g.rep.implant_tur}`);
      if (g.rep.abutment)      noteParts.push(`Abutment: ${g.rep.abutment}`);
      if (g.rep.vida)          noteParts.push(`Vida: ${g.rep.vida}`);
      if (g.rep.materyal)      noteParts.push(`Materyal: ${g.rep.materyal}`);
      if (g.rep.renk)          noteParts.push(`Renk: ${g.rep.renk}`);
      try {
        await addOrderItem({
          work_order_id: order.id,
          name: g.rep.is_tipi,
          price: g.price,
          quantity: g.count,
          tooth_numbers: Array.from(new Set(g.teeth)).sort((a, b) => a - b),
          notes: noteParts.length ? noteParts.join(' · ') : undefined,
        });
      } catch { /* kalem eklenemezse sipariş yine de oluştu — sessiz geç */ }
    }

    // Sohbete iliştirilmiş dosyaları (staged) work_order_photos'a yükle — formdaki
    // akışın aynısı: work-order-photos bucket'ına yükle, sonra photos satırı ekle.
    let uploaded = 0;
    let failed = 0;
    const store = useDentyStore.getState();
    const staged = store.attachments;
    if (staged.length) {
      // RLS: photos.lab_id, work_order.lab_id ile eşleşmeli (hekimin profile.lab_id'i null olabilir).
      const labId = order.lab_id ?? (profile as any)?.lab_id ?? null;
      for (const a of staged) {
        try {
          let blob: any = a.blob;
          if (!blob && a.uri) blob = await (await fetch(a.uri)).blob();
          if (!blob) { failed++; continue; }
          const safeName = String(a.name || 'dosya').replace(/[^\w.-]+/g, '_').slice(0, 80);
          const storagePath = `${order.id}/${a.id}-${safeName}`;
          const contentType = a.mime || blob.type || 'application/octet-stream';
          const { error: upErr } = await supabase.storage
            .from('work-order-photos')
            .upload(storagePath, blob, { contentType, upsert: false });
          if (upErr) { failed++; continue; }
          const { error: dbErr } = await supabase
            .from('work_order_photos')
            .insert({ work_order_id: order.id, storage_path: storagePath, uploaded_by: profile.id, lab_id: labId, caption: a.name });
          if (dbErr) { failed++; void supabase.storage.from('work-order-photos').remove([storagePath]); continue; }
          uploaded++;
        } catch { failed++; }
      }
      store.clearAttachments();
    }

    const fileNote =
      uploaded > 0 ? ` · ${uploaded} dosya eklendi${failed ? ` (${failed} başarısız)` : ''}`
      : failed > 0 ? ` · ${failed} dosya eklenemedi`
      : '';
    return `Sipariş oluşturuldu ✓ No: ${order.order_number ?? order.id}${fileNote}`;
  }, [can, profile, ctx.userType]);

  // ── Yazma: sipariş düzenle (kapı-farkında) ───────────────────────────────
  const editOrder = useCallback(async (input: any): Promise<string> => {
    if (!profile?.id) return 'Oturum bulunamadı.';
    const resolved = await resolveOrderRef(input, ctx.orderId);
    if ('error' in resolved) return resolved.error;
    const row = resolved.row;

    // İş kalemleri yalnız is_kalemleri açıkça verildiyse yeniden yazılır (aksi halde dokunulmaz).
    const items = Array.isArray(input?.is_kalemleri) && input.is_kalemleri.length ? normalizeOrderItems(input) : null;
    const fields = buildEditFields(input, items);
    if (fields.delivery_date && !/^\d{4}-\d{2}-\d{2}$/.test(fields.delivery_date)) {
      return 'Teslim tarihi YYYY-AA-GG formatında olmalı.';
    }
    const hasFieldChange = Object.keys(fields).length > 0;
    const payloadItems = items && items.length ? groupItemsForPayload(items) : null;
    if (!hasFieldChange && !payloadItems) return 'Değiştirilecek bir bilgi belirtilmedi.';

    const ref = row.order_number ?? String(row.id).slice(0, 8);
    const clientUser = ['doctor', 'clinic_admin', 'clinic_secretary'].includes(ctx.userType);

    if (clientUser) {
      if (isOrderPrePlanning(row)) {
        const { error } = await updateOrderClient(row.id, fields, payloadItems);
        if (error) return 'Düzenleme başarısız: ' + ((error as any)?.message ?? 'bilinmeyen hata');
        return `Sipariş güncellendi ✓ (No: ${ref})`;
      }
      // Planlama başlamış → doğrudan değil, değişiklik talebi (lab onayı).
      const note = input?.degisiklik_notu ? String(input.degisiklik_notu) : null;
      const { error } = await createChangeRequest(row.id, fields, payloadItems, note);
      if (error) return 'Değişiklik talebi oluşturulamadı: ' + ((error as any)?.message ?? 'bilinmeyen hata');
      return `Bu sipariş üretim planlamasına girmiş; değişikliği doğrudan uygulayamıyorum. Değişiklik talebi oluşturdum ⏳ — laboratuvar onayından sonra uygulanacak. (No: ${ref})`;
    }

    // Admin/lab → kapı yok (admin_update_order, sunucuda is_lab_user() kontrolü).
    const { error } = await updateOrderAdmin(row.id, fields, payloadItems);
    if (error) return 'Düzenleme başarısız: ' + ((error as any)?.message ?? 'bilinmeyen hata');
    return `Sipariş güncellendi ✓ (No: ${ref})`;
  }, [profile, ctx.orderId, ctx.userType]);

  // ── Yazma: sipariş iptal (yalnız planlama öncesi, klinik/hekim) ───────────
  const cancelOrder = useCallback(async (input: any): Promise<string> => {
    if (!profile?.id) return 'Oturum bulunamadı.';
    const clientUser = ['doctor', 'clinic_admin', 'clinic_secretary'].includes(ctx.userType);
    if (!clientUser) return 'Sipariş iptali klinik/hekim hesaplarından yapılır. Yönetici olarak sipariş ekranından arşivleyebilirsin.';
    const resolved = await resolveOrderRef(input, ctx.orderId);
    if ('error' in resolved) return resolved.error;
    const row = resolved.row;
    const ref = row.order_number ?? String(row.id).slice(0, 8);
    if (String(row.status) === 'iptal') return `Bu sipariş zaten iptal edilmiş (No: ${ref}).`;
    if (!isOrderPrePlanning(row)) {
      return `Bu sipariş üretim planlamasına girmiş — artık iptal edilemez (No: ${ref}). İptal yerine bir "değişiklik talebi" oluşturabilir ya da lab ile mesajlaşabilirsin.`;
    }
    const { error } = await cancelOrderClient(row.id);
    if (error) return 'İptal başarısız: ' + ((error as any)?.message ?? 'bilinmeyen hata');
    return `Sipariş iptal edildi ✓ (No: ${ref})`;
  }, [profile, ctx.orderId, ctx.userType]);

  const openTicket = useCallback(async (input: any): Promise<string> => {
    if (!can('manage_support')) return 'Destek talebi açma yetkin yok.';
    const subject = String(input?.baslik ?? '').trim();
    const body = String(input?.aciklama ?? '').trim();
    if (!subject || !body) return 'Başlık ve açıklama gerekli.';
    const category = SUPPORT_CATEGORIES.has(input?.kategori) ? input.kategori : 'teknik_sorun';
    const priority = SUPPORT_PRIORITIES.has(input?.oncelik) ? input.oncelik : 'normal';
    const { data, error } = await createTicket({
      subject, category, priority, body,
      lab_id: (profile as any)?.lab_id ?? null,
    });
    if (error || !data) return 'Talep açılamadı: ' + ((error as any)?.message ?? '');
    return 'Destek talebi açıldı ✓ Ekibe ulaştı.';
  }, [can, profile]);

  const sendOrderMessage = useCallback(async (input: any): Promise<string> => {
    if (!can('manage_messages')) return 'Mesaj gönderme yetkin yok.';
    if (!ctx.orderId) return 'Mesaj göndermek için bir sipariş açık olmalı.';
    if (!profile?.id) return 'Oturum bulunamadı.';
    const content = String(input?.mesaj ?? '').trim();
    if (!content) return 'Mesaj boş olamaz.';
    const { error } = await chatSendMessage(ctx.orderId, profile.id, content);
    if (error) return 'Mesaj gönderilemedi: ' + ((error as any)?.message ?? '');
    return 'Mesaj gönderildi ✓';
  }, [can, profile, ctx.orderId]);

  const runOcclusion = useCallback(async (): Promise<string> => {
    const v = getActiveViewer();
    if (!v) return '3D görüntüleyici şu an açık değil. Önce bir siparişin 3D taramalarını aç.';
    const res = await v.analyzeOcclusion();
    if (!res) return 'Kapanış analizi için üst VE alt çene taraması gerekli — şu an ikisi birden yüklü görünmüyor.';
    const { describeOcclusion } = await import('../viewer-3d/lib/occlusion');
    return 'Kapanış analizi tamam → ' + describeOcclusion(res);
  }, []);

  const scanDiagnostics = useCallback(async (): Promise<string> => {
    const v = getActiveViewer();
    if (!v) return '3D görüntüleyici şu an açık değil.';
    const list = v.getDiagnostics();
    if (!list.length) return 'Taramalar için teşhis verisi yok (henüz hesaplanmadı veya 3D dosya yok).';
    return list.map(d =>
      `${d.name}: ${d.triCount.toLocaleString('tr-TR')} üçgen · ${d.holeEdges} açık kenar · ${d.nonManifoldEdges} non-manifold · ters normal %${Math.round(d.invertedRatio * 100)}${d.flags.length ? ' · uyarı: ' + d.flags.join(', ') : ''}`,
    ).join('\n');
  }, []);


  // ── Salt-okunur: lab & yönetici panelleri ────────────────────────────────
  /** Günün tek bakışta durumu — dashboard'un sorduğu soruların aynısı. */
  const dailySummary = useCallback(async (): Promise<string> => {
    const today = new Date().toISOString().slice(0, 10);
    try {
      const [overdueRes, todayRes, triageRes, stockRes, unbilledRes] = await Promise.all([
        supabase.from('work_orders')
          .select('order_number, patient_name, delivery_date')
          .lt('delivery_date', today).neq('status', 'teslim_edildi').neq('status', 'iptal')
          .order('delivery_date').limit(5),
        supabase.from('work_orders')
          .select('order_number, patient_name')
          .eq('delivery_date', today).neq('status', 'teslim_edildi').neq('status', 'iptal').limit(5),
        supabase.from('work_orders')
          .select('order_number', { count: 'exact' })
          .is('triaged_at', null).neq('status', 'iptal').limit(5),
        supabase.from('stock_items').select('name, quantity, min_quantity').limit(200),
        supabase.from('v_unbilled_work_orders').select('order_number, totals_by_currency').limit(5),
      ]);
      const overdue = overdueRes.data ?? [];
      const todayList = todayRes.data ?? [];
      const triage = triageRes.data ?? [];
      const low = (stockRes.data ?? []).filter((i: any) =>
        Number(i.min_quantity ?? 0) > 0 && Number(i.quantity ?? 0) < Number(i.min_quantity));
      const unbilled = unbilledRes.data ?? [];

      const lines: string[] = ['GÜNLÜK ÖZET:'];
      lines.push(`• Gecikmiş: ${overdue.length}${overdue.length ? ' → ' + overdue.map((o: any) => `#${o.order_number} (${o.patient_name ?? '-'}, ${o.delivery_date})`).join(', ') : ''}`);
      lines.push(`• Bugün teslim: ${todayList.length}${todayList.length ? ' → ' + todayList.map((o: any) => `#${o.order_number}`).join(', ') : ''}`);
      lines.push(`• Planlama bekleyen: ${triageRes.count ?? triage.length}`);
      lines.push(`• Kritik stok: ${low.length}${low.length ? ' → ' + low.slice(0, 5).map((i: any) => `${i.name} (${i.quantity}/${i.min_quantity})`).join(', ') : ''}`);
      lines.push(`• Faturasız teslimat: ${unbilled.length}${unbilled.length ? ' → ' + unbilled.map((u: any) => `#${u.order_number}`).join(', ') : ''}`);
      lines.push('(Sayılar kullanıcının yetkisi/RLS kapsamındadır.)');
      return lines.join('\n');
    } catch (e: any) { return `Özet alınamadı: ${e?.message ?? String(e)}`; }
  }, []);

  /** Bir siparişin aşama zinciri — kim, hangi durumda. */
  const stageStatus = useCallback(async (input: any): Promise<string> => {
    const ref = await resolveOrderRef({ siparis_no: input?.siparis_no }, ctx.orderId);
    if ('error' in ref) return ref.error;
    const { data, error } = await supabase
      .from('order_stages')
      .select('sequence_order, stage_name, status, assigned_to, started_at, completed_at, lane')
      .eq('work_order_id', ref.row.id)
      .order('sequence_order');
    if (error) return `Aşamalar okunamadı: ${error.message}`;
    if (!data || !data.length) return `#${ref.row.order_number} için aşama tanımlı değil (henüz planlanmamış olabilir).`;
    // Atanan teknisyenlerin adını tek sorguda çöz
    const ids = Array.from(new Set(data.map((r: any) => r.assigned_to).filter(Boolean)));
    const names: Record<string, string> = {};
    if (ids.length) {
      const { data: people } = await supabase.from('profiles').select('id, full_name').in('id', ids);
      (people ?? []).forEach((p: any) => { names[p.id] = p.full_name; });
    }
    const rows = data.map((r: any) =>
      `${r.sequence_order}. ${r.stage_name} — ${r.status}${r.lane ? ` (şerit ${r.lane})` : ''}${r.assigned_to ? ` · ${names[r.assigned_to] ?? 'atanmış'}` : ''}`);
    return `#${ref.row.order_number} (${ref.row.patient_name ?? '-'}) aşamaları:\n` + rows.join('\n');
  }, [ctx.orderId]);

  /** İstasyon başına bekleyen/devam eden iş sayısı. */
  const stationLoad = useCallback(async (): Promise<string> => {
    const { data, error } = await supabase
      .from('order_stages')
      .select('stage_name, status')
      .in('status', ['bekliyor', 'aktif'])
      .limit(500);
    if (error) return `İstasyon yükü okunamadı: ${error.message}`;
    if (!data || !data.length) return 'Bekleyen veya devam eden aşama yok.';
    const byStation: Record<string, { bekleyen: number; devam: number }> = {};
    data.forEach((r: any) => {
      const k = r.stage_name ?? 'bilinmiyor';
      byStation[k] = byStation[k] ?? { bekleyen: 0, devam: 0 };
      if (r.status === 'aktif') byStation[k].devam++; else byStation[k].bekleyen++;
    });
    return 'İstasyon yükü (bekleyen / aktif):\n' + Object.entries(byStation)
      .sort((a, b) => (b[1].bekleyen + b[1].devam) - (a[1].bekleyen + a[1].devam))
      .map(([k, v]) => `• ${k}: ${v.bekleyen} bekleyen · ${v.devam} aktif`)
      .join('\n');
  }, []);

  /** Kritik seviyenin altındaki stok kalemleri. */
  const stockStatus = useCallback(async (): Promise<string> => {
    const { data, error } = await supabase
      .from('stock_items').select('name, quantity, min_quantity, unit').limit(300);
    if (error) return `Stok okunamadı: ${error.message}`;
    const low = (data ?? []).filter((i: any) =>
      Number(i.min_quantity ?? 0) > 0 && Number(i.quantity ?? 0) < Number(i.min_quantity));
    if (!low.length) return 'Kritik seviyenin altında stok kalemi yok.';
    return `Kritik stok (${low.length} kalem):\n` + low
      .map((i: any) => `• ${i.name}: ${i.quantity}${i.unit ? ' ' + i.unit : ''} (min ${i.min_quantity})`)
      .join('\n');
  }, []);


  // ── Yazma: lab & yönetici (hepsi onay kartından geçer) ───────────────────
  /** Aktif aşamayı tamamla → sıradaki aşama otomatik başlar (admin_complete_stage). */
  const advanceStage = useCallback(async (input: any): Promise<string> => {
    if (!isLabManager(ctx)) return 'Bu işlem için laboratuvar yöneticisi yetkisi gerekiyor.';
    const ref = await resolveOrderRef({ siparis_no: input?.siparis_no }, ctx.orderId);
    if ('error' in ref) return ref.error;
    const { data: stages, error } = await supabase
      .from('order_stages')
      .select('id, sequence_order, stage_name, status')
      .eq('work_order_id', ref.row.id)
      .order('sequence_order');
    if (error) return `Aşamalar okunamadı: ${error.message}`;
    const wanted = String(input?.asama_adi ?? '').trim().toLocaleLowerCase('tr');
    const target = wanted
      ? (stages ?? []).find((st: any) => String(st.stage_name ?? '').toLocaleLowerCase('tr').includes(wanted))
      : (stages ?? []).find((st: any) => st.status === 'aktif');
    if (!target) {
      return wanted
        ? `#${ref.row.order_number} içinde "${input.asama_adi}" adlı aşama yok.`
        : `#${ref.row.order_number} için aktif aşama yok (planlanmamış veya tamamlanmış olabilir).`;
    }
    if (target.status === 'tamamlandi' || target.status === 'skipped') {
      return `"${target.stage_name}" zaten ${target.status === 'skipped' ? 'atlanmış' : 'tamamlanmış'}.`;
    }
    const res = await adminCompleteStage(target.id);
    if (!res.ok) return `Aşama ilerletilemedi: ${res.error}`;
    return `#${ref.row.order_number} — "${target.stage_name}" tamamlandı, sıradaki aşama başlatıldı.`;
  }, [ctx.orderId, ctx.userType, ctx.role]);

  /** Siparişi teknisyene ata — isim kısmi, çok eşleşmede işlem yapmaz. */
  const assignTech = useCallback(async (input: any): Promise<string> => {
    if (!isLabManager(ctx)) return 'Bu işlem için laboratuvar yöneticisi yetkisi gerekiyor.';
    const name = String(input?.teknisyen_adi ?? '').trim();
    if (!name) return 'Hangi teknisyene atanacak?';
    const ref = await resolveOrderRef({ siparis_no: input?.siparis_no }, ctx.orderId);
    if ('error' in ref) return ref.error;
    const term = sanitizeIlikeTerm(name);
    const { data: people, error } = await supabase
      .from('profiles').select('id, full_name, role')
      .eq('user_type', 'lab').ilike('full_name', `%${term}%`).limit(5);
    if (error) return `Teknisyen aranamadı: ${error.message}`;
    if (!people || !people.length) return `"${name}" adında bir lab kullanıcısı bulunamadı.`;
    if (people.length > 1) {
      return 'Birden çok kişi eşleşti, hangisi: ' + people.map((p: any) => p.full_name).join(', ');
    }
    const { error: upErr } = await assignTechnician(ref.row.id, people[0].id);
    if (upErr) return `Atama başarısız: ${upErr.message}`;
    return `#${ref.row.order_number} ${people[0].full_name} adlı teknisyene atandı.`;
  }, [ctx.orderId, ctx.userType, ctx.role]);

  /** Teslim edilmiş siparişten fatura oluştur. */
  const createInvoice = useCallback(async (input: any): Promise<string> => {
    if (!isLabManager(ctx)) return 'Bu işlem için laboratuvar yöneticisi yetkisi gerekiyor.';
    const ref = await resolveOrderRef({ siparis_no: input?.siparis_no }, ctx.orderId);
    if ('error' in ref) return ref.error;
    if (ref.row.status !== 'teslim_edildi') {
      return `#${ref.row.order_number} henüz teslim edilmemiş (durum: ${ref.row.status}). Fatura yalnız teslim edilmiş siparişten kesilir.`;
    }
    const { data, error } = await createInvoiceFromOrder(ref.row.id);
    if (error) return `Fatura oluşturulamadı: ${(error as any).message ?? String(error)}`;
    const no = (data as any)?.invoice_number;
    return `#${ref.row.order_number} için fatura oluşturuldu${no ? ': ' + no : ''}.`;
  }, [ctx.orderId, ctx.userType, ctx.role]);

  /** Lab içi nota tarihli satır ekle (mevcut not korunur). */
  const appendNote = useCallback(async (input: any): Promise<string> => {
    if (!isLabManager(ctx)) return 'Bu işlem için laboratuvar yöneticisi yetkisi gerekiyor.';
    const text = String(input?.not ?? '').trim();
    if (!text) return 'Not metni boş.';
    const ref = await resolveOrderRef({ siparis_no: input?.siparis_no }, ctx.orderId);
    if ('error' in ref) return ref.error;
    const { data: row, error: readErr } = await supabase
      .from('work_orders').select('lab_notes').eq('id', ref.row.id).maybeSingle();
    if (readErr) return `Not okunamadı: ${readErr.message}`;
    const stamp = new Date().toLocaleDateString('tr-TR');
    const line = `[${stamp} · ${ctx.userName}] ${text}`;
    const merged = [(row as any)?.lab_notes, line].filter(Boolean).join('\n');
    const { error } = await supabase.from('work_orders').update({ lab_notes: merged }).eq('id', ref.row.id);
    if (error) return `Not eklenemedi: ${error.message}`;
    return `#${ref.row.order_number} lab notuna eklendi.`;
  }, [ctx.orderId, ctx.userName, ctx.userType, ctx.role]);

  const execute = useCallback(async (name: string, input: any): Promise<string> => {
    switch (name) {
      case 'goturBeni':     return navigate(String(input?.hedef ?? ''));
      case 'siparisAra':    return search(input?.sorgu);
      case 'veriOku':       return readData(input);
      case 'cariDurum':     return accountBalance();
      case 'hekimAra':      return searchDoctors(input?.sorgu);
      case 'kapanisAnalizi':return runOcclusion();
      case 'taramaTeshis':  return scanDiagnostics();
      case 'gunlukOzet':    return dailySummary();
      case 'asamaDurumu':   return stageStatus(input);
      case 'istasyonYuku':  return stationLoad();
      case 'stokDurumu':    return stockStatus();
      case 'asamaIlerlet':  return advanceStage(input);
      case 'teknisyenAta':  return assignTech(input);
      case 'faturaKes':     return createInvoice(input);
      case 'notEkle':       return appendNote(input);
      case 'siparisOlustur':return createOrder(input);
      case 'siparisDuzenle':return editOrder(input);
      case 'siparisIptal':  return cancelOrder(input);
      case 'destekTalebiAc':return openTicket(input);
      case 'mesajGonder':   return sendOrderMessage(input);
      default:              return `Bilinmeyen araç: ${name}`;
    }
  }, [navigate, search, readData, accountBalance, searchDoctors, runOcclusion, scanDiagnostics, dailySummary, stageStatus, stationLoad, stockStatus, advanceStage, assignTech, createInvoice, appendNote, createOrder, editOrder, cancelOrder, openTicket, sendOrderMessage]);

  // Model YALNIZ bu panelde geçerli araçları görür (TOOL_META filtresi)
  const defs = useMemo(() => toolDefsFor(ctx), [ctx.panel, ctx.perms.support, ctx.perms.messages]);
  return useMemo(() => ({ defs, execute }), [defs, execute]);
}
