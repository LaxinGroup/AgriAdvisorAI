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

import {
  addPdfSource,
  addSourceFromLink,
  addSourceParagraph,
  deleteSource,
  KnowledgeSource,
  listSources,
  renameSource,
} from '@/lib/sources';

type EntryMode = 'link' | 'paragraph';

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

  const sourceType =
    source.source_type === 'webpage'
      ? 'Webpage'
      : source.source_type === 'pdf'
        ? 'PDF'
        : 'Pasted text';

  return (
    <View className="border-b border-slate-200 py-4 dark:border-zinc-800">
      {isEditing ? (
        <View>
          <Text className="mb-2 text-sm font-medium text-slate-800 dark:text-slate-200">
            Source title
          </Text>
          <TextInput
            accessibilityLabel="Source title"
            autoCapitalize="sentences"
            className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
            onChangeText={setTitle}
            value={title}
          />
          <View className="mt-2 flex-row gap-3">
            <Pressable
              accessibilityLabel="Save source title"
              accessibilityRole="button"
              className="min-h-11 justify-center px-2"
              disabled={busy}
              onPress={() => void saveTitle()}>
              <Text className="font-semibold text-brand-700 dark:text-brand-300">Save</Text>
            </Pressable>
            <Pressable
              accessibilityLabel="Cancel title edit"
              accessibilityRole="button"
              className="min-h-11 justify-center px-2"
              onPress={() => {
                setTitle(source.title);
                setIsEditing(false);
              }}>
              <Text className="text-slate-600 dark:text-slate-300">Cancel</Text>
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
            Added {new Date(source.created_at).toLocaleDateString()}
          </Text>
          {canManage ? (
            <View className="mt-2 flex-row gap-3">
              <Pressable
                accessibilityLabel={`Edit ${source.title}`}
                accessibilityRole="button"
                className="min-h-11 justify-center px-2"
                onPress={() => setIsEditing(true)}>
                <Text className="font-medium text-brand-700 dark:text-brand-300">Edit title</Text>
              </Pressable>
              <Pressable
                accessibilityLabel={`Delete ${source.title}`}
                accessibilityRole="button"
                className="min-h-11 justify-center px-2"
                disabled={busy}
                onPress={() => onDelete(source)}>
                <Text className="font-medium text-red-700 dark:text-red-300">Delete</Text>
              </Pressable>
            </View>
          ) : null}
        </>
      )}
    </View>
  );
}

