/**
 * NOLiveSummary — Step 4 sticky right panel (360px)
 * ──────────────────────────────────────────────────
 * Vaka kartı önizleme: Hasta, Vaka detayları, Operasyonlar,
 * Toplam (siyah kart), QR kodu.
 */
import React from 'react';
import { View, Text } from 'react-native';
import { Calendar } from 'lucide-react-native';
import { NO, NOType, NORadius } from './NOTokens';
import { NOEyebrow } from './NOFormPrimitives';

// ── Types ─────────────────────────────────────────────────────────
export interface SummaryPatient {
  name: string;
  gender: string;
  dob: string;
}

export interface SummaryCase {
  measurement: string;
  model: string;
  delivery: string;
  method: string;
}

export interface SummaryTooth {
  no: number;
  work: string;
  shade: string;
  price: number;
}

export interface NOLiveSummaryProps {
  caseId?: string;
  clinic?: string;
  doctor?: string;
  patient?: SummaryPatient;
  caseDetails?: SummaryCase;
  teeth?: SummaryTooth[];
  estimatedDeliveryDate?: string;
}

// ── Small row helper ──────────────────────────────────────────────
function SumRow({ label, value }: { label: string; value: string }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 6,
      }}
    >
      <Text style={{ fontSize: 11, color: NO.inkMute }}>{label}</Text>
      <Text style={{ fontSize: 11, color: NO.inkStrong, fontWeight: '500' }}>
        {value}
      </Text>
    </View>
  );
}

// ── Mini tooth map (upper jaw 16 teeth) ───────────────────────────
const UPPER_JAW = [18,17,16,15,14,13,12,11,21,22,23,24,25,26,27,28];

