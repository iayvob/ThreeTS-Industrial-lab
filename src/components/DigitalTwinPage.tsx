'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { SceneHandle } from '@/components/ThreeScene';
import ThreeScene from '@/components/ThreeScene';
import LoadingOverlay from '@/components/LoadingOverlay';
import SidebarPanel from '@/components/SidebarPanel';
import MobileTopBar from '@/components/MobileTopBar';
import StatusHud from '@/components/StatusHud';
import { MachineState } from '@/lib/machine/machineState';
import { UR5State } from '@/lib/machine/ur5State';

type VibrationStatus = 'normal' | 'warning' | 'danger';

type MachineMode = 'MANUAL' | 'AUTOMATIC' | 'MAINTENANCE';

type LaserMode = 'ON' | 'OFF';

interface UiState {
  machineOn: boolean;
  mode: MachineMode;
  laserMode: LaserMode;
  positionX: number;
  positionY: number;

  laserPower: number;
  vibrationValue: number;
  vibrationStatus: VibrationStatus;
  vibrationHistory: number[];
  doorOpen: boolean;
  temperature: number;
}

const initialUiState: UiState = {
  machineOn: false,
  mode: 'MANUAL',
  laserMode: 'OFF',
  positionX: 0,
  positionY: 0,

  laserPower: 30,
  vibrationValue: 0,
  vibrationStatus: 'normal',
  vibrationHistory: new Array(60).fill(0),
  doorOpen: false,
  temperature: 22.0,
};

