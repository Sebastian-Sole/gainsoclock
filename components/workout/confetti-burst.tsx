import React, { useEffect, useState } from 'react';
import { View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Rect } from 'react-native-svg';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useTokenColors } from '@/hooks/use-token-colors';
import { useRingColors } from '@/components/shared/progress-ring';

/**
 * One-shot confetti burst for the workout-complete screen. Self-contained
 * Reanimated + react-native-svg — no confetti/lottie dependency. A single
 * shared progress value (0..1) drives every particle's physics in worklets;
 * particles unmount when the timing finishes. Purely decorative
 * (pointer-events none, hidden from screen readers); the success haptic is
 * fired by the caller, same convention as FocusReward. Renders nothing when
 * the system Reduce Motion setting is on.
 */

const PIECE_COUNT = 36;
const DURATION_MS = 2400;
/** Total gravity fall (px) over the normalized flight, applied as g·t². */
const GRAVITY = 640;

type PieceSpec = {
  id: number;
  shape: 'rect' | 'circle';
  size: number;
  /** Horizontal travel (px) over the full flight. */
  vx: number;
  /** Initial vertical travel (px); negative = launched upward. */
  vy: number;
  rotate0: number;
  rotateSpeed: number;
  swayAmp: number;
  swayFreq: number;
  swayPhase: number;
  flipSpeed: number;
  /** Per-piece stagger as a fraction of the timeline (0..0.15). */
  delay: number;
  colorIndex: number;
};

function createPieces(count: number): PieceSpec[] {
  const pieces: PieceSpec[] = [];
  for (let i = 0; i < count; i++) {
    // Upward cone, ±~80° around straight up (screen y is inverted).
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.9;
    const speed = 150 + Math.random() * 230;
    pieces.push({
      id: i,
      shape: i % 3 === 0 ? 'circle' : 'rect',
      size: 6 + Math.random() * 6,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      rotate0: Math.random() * 360,
      rotateSpeed: (Math.random() - 0.5) * 720,
      swayAmp: 8 + Math.random() * 18,
      swayFreq: 4 + Math.random() * 6,
      swayPhase: Math.random() * Math.PI * 2,
      flipSpeed: 6 + Math.random() * 8,
      delay: Math.random() * 0.15,
      colorIndex: i % 5,
    });
  }
  return pieces;
}

function ConfettiPiece({
  piece,
  progress,
  color,
  originX,
  originY,
}: {
  piece: PieceSpec;
  progress: SharedValue<number>;
  color: string;
  originX: number;
  originY: number;
}) {
  const animatedStyle = useAnimatedStyle(() => {
    const raw = (progress.value - piece.delay) / (1 - piece.delay);
    const t = Math.min(1, Math.max(0, raw));
    const x = piece.vx * t + Math.sin(t * piece.swayFreq + piece.swayPhase) * piece.swayAmp * t;
    const y = piece.vy * t + GRAVITY * t * t;
    const fade = t < 0.7 ? 1 : Math.max(0, 1 - (t - 0.7) / 0.3);
    const flip =
      piece.shape === 'rect'
        ? 0.35 + 0.65 * Math.abs(Math.cos(t * piece.flipSpeed + piece.swayPhase))
        : 1;
    return {
      opacity: t === 0 ? 0 : fade,
      transform: [
        { translateX: x },
        { translateY: y },
        { rotate: `${piece.rotate0 + piece.rotateSpeed * t}deg` },
        { scaleY: flip },
      ],
    };
  });

  const s = piece.size;
  return (
    <Animated.View
      style={[
        { position: 'absolute', left: originX - s / 2, top: originY - s / 2 },
        animatedStyle,
      ]}
    >
      <Svg width={s} height={s * 1.6} viewBox={`0 0 ${s} ${s * 1.6}`}>
        {piece.shape === 'circle' ? (
          <Circle cx={s / 2} cy={s / 2} r={s / 2} fill={color} />
        ) : (
          <Rect x={0} y={0} width={s} height={s * 1.6} rx={s * 0.2} fill={color} />
        )}
      </Svg>
    </Animated.View>
  );
}

export function ConfettiBurst() {
  const reducedMotion = useReducedMotion();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const progress = useSharedValue(0);
  const [finished, setFinished] = useState(false);
  const [pieces] = useState(() => createPieces(PIECE_COUNT));
  const tokens = useTokenColors();
  const ring = useRingColors();

  // Theme-derived palette: brand orange, success green, and the chart accents.
  const palette = [ring.primary, ring.good, tokens.chartProtein, tokens.chartCarbs, tokens.chartFat];

  useEffect(() => {
    if (reducedMotion) return;
    progress.value = withTiming(1, { duration: DURATION_MS }, (done) => {
      if (done) runOnJS(setFinished)(true);
    });
  }, [reducedMotion, progress]);

  if (reducedMotion || finished) return null;

  // Burst origin: over the success check icon (safe-area top + header offset).
  const originX = width / 2;
  const originY = insets.top + 72;

  return (
    <View
      pointerEvents="none"
      className="absolute inset-0 overflow-hidden"
      style={{ zIndex: 50 }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {pieces.map((piece) => (
        <ConfettiPiece
          key={piece.id}
          piece={piece}
          progress={progress}
          color={palette[piece.colorIndex]}
          originX={originX}
          originY={originY}
        />
      ))}
    </View>
  );
}
