export type ChatMessage = {
  id: string;
  role: "user" | "denty";
  text: string;
};

export const initialMessages: ChatMessage[] = [
  { id: "m1", role: "user", text: "Yarınki randevuları özetle ve boşlukları göster." },
  {
    id: "m2",
    role: "denty",
    text: "Yarın 7 randevun var (09:00–17:30). 13:00–14:00 ve 16:00 sonrası boş. İki dolgu, bir implant kontrolü ve bir zirkonyum prova öne çıkıyor.",
  },
  { id: "m3", role: "user", text: "16:00'a Ayşe Hanım'ı ekle." },
  {
    id: "m4",
    role: "denty",
    text: "Tamamdır — Ayşe Yılmaz 16:00'a eklendi ve WhatsApp'tan onay mesajı gönderildi. ✅",
  },
];

export const quickPrompts = [
  "Bugünün özeti",
  "Yeni tedavi planı",
  "Lab siparişi oluştur",
  "Hastaya hatırlatma gönder",
];

export type Patient = {
  id: string;
  name: string;
  initials: string;
  age: number;
  status: "active" | "review" | "new";
  lastVisit: string;
  treatment: string;
  hue: number;
};

export const patients: Patient[] = [
  { id: "p1", name: "Ayşe Yılmaz", initials: "AY", age: 34, status: "active", lastVisit: "2 gün önce", treatment: "İmplant — 36", hue: 210 },
  { id: "p2", name: "Mehmet Demir", initials: "MD", age: 41, status: "review", lastVisit: "1 hafta önce", treatment: "Zirkonyum köprü", hue: 168 },
  { id: "p3", name: "Elif Kaya", initials: "EK", age: 27, status: "new", lastVisit: "Yeni kayıt", treatment: "Ortodonti danışma", hue: 280 },
  { id: "p4", name: "Can Öztürk", initials: "CÖ", age: 52, status: "active", lastVisit: "Dün", treatment: "Kanal tedavisi", hue: 24 },
];

export type TreatmentStep = { label: string; done: boolean };
export type TreatmentPlan = {
  id: string;
  patient: string;
  title: string;
  tooth: string;
  progress: number;
  cost: string;
  steps: TreatmentStep[];
};

export const treatmentPlans: TreatmentPlan[] = [
  {
    id: "t1",
    patient: "Ayşe Yılmaz",
    title: "İmplant + Üst Yapı",
    tooth: "36",
    progress: 60,
    cost: "₺28.500",
    steps: [
      { label: "Muayene & tomografi", done: true },
      { label: "İmplant yerleşimi", done: true },
      { label: "İyileşme (osseointegrasyon)", done: true },
      { label: "Ölçü & abutment", done: false },
      { label: "Zirkonyum kron", done: false },
    ],
  },
  {
    id: "t2",
    patient: "Mehmet Demir",
    title: "Zirkonyum Köprü (3 üye)",
    tooth: "14–16",
    progress: 35,
    cost: "₺19.200",
    steps: [
      { label: "Prep & ölçü", done: true },
      { label: "Lab — alt yapı", done: false },
      { label: "Prova", done: false },
      { label: "Simantasyon", done: false },
    ],
  },
];

export type WhatsAppMsg = { id: string; from: "patient" | "denty"; text: string; time: string };
export const whatsappThread: WhatsAppMsg[] = [
  { id: "w1", from: "patient", text: "Merhaba, yarınki randevumu öğleden sonraya alabilir miyiz?", time: "09:24" },
  { id: "w2", from: "denty", text: "Tabii ki! 14:30 veya 16:00 uygun. Hangisini tercih edersiniz?", time: "09:24" },
  { id: "w3", from: "patient", text: "16:00 olur 🙏", time: "09:26" },
  { id: "w4", from: "denty", text: "Randevunuz 16:00'a güncellendi. Görüşmek üzere! 🦷", time: "09:26" },
];

export type LabOrder = {
  id: string;
  code: string;
  patient: string;
  item: string;
  shade: string;
  status: "design" | "production" | "qc" | "ready";
  due: string;
};

export const labOrders: LabOrder[] = [
  { id: "l1", code: "LAB-2041", patient: "Mehmet Demir", item: "Zirkonyum köprü ×3", shade: "A2", status: "production", due: "16 Haz" },
  { id: "l2", code: "LAB-2042", patient: "Ayşe Yılmaz", item: "İmplant kron", shade: "A1", status: "design", due: "19 Haz" },
  { id: "l3", code: "LAB-2039", patient: "Can Öztürk", item: "Geçici kron", shade: "B1", status: "ready", due: "Bugün" },
  { id: "l4", code: "LAB-2038", patient: "Elif Kaya", item: "Şeffaf plak", shade: "—", status: "qc", due: "17 Haz" },
];

export const labStatusMeta: Record<LabOrder["status"], { label: string; color: string }> = {
  design: { label: "Tasarım", color: "#6ea8fe" },
  production: { label: "Üretim", color: "#f59e0b" },
  qc: { label: "Kalite", color: "#a855f7" },
  ready: { label: "Hazır", color: "#00c2a8" },
};
