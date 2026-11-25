import { StyleSheet } from 'react-native';
import Animated, {
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';

import { CardFace } from '../cards/CardFace';

interface Props {
  imageUri: string | null;
  name: string | null;
  number: string | null;
  width: number;
  height: number;
  dragX: SharedValue<number>;
  dragY: SharedValue<number>;
  active: SharedValue<number>;
}

/**
 * The single floating card that follows the finger during a drag.
 * Position/scale run entirely on the UI thread via shared values.
 */
export function DragOverlay({ imageUri, name, number, width, height, dragX, dragY, active }: Props) {
  const style = useAnimatedStyle(() => ({
    opacity: active.value,
    transform: [
      { translateX: dragX.value - width / 2 },
      { translateY: dragY.value - height * 0.75 },
      { scale: withSpring(active.value === 1 ? 1.08 : 0.9) },
    ],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.overlay, { width, height }, style]}
    >
      <CardFace
        name={name}
        number={number}
        imageUri={imageUri}
        style={styles.image}
        contentFit="cover"
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    borderRadius: 6,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 12,
  },
  image: { width: '100%', height: '100%', borderRadius: 6 },
});
