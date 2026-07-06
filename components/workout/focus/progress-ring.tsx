import React from 'react';
import Svg, { Circle } from 'react-native-svg';

interface ProgressRingProps {
  /** 0..1 */
  progress: number;
  size?: number;
  strokeWidth?: number;
  /** Resolved color strings (SVG can't take Tailwind classes). */
  color: string;
  trackColor: string;
}

/** A minimal completion ring. Colors are passed in resolved per theme by the
 *  caller (same convention as icon colors in set-row.tsx). */
export function ProgressRing({ progress, size = 20, strokeWidth = 3, color, trackColor }: ProgressRingProps) {
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(1, progress));
  const offset = circumference * (1 - clamped);
  const c = size / 2;

  return (
    <Svg width={size} height={size}>
      <Circle cx={c} cy={c} r={r} stroke={trackColor} strokeWidth={strokeWidth} fill="none" />
      {clamped > 0 && (
        <Circle
          cx={c}
          cy={c}
          r={r}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${c} ${c})`}
        />
      )}
    </Svg>
  );
}
