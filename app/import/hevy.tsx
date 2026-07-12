import React, { useCallback } from 'react';
import { Text } from '@/components/ui/text';
import { CsvImportFlow } from '@/components/import/csv-import-flow';
import { parseHevyCSV } from '@/lib/import/hevy';
import { toParsedCsvImport, type ParsedCsvImport } from '@/lib/import/shared';
import { useSettingsStore } from '@/stores/settings-store';

export default function HevyImportScreen() {
  const weightUnit = useSettingsStore((s) => s.weightUnit);
  const distanceUnit = useSettingsStore((s) => s.distanceUnit);

  const parse = useCallback(
    (csv: string): ParsedCsvImport =>
      toParsedCsvImport(parseHevyCSV(csv, { weightUnit, distanceUnit })),
    [weightUnit, distanceUnit]
  );

  return (
    <CsvImportFlow
      title="Hevy"
      instructionsTitle="HOW TO EXPORT FROM HEVY"
      instructions={
        <Text className="leading-6 text-foreground">
          1. Open Hevy on your device{'\n'}
          2. Go to <Text className="font-bold">Profile</Text> →{' '}
          <Text className="font-bold">Settings</Text>
          {'\n'}
          3. Tap <Text className="font-bold">Export & Import Data</Text>
          {'\n'}
          4. Tap <Text className="font-bold">Export Workouts</Text> — the CSV
          is sent to your email{'\n'}
          5. Save the CSV file and upload it below
        </Text>
      }
      pickerHint="Tap to choose your Hevy export file"
      parse={parse}
    />
  );
}
