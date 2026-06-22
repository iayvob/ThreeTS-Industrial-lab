"use client";

interface MobileTopBarProps {
  onOpenSidebar: () => void;
}

export default function MobileTopBar({ onOpenSidebar }: MobileTopBarProps) {
  return (
    <header className="absolute left-0 top-0 z-40 flex w-full items-center justify-between gap-4 border-b border-slate-200 bg-white/90 p-3 md:hidden">
      <button
        aria-label="Open sidebar"
        onClick={onOpenSidebar}
        className="h-9 w-9 rounded-md bg-slate-100 text-slate-700"
      >
        ☰
      </button>
      <div className="ml-2 text-base font-semibold text-slate-900">VLS6.60</div>
      <div style={{ width: 40 }} />
    </header>
  );
}
