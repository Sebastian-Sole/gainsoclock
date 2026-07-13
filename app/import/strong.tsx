import React, { useCallback } from 'react';
import { Text } from '@/components/ui/text';
import { CsvImportFlow } from '@/components/import/csv-import-flow';
import { parseStrongCSV } from '@/lib/import/strong';
import { toParsedCsvImport, type ParsedCsvImport } from '@/lib/import/shared';
import { useSettingsStore } from '@/stores/settings-store';

export default function StrongImportScreen() {
  const weightUnit = useSettingsStore((s) => s.weightUnit);
  const distanceUnit = useSettingsStore((s) => s.distanceUnit);

  const parse = useCallback(
    (csv: string): ParsedCsvImport =>
      toParsedCsvImport(parseStrongCSV(csv, { weightUnit, distanceUnit })),
    [weightUnit, distanceUnit]
  );

  return (
    <CsvImportFlow
      title="Strong"
      instructionsTitle="HOW TO EXPORT FROM STRONG"
      instructions={
        <Text className="leading-6 text-foreground">
          1. Open Strong on your device{'\n'}
          2. Go to <Text className="font-bold">Profile</Text> and tap the{' '}
          <Text className="font-bold">settings</Text> icon{'\n'}
          3. Tap <Text className="font-bold">Export Strong Data</Text>
          {'\n'}
          4. Save the CSV file and upload it below
        </Text>
      }
      pickerHint="Tap to choose your Strong export file"
      parse={parse}
    />
  );
}
