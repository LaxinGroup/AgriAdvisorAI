import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useLanguage } from '@/lib/i18n';
import {
  addPdfSource,
  addSourceFromLink,
  addSourceParagraph,
  deleteSource,
  KnowledgeSource,
  listSources,
  renameSource,
} from '@/lib/sources';
import { TranslatableError, type TranslationKey } from '@/lib/translations';

type EntryMode = 'link' | 'paragraph';

// The caught error plus the message to use if it has none of its own.
type ScreenError = { error: unknown; fallbackKey: TranslationKey };

function SourceRow({
  source,
  canManage,
  busy,
  onDelete,
  onRename,
}: {
  source: KnowledgeSource;
  canManage: boolean;
  busy: boolean;
  onDelete: (source: KnowledgeSource) => void;
  onRename: (source: KnowledgeSource, title: string) => Promise<void>;
}) {
  const { t } = useLanguage();
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(source.title);

  async function saveTitle() {
    try {
      await onRename(source, title);
      setIsEditing(false);
    } catch {
      return;
    }
  }

  const sourceType = t(`sources.type.${source.source_type}`);

  return (
    <View className="border-b border-slate-200 py-4 dark:border-zinc-800">
      {isEditing ? (
        <View>
          <Text className="mb-2 text-sm font-medium text-slate-800 dark:text-slate-200">
            {t('sources.sourceTitle')}
          </Text>
          <TextInput
            accessibilityLabel={t('sources.sourceTitle')}
            autoCapitalize="sentences"
            className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
            onChangeText={setTitle}
            value={title}
          />
          <View className="mt-2 flex-row gap-3">
            <Pressable
              accessibilityLabel={t('sources.saveTitle')}
              accessibilityRole="button"
              className="min-h-11 justify-center px-2"
              disabled={busy}
              onPress={() => void saveTitle()}>
              <Text className="font-semibold text-brand-700 dark:text-brand-300">
                {t('common.save')}
              </Text>
            </Pressable>
            <Pressable
              accessibilityLabel={t('sources.cancelEdit')}
              accessibilityRole="button"
              className="min-h-11 justify-center px-2"
              onPress={() => {
                setTitle(source.title);
                setIsEditing(false);
              }}>
              <Text className="text-slate-600 dark:text-slate-300">{t('common.cancel')}</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <>
          <Text className="text-base font-semibold text-slate-900 dark:text-slate-100">
            {source.title}
          </Text>
          <Text className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            {sourceType}
            {source.source_url ? ` · ${source.source_url}` : ''}
          </Text>
          <Text className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {t('sources.added', { date: new Date(source.created_at).toLocaleDateString() })}
          </Text>
          {canManage ? (
            <View className="mt-2 flex-row gap-3">
              <Pressable
                accessibilityLabel={t('sources.editLabel', { title: source.title })}
                accessibilityRole="button"
                className="min-h-11 justify-center px-2"
                onPress={() => setIsEditing(true)}>
                <Text className="font-medium text-brand-700 dark:text-brand-300">
                  {t('sources.editTitle')}
                </Text>
              </Pressable>
              <Pressable
                accessibilityLabel={t('sources.deleteLabel', { title: source.title })}
                accessibilityRole="button"
                className="min-h-11 justify-center px-2"
                disabled={busy}
                onPress={() => onDelete(source)}>
                <Text className="font-medium text-red-700 dark:text-red-300">
                  {t('common.delete')}
                </Text>
              </Pressable>
            </View>
          ) : null}
        </>
      )}
    </View>
  );
}

