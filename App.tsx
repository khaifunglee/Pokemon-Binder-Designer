import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { useDbReady } from './src/db/hooks';
import { BinderListScreen } from './src/features/binders/BinderListScreen';
import { BinderScreen } from './src/features/binders/BinderScreen';
import { PickerCardsScreen } from './src/features/cards/PickerCardsScreen';
import { PickerSetsScreen } from './src/features/cards/PickerSetsScreen';
import { ChecklistScreen } from './src/features/checklist/ChecklistScreen';
import { ChecklistSetsScreen } from './src/features/checklist/ChecklistSetsScreen';
import { ImportScreen } from './src/features/import/ImportScreen';
import { MirrorCaptureScreen } from './src/features/binders/MirrorCaptureScreen';
import { MoveListScreen } from './src/features/binders/MoveListScreen';
import { StatsScreen } from './src/features/binders/StatsScreen';
import type { RootStackParamList } from './src/navigation/types';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  const { ready, error } = useDbReady();

  if (error) {
    return (
      <View style={styles.gate}>
        <Text>Database migration failed: {error.message}</Text>
      </View>
    );
  }
  if (!ready) {
    return <View style={styles.gate} />;
  }

  return (
    <GestureHandlerRootView style={styles.root}>
      <NavigationContainer>
        <Stack.Navigator initialRouteName="BinderList">
          <Stack.Screen
            name="BinderList"
            component={BinderListScreen}
            options={{ title: 'PokéBinder' }}
          />
          <Stack.Screen name="Binder" component={BinderScreen} />
          <Stack.Screen
            name="PickerSets"
            component={PickerSetsScreen}
            options={{ title: 'Add card', presentation: 'modal' }}
          />
          <Stack.Screen
            name="PickerCards"
            component={PickerCardsScreen}
            options={{ title: 'Pick a card' }}
          />
          <Stack.Screen
            name="ChecklistSets"
            component={ChecklistSetsScreen}
            options={{ title: 'Checklists' }}
          />
          <Stack.Screen name="Checklist" component={ChecklistScreen} />
          <Stack.Screen
            name="Import"
            component={ImportScreen}
            options={{ title: 'Import CSV', presentation: 'modal' }}
          />
          <Stack.Screen name="BinderStats" component={StatsScreen} />
          <Stack.Screen name="MirrorCapture" component={MirrorCaptureScreen} />
          <Stack.Screen name="ResortMoves" component={MoveListScreen} />
        </Stack.Navigator>
      </NavigationContainer>
      <StatusBar style="auto" />
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  gate: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
