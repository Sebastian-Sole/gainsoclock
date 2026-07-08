import { useEffect, useState } from 'react';
import { parseLocaleNumber } from '@/lib/format';

interface NumericFieldOptions {
  /** Current numeric value. 0 and undefined both display blank. */
  value: number | undefined;
  allowDecimals?: boolean;
  /** Parsed number on every keystroke; null when the field is empty. */
  onNumber: (n: number | null) => void;
}

const toDisplay = (v: number | undefined) => (v != null && v !== 0 ? String(v) : '');

/**
 * Shared text-state machinery for numeric set inputs (SetInput, Focus Mode's
 * BigInput): comma-decimal entry routed through lib/format's
 * `parseLocaleNumber` (the locale invariant from commit 2629ff8), external
 * value sync that doesn't clobber an in-progress trailing separator
 * ("82," parses to 82 already), and blur cleanup.
 */
export function useNumericField({ value, allowDecimals = false, onNumber }: NumericFieldOptions) {
  const [text, setText] = useState(() => toDisplay(value));

  // Sync external value changes (e.g. bulk edit, stepper) into local text.
  useEffect(() => {
    if (parseLocaleNumber(text) !== (value ?? null)) {
      setText(toDisplay(value));
    }
    // `text` is deliberately omitted: this only reacts to external `value`
    // changes; reacting to keystrokes would fight the user's in-progress edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const onChangeText = (input: string) => {
    // Digits plus at most one decimal separator ('.' or ',' — Norwegian etc.).
    if (input !== '' && !(allowDecimals ? /^\d*[.,]?\d*$/ : /^\d*$/).test(input)) return;
    setText(input);
    onNumber(parseLocaleNumber(input));
  };

  const onBlur = () => {
    // Clean up display on blur (e.g. "82." -> "82").
    setText(toDisplay(value));
  };

  return { text, onChangeText, onBlur };
}
