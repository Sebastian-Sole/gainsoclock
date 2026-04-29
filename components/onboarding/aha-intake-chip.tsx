import { Pressable } from "react-native";
import { useRouter, type Href } from "expo-router";

import { Text } from "@/components/ui/text";

type Props = {
  label: string;
  value: string;
  editPath: Href;
  onBeforeEdit?: () => void;
  testID?: string;
};

// Chip used on the aha reveal so users can correct a single intake answer
// and the server re-generates. Tap navigates to the intake screen; on return
// the host screen issues a fresh generationId (subject to the 30s debounce
// + lifetime 5 cap).
export function AhaIntakeChip({
  label,
  value,
  editPath,
  onBeforeEdit,
  testID,
}: Props) {
  const router = useRouter();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}`}
      accessibilityHint="Double-tap to edit"
      onPress={() => {
        onBeforeEdit?.();
        router.push(editPath);
      }}
      hitSlop={8}
      className="flex-row items-center gap-2 self-start rounded-full border border-border bg-background px-3 py-2"
      testID={testID}
    >
      <Text className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </Text>
      <Text className="text-sm font-medium">{value}</Text>
    </Pressable>
  );
}