export default function DigitalTwinPage() {
  const sceneRef = useRef<SceneHandle | null>(null);
  const machineState = useMemo(() => new MachineState(), []);
  const ur5State = useMemo(() => new UR5State(), []);

  const [ui, setUi] = useState<UiState>(initialUiState);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // UR5 state
  const [ur5Joints, setUr5Joints] = useState<number[]>([0, 0, 0, 0, 0, 0]);
  const [ur5GripValue, setUr5GripValue] = useState(50);
  // TCP coords stored in ref to avoid 60fps re-renders; synced to state at ~4fps for sidebar display
  const ur5TcpRef = useRef({ x: 0, y: 0, z: 0 });
  const [ur5TcpCoords, setUr5TcpCoords] = useState({ x: 0, y: 0, z: 0 });

  const handleLoaded = useCallback(() => {
    setLoading(false);
  }, []);

  const handleProgress = useCallback((value: number) => {
    setProgress(Math.max(0, Math.min(1, value)));
  }, []);

  const updateUi = useCallback((updates: Partial<UiState>) => {
    setUi((prev) => ({ ...prev, ...updates }));
  }, []);

  const handleUr5JointChange = useCallback((index: number, value: number) => {
    setUr5Joints((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
    ur5State.setJoint(index, value);
  }, [ur5State]);

  const handleUr5GripChange = useCallback((value: number) => {
    setUr5GripValue(value);
    ur5State.setGripValue(value);
  }, [ur5State]);

  // Store TCP coords in ref (called 60fps from animation loop) — no setState here!
  const handleUr5TcpUpdate = useCallback((coords: { x: number; y: number; z: number }) => {
    ur5TcpRef.current.x = coords.x;
    ur5TcpRef.current.y = coords.y;
    ur5TcpRef.current.z = coords.z;
  }, []);

  // Throttled sync: push ref → state at ~4fps so the sidebar TCP readout stays fresh
  // without hammering React with 60 re-renders/second
  useEffect(() => {
    const id = setInterval(() => {
      const r = ur5TcpRef.current;
      setUr5TcpCoords((prev) => {
        // Skip setState if values haven't changed (avoids unnecessary renders)
        if (
          Math.abs(prev.x - r.x) < 1e-6 &&
          Math.abs(prev.y - r.y) < 1e-6 &&
          Math.abs(prev.z - r.z) < 1e-6
        ) {
          return prev;
        }
        return { x: r.x, y: r.y, z: r.z };
      });
    }, 250); // 4fps is plenty for a numeric readout
    return () => clearInterval(id);
  }, []);

  const actions = useMemo(() => {
    return {
      togglePower: () =>
        setUi((prev) => ({
          ...prev,
          machineOn: !prev.machineOn,
          laserMode: prev.machineOn ? 'OFF' : prev.laserMode,
        })),
      estop: () => {
        machineState.estop();
        updateUi({ machineOn: false, laserMode: 'OFF', doorOpen: false });
      },
      doorOpen: () => {
        machineState.setDoorTarget(1.0); // Fully open
        updateUi({ doorOpen: true, laserMode: 'OFF' });
      },
      doorClose: () => {
        machineState.setDoorTarget(0.0); // Fully close
        updateUi({ doorOpen: false });
      },
      resetView: () => {
        sceneRef.current?.resetView();
      },
      setMode: (mode: MachineMode) => updateUi({ mode }),
      setLaserMode: (mode: LaserMode) => updateUi({ laserMode: mode }),
      setPositionX: (value: number) => {
        machineState.setPositionX(value);
        updateUi({ positionX: value });
      },
      setPositionY: (value: number) => {
        machineState.setPositionY(value);
        updateUi({ positionY: value });
      },
      setLaserPower: (value: number) => updateUi({ laserPower: value }),
      toggleDoor: () => {
        if (machineState.isDoorOpen()) {
          machineState.setDoorTarget(0.0);
          updateUi({ doorOpen: false });
        } else {
          machineState.setDoorTarget(1.0);
          updateUi({ doorOpen: true, laserMode: 'OFF' });
        }
      }
    };
  }, [updateUi, machineState]);

  /** Shared sidebar props (CNC + UR5) */
  const sidebarProps = {
    machineOn: ui.machineOn,
    mode: ui.mode,
    laserMode: ui.laserMode,
    positionX: ui.positionX,
    positionY: ui.positionY,
    laserPower: ui.laserPower,
    vibrationHistory: ui.vibrationHistory,
    vibrationStatus: ui.vibrationStatus,
    onTogglePower: actions.togglePower,
    onEstop: actions.estop,
    onDoorOpen: actions.doorOpen,
    onDoorClose: actions.doorClose,
    onResetView: actions.resetView,
    onModeChange: actions.setMode,
    onLaserModeChange: actions.setLaserMode,
    onPositionXChange: actions.setPositionX,
    onPositionYChange: actions.setPositionY,
    onLaserPowerChange: actions.setLaserPower,
    // UR5 props
    ur5Joints,
    ur5GripValue,
    ur5TcpCoords,
    onUr5JointChange: handleUr5JointChange,
    onUr5GripChange: handleUr5GripChange,
  } as const;

  return (
    <div className="relative flex h-screen w-screen overflow-hidden bg-slate-50 text-slate-900">
      <div className="hidden md:block md:w-80 md:shrink-0">
        <SidebarPanel
          variant="dock"
          {...sidebarProps}
        />
      </div>

      <div className="relative flex-1 h-full min-w-0">
        <MobileTopBar onOpenSidebar={() => setSidebarOpen(true)} />

        <ThreeScene
          ref={sceneRef}
          onProgress={handleProgress}
          onLoaded={handleLoaded}
          machineState={machineState}
          ur5State={ur5State}
          onToggleDoor={actions.toggleDoor}
          onUr5TcpUpdate={handleUr5TcpUpdate}
        />

        <LoadingOverlay visible={loading} progress={progress} />

        <div className="md:hidden">
          <SidebarPanel
            {...sidebarProps}
            isOpen={sidebarOpen}
            onClose={() => setSidebarOpen(false)}
          />
        </div>

        <StatusHud
          vibration={ui.vibrationValue}
          vibrationStatus={ui.vibrationStatus}
          laserActive={ui.laserMode === 'ON'}
          doorOpen={ui.doorOpen}
          temperature={ui.temperature}
        />
      </div>
    </div>
  );
}
