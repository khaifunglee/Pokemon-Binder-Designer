import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { StyleSheet, Text, View } from 'react-native';

import type { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Binder'>;

// Placeholder: spread view (slot grid, pager, drag & drop) lands next.
export function BinderScreen({ route }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.placeholder}>Binder {route.params.binderId}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  placeholder: { color: '#999' },
});
