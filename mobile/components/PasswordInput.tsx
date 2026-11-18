import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { Pressable, TextInput, View, type TextInputProps } from 'react-native';

import { useColorScheme } from '@/components/useColorScheme';
import { useLanguage } from '@/lib/i18n';

// Placeholder text is dimmer than the field labels (slate-800 / slate-200).
export function usePlaceholderColor() {
  return useColorScheme() === 'dark' ? '#94a3b8' : '#64748b'; // slate-400 / slate-500
}

type PasswordInputProps = Omit<TextInputProps, 'secureTextEntry' | 'placeholderTextColor'>;

// Password field that starts hidden, with an eye button to show or hide it.
export function PasswordInput(props: PasswordInputProps) {
  const { t } = useLanguage();
  const [isVisible, setIsVisible] = useState(false);
  const placeholderColor = usePlaceholderColor();

  return (
    <View className="min-h-12 flex-row items-center rounded-lg border border-slate-300 bg-white dark:border-zinc-700 dark:bg-zinc-900">
      <TextInput
        {...props}
        autoCapitalize="none"
        autoCorrect={false}
        className="min-h-12 flex-1 px-3 text-base text-slate-900 dark:text-white"
        placeholderTextColor={placeholderColor}
        secureTextEntry={!isVisible}
      />
      <Pressable
        accessibilityLabel={isVisible ? t('password.hide') : t('password.show')}
        accessibilityRole="button"
        className="h-11 w-11 items-center justify-center active:opacity-75"
        hitSlop={4}
        onPress={() => setIsVisible((visible) => !visible)}>
        <SymbolView
          name={
            isVisible
              ? { ios: 'eye.slash', android: 'visibility_off', web: 'visibility_off' }
              : { ios: 'eye', android: 'visibility', web: 'visibility' }
          }
          size={20}
          tintColor={placeholderColor}
        />
      </Pressable>
    </View>
  );
}
