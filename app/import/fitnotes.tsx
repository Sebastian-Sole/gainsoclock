import React, { useCallback } from 'react';
import { Text } from '@/components/ui/text';
import { CsvImportFlow } from '@/components/import/csv-import-flow';
import { parseFitNotesCSV, toFitNotesImport } from '@/lib/import/fitnotes';
import type { ParsedCsvImport } from '@/lib/import/shared';

export default function FitNotesImportScreen() {
  const parse = useCallback(
    (csv: string): ParsedCsvImport => toFitNotesImport(parseFitNotesCSV(csv)),
    []
  );

  return (
    <CsvImportFlow
      title="FitNotes"
      instructionsTitle="HOW TO EXPORT FROM FITNOTES"
      instructions={
        <Text className="leading-6 text-foreground">
          1. Open FitNotes on your device{'\n'}
          2. Go to <Text className="font-bold">Settings</Text>
          {'\n'}
          3. Tap <Text className="font-bold">Export Data</Text>
          {'\n'}
          4. Tap <Text className="font-bold">Export Workouts</Text>
          {'\n'}
          5. Save the CSV file and upload it below
        </Text>
      }
      pickerHint="Tap to choose your FitNotes export file"
      parse={parse}
    />
  );
}
