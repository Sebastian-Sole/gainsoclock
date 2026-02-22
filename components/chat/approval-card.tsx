import React, { useState } from 'react';
import { View, Pressable, ActivityIndicator, Modal, ScrollView } from 'react-native';
import { Text } from '@/components/ui/text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { useColorScheme } from 'nativewind';
import { Colors } from '@/constants/theme';
import { Check, X, ChevronDown } from 'lucide-react-native';
import { TemplatePreview } from './template-preview';
import { PlanPreview } from './plan-preview';
import { UpdatePlanPreview } from './update-plan-preview';
import { RecipePreview } from './recipe-preview';
import type { Id } from '@/convex/_generated/dataModel';

interface ApprovalCardProps {
  messageId: string;
  approval: {
    type: string;
    payload: string;
    status: string;
  };
  conversationClientId: string;
}

export function ApprovalCard({ messageId, approval, conversationClientId }: ApprovalCardProps) {
  const approveAction = useMutation(api.chat.approveAction);
  const rejectAction = useMutation(api.chat.rejectAction);
  const executeApproval = useMutation(api.aiTools.executeApproval);
  const [isProcessing, setIsProcessing] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const { colorScheme } = useColorScheme();

  const payload = JSON.parse(approval.payload);
  const isPending = approval.status === 'pending';
  const isApproved = approval.status === 'approved';
  const isRejected = approval.status === 'rejected';

  const handleApprove = async () => {
    setIsProcessing(true);
    try {
      await approveAction({ messageId: messageId as Id<"chatMessages"> });
      await executeApproval({
        type: approval.type,
        payload: approval.payload,
        conversationClientId,
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReject = async () => {
    setIsProcessing(true);
    try {
      await rejectAction({ messageId: messageId as Id<"chatMessages"> });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <>
      <View className="w-[85%] self-start rounded-xl border border-border bg-card overflow-hidden">
        {/* Preview content — tappable to expand */}
        <Pressable onPress={() => setDetailOpen(true)} className="p-3">
          {approval.type === 'create_template' && (
            <TemplatePreview data={payload} collapsed />
          )}
          {approval.type === 'create_plan' && (
            <PlanPreview data={payload} collapsed />
          )}
          {approval.type === 'update_plan' && (
            <UpdatePlanPreview data={payload} collapsed />
          )}
          {approval.type === 'create_recipe' && (
            <RecipePreview data={payload} collapsed />
          )}
          <View className="flex-row items-center justify-center gap-1 mt-2 pt-2 border-t border-border">
            <Text className="text-xs text-muted-foreground">Tap to view details</Text>
            <ChevronDown size={12} color={colorScheme === 'dark' ? '#9ca3af' : '#6b7280'} />
          </View>
        </Pressable>

        {/* Status / Action buttons */}
        {isPending && (
          <View className="flex-row border-t border-border">
            <Pressable
              onPress={handleReject}
              disabled={isProcessing}
              className="flex-1 flex-row items-center justify-center gap-2 border-r border-border bg-card py-3"
            >
              <X size={16} color="#ef4444" />
              <Text className="text-sm font-medium text-destructive">Reject</Text>
            </Pressable>
            <Pressable
              onPress={handleApprove}
              disabled={isProcessing}
              className="flex-1 flex-row items-center justify-center gap-2 bg-card py-3"
            >
              {isProcessing ? (
                <ActivityIndicator size="small" color={Colors[colorScheme === 'dark' ? 'dark' : 'light'].tint} />
              ) : (
                <>
                  <Check size={16} color="#22c55e" />
                  <Text className="text-sm font-medium text-green-500">Approve</Text>
                </>
              )}
            </Pressable>
          </View>
        )}

        {isApproved && (
          <View className="flex-row items-center justify-center gap-2 border-t border-border bg-green-500/10 py-2">
            <Check size={14} color="#22c55e" />
            <Text className="text-xs font-medium text-green-500">Approved & Saved</Text>
          </View>
        )}

        {isRejected && (
          <View className="flex-row items-center justify-center gap-2 border-t border-border bg-destructive/10 py-2">
            <X size={14} color="#ef4444" />
            <Text className="text-xs font-medium text-destructive">Rejected</Text>
          </View>
        )}
      </View>

      {/* Full detail modal */}
      <Modal visible={detailOpen} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView className="flex-1 bg-background">
          <View className="flex-row items-center justify-between border-b border-border px-4 py-3">
            <Text className="text-lg font-bold">Details</Text>
            <Pressable onPress={() => setDetailOpen(false)} className="p-1">
              <X size={24} color={colorScheme === 'dark' ? '#fff' : '#000'} />
            </Pressable>
          </View>
          <ScrollView className="flex-1 px-4 py-4">
            {approval.type === 'create_template' && (
              <TemplatePreview data={payload} />
            )}
            {approval.type === 'create_plan' && (
              <PlanPreview data={payload} />
            )}
            {approval.type === 'update_plan' && (
              <UpdatePlanPreview data={payload} />
            )}
            {approval.type === 'create_recipe' && (
              <RecipePreview data={payload} />
            )}
          </ScrollView>

          {/* Approve/Reject in modal too */}
          {isPending && (
            <View className="flex-row border-t border-border px-4 pb-4 pt-3 gap-3">
              <Pressable
                onPress={() => { handleReject(); setDetailOpen(false); }}
                disabled={isProcessing}
                className="flex-1 flex-row items-center justify-center gap-2 rounded-xl border border-border bg-card py-3"
              >
                <X size={16} color="#ef4444" />
                <Text className="text-sm font-medium text-destructive">Reject</Text>
              </Pressable>
              <Pressable
                onPress={() => { handleApprove(); setDetailOpen(false); }}
                disabled={isProcessing}
                className="flex-1 flex-row items-center justify-center gap-2 rounded-xl bg-primary py-3"
              >
                {isProcessing ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Check size={16} color="#fff" />
                    <Text className="text-sm font-medium text-primary-foreground">Approve</Text>
                  </>
                )}
              </Pressable>
            </View>
          )}
        </SafeAreaView>
      </Modal>
    </>
  );
}