export default function SourcesScreen() {
  const { errorMessage, t } = useLanguage();
  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  // Kept as the caught error so the message follows a language change.
  const [error, setError] = useState<ScreenError | null>(null);
  const [entryMode, setEntryMode] = useState<EntryMode>('link');
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [paragraph, setParagraph] = useState('');

  const loadSources = useCallback(async (refresh = false) => {
    if (refresh) setIsRefreshing(true);
    else setIsLoading(true);
    setError(null);
    try {
      const result = await listSources();
      setSources(result.sources);
      setCanManage(result.canManage);
    } catch (loadError) {
      setError({ error: loadError, fallbackKey: 'sources.loadFailed' });
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadSources();
  }, [loadSources]);

  async function handleAdd() {
    setError(null);
    setBusy(true);
    try {
      let created: KnowledgeSource;
      if (entryMode === 'link') {
        created = await addSourceFromLink(url.trim());
        setUrl('');
      } else {
        created = await addSourceParagraph(title.trim(), paragraph.trim());
        setTitle('');
        setParagraph('');
      }
      setSources((current) => [created, ...current.filter((source) => source.id !== created.id)]);
    } catch (addError) {
      setError({ error: addError, fallbackKey: 'sources.addFailed' });
    } finally {
      setBusy(false);
    }
  }

  async function handlePdfUpload() {
    setError(null);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      setBusy(true);
      const created = await addPdfSource(asset);
      setSources((current) => [created, ...current.filter((source) => source.id !== created.id)]);
    } catch (uploadError) {
      setError({ error: uploadError, fallbackKey: 'sources.pdfFailed' });
    } finally {
      setBusy(false);
    }
  }

  async function handleRename(source: KnowledgeSource, nextTitle: string) {
    const trimmedTitle = nextTitle.trim();
    if (!trimmedTitle) {
      const titleError = new TranslatableError('sources.titleRequired');
      setError({ error: titleError, fallbackKey: 'sources.titleRequired' });
      throw titleError;
    }
    setError(null);
    setBusy(true);
    try {
      await renameSource(source.id, trimmedTitle);
      setSources((current) =>
        current.map((item) =>
          item.id === source.id ? { ...item, title: trimmedTitle } : item,
        ),
      );
    } catch (renameError) {
      setError({ error: renameError, fallbackKey: 'sources.renameFailed' });
      throw renameError;
    } finally {
      setBusy(false);
    }
  }

  function confirmDelete(source: KnowledgeSource) {
    Alert.alert(t('sources.deleteTitle'), t('sources.deleteMessage', { title: source.title }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () => {
          setBusy(true);
          setError(null);
          void deleteSource(source.id)
            .then(() => {
              setSources((current) => current.filter((item) => item.id !== source.id));
            })
            .catch((deleteError: unknown) => {
              setError({ error: deleteError, fallbackKey: 'sources.deleteFailed' });
            })
            .finally(() => setBusy(false));
        },
      },
    ]);
  }

  const renderSource = ({ item }: { item: KnowledgeSource }) => (
    <SourceRow
      source={item}
      canManage={canManage}
      busy={busy}
      onDelete={confirmDelete}
      onRename={handleRename}
    />
  );

  return (
    <SafeAreaView className="flex-1 bg-slate-50 dark:bg-zinc-950" edges={['top', 'left', 'right']}>
      <View className="w-full max-w-3xl flex-1 self-center px-5 pt-4">
        <Text className="text-xl font-semibold text-slate-900 dark:text-slate-100">
          {t('sources.title')}
        </Text>
        <Text className="mt-1 text-sm leading-5 text-slate-600 dark:text-slate-300">
          {t('sources.subtitle')}
        </Text>

        {canManage ? (
          <View className="mt-5 border-b border-slate-200 pb-5 dark:border-zinc-800">
            <Text className="text-base font-semibold text-slate-900 dark:text-slate-100">
              {t('sources.addHeading')}
            </Text>
            <View className="mt-3 flex-row gap-2">
              {(['link', 'paragraph'] as const).map((mode) => (
                <Pressable
                  key={mode}
                  accessibilityLabel={t(`sources.addModeLabel.${mode}`)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: entryMode === mode }}
                  className={`min-h-11 justify-center rounded-lg border px-3 ${
                    entryMode === mode
                      ? 'border-brand-700 bg-brand-50 dark:border-brand-300 dark:bg-zinc-900'
                      : 'border-slate-300 bg-white dark:border-zinc-700 dark:bg-zinc-900'
                  }`}
                  onPress={() => setEntryMode(mode)}>
                  <Text className="text-sm font-medium text-slate-800 dark:text-slate-100">
                    {t(`sources.mode.${mode}`)}
                  </Text>
                </Pressable>
              ))}
              <Pressable
                accessibilityLabel={t('sources.uploadLabel')}
                accessibilityRole="button"
                className="min-h-11 justify-center rounded-lg border border-slate-300 bg-white px-3 dark:border-zinc-700 dark:bg-zinc-900"
                disabled={busy}
                onPress={() => void handlePdfUpload()}>
                <Text className="text-sm font-medium text-slate-800 dark:text-slate-100">
                  {t('sources.upload')}
                </Text>
              </Pressable>
            </View>

            {entryMode === 'link' ? (
              <View className="mt-4">
                <Text className="mb-2 text-sm font-medium text-slate-800 dark:text-slate-200">
                  {t('sources.linkLabel')}
                </Text>
                <TextInput
                  accessibilityLabel={t('sources.linkAccessibility')}
                  autoCapitalize="none"
                  autoCorrect={false}
                  className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
                  keyboardType="url"
                  onChangeText={setUrl}
                  placeholder="https://..."
                  value={url}
                />
              </View>
            ) : (
              <>
                <View className="mt-4">
                  <Text className="mb-2 text-sm font-medium text-slate-800 dark:text-slate-200">
                    {t('sources.titleLabel')}
                  </Text>
                  <TextInput
                    accessibilityLabel={t('sources.sourceTitle')}
                    autoCapitalize="sentences"
                    className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
                    onChangeText={setTitle}
                    placeholder={t('sources.titlePlaceholder')}
                    value={title}
                  />
                </View>
                <View className="mt-4">
                  <Text className="mb-2 text-sm font-medium text-slate-800 dark:text-slate-200">
                    {t('sources.paragraphLabel')}
                  </Text>
                  <TextInput
                    accessibilityLabel={t('sources.paragraphAccessibility')}
                    className="min-h-28 rounded-lg border border-slate-300 bg-white px-3 py-3 text-base text-slate-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
                    multiline
                    onChangeText={setParagraph}
                    placeholder={t('sources.paragraphPlaceholder')}
                    textAlignVertical="top"
                    value={paragraph}
                  />
                </View>
              </>
            )}

            <Pressable
              accessibilityLabel={
                entryMode === 'link' ? t('sources.addLinkLabel') : t('sources.addTextLabel')
              }
              accessibilityRole="button"
              accessibilityState={{ disabled: busy }}
              className="mt-4 min-h-11 items-center justify-center self-start rounded-xl bg-brand-700 px-4 active:opacity-75"
              disabled={busy}
              onPress={() => void handleAdd()}>
              <Text className="font-semibold text-white">
                {busy ? t('sources.processing') : t('sources.add')}
              </Text>
            </Pressable>
          </View>
        ) : (
          <Text className="mt-4 text-sm text-slate-600 dark:text-slate-300">
            {t('sources.readOnly')}
          </Text>
        )}

        {error ? (
          <View className="mt-4">
            <Text accessibilityRole="alert" className="text-sm leading-5 text-red-700 dark:text-red-300">
              {errorMessage(error.error, error.fallbackKey)}
            </Text>
            <Pressable
              accessibilityLabel={t('sources.retryLoading')}
              accessibilityRole="button"
              className="mt-2 min-h-11 justify-center self-start px-2"
              onPress={() => void loadSources()}>
              <Text className="font-medium text-brand-700 dark:text-brand-300">
                {t('common.retry')}
              </Text>
            </Pressable>
          </View>
        ) : null}

        {isLoading ? (
          <Text className="mt-6 text-sm text-slate-600 dark:text-slate-300">
            {t('sources.loading')}
          </Text>
        ) : (
          <FlatList
            className="mt-2"
            contentContainerStyle={{ paddingBottom: 24 }}
            data={sources}
            keyExtractor={(item) => item.id}
            ListEmptyComponent={
              <Text className="py-6 text-sm text-slate-600 dark:text-slate-300">
                {t('sources.empty')}
              </Text>
            }
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={() => void loadSources(true)}
              />
            }
            renderItem={renderSource}
          />
        )}
      </View>
    </SafeAreaView>
  );
}
