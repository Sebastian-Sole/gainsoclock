import React from 'react';
import { View } from 'react-native';
import Svg, { Defs, RadialGradient, Stop, Rect } from 'react-native-svg';
import { useColorScheme } from 'nativewind';

/**
 * The warm top glow from the Focus Mode spec — a subtle orange radial fading
 * into the background at the top of a screen. Purely decorative (render it
 * first inside a relatively-positioned container so content stacks above it).
 */
export function ScreenGlow({ height = 340 }: { height?: number }) {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';
  const accent = isDark ? '#fb8b3c' : '#f97316';
  const peak = isDark ? 0.24 : 0.13;

  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height }}>
      <Svg width="100%" height={height}>
        <Defs>
          <RadialGradient id="screenGlow" cx="50%" cy="-2%" rx="82%" ry="66%" fx="50%" fy="-4%">
            <Stop offset="0" stopColor={accent} stopOpacity={peak} />
            <Stop offset="0.62" stopColor={accent} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height={height} fill="url(#screenGlow)" />
      </Svg>
    </View>
  );
}