function MiniToothMap({ selected }: { selected: number[] }) {
  return (
    <View
      style={{
        padding: 10,
        backgroundColor: NO.bgInput,
        borderRadius: 10,
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 2,
        marginBottom: 10,
      }}
    >
      {UPPER_JAW.map((n) => {
        const sel = selected.includes(n);
        return (
          <View
            key={n}
            style={{
              flex: 1,
              minWidth: 0,
              aspectRatio: 0.8,
              borderRadius: 3,
              backgroundColor: sel ? NO.saffron : '#FFFFFF',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text
              style={{
                fontSize: 7,
                fontFamily: 'monospace',
                fontWeight: '600',
                color: sel ? NO.inkStrong : NO.inkMute,
              }}
            >
              {n}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

// ── QR Pattern (prosedürel) ───────────────────────────────────────
function QRPattern() {
  // Simple procedural pattern — will be replaced with real QR in production
  const size = 100;
  const cells = 12;
  const cellSize = size / cells;
  const rects: React.ReactNode[] = [];

  // Deterministic pattern
  const pattern = [
    1,1,1,1,0,1,0,1,1,1,1,1,
    1,0,0,1,0,0,1,0,1,0,0,1,
    1,0,0,1,1,0,1,1,1,0,0,1,
    1,1,1,1,0,1,0,0,1,1,1,1,
    0,0,1,0,1,1,1,0,0,0,1,0,
    1,0,0,1,1,0,0,1,0,1,0,1,
    0,1,1,0,1,0,1,1,0,0,1,0,
    1,1,1,1,0,1,0,1,0,1,0,1,
    1,0,0,1,0,0,1,1,1,1,1,1,
    1,0,0,1,1,0,0,1,1,0,0,1,
    1,1,1,1,0,1,1,0,1,0,0,1,
    0,0,0,0,1,0,1,0,1,1,1,1,
  ];

  for (let y = 0; y < cells; y++) {
    for (let x = 0; x < cells; x++) {
      if (pattern[y * cells + x]) {
        rects.push(
          <View
            key={`${x}-${y}`}
            style={{
              position: 'absolute',
              left: x * cellSize,
              top: y * cellSize,
              width: cellSize,
              height: cellSize,
              backgroundColor: NO.inkStrong,
            }}
          />
        );
      }
    }
  }

  return (
    <View style={{ width: size, height: size, position: 'relative' }}>
      {rects}
    </View>
  );
}

// ── Main Component ────────────────────────────────────────────────
export function NOLiveSummary({
  caseId = '#DL-2026-0427',
  clinic,
  doctor,
  patient,
  caseDetails,
  teeth = [],
  estimatedDeliveryDate,
}: NOLiveSummaryProps) {
  const total = teeth.reduce((s, t) => s + t.price, 0);
  const selectedNos = teeth.map((t) => t.no);

  return (
    <View style={{ padding: 24, flexDirection: 'column', gap: 12 }}>
      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          marginBottom: 6,
        }}
      >
        <View
          style={{
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: NO.success,
          }}
        />
        <NOEyebrow>Vaka kartı önizleme</NOEyebrow>
        <View style={{ flex: 1 }} />
        <View
          style={{
            paddingVertical: 2,
            paddingHorizontal: 7,
            borderRadius: NORadius.pill,
            backgroundColor: '#FFFFFF',
          }}
        >
          <Text
            style={{
              fontSize: 10,
              fontFamily: 'monospace',
              fontWeight: '600',
              color: NO.inkSoft,
            }}
          >
            {caseId}
          </Text>
        </View>
      </View>

      {/* Hasta kartı */}
      {patient && (
        <View
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: 18,
            padding: 18,
          }}
        >
          <NOEyebrow>Hasta</NOEyebrow>
          <Text
            style={{
              ...NOType.headingMd,
              color: NO.inkStrong,
              marginTop: 8,
            }}
          >
            {patient.name}
          </Text>
          <Text style={{ fontSize: 11, color: NO.inkMute, marginTop: 2 }}>
            {patient.gender} · {patient.dob}
          </Text>
          {(clinic || doctor) && (
            <View
              style={{
                marginTop: 10,
                paddingTop: 10,
                borderTopWidth: 1,
                borderStyle: 'dashed',
                borderTopColor: 'rgba(0,0,0,0.06)',
              }}
            >
              <Text style={{ fontSize: 11, color: NO.inkSoft }}>
                {[clinic, doctor].filter(Boolean).join(' · ')}
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Vaka detayları */}
      {caseDetails && (
        <View
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: 18,
            padding: 18,
          }}
        >
          <NOEyebrow>Vaka detayları</NOEyebrow>
          <View style={{ marginTop: 10 }}>
            <SumRow label="Ölçüm" value={caseDetails.measurement} />
            <SumRow label="Model" value={caseDetails.model} />
            <SumRow label="Teslim" value={caseDetails.delivery} />
            <SumRow label="Yöntem" value={caseDetails.method} />
          </View>
        </View>
      )}

      {/* Operasyonlar */}
      {teeth.length > 0 && (
        <View
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: 18,
            padding: 18,
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              marginBottom: 10,
            }}
          >
            <NOEyebrow>Operasyonlar</NOEyebrow>
            <View style={{ flex: 1 }} />
            <View
              style={{
                paddingVertical: 2,
                paddingHorizontal: 7,
                borderRadius: NORadius.pill,
                backgroundColor: NO.saffronSoft,
              }}
            >
              <Text style={{ fontSize: 10, fontWeight: '500' }}>
                {teeth.length} diş
              </Text>
            </View>
          </View>

          <MiniToothMap selected={selectedNos} />

          <View style={{ flexDirection: 'column', gap: 4 }}>
            {teeth.map((t) => (
              <View
                key={t.no}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <View
                  style={{
                    paddingVertical: 2,
                    paddingHorizontal: 6,
                    borderRadius: 4,
                    backgroundColor: NO.saffron,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 11,
                      fontFamily: 'monospace',
                      fontWeight: '600',
                      color: NO.inkStrong,
                    }}
                  >
                    {t.no}
                  </Text>
                </View>
                <Text
                  numberOfLines={1}
                  style={{ flex: 1, fontSize: 11, color: NO.inkMedium }}
                >
                  {t.work}
                </Text>
                <Text
                  style={{
                    fontSize: 11,
                    color: NO.inkSoft,
                    fontWeight: '500',
                  }}
                >
                  ₺{(t.price / 1000).toFixed(1)}k
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Toplam (siyah kart) */}
      <View
        style={{
          backgroundColor: NO.inkStrong,
          borderRadius: 18,
          padding: 18,
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            marginBottom: 8,
          }}
        >
          <NOEyebrow color="rgba(255,255,255,0.4)">Tahmini toplam</NOEyebrow>
          <View
            style={{
              paddingVertical: 2,
              paddingHorizontal: 7,
              borderRadius: NORadius.pill,
              backgroundColor: NO.saffron,
            }}
          >
            <Text
              style={{
                fontSize: 10,
                fontWeight: '600',
                color: NO.inkStrong,
              }}
            >
              HAZIR
            </Text>
          </View>
        </View>
        <Text
          style={{
            fontSize: 28,
            fontWeight: '300',
            letterSpacing: -0.84,
            color: NO.saffron,
            lineHeight: 28,
          }}
        >
          ₺ {total.toLocaleString('tr-TR')}
        </Text>
        {estimatedDeliveryDate && (
          <View
            style={{
              marginTop: 10,
              paddingTop: 10,
              borderTopWidth: 1,
              borderTopColor: 'rgba(255,255,255,0.1)',
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <Calendar size={11} color="rgba(255,255,255,0.7)" strokeWidth={1.6} />
            <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)' }}>
              Teslim: {estimatedDeliveryDate}
            </Text>
          </View>
        )}
      </View>

      {/* QR */}
      <View
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: 18,
          padding: 18,
          alignItems: 'center',
        }}
      >
        <View
          style={{
            width: 120,
            height: 120,
            backgroundColor: NO.bgInput,
            borderRadius: 12,
            padding: 10,
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 8,
          }}
        >
          <QRPattern />
        </View>
        <Text style={{ fontSize: 10, color: NO.inkMute }}>
          Vaka kartı QR · {caseId}
        </Text>
      </View>
    </View>
  );
}
