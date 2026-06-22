"use client";

interface LoadingOverlayProps {
  visible: boolean;
  progress: number;
}

export default function LoadingOverlay({ visible, progress }: LoadingOverlayProps) {
  if (!visible) return null;

  return (
    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-white/95 text-slate-900 transition-opacity">
      <h1 className="mb-1 text-xl font-semibold">Loading</h1>
      <div className="mt-4 h-1 w-75 overflow-hidden rounded bg-slate-200">
        <div
          className="h-full bg-slate-900 transition-[width]"
          style={{ width: `${Math.round(progress * 100)}%` }}
        />
      </div>
    </div>
  );
}
