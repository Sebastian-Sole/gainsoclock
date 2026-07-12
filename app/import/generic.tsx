import React, { useCallback } from 'react';
import { Text } from '@/components/ui/text';
import { CsvImportFlow } from '@/components/import/csv-import-flow';
import { parseGenericCSV } from '@/lib/import/generic-csv';
import { toParsedCsvImport, type ParsedCsvImport } from '@/lib/import/shared';
import { useSettingsStore } from '@/stores/settings-store';

export default function GenericCsvImportScreen() {
  const weightUnit = useSettingsStore((s) => s.weightUnit);
  const distanceUnit = useSettingsStore((s) => s.distanceUnit);

  const parse = useCallback(
    (csv: string): ParsedCsvImport =>
      toParsedCsvImport(parseGenericCSV(csv, { weightUnit, distanceUnit })),
    [weightUnit, distanceUnit]
  );

  return (
    <CsvImportFlow
      title="Generic CSV"
      instructionsTitle="SUPPORTED CSV FORMAT"
      instructions={
        <Text className="leading-6 text-foreground">
          Upload any CSV with a header row. Columns are detected
          automatically:{'\n'}
          {'\n'}• <Text className="font-bold">Date</Text> — e.g. “date”,
          “start_time” (ISO or DD/MM/YYYY){'\n'}•{' '}
          <Text className="font-bold">Exercise</Text> — e.g. “exercise”,
          “movement”, “lift”{'\n'}• <Text className="font-bold">Weight</Text> —
          “weight”, “weight_kg”, “weight_lbs”{'\n'}•{' '}
          <Text className="font-bold">Reps</Text> — “reps”, “repetitions”
          {'\n'}• <Text className="font-bold">Duration</Text> — “seconds”,
          “duration”, “time”{'\n'}
          {'\n'}Each row is one set. A date and exercise column plus at least
          one of weight, reps, or duration are required.
        </Text>
      }
      pickerHint="Tap to choose a CSV file"
      parse={parse}
    />
  );
}
