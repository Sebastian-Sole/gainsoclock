import React, { useState } from 'react';
import { View, Pressable, ActivityIndicator, Modal, ScrollView, Alert } from 'react-native';
import { Text } from '@/components/ui/text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { useColorScheme } from 'nativewind';
import { Colors } from '@/constants/theme';
import { Check, X, ChevronDown } from 'lucide-react-native';
import { Icon } from '@/components/ui/icon';
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
      // Execute resource creation first, then mark as approved only on success
      await executeApproval({
        type: approval.type,
        payload: approval.payload,
        conversationClientId,
      });
      await approveAction({ messageId: messageId as Id<"chatMessages"> });
    } catch (error) {
      console.error('Approval failed:', error);
      Alert.alert(
        'Approval Failed',
        'Something went wrong while processing this approval. Please try again.',
      );
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
            <Icon as={ChevronDown} size={12} className="text-muted-foreground" />
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
              <Icon as={X} size={16} className="text-destructive" />
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
                  <Icon as={Check} size={16} className="text-green-500" />
                  <Text className="text-sm font-medium text-green-500">Approve</Text>
                </>
              )}
            </Pressable>
          </View>
        )}

        {isApproved && (
          <View className="flex-row items-center justify-center gap-2 border-t border-border bg-green-500/10 py-2">
            <Icon as={Check} size={14} className="text-green-500" />
            <Text className="text-xs font-medium text-green-500">Approved & Saved</Text>
          </View>
        )}

        {isRejected && (
          <View className="flex-row items-center justify-center gap-2 border-t border-border bg-destructive/10 py-2">
            <Icon as={X} size={14} className="text-destructive" />
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
              <Icon as={X} size={24} className="text-foreground" />
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
                <Icon as={X} size={16} className="text-destructive" />
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
                    <Icon as={Check} size={16} className="text-primary-foreground" />
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