export default function SourcesScreen() {
  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Sources could not be loaded. Retry the request.',
      );
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
      setError(
        addError instanceof Error
          ? addError.message
          : 'The source could not be added. Check the details and retry.',
      );
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
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : 'The PDF could not be added. Retry the upload.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleRename(source: KnowledgeSource, nextTitle: string) {
    const trimmedTitle = nextTitle.trim();
    if (!trimmedTitle) {
      setError('Enter a title for this source.');
      throw new Error('A title is required.');
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
      setError(
        renameError instanceof Error
          ? renameError.message
          : 'The source title could not be updated.',
      );
      throw renameError;
    } finally {
      setBusy(false);
    }
  }

  function confirmDelete(source: KnowledgeSource) {
    Alert.alert('Delete source?', `Remove "${source.title}" from the shared library?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          setBusy(true);
          setError(null);
          void deleteSource(source.id)
            .then(() => {
              setSources((current) => current.filter((item) => item.id !== source.id));
            })
            .catch((deleteError: unknown) => {
              setError(
                deleteError instanceof Error
                  ? deleteError.message
                  : 'The source could not be deleted.',
              );
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
          Sources
        </Text>
        <Text className="mt-1 text-sm leading-5 text-slate-600 dark:text-slate-300">
          Approved information used to answer staff questions.
        </Text>

        {canManage ? (
          <View className="mt-5 border-b border-slate-200 pb-5 dark:border-zinc-800">
            <Text className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Add a source
            </Text>
            <View className="mt-3 flex-row gap-2">
              {(['link', 'paragraph'] as const).map((mode) => (
                <Pressable
                  key={mode}
                  accessibilityLabel={`Add ${mode}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: entryMode === mode }}
                  className={`min-h-11 justify-center rounded-lg border px-3 ${
                    entryMode === mode
                      ? 'border-brand-700 bg-brand-50 dark:border-brand-300 dark:bg-zinc-900'
                      : 'border-slate-300 bg-white dark:border-zinc-700 dark:bg-zinc-900'
                  }`}
                  onPress={() => setEntryMode(mode)}>
                  <Text className="text-sm font-medium text-slate-800 dark:text-slate-100">
                    {mode === 'link' ? 'Web link' : 'Pasted text'}
                  </Text>
                </Pressable>
              ))}
              <Pressable
                accessibilityLabel="Upload a PDF"
                accessibilityRole="button"
                className="min-h-11 justify-center rounded-lg border border-slate-300 bg-white px-3 dark:border-zinc-700 dark:bg-zinc-900"
                disabled={busy}
                onPress={() => void handlePdfUpload()}>
                <Text className="text-sm font-medium text-slate-800 dark:text-slate-100">
                  Upload PDF
                </Text>
              </Pressable>
            </View>

            {entryMode === 'link' ? (
              <View className="mt-4">
                <Text className="mb-2 text-sm font-medium text-slate-800 dark:text-slate-200">
                  Public webpage or direct PDF link
                </Text>
                <TextInput
                  accessibilityLabel="Source link"
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
                    Title
                  </Text>
                  <TextInput
                    accessibilityLabel="Source title"
                    autoCapitalize="sentences"
                    className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
                    onChangeText={setTitle}
                    placeholder="Required source title"
                    value={title}
                  />
                </View>
                <View className="mt-4">
                  <Text className="mb-2 text-sm font-medium text-slate-800 dark:text-slate-200">
                    Paragraph
                  </Text>
                  <TextInput
                    accessibilityLabel="Source paragraph"
                    className="min-h-28 rounded-lg border border-slate-300 bg-white px-3 py-3 text-base text-slate-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
                    multiline
                    onChangeText={setParagraph}
                    placeholder="Paste approved source text"
                    textAlignVertical="top"
                    value={paragraph}
                  />
                </View>
              </>
            )}

            <Pressable
              accessibilityLabel={entryMode === 'link' ? 'Add link source' : 'Add text source'}
              accessibilityRole="button"
              accessibilityState={{ disabled: busy }}
              className="mt-4 min-h-11 items-center justify-center self-start rounded-xl bg-brand-700 px-4 active:opacity-75"
              disabled={busy}
              onPress={() => void handleAdd()}>
              <Text className="font-semibold text-white">
                {busy ? 'Processing...' : 'Add source'}
              </Text>
            </Pressable>
          </View>
        ) : (
          <Text className="mt-4 text-sm text-slate-600 dark:text-slate-300">
            Read-only access. A content curator can add or update sources.
          </Text>
        )}

        {error ? (
          <View className="mt-4">
            <Text accessibilityRole="alert" className="text-sm leading-5 text-red-700 dark:text-red-300">
              {error}
            </Text>
            <Pressable
              accessibilityLabel="Retry loading sources"
              accessibilityRole="button"
              className="mt-2 min-h-11 justify-center self-start px-2"
              onPress={() => void loadSources()}>
              <Text className="font-medium text-brand-700 dark:text-brand-300">Retry</Text>
            </Pressable>
          </View>
        ) : null}

        {isLoading ? (
          <Text className="mt-6 text-sm text-slate-600 dark:text-slate-300">
            Loading sources...
          </Text>
        ) : (
          <FlatList
            className="mt-2"
            contentContainerStyle={{ paddingBottom: 24 }}
            data={sources}
            keyExtractor={(item) => item.id}
            ListEmptyComponent={
              <Text className="py-6 text-sm text-slate-600 dark:text-slate-300">
                No sources have been added yet.
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
