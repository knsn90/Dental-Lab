import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, useWindowDimensions } from 'react-native';
import { C } from '../../../core/theme/colors';

// FDI numbering — upper: 18→11 then 21→28, lower: 48→41 then 31→38
const UPPER_TEETH = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
const LOWER_TEETH = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];

const toRad = (d: number) => (d * Math.PI) / 180;

// Tooth size by type (base values, scaled later)
function baseSize(tooth: number): number {
  if ([18, 28, 38, 48, 17, 27, 37, 47].includes(tooth)) return 22;
  if ([16, 26, 36, 46].includes(tooth)) return 21;
  if ([15, 25, 35, 45, 14, 24, 34, 44].includes(tooth)) return 18;
  if ([13, 23, 33, 43].includes(tooth)) return 16;
  return 13; // incisors
}

function computePositions(
  teeth: number[],
  cx: number, cy: number,
  rx: number, ry: number,
  t0: number, t1: number
) {
  return teeth.map((tooth, i) => {
    const t = i / (teeth.length - 1);
    const theta = t0 + t * (t1 - t0);
    return {
      tooth,
      x: cx + rx * Math.cos(toRad(theta)),
      y: cy + ry * Math.sin(toRad(theta)),
    };
  });
}

interface Props {
  selected: number[];
  onChange: (teeth: number[]) => void;
}

export function ToothNumberPicker({ selected, onChange }: Props) {
  const { width } = useWindowDimensions();

  // Scale arch to fit available width
  const cw = Math.min(Math.max(width - 40, 240), 320);
  const s = cw / 280; // scale factor
  const ch = Math.round(365 * s);

  // Arch parameters (base coords designed for 280-wide container)
  const cx = 140 * s;
  const upperCY = 162 * s;
  const lowerCY = 198 * s;
  const rx = 108 * s;
  const upperRY = 130 * s;
  const lowerRY = 130 * s;

  // Upper arch: theta 200°→340° (passes through 270° = top of ellipse = small y)
  // Lower arch: theta 160°→20°  (passes through  90° = bottom = large y)
  const upperPos = useMemo(
    () => computePositions(UPPER_TEETH, cx, upperCY, rx, upperRY, 200, 340),
    [cx, upperCY, rx, upperRY]
  );
  const lowerPos = useMemo(
    () => computePositions(LOWER_TEETH, cx, lowerCY, rx, lowerRY, 160, 20),
    [cx, lowerCY, rx, lowerRY]
  );

  const toggle = (tooth: number) => {
    onChange(
      selected.includes(tooth)
        ? selected.filter((t) => t !== tooth)
        : [...selected, tooth]
    );
  };

  const selectGroup = (teeth: number[]) => {
    const allIn = teeth.every((t) => selected.includes(t));
    onChange(allIn ? selected.filter((t) => !teeth.includes(t)) : [...new Set([...selected, ...teeth])]);
  };

  const renderTooth = ({ tooth, x, y }: { tooth: number; x: number; y: number }) => {
    const size = baseSize(tooth) * s;
    const active = selected.includes(tooth);
    return (
      <TouchableOpacity
        key={tooth}
        onPress={() => toggle(tooth)}
        activeOpacity={0.75}
        style={{
          position: 'absolute',
          left: x - size / 2,
          top: y - size / 2,
          width: size,
          height: size,
          borderRadius: size * 0.38,
          backgroundColor: active ? C.primary : '#D8E1EA',
          borderWidth: 1.5,
          borderColor: active ? C.primary : '#8FA3B5',
          alignItems: 'center',
          justifyContent: 'center',
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.14,
          shadowRadius: 1.5,
          elevation: 2,
        }}
      >
        <Text
          style={{
            fontSize: Math.max(size * 0.36, 6),
            fontWeight: '700',
            color: active ? '#fff' : '#3D5166',
            lineHeight: size * 0.95,
          }}
          adjustsFontSizeToFit
          numberOfLines={1}
        >
          {tooth}
        </Text>
      </TouchableOpacity>
    );
  };

  // Quadrant groups
  const q18 = UPPER_TEETH.slice(0, 8); // 18→11 (patient right upper)
  const q28 = UPPER_TEETH.slice(8);    // 21→28 (patient left  upper)
  const q48 = LOWER_TEETH.slice(0, 8); // 48→41 (patient right lower)
  const q38 = LOWER_TEETH.slice(8);    // 31→38 (patient left  lower)
  const allTeeth = [...UPPER_TEETH, ...LOWER_TEETH];

  return (
    <View style={{ alignItems: 'center' }}>
      {/* Upper quadrant buttons */}
      <View style={row}>
        <QBtn label="Sağ Üst" onPress={() => selectGroup(q18)} />
        <QBtn label="Tümünü Seç" onPress={() => selectGroup(allTeeth)} primary />
        <QBtn label="Temizle" onPress={() => onChange([])} danger />
        <QBtn label="Sol Üst" onPress={() => selectGroup(q28)} />
      </View>

      {/* Arch canvas */}
      <View
        style={{
          width: cw,
          height: ch,
          position: 'relative',
          backgroundColor: '#F5F7FA',
          borderRadius: 14,
          borderWidth: 1,
          borderColor: C.border,
          marginVertical: 10,
          overflow: 'hidden',
        }}
      >
        {/* Corner labels */}
        <Text style={[lbl, { top: 5, left: 8 }]}>SAĞ</Text>
        <Text style={[lbl, { top: 5, right: 8 }]}>SOL</Text>
        <Text style={[lbl, { top: 5, left: cw / 2 - 10 }]}>ÜST</Text>
        <Text style={[lbl, { bottom: 5, left: cw / 2 - 10 }]}>ALT</Text>

        {upperPos.map(renderTooth)}
        {lowerPos.map(renderTooth)}
      </View>

      {/* Lower quadrant buttons */}
      <View style={row}>
        <QBtn label="Sağ Alt" onPress={() => selectGroup(q48)} />
        <View style={{ flex: 1 }} />
        <QBtn label="Sol Alt" onPress={() => selectGroup(q38)} />
      </View>

      {/* Selected teeth display */}
      {selected.length > 0 && (
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            marginTop: 10,
            padding: 10,
            backgroundColor: C.primaryBg,
            borderRadius: 10,
            alignSelf: 'stretch',
          }}
        >
          <Text style={{ fontSize: 12, color: C.textSecondary, fontWeight: '600' }}>
            Seçili dişler:{' '}
          </Text>
          <Text style={{ fontSize: 12, color: C.primary, fontWeight: '700', flex: 1 }}>
            {[...selected].sort((a, b) => a - b).join(', ')}
          </Text>
        </View>
      )}
    </View>
  );
}

function QBtn({
  label,
  onPress,
  primary,
  danger,
}: {
  label: string;
  onPress: () => void;
  primary?: boolean;
  danger?: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 8,
        borderWidth: 1.5,
        borderColor: danger ? '#FECACA' : primary ? C.primary : C.border,
        backgroundColor: danger ? C.dangerBg : primary ? C.primaryBg : C.surface,
      }}
    >
      <Text
        style={{
          fontSize: 11,
          fontWeight: '700',
          color: danger ? C.danger : primary ? C.primary : C.textSecondary,
        }}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const row: any = {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 6,
  flexWrap: 'wrap',
  alignSelf: 'stretch',
};

const lbl: any = {
  position: 'absolute',
  fontSize: 9,
  fontWeight: '800',
  color: '#8FA3B5',
  letterSpacing: 0.5,
};
