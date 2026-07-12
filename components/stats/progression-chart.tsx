import React, { useState } from 'react';
import { View, Pressable, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { useColorScheme } from 'nativewind';
import { format } from 'date-fns';

import { Text } from '@/components/ui/text';
import { Colors } from '@/constants/theme';
import { trendAccessibilitySummary, type MetricValuePoint } from '@/lib/stats';

const CHART_HEIGHT = 120;
const PAD = 6; // keeps dots/stroke inside the SVG bounds
const MAX_DOTS = 40; // beyond this the line alone is clearer

interface ProgressionChartProps {
  /** Row title, e.g. "Weight" or "Estimated 1RM (Epley)". */
  title: string;
  /** Subject for the screen-reader trend summary, e.g.
   *  "Bench Press estimated 1RM (Epley)". */
  accessibilitySubject: string;
  /** Chronological dated points (see computeExerciseSeries). Needs >= 2. */
  points: MetricValuePoint[];
  formatValue: (value: number) => string;
}

/** Theme-resolved chart colors. SVG props can't take Tailwind classes, so
 *  colors are resolved in JS — same convention as progress-ring.tsx. */
function useChartColors() {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';
  return {
    line: Colors[isDark ? 'dark' : 'light'].tint,
    grid: isDark ? '#302820' : '#e7e1d8',
  };
}

function buildGeometry(points: MetricValuePoint[], width: number) {
  const times = points.map((p) => new Date(p.date).getTime());
  const t0 = times[0];
  const tSpan = times[times.length - 1] - t0;
  let vMin = Math.min(...points.map((p) => p.value));
  let vMax = Math.max(...points.map((p) => p.value));
  if (vMin === vMax) {
    // Flat series: pad the domain so the line sits mid-chart.
    const pad = Math.abs(vMin) > 0 ? Math.abs(vMin) * 0.1 : 1;
    vMin -= pad;
    vMax += pad;
  }
  const coords = points.map((p, i) => {
    const tx = tSpan > 0 ? (times[i] - t0) / tSpan : i / Math.max(1, points.length - 1);
    const ty = (p.value - vMin) / (vMax - vMin);
    return {
      x: PAD + tx * (width - 2 * PAD),
      y: PAD + (1 - ty) * (CHART_HEIGHT - 2 * PAD),
    };
  });
  const d = coords
    .map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)} ${c.y.toFixed(1)}`)
    .join(' ');
  return { coords, d };
}

/**
 * Generic hand-rolled line chart (decision: docs/decisions/charting.md).
 * Marks are SVG; all text is RN <Text> so Dynamic Type and theme tokens
 * apply. The chart block carries a trend-summary accessibilityLabel and the
 * "Show data" toggle exposes the underlying numbers to screen readers.
 */
export function ProgressionChart({
  title,
  accessibilitySubject,
  points,
  formatValue,
}: ProgressionChartProps) {
  const colors = useChartColors();
  const [width, setWidth] = useState(0);
  const [showData, setShowData] = useState(false);

  const handleLayout = (e: LayoutChangeEvent) => {
    setWidth(e.nativeEvent.layout.width);
  };

  if (points.length < 2) return null; // callers gate; defensive

  const first = points[0];
  const last = points[points.length - 1];
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const summary = trendAccessibilitySummary(accessibilitySubject, points, formatValue);

  return (
    <View className="gap-1">
      <View className="flex-row items-baseline justify-between gap-2">
        <Text className="text-sm font-medium">{title}</Text>
        <Text className="text-sm font-semibold">{formatValue(last.value)}</Text>
      </View>

      <View accessible accessibilityLabel={summary} onLayout={handleLayout}>
        {width > 0 && (
          <ChartSvg
            points={points}
            width={width}
            lineColor={colors.line}
            gridColor={colors.grid}
          />
        )}
      </View>

      <View className="flex-row justify-between gap-2">
        <Text className="text-xs text-muted-foreground">
          {format(new Date(first.date), 'MMM d, yyyy')}
        </Text>
        <Text className="text-xs text-muted-foreground">
          {format(new Date(last.date), 'MMM d, yyyy')}
        </Text>
      </View>
      <View className="flex-row justify-between gap-2">
        <Text className="text-xs text-muted-foreground">Low {formatValue(min)}</Text>
        <Text className="text-xs text-muted-foreground">High {formatValue(max)}</Text>
      </View>

      <Pressable
        onPress={() => setShowData((v) => !v)}
        accessibilityRole="button"
        accessibilityLabel={showData ? `Hide ${title} data` : `Show ${title} data`}
        accessibilityState={{ expanded: showData }}
        hitSlop={10}
        className="self-start rounded-md bg-muted px-3 py-2"
      >
        <Text className="text-xs font-medium text-muted-foreground">
          {showData ? 'Hide data' : 'Show data'}
        </Text>
      </Pressable>

      {showData && (
        <View accessibilityRole="list" className="rounded-lg border border-border">
          {points.map((p, i) => (
            <View
              key={`${p.date}-${i}`}
              className={`flex-row items-center justify-between px-3 py-1.5 ${
                i > 0 ? 'border-t border-border' : ''
              }`}
            >
              <Text className="text-xs text-muted-foreground">
                {format(new Date(p.date), 'MMM d, yyyy')}
              </Text>
              <Text className="text-xs font-medium">{formatValue(p.value)}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function ChartSvg({
  points,
  width,
  lineColor,
  gridColor,
}: {
  points: MetricValuePoint[];
  width: number;
  lineColor: string;
  gridColor: string;
}) {
  const { coords, d } = buildGeometry(points, width);
  return (
    <Svg width={width} height={CHART_HEIGHT}>
      <Line x1={PAD} y1={PAD} x2={width - PAD} y2={PAD} stroke={gridColor} strokeWidth={1} />
      <Line
        x1={PAD}
        y1={CHART_HEIGHT - PAD}
        x2={width - PAD}
        y2={CHART_HEIGHT - PAD}
        stroke={gridColor}
        strokeWidth={1}
      />
      <Path
        d={d}
        stroke={lineColor}
        strokeWidth={2}
        fill="none"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {coords.length <= MAX_DOTS &&
        coords.map((c, i) => (
          <Circle key={i} cx={c.x} cy={c.y} r={3} fill={lineColor} />
        ))}
    </Svg>
  );
}
