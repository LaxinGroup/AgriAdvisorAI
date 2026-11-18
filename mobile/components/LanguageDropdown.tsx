import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { useColorScheme } from '@/components/useColorScheme';
import { useLanguage } from '@/lib/i18n';
import { LANGUAGES } from '@/lib/translations';

const MENU_WIDTH = 200;
const SIDE_GUTTER = 20;

// Top-right language menu. Render it as the first child of a full-screen container:
// it adds a top bar for the button and, while open, an invisible layer that closes it.
export function LanguageDropdown() {
  const { language, setLanguage, t } = useLanguage();
  const { width } = useWindowDimensions();
  const isDark = useColorScheme() === 'dark';
  const [isOpen, setIsOpen] = useState(false);

  const iconColor = isDark ? '#cbd5e1' : '#334155'; // slate-300 / slate-700
  const currentLabel = LANGUAGES.find((option) => option.code === language)?.label ?? 'English';
  // Never wider than the screen minus the side gutters.
  const menuWidth = Math.min(MENU_WIDTH, width - SIDE_GUTTER * 2);

  return (
    <>
      {isOpen ? (
        <Pressable
          accessible={false}
          importantForAccessibility="no"
          onPress={() => setIsOpen(false)}
          style={[StyleSheet.absoluteFill, { zIndex: 10 }]}
        />
      ) : null}

      <View className="flex-row justify-end px-5 pt-2" style={{ zIndex: 20 }}>
        <View>
          <Pressable
            accessibilityLabel={`${t('language.select')}: ${currentLabel}`}
            accessibilityRole="button"
            accessibilityState={{ expanded: isOpen }}
            className="min-h-11 flex-row items-center gap-2 rounded-full border border-slate-300 bg-white px-3 active:opacity-75 dark:border-zinc-700 dark:bg-zinc-900"
            onPress={() => setIsOpen((open) => !open)}>
            <SymbolView
              name={{ ios: 'globe', android: 'language', web: 'language' }}
              size={18}
              tintColor={iconColor}
            />
            <Text className="text-sm font-medium text-slate-800 dark:text-slate-200">
              {currentLabel}
            </Text>
            <SymbolView
              name={
                isOpen
                  ? { ios: 'chevron.up', android: 'expand_less', web: 'expand_less' }
                  : { ios: 'chevron.down', android: 'expand_more', web: 'expand_more' }
              }
              size={16}
              tintColor={iconColor}
            />
          </Pressable>

          {isOpen ? (
            <View
              className="absolute right-0 mt-2 overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-zinc-700 dark:bg-zinc-900"
              style={{
                top: '100%',
                width: menuWidth,
                elevation: 6,
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.12,
                shadowRadius: 12,
              }}>
              {LANGUAGES.map((option) => {
                const selected = option.code === language;
                return (
                  <Pressable
                    accessibilityLabel={option.label}
                    accessibilityRole="menuitem"
                    accessibilityState={{ selected }}
                    className={`min-h-11 flex-row items-center justify-between px-4 active:opacity-75 ${
                      selected ? 'bg-brand-50 dark:bg-zinc-800' : ''
                    }`}
                    key={option.code}
                    onPress={() => {
                      setLanguage(option.code);
                      setIsOpen(false);
                    }}>
                    <Text
                      className={`text-base ${
                        selected
                          ? 'font-semibold text-slate-900 dark:text-white'
                          : 'text-slate-800 dark:text-slate-200'
                      }`}>
                      {option.label}
                    </Text>
                    {selected ? (
                      <SymbolView
                        name={{ ios: 'checkmark', android: 'check', web: 'check' }}
                        size={18}
                        tintColor="#476653"
                      />
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          ) : null}
        </View>
      </View>
    </>
  );
}
