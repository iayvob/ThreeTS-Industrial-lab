'use client';

import { useEffect, useState } from 'react';
import { RotateCcw, TriangleAlert } from 'lucide-react';

import VibrationChart from '@/components/VibrationChart';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

/* ─── Types ──────────────────────────────────────────────────────────────── */

type VibrationStatus = 'normal' | 'warning' | 'danger';
type MachineMode = 'MANUAL' | 'AUTOMATIC' | 'MAINTENANCE';
type LaserMode = 'ON' | 'OFF';

type SidebarTab = 'cnc' | 'ur5';

interface SidebarPanelProps {
  machineOn: boolean;
  mode: MachineMode;
  laserMode: LaserMode;
  positionX: number;
  positionY: number;
  laserPower: number;
  vibrationHistory: number[];
  vibrationStatus: VibrationStatus;
  onTogglePower: () => void;
  onEstop: () => void;
  onDoorOpen: () => void;
  onDoorClose: () => void;
  onResetView: () => void;
  onModeChange: (_mode: MachineMode) => void;
  onLaserModeChange: (_mode: LaserMode) => void;
  onPositionXChange: (_value: number) => void;
  onPositionYChange: (_value: number) => void;
  onLaserPowerChange: (_value: number) => void;
  isOpen?: boolean;
  onClose?: () => void;
  variant?: 'drawer' | 'dock';
  // UR5 robot props
  ur5Joints?: number[];
  ur5GripValue?: number;
  ur5TcpCoords?: { x: number; y: number; z: number };
  onUr5JointChange?: (_index: number, _value: number) => void;
  onUr5GripChange?: (_value: number) => void;
}

/* ─── Tokens ─────────────────────────────────────────────────────────────── */
// White ground. Near-black text for real contrast. Blue = control. Red = danger.
// A few dark surface accents (header, status bar) carry weight against the light panel.
const T = {
  bg: '#FFFFFF',
  surface: '#F5F5F5',
  border: '#D8D8D6',
  borderHard: '#000000',
  dark: '#111111', // dark surface accent
  darkSurfaceText: '#FFFFFF',
  text: '#0A0A0A', // near-black, solid
  textMuted: '#4B4B49', // stronger mid-gray, not light gray
  blue: '#0047AB', // cobalt — control / active
  blueLight: '#E8EFFF',
  red: '#CC0000', // danger / estop
  redLight: '#FFF0F0',
  radius: 12,
  radiusSm: 8,
  mono: "'Courier New', Courier, monospace",
  sans: "'Arial', 'Helvetica Neue', sans-serif",
} as const;

/* ─── Shared micro-components ────────────────────────────────────────────── */

function Label({
  children,
  inverted,
}: {
  children: React.ReactNode;
  inverted?: boolean;
}) {
  return (
    <span
      style={{
        fontFamily: T.sans,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.10em',
        textTransform: 'uppercase' as const,
        color: inverted ? 'rgba(255,255,255,0.75)' : T.textMuted,
      }}
    >
      {children}
    </span>
  );
}

function Mono({
  children,
  color,
}: {
  children: React.ReactNode;
  color?: string;
}) {
  return (
    <span
      style={{
        fontFamily: T.mono,
        fontSize: 12,
        fontWeight: 700,
        color: color ?? T.text,
        letterSpacing: '0.04em',
      }}
    >
      {children}
    </span>
  );
}

function Divider() {
  return <div style={{ height: 1, backgroundColor: T.border, margin: '0' }} />;
}

function SectionHead({ num, title }: { num: string; title: string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '14px 20px',
        backgroundColor: T.surface,
        borderBottom: `1px solid ${T.border}`,
      }}
    >
      <Mono color={T.textMuted}>{num}</Mono>
      <div style={{ width: 1, height: 10, backgroundColor: T.border }} />
      <Label>{title}</Label>
    </div>
  );
}

