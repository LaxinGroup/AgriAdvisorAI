import { useMemo, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { askAssistant, type AssistantResponse } from '@/lib/assistant';
import { useLanguage } from '@/lib/i18n';

type ConversationItem =
  | { id: string; role: 'user'; text: string }
  | { id: string; role: 'assistant'; response: AssistantResponse };

const CARD_STYLES = {
  success: 'border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950',
  warning: 'border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950',
  error: 'border-rose-200 bg-rose-50 dark:border-rose-900 dark:bg-rose-950',
};

export default function AssistantScreen() {
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList<ConversationItem>>(null);
  // The assistant is asked in the app language, so replies match the screen.
  const { language: locale, t } = useLanguage();
  const copy = useMemo(
    () => ({
      title: t('ask.title'),
      subtitle: t('ask.subtitle'),
      localeNote: t('ask.localeNote'),
      emptyTitle: t('ask.emptyTitle'),
      emptyDescription: t('ask.emptyDescription'),
      quickPrompts: [t('ask.prompt1'), t('ask.prompt2'), t('ask.prompt3')],
      questionLabel: t('ask.questionLabel'),
      placeholder: t('ask.placeholder'),
      sendLabel: t('ask.sendLabel'),
      loading: t('ask.loading'),
      errorTitle: t('ask.errorTitle'),
      errorMessage: t('ask.errorMessage'),
      retry: t('common.retry'),
      citationTitle: t('ask.citationTitle'),
      sourceLabel: t('ask.sourceLabel'),
      handoffTitle: t('ask.handoffTitle'),
      queueLabels: {
        general_support: t('ask.queue.general_support'),
        eligibility_review: t('ask.queue.eligibility_review'),
        content_curators: t('ask.queue.content_curators'),
      },
      disclaimer: t('ask.disclaimer'),
      eligibility: t('ask.eligibility'),
      escalation: t('ask.escalation'),
      standard: t('ask.standard'),
    }),
    [t],
  );
  const [messages, setMessages] = useState<ConversationItem[]>([]);
  const [draft, setDraft] = useState('');
  const [lastQuestion, setLastQuestion] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [hasError, setHasError] = useState(false);

  async function sendMessage(text = draft) {
    const question = text.trim();
    if (!question || isSending) return;

    setDraft('');
    setLastQuestion(question);
    setHasError(false);
    setMessages((current) => [
      ...current,
      { id: `${Date.now()}-user`, role: 'user', text: question },
    ]);
    setIsSending(true);

    try {
      const response = await askAssistant(question, locale);
      setMessages((current) => [
        ...current,
        { id: `${Date.now()}-assistant`, role: 'assistant', response },
      ]);
    } catch {
      setHasError(true);
    } finally {
      setIsSending(false);
    }

    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
  }

  function renderConversationItem({ item }: { item: ConversationItem }) {
    if (item.role === 'user') {
      return (
        <View className="mb-4 items-end">
          <View className="max-w-[88%] rounded-2xl rounded-tr-sm bg-brand-600 px-4 py-3">
            <Text className="text-sm leading-5 text-white">{item.text}</Text>
          </View>
        </View>
      );
    }

    const { response } = item;
    const heading =
      response.intent_category === 'eligibility_check'
        ? copy.eligibility
        : response.intent_category === 'standard_query'
          ? copy.standard
          : copy.escalation;
    const cardStyle = CARD_STYLES[response.ui_hints.nativewind_card_type];

    return (
      <View className="mb-5">
        <View className="mb-2 flex-row items-center">
          <View className="mr-2 h-2 w-2 rounded-full bg-brand-600" />
          <Text className="text-xs font-semibold text-slate-600 dark:text-slate-300">
            {copy.title}
          </Text>
        </View>
        <View className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <Text className="mb-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
            {heading}
          </Text>
          <Text className="text-sm leading-6 text-slate-700 dark:text-slate-200">
            {response.conversational_response}
          </Text>

          {response.citations.length > 0 && (
            <View className="mt-4 border-t border-slate-200 pt-3 dark:border-zinc-700">
              <Text className="mb-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                {copy.citationTitle}
              </Text>
              {response.citations.map((citation) => (
                <View
                  key={citation.match_id}
                  className="mb-2 rounded-lg bg-slate-100 px-3 py-2 dark:bg-zinc-800">
                  <Text className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                    {citation.title} [{copy.sourceLabel}: {citation.source_id}]
                  </Text>
                  {citation.location ? (
                    <Text className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {citation.location}
                    </Text>
                  ) : null}
                  {citation.url_or_reference ? (
                    <Text className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {citation.url_or_reference}
                    </Text>
                  ) : null}
                  <Text className="mt-2 text-sm leading-5 text-slate-700 dark:text-slate-200">
                    {citation.excerpt}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {response.escalation_payload.requires_human && (
            <View className={`mt-4 rounded-xl border p-3 ${cardStyle}`}>
              <Text className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                {copy.handoffTitle}
              </Text>
              <Text className="mt-1 text-xs text-slate-700 dark:text-slate-200">
                {copy.queueLabels[response.escalation_payload.routing_queue]}
              </Text>
            </View>
          )}
        </View>
      </View>
    );
  }

  function renderEmptyState() {
    return (
      <View className="flex-1 justify-center py-8">
        <View className="mb-6 border-l-4 border-brand-600 pl-4">
          <Text className="text-xl font-semibold leading-7 text-slate-900 dark:text-slate-100">
            {copy.emptyTitle}
          </Text>
          <Text className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
            {copy.emptyDescription}
          </Text>
        </View>
        <View className="gap-2">
          {copy.quickPrompts.map((prompt) => (
            <Pressable
              key={prompt}
              accessibilityLabel={prompt}
              accessibilityRole="button"
              className="min-h-14 flex-row items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 active:opacity-70 dark:border-zinc-800 dark:bg-zinc-900"
              onPress={() => void sendMessage(prompt)}>
              <Text className="mr-3 flex-1 text-sm leading-5 text-slate-700 dark:text-slate-200">
                {prompt}
              </Text>
              <Text className="text-lg text-brand-700 dark:text-brand-100">›</Text>
            </Pressable>
          ))}
        </View>
      </View>
    );
  }

  function renderFooter() {
    if (hasError) {
      return (
        <View
          accessibilityRole="alert"
          className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-4 dark:border-rose-900 dark:bg-rose-950">
          <Text className="text-sm font-semibold text-rose-900 dark:text-rose-100">
            {copy.errorTitle}
          </Text>
          <Text className="mt-1 text-sm leading-5 text-rose-800 dark:text-rose-200">
            {copy.errorMessage}
          </Text>
          <Pressable
            accessibilityLabel={copy.retry}
            accessibilityRole="button"
            className="mt-3 min-h-11 self-start justify-center rounded-lg bg-rose-800 px-4 active:opacity-75 dark:bg-rose-200"
            onPress={() => void sendMessage(lastQuestion)}>
            <Text className="text-sm font-semibold text-white dark:text-rose-950">
              {copy.retry}
            </Text>
          </Pressable>
        </View>
      );
    }

    if (isSending) {
      return (
        <View accessibilityLiveRegion="polite" className="mb-4 flex-row items-center">
          <View className="mr-3 h-2 w-2 rounded-full bg-brand-600" />
          <Text className="text-sm text-slate-600 dark:text-slate-300">{copy.loading}</Text>
        </View>
      );
    }

    return null;
  }

  return (
    <SafeAreaView className="flex-1 bg-slate-50 dark:bg-zinc-950" edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View className="w-full max-w-3xl flex-1 self-center">
          <View className="border-b border-slate-200 px-5 pb-3 pt-2 dark:border-zinc-800">
            <Text className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              {copy.title}
            </Text>
            <View className="mt-1 flex-row items-center justify-between">
              <Text className="text-xs text-slate-500 dark:text-slate-400">{copy.subtitle}</Text>
              <Text className="text-xs text-slate-500 dark:text-slate-400">
                {copy.localeNote}
              </Text>
            </View>
          </View>

          <FlatList
            ref={listRef}
            className="flex-1"
            contentContainerStyle={{
              flexGrow: 1,
              paddingHorizontal: 20,
              paddingTop: 20,
              paddingBottom: 16,
            }}
            data={messages}
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            keyboardShouldPersistTaps="handled"
            keyExtractor={(item) => item.id}
            ListEmptyComponent={renderEmptyState}
            ListFooterComponent={renderFooter}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
            renderItem={renderConversationItem}
          />

          <View
            className="border-t border-slate-200 bg-white px-5 pt-3 dark:border-zinc-800 dark:bg-zinc-900"
            style={{ paddingBottom: insets.bottom + 12 }}>
            <View className="min-h-14 flex-row items-center rounded-2xl border border-slate-300 bg-slate-50 pl-4 pr-2 dark:border-zinc-700 dark:bg-zinc-800">
              <TextInput
                accessibilityLabel={copy.questionLabel}
                className="max-h-28 min-h-11 flex-1 py-3 text-sm leading-5 text-slate-900 dark:text-slate-100"
                editable={!isSending}
                multiline
                onChangeText={setDraft}
                onSubmitEditing={() => void sendMessage()}
                placeholder={copy.placeholder}
                returnKeyType="send"
                value={draft}
              />
              <Pressable
                accessibilityLabel={copy.sendLabel}
                accessibilityRole="button"
                className={`ml-2 h-11 w-11 items-center justify-center rounded-xl ${
                  draft.trim() && !isSending ? 'bg-brand-600 active:opacity-75' : 'bg-slate-300'
                }`}
                disabled={!draft.trim() || isSending}
                onPress={() => void sendMessage()}>
                <Text className="text-xl font-semibold text-white">↑</Text>
              </Pressable>
            </View>
            <Text className="mt-2 text-center text-xs text-slate-500 dark:text-slate-400">
              {copy.disclaimer}
            </Text>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
