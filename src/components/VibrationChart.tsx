'use client';

import { useEffect, useRef } from 'react';

type VibrationStatus = 'normal' | 'warning' | 'danger';

interface VibrationChartProps {
  data: number[];
  status: VibrationStatus;
}

export default function VibrationChart({ data, status }: VibrationChartProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);

    ctx.fillStyle = 'rgba(0, 210, 106, 0.08)';
    ctx.fillRect(0, height * 0.7, width, height * 0.3);
    ctx.fillStyle = 'rgba(240, 160, 32, 0.08)';
    ctx.fillRect(0, height * 0.35, width, height * 0.35);
    ctx.fillStyle = 'rgba(244, 63, 94, 0.08)';
    ctx.fillRect(0, 0, width, height * 0.35);

    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(240, 160, 32, 0.4)';
    ctx.beginPath();
    ctx.moveTo(0, height * 0.7);
    ctx.lineTo(width, height * 0.7);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(244, 63, 94, 0.4)';
    ctx.beginPath();
    ctx.moveTo(0, height * 0.35);
    ctx.lineTo(width, height * 0.35);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.beginPath();
    ctx.lineWidth = 2;
    const safeData = data.length > 1 ? data : [0, 0];
    safeData.forEach((value, index) => {
      const x = (index / (safeData.length - 1)) * width;
      const y = height - (Math.min(value, 1.2) / 1.2) * height;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });

    ctx.strokeStyle =
      status === 'danger'
        ? '#f43f5e'
        : status === 'warning'
          ? '#f0a020'
          : '#00d26a';
    ctx.stroke();

    ctx.lineTo(width, height);
    ctx.lineTo(0, height);
    ctx.closePath();

    ctx.fillStyle =
      status === 'danger'
        ? 'rgba(244,63,94,0.15)'
        : status === 'warning'
          ? 'rgba(240,160,32,0.15)'
          : 'rgba(0,210,106,0.15)';
    ctx.fill();

    ctx.font = '9px Inter, sans-serif';
    ctx.fillStyle = '#8b92a5';
    ctx.fillText('1.0', 2, 12);
    ctx.fillText('0.5', 2, height * 0.58);
    ctx.fillText('0', 2, height - 3);

    ctx.font = 'italic 10px Inter, sans-serif';
    ctx.fillStyle = 'rgba(244, 63, 94, 0.5)';
    ctx.fillText('DANGER', width - 50, 14);
    ctx.fillStyle = 'rgba(240, 160, 32, 0.5)';
    ctx.fillText('WARNING', width - 55, height * 0.35 + 14);
    ctx.fillStyle = 'rgba(0, 210, 106, 0.5)';
    ctx.fillText('NORMAL', width - 50, height * 0.7 + 14);

    // Cleanup function to prevent memory leaks
    return () => {
      ctx.clearRect(0, 0, width, height);
    };
  }, [data, status]);

  return (
    <canvas
      ref={canvasRef}
      width={270}
      height={100}
      className="w-full rounded-lg border border-(--panel-border) bg-black/30"
    />
  );
}
