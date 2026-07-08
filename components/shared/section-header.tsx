import React from 'react';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

/**
 * The uppercase muted group label the Settings screen established
 * (`text-sm font-medium uppercase text-muted-foreground`), shared so every
 * screen labels its sections the same way.
 */
export function SectionHeader({ title, className }: { title: string; className?: string }) {
  return (
    <Text className={cn('mb-3 text-sm font-medium uppercase text-muted-foreground', className)}>
      {title}
    </Text>
  );
}