/* Rounded pill toggle for 2–3 options */
function SegmentControl<T extends string>({
  options,
  value,
  onChange,
  danger,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (_value: T) => void;
  danger?: T;
}) {
  return (
    <div
      style={{
        display: 'flex',
        border: `1px solid ${T.border}`,
        borderRadius: T.radiusSm,
        padding: 3,
        gap: 3,
        backgroundColor: T.surface,
      }}
    >
      {options.map(({ value: v, label }) => {
        const active = value === v;
        const isDanger = danger === v;
        return (
          <button
            key={v}
            onClick={() => onChange(v)}
            style={{
              flex: 1,
              padding: '8px 0',
              border: 'none',
              borderRadius: T.radiusSm - 3,
              cursor: 'pointer',
              fontFamily: T.sans,
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase' as const,
              backgroundColor: active
                ? isDanger
                  ? T.red
                  : T.blue
                : 'transparent',
              color: active ? '#fff' : T.textMuted,
              transition: 'background 80ms',
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

/* Axis slider row with rounded track and increased spacing */
function AxisRow({
  axis,
  value,
  min,
  max,
  color,
  onChange,
}: {
  axis: string;
  value: number;
  min: number;
  max: number;
  color: string;
  onChange: (_v: number) => void;
}) {
  return (
    <div
      style={{
        padding: '16px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span
            style={{
              fontFamily: T.mono,
              fontSize: 11,
              fontWeight: 700,
              color,
            }}
          >
            {axis}
          </span>
          <Label>Axis</Label>
        </div>
        <Mono>
          {value}
          <span style={{ fontSize: 9, color: T.textMuted, marginLeft: 3 }}>
            mm
          </span>
        </Mono>
      </div>
      {/* Rounded track */}
      <div
        style={{
          position: 'relative',
          height: 4,
          backgroundColor: T.border,
          borderRadius: 999,
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            height: '100%',
            width: `${((value - min) / (max - min)) * 100}%`,
            backgroundColor: color,
            borderRadius: 999,
          }}
        />
        <Slider
          value={[value]}
          min={min}
          max={max}
          step={1}
          onValueChange={(v) => onChange(v[0] ?? 0)}
          style={{
            position: 'absolute',
            inset: '-8px 0',
            opacity: 0,
            zIndex: 2,
            cursor: 'pointer',
          }}
        />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <Label>{min}</Label>
        <Label>{max}</Label>
      </div>
    </div>
  );
}

/* Rounded action button */
function ActionBtn({
  onClick,
  children,
  span,
}: {
  onClick: () => void;
  children: React.ReactNode;
  span?: number;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        gridColumn: span ? `span ${span}` : undefined,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-start',
        gap: 8,
        padding: '12px 14px',
        backgroundColor: T.bg,
        border: `1px solid ${T.border}`,
        borderRadius: T.radiusSm,
        color: T.text,
        cursor: 'pointer',
        fontFamily: T.sans,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.08em',
        textTransform: 'uppercase' as const,
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor = T.blue;
        (e.currentTarget as HTMLElement).style.color = T.blue;
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor = T.border;
        (e.currentTarget as HTMLElement).style.color = T.text;
      }}
    >
      {children}
    </button>
  );
}

/* ─── Main ───────────────────────────────────────────────────────────────── */

export default function SidebarPanel({
  machineOn,
  mode,
  laserMode,
  positionX,
  positionY,

  laserPower,
  vibrationHistory,
  vibrationStatus,
  onTogglePower,
  onEstop,
  onDoorOpen,
  onDoorClose,
  onResetView,
  onModeChange,
  onLaserModeChange,
  onPositionXChange,
  onPositionYChange,
  onLaserPowerChange,
  isOpen = true,
  onClose,
  variant = 'dock',
  ur5Joints = [0, 0, 0, 0, 0, 0],
  ur5GripValue = 50,
  ur5TcpCoords = { x: 0, y: 0, z: 0 },
  onUr5JointChange,
  onUr5GripChange,
}: SidebarPanelProps) {
  const isDocked = variant === 'dock';
  const [activeTab, setActiveTab] = useState<SidebarTab>('cnc');

  useEffect(() => {
    if (!isOpen || isDocked) return;
    const fn = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [isDocked, isOpen, onClose]);

  const vibColor =
    vibrationStatus === 'danger'
      ? T.red
      : vibrationStatus === 'warning'
        ? '#B87000'
        : T.blue;

  return (
    <>
      {/* Mobile backdrop */}
      {!isDocked && (
        <div
          aria-hidden={!isOpen}
          onClick={onClose}
          className="md:hidden"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 20,
            backgroundColor: 'rgba(0,0,0,0.3)',
            opacity: isOpen ? 1 : 0,
            pointerEvents: isOpen ? 'auto' : 'none',
            transition: 'opacity 180ms',
          }}
        />
      )}

      <aside
        role="complementary"
        aria-hidden={!isOpen}
        className={cn(
          'z-30 flex h-screen flex-col overflow-hidden',
          isDocked
            ? 'relative max-w-75'
            : 'fixed left-0 top-0 w-full md:max-w-75',
          !isDocked &&
            `transform transition-transform duration-300 md:translate-x-0 ${
              isOpen ? 'translate-x-0' : '-translate-x-full'
            }`
        )}
        style={{
          backgroundColor: T.bg,
          borderRight: `1px solid ${T.border}`,
          fontFamily: T.sans,
          borderRadius: isDocked ? `${T.radius}px 0 0 ${T.radius}px` : 0,
          overflow: 'hidden',
        }}
      >
        {/* ── Header (dark surface accent) ───────────────────────────────── */}
        <header style={{ backgroundColor: T.dark }}>
          {/* Title bar */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '18px 20px',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span
                style={{
                  fontFamily: T.sans,
                  fontSize: 14,
                  fontWeight: 700,
                  letterSpacing: '-0.01em',
                  color: T.darkSurfaceText,
                }}
              >
                Lab Control
              </span>
              <Label inverted>CNC + UR5 · Digital Twin</Label>
            </div>
            {onClose && !isDocked && (
              <button
                onClick={onClose}
                className="md:hidden"
                aria-label="Close"
                style={{
                  background: 'rgba(255,255,255,0.08)',
                  border: '1px solid rgba(255,255,255,0.2)',
                  borderRadius: T.radiusSm,
                  color: '#fff',
                  width: 28,
                  height: 28,
                  cursor: 'pointer',
                  fontSize: 10,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                ✕
              </button>
            )}
          </div>

          {/* Status bar */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 20px',
              backgroundColor: 'rgba(255,255,255,0.06)',
              borderTop: '1px solid rgba(255,255,255,0.1)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span
                style={{
                  display: 'inline-block',
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  backgroundColor: machineOn
                    ? '#4D8FFF'
                    : 'rgba(255,255,255,0.3)',
                  flexShrink: 0,
                }}
              />
              <Mono color={machineOn ? '#4D8FFF' : 'rgba(255,255,255,0.6)'}>
                {machineOn ? 'READY' : 'STANDBY'}
              </Mono>
            </div>
            <Mono color="rgba(255,255,255,0.6)">{mode}</Mono>
          </div>
        </header>

        {/* ── Tab Bar ─────────────────────────────────────────────────── */}
        <div
          style={{
            display: 'flex',
            backgroundColor: T.surface,
            borderBottom: `1px solid ${T.border}`,
            padding: 0,
          }}
        >
          {(['cnc', 'ur5'] as SidebarTab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                flex: 1,
                padding: '12px 0',
                border: 'none',
                borderBottom:
                  activeTab === tab
                    ? `2px solid ${T.blue}`
                    : '2px solid transparent',
                cursor: 'pointer',
                fontFamily: T.sans,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.10em',
                textTransform: 'uppercase' as const,
                backgroundColor: 'transparent',
                color: activeTab === tab ? T.blue : T.textMuted,
                transition: 'color 120ms, border-color 120ms',
              }}
            >
              {tab === 'cnc' ? 'CNC Machine' : 'UR5 Robot'}
            </button>
          ))}
        </div>

        {/* ── Scrollable body ──────────────────────────────────────────── */}
        <div
          style={{ flex: 1, overflowY: 'auto', backgroundColor: T.bg }}
          className="sidebar-scroll"
        >
          {activeTab === 'cnc' ? (
            /* ── CNC Tab Content ────────────────────────────────────────── */
            <>
              {/* E-STOP */}
              <div
                style={{ padding: 20, borderBottom: `1px solid ${T.border}` }}
              >
                <button
                  onClick={onEstop}
                  style={{
                    width: '100%',
                    padding: '16px',
                    backgroundColor: T.redLight,
                    border: `2px solid ${T.red}`,
                    borderRadius: T.radius,
                    color: T.red,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 10,
                    fontFamily: T.sans,
                    fontSize: 11,
                    fontWeight: 800,
                    letterSpacing: '0.14em',
                    textTransform: 'uppercase' as const,
                  }}
                >
                  <span className="w-6 h-6 flex items-center justify-center font-bold text-white">
                    !
                  </span>
                  Emergency Stop
                </button>
              </div>

              {/* 01 · POWER */}
              <div style={{ borderBottom: `1px solid ${T.border}` }}>
                <SectionHead num="01" title="Power" />
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '16px 20px',
                  }}
                >
                  <div
                    style={{ display: 'flex', flexDirection: 'column', gap: 4 }}
                  >
                    <Mono color={machineOn ? T.blue : T.text}>
                      {machineOn ? 'ON' : 'OFF'}
                    </Mono>
                    <Label>Primary contactor</Label>
                  </div>
                  <Switch
                    checked={machineOn}
                    onCheckedChange={onTogglePower}
                    aria-label="Toggle power"
                  />
                </div>
              </div>

              {/* 02 · OPERATION MODE */}
              <div style={{ borderBottom: `1px solid ${T.border}` }}>
                <SectionHead num="02" title="Operation Mode" />
                <div style={{ padding: '16px 20px' }}>
                  <SegmentControl
                    options={[
                      { value: 'MANUAL' as MachineMode, label: 'Manual' },
                      { value: 'AUTOMATIC' as MachineMode, label: 'Auto' },
                      { value: 'MAINTENANCE' as MachineMode, label: 'Maint' },
                    ]}
                    value={mode}
                    onChange={onModeChange}
                  />
                </div>
              </div>

              {/* 03 · AXIS POSITION */}
              <div style={{ borderBottom: `1px solid ${T.border}` }}>
                <SectionHead num="03" title="Axis Position" />
                <AxisRow
                  axis="X"
                  value={positionX}
                  min={-440}
                  max={550}
                  color={T.blue}
                  onChange={onPositionXChange}
                />
                <Divider />
                <AxisRow
                  axis="Y"
                  value={positionY}
                  min={-750}
                  max={0}
                  color={T.blue}
                  onChange={onPositionYChange}
                />
                <Divider />
              </div>

              {/* 04 · LASER */}
              <div style={{ borderBottom: `1px solid ${T.border}` }}>
                <SectionHead num="04" title="Laser" />

                {/* Power readout + track */}
                <div
                  style={{
                    padding: '16px 20px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'baseline',
                    }}
                  >
                    <Label>Power · 10–60 W</Label>
                    <Mono>
                      {laserPower}
                      <span
                        style={{
                          fontSize: 9,
                          color: T.textMuted,
                          marginLeft: 3,
                        }}
                      >
                        W
                      </span>
                    </Mono>
                  </div>
                  <div
                    style={{
                      position: 'relative',
                      height: 4,
                      backgroundColor: T.border,
                      borderRadius: 999,
                    }}
                  >
                    <div
                      style={{
                        position: 'absolute',
                        left: 0,
                        top: 0,
                        height: '100%',
                        width: `${((laserPower - 10) / 50) * 100}%`,
                        backgroundColor:
                          laserMode === 'ON' ? T.red : T.textMuted,
                        borderRadius: 999,
                      }}
                    />
                    <Slider
                      value={[laserPower]}
                      min={10}
                      max={60}
                      step={1}
                      onValueChange={(v) => onLaserPowerChange(v[0] ?? 0)}
                      style={{
                        position: 'absolute',
                        inset: '-8px 0',
                        opacity: 0,
                        zIndex: 2,
                        cursor: 'pointer',
                      }}
                    />
                  </div>
                  <div
                    style={{ display: 'flex', justifyContent: 'space-between' }}
                  >
                    <Label>10</Label>
                    <Label>60</Label>
                  </div>
                </div>

                {/* Emission state */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '14px 20px',
                    borderTop: `1px solid ${T.border}`,
                  }}
                >
                  <div
                    style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                  >
                    <span
                      style={{
                        display: 'inline-block',
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        backgroundColor: laserMode === 'ON' ? T.red : T.border,
                        flexShrink: 0,
                      }}
                    />
                    <Label>Emission</Label>
                  </div>
                  <SegmentControl
                    options={[
                      { value: 'OFF' as LaserMode, label: 'Off' },
                      { value: 'ON' as LaserMode, label: 'On' },
                    ]}
                    value={laserMode}
                    onChange={onLaserModeChange}
                    danger={'ON' as LaserMode}
                  />
                </div>
              </div>

              {/* 05 · VIBRATION */}
              <div style={{ borderBottom: `1px solid ${T.border}` }}>
                <SectionHead num="05" title="Vibration Monitor" />
                <div
                  style={{
                    padding: '16px 20px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                  }}
                >
                  <div
                    style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                  >
                    <span
                      style={{
                        display: 'inline-block',
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        backgroundColor: vibColor,
                        flexShrink: 0,
                      }}
                    />
                    <Mono color={vibColor}>
                      {vibrationStatus.toUpperCase()}
                    </Mono>
                  </div>
                  <div
                    style={{
                      border: `1px solid ${T.border}`,
                      borderRadius: T.radiusSm,
                      backgroundColor: T.surface,
                      padding: 12,
                    }}
                  >
                    <VibrationChart
                      data={vibrationHistory}
                      status={vibrationStatus}
                    />
                  </div>
                </div>
              </div>

              {/* 06 · SYSTEM */}
              <div style={{ borderBottom: `1px solid ${T.border}` }}>
                <SectionHead num="06" title="System" />
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 10,
                    padding: '16px 20px',
                  }}
                >
                  <ActionBtn onClick={onDoorOpen}>
                    <span className="w-5 h-5 flex items-center justify-center font-bold">
                      []
                    </span>
                    Open Door
                  </ActionBtn>
                  <ActionBtn onClick={onDoorClose}>
                    <span className="w-5 h-5 flex items-center justify-center font-bold">
                      []
                    </span>
                    Close Door
                  </ActionBtn>
                  <ActionBtn onClick={onResetView} span={2}>
                    <span className="w-5 h-5 flex items-center justify-center font-bold">
                      R
                    </span>
                    Reset View
                  </ActionBtn>
                </div>
              </div>
            </>
          ) : (
            /* ── UR5 Tab Content ─────────────────────────────────────────── */
            <>
              {/* 01 · JOINT CONTROL */}
              <div style={{ borderBottom: `1px solid ${T.border}` }}>
                <SectionHead num="01" title="Joint Control" />
                {(['J1', 'J2', 'J3', 'J4', 'J5', 'J6'] as const).map(
                  (label, index) => {
                    const jointColors = [
                      '#e8701a',
                      '#2d7dd2',
                      '#e81a3d',
                      '#d2b22d',
                      '#2dd2b2',
                      '#888888',
                    ];
                    return (
                      <div key={label}>
                        <div
                          style={{
                            padding: '14px 20px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 10,
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'baseline',
                            }}
                          >
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'baseline',
                                gap: 8,
                              }}
                            >
                              <span
                                style={{
                                  fontFamily: T.mono,
                                  fontSize: 11,
                                  fontWeight: 700,
                                  color: jointColors[index],
                                }}
                              >
                                {label}
                              </span>
                              <Label>Rotation</Label>
                            </div>
                            <Mono>
                              {(
                                ((ur5Joints[index] ?? 0) * 180) /
                                Math.PI
                              ).toFixed(1)}
                              <span
                                style={{
                                  fontSize: 9,
                                  color: T.textMuted,
                                  marginLeft: 3,
                                }}
                              >
                                °
                              </span>
                            </Mono>
                          </div>
                          {/* Slider track */}
                          <div
                            style={{
                              position: 'relative',
                              height: 4,
                              backgroundColor: T.border,
                              borderRadius: 999,
                            }}
                          >
                            <div
                              style={{
                                position: 'absolute',
                                left: '50%',
                                top: 0,
                                height: '100%',
                                width: `${Math.abs(((ur5Joints[index] ?? 0) / Math.PI) * 50)}%`,
                                marginLeft:
                                  (ur5Joints[index] ?? 0) < 0
                                    ? `-${Math.abs(((ur5Joints[index] ?? 0) / Math.PI) * 50)}%`
                                    : 0,
                                backgroundColor: jointColors[index],
                                borderRadius: 999,
                              }}
                            />
                            <Slider
                              value={[ur5Joints[index] ?? 0]}
                              min={-Math.PI}
                              max={Math.PI}
                              step={0.01}
                              onValueChange={(v) =>
                                onUr5JointChange?.(index, v[0] ?? 0)
                              }
                              style={{
                                position: 'absolute',
                                inset: '-8px 0',
                                opacity: 0,
                                zIndex: 2,
                                cursor: 'pointer',
                              }}
                            />
                          </div>
                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                            }}
                          >
                            <Label>-180°</Label>
                            <Label>0°</Label>
                            <Label>180°</Label>
                          </div>
                        </div>
                        {index < 5 && <Divider />}
                      </div>
                    );
                  }
                )}
              </div>

              {/* 02 · GRIPPER */}
              <div style={{ borderBottom: `1px solid ${T.border}` }}>
                <SectionHead num="02" title="Gripper" />
                <div
                  style={{
                    padding: '16px 20px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'baseline',
                    }}
                  >
                    <Label>RG6 Opening · 0–100%</Label>
                    <Mono>
                      {ur5GripValue}
                      <span
                        style={{
                          fontSize: 9,
                          color: T.textMuted,
                          marginLeft: 3,
                        }}
                      >
                        %
                      </span>
                    </Mono>
                  </div>
                  <div
                    style={{
                      position: 'relative',
                      height: 4,
                      backgroundColor: T.border,
                      borderRadius: 999,
                    }}
                  >
                    <div
                      style={{
                        position: 'absolute',
                        left: 0,
                        top: 0,
                        height: '100%',
                        width: `${ur5GripValue}%`,
                        backgroundColor: T.blue,
                        borderRadius: 999,
                      }}
                    />
                    <Slider
                      value={[ur5GripValue]}
                      min={0}
                      max={100}
                      step={1}
                      onValueChange={(v) => onUr5GripChange?.(v[0] ?? 0)}
                      style={{
                        position: 'absolute',
                        inset: '-8px 0',
                        opacity: 0,
                        zIndex: 2,
                        cursor: 'pointer',
                      }}
                    />
                  </div>
                  <div
                    style={{ display: 'flex', justifyContent: 'space-between' }}
                  >
                    <Label>Closed</Label>
                    <Label>Open</Label>
                  </div>
                </div>
              </div>

              {/* 03 · TCP POSITION */}
              <div style={{ borderBottom: `1px solid ${T.border}` }}>
                <SectionHead num="03" title="TCP Position" />
                <div
                  style={{
                    padding: '16px 20px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 12,
                  }}
                >
                  {(['X', 'Y', 'Z'] as const).map((axis) => {
                    const axisColors: Record<string, string> = {
                      X: '#e8701a',
                      Y: '#2d7dd2',
                      Z: '#2dd2b2',
                    };
                    const val =
                      ur5TcpCoords[axis.toLowerCase() as 'x' | 'y' | 'z'];
                    return (
                      <div
                        key={axis}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'baseline',
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'baseline',
                            gap: 8,
                          }}
                        >
                          <span
                            style={{
                              fontFamily: T.mono,
                              fontSize: 12,
                              fontWeight: 700,
                              color: axisColors[axis],
                            }}
                          >
                            {axis}
                          </span>
                          <Label>Axis</Label>
                        </div>
                        <span
                          style={{
                            fontFamily: T.mono,
                            fontSize: 13,
                            fontWeight: 700,
                            color: '#4ade80',
                            letterSpacing: '0.04em',
                          }}
                        >
                          {val.toFixed(4)}
                          <span
                            style={{
                              fontSize: 9,
                              color: T.textMuted,
                              marginLeft: 3,
                            }}
                          >
                            m
                          </span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 04 · SYSTEM */}
              <div style={{ borderBottom: `1px solid ${T.border}` }}>
                <SectionHead num="04" title="System" />
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 10,
                    padding: '16px 20px',
                  }}
                >
                  <ActionBtn onClick={onResetView} span={2}>
                    <RotateCcw size={12} />
                    Reset View
                  </ActionBtn>
                </div>
              </div>
            </>
          )}
        </div>

        {/* ── Footer ───────────────────────────────────────────────────── */}
        <footer
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 20px',
            backgroundColor: T.dark,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <TriangleAlert
              size={11}
              style={{ color: 'rgba(255,255,255,0.6)' }}
            />
            <Label inverted>Interlock</Label>
          </div>
          <Mono color="rgba(255,255,255,0.6)">FW 1.0</Mono>
        </footer>
      </aside>
    </>
  );
}
