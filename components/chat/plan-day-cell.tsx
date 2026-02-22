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
}

export function PlanDayCell({ label, status, date, cellWidth, onPress }: PlanDayCellProps) {
  const isRest = status === 'rest' || !label;
  const isCompleted = status === 'completed';
  const isSkipped = status === 'skipped';
  const isMissed = status === 'pending' && !!date && isPast(date);

  return (
    <Pressable
      onPress={onPress}
      disabled={isRest}
      style={cellWidth ? { width: cellWidth } : undefined}
      className={cn(
        !cellWidth && 'flex-1',
        'items-center justify-center rounded-lg py-2 mx-0.5',
        isCompleted && 'bg-green-500/15',
        isSkipped && 'bg-yellow-500/10',
        isMissed && 'bg-red-500/10',
        isRest && 'bg-muted/30',
        !isCompleted && !isSkipped && !isMissed && !isRest && 'bg-card border border-border'
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
