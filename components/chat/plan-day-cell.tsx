import React from 'react';
import { Pressable } from 'react-native';
import { Text } from '@/components/ui/text';
import { Check, X } from 'lucide-react-native';
import { cn } from '@/lib/utils';
import { isPast } from '@/lib/plan-dates';

interface PlanDayCellProps {
  label?: string;
  status: string;
  date?: Date;
  cellWidth?: number;
  onPress: () => void;
  onLongPress?: () => void;
  isSwapSource?: boolean;
  isSwapTarget?: boolean;
}

export function PlanDayCell({
  label,
  status,
  date,
  cellWidth,
  onPress,
  onLongPress,
  isSwapSource,
  isSwapTarget,
}: PlanDayCellProps) {
  const isRest = status === 'rest' || !label;
  const isCompleted = status === 'completed';
  const isSkipped = status === 'skipped';
  const isMissed = status === 'pending' && !!date && isPast(date);

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={false}
      style={[
        cellWidth ? { width: cellWidth } : undefined,
        isSwapSource ? { borderWidth: 2, borderColor: '#f97316' } : undefined,
        isSwapTarget && !isSwapSource ? { borderWidth: 1, borderStyle: 'dashed', borderColor: '#f97316' } : undefined,
      ]}
      className={cn(
        !cellWidth && 'flex-1',
        'items-center justify-center rounded-lg py-2 mx-0.5',
        isCompleted && !isSwapSource && 'bg-green-500/15',
        isSkipped && !isSwapSource && 'bg-yellow-500/10',
        isMissed && !isSwapSource && 'bg-red-500/10',
        isRest && !isSwapSource && !isSwapTarget && 'bg-muted/30',
        isSwapTarget && isRest && 'bg-primary/5',
        !isCompleted && !isSkipped && !isMissed && !isRest && !isSwapSource && 'bg-card border border-border'
      )}
    >
      {isCompleted ? (
        <Check size={14} color="#22c55e" />
      ) : isMissed ? (
        <X size={14} color="#ef4444" />
      ) : (
        <Text
          className={cn(
            'text-[10px] text-center leading-tight px-1',
            isRest ? 'text-muted-foreground/50' : 'text-foreground'
          )}
          numberOfLines={2}
        >
          {isRest ? '-' : (label ?? '')}
        </Text>
      )}
    </Pressable>
  );
}
