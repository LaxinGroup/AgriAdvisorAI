import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function SupportScreen() {
  return (
    <SafeAreaView className="flex-1 bg-slate-50 dark:bg-zinc-950" edges={['top', 'left', 'right']}>
      <View className="w-full max-w-3xl flex-1 self-center px-5 pt-4">
        <Text className="text-xl font-semibold text-slate-900 dark:text-slate-100">Support</Text>
        <View className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <Text className="text-sm leading-6 text-slate-600 dark:text-slate-300">
            Live support is not connected in this prototype yet.
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}
