import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { StyleSheet, Text, View } from 'react-native';

import type { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'PickerCards'>;

// Placeholder: card grid for a set lands with the card picker step.
export function PickerCardsScreen(_props: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.placeholder}>Card picker</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  placeholder: { color: '#999' },
});
