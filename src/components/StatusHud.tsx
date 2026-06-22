"use client";

type VibrationStatus = "normal" | "warning" | "danger";

interface StatusHudProps {
  vibration: number;
  vibrationStatus: VibrationStatus;
  laserActive: boolean;
  doorOpen: boolean;
  temperature: number;
}

export default function StatusHud({
  vibration,
  vibrationStatus,
  laserActive,
  doorOpen,
  temperature,
}: StatusHudProps) {
  const vibrationColor =
    vibrationStatus === "danger"
      ? "var(--accent-red)"
      : vibrationStatus === "warning"
        ? "#f0a020"
        : "var(--accent-green)";

  return (
    <div
      className="panel panel-light absolute right-4 top-4 z-30 flex flex-col rounded-xl md:right-6 md:top-6"
      style={{ width: 240, padding: "20px 22px" }}
    >
      <div
        className="flex items-center justify-between border-b border-slate-200"
        style={{ paddingBottom: 12, marginBottom: 16 }}
      >
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground">
          Machine Telemetry
        </span>
        <span className="text-[10px] font-medium uppercase tracking-[0.1em] text-[var(--text-muted)]">
          Live
        </span>
      </div>

      <div className="flex flex-col" style={{ gap: 14 }}>
        <div className="flex items-baseline justify-between">
          <span className="text-[11px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
            Vibration
          </span>
          <span
            className="font-mono text-sm font-medium tabular-nums"
            style={{ color: vibrationColor }}
          >
            {vibration.toFixed(1)}
            <span className="ml-1 text-[10px] font-normal text-[var(--text-muted)]">
              Hz
            </span>
          </span>
        </div>

        <div className="flex items-baseline justify-between">
          <span className="text-[11px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
            Laser
          </span>
          <span
            className="font-mono text-sm font-medium tabular-nums"
            style={{ color: laserActive ? "var(--accent-red)" : "var(--text-muted)" }}
          >
            {laserActive ? "ON" : "OFF"}
          </span>
        </div>

        <div className="flex items-baseline justify-between">
          <span className="text-[11px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
            Door
          </span>
          <span
            className="font-mono text-sm font-medium tabular-nums"
            style={{ color: doorOpen ? "var(--accent-primary)" : "var(--text-muted)" }}
          >
            {doorOpen ? "OPEN" : "CLOSED"}
          </span>
        </div>

        <div className="flex items-baseline justify-between">
          <span className="text-[11px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
            Temp
          </span>
          <span className="font-mono text-sm font-medium tabular-nums text-foreground">
            {temperature.toFixed(1)}
            <span className="ml-1 text-[10px] font-normal text-[var(--text-muted)]">
              °C
            </span>
          </span>
        </div>

        <div className="flex items-baseline justify-between">
          <span className="text-[11px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
            Mount
          </span>
          <span
            className="font-mono text-sm font-medium tabular-nums"
            style={{ color: "var(--accent-green)" }}
          >
            OK
          </span>
        </div>
      </div>
    </div>
  );
}