import { useColorScheme } from 'nativewind';
import { TOKEN_COLORS } from '@/lib/theme';

/** Scheme-resolved theme token values for RN props that can't take Tailwind
 *  classes (same convention as useRingColors / set-row icon colors). */
export function useTokenColors() {
  const { colorScheme } = useColorScheme();
  return TOKEN_COLORS[colorScheme === 'dark' ? 'dark' : 'light'];
}
