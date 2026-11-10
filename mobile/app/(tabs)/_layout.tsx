import { Tabs } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useColorScheme } from 'react-native';

export default function TabLayout() {
  const colorScheme = useColorScheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#476653',
        tabBarInactiveTintColor: colorScheme === 'dark' ? '#a1a1aa' : '#64748b',
        tabBarLabelStyle: {
          fontSize: 11,
        },
        tabBarStyle: {
          backgroundColor: colorScheme === 'dark' ? '#09090b' : '#ffffff',
          borderTopColor: colorScheme === 'dark' ? '#27272a' : '#e2e8f0',
        },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Ask',
          tabBarIcon: ({ color, size }) => (
            <SymbolView
              name={{
                ios: 'bubble.left',
                android: 'chat_bubble_outline',
                web: 'chat_bubble_outline',
              }}
              size={size}
              tintColor={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="sources"
        options={{
          title: 'Sources',
          tabBarIcon: ({ color, size }) => (
            <SymbolView
              name={{
                ios: 'book.closed',
                android: 'menu_book',
                web: 'menu_book',
              }}
              size={size}
              tintColor={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="support"
        options={{
          title: 'Support',
          tabBarIcon: ({ color, size }) => (
            <SymbolView
              name={{
                ios: 'headphones',
                android: 'headset_mic',
                web: 'headset_mic',
              }}
              size={size}
              tintColor={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="workspace"
        options={{
          title: 'Workspace',
          tabBarIcon: ({ color, size }) => (
            <SymbolView
              name={{
                ios: 'square.grid.2x2',
                android: 'grid_view',
                web: 'grid_view',
              }}
              size={size}
              tintColor={color}
            />
          ),
        }}
      />
    </Tabs>
  );
}
