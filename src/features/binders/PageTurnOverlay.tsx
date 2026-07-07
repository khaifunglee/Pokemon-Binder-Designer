import {
  Canvas,
  Group,
  LinearGradient,
  RoundedRect,
  vec,
} from '@shopify/react-native-skia';
import { StyleSheet } from 'react-native';
import { useDerivedValue } from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';

interface Props {
  /** 0 → 1 over one page turn; idle at 0 or 1. */
  progress: SharedValue<number>;
  /** +1 turning forward (sheet sweeps right→left), -1 backward. */
  direction: SharedValue<number>;
  width: number;
  height: number;
}

/**
 * Fixed-cost page-turn proxy: one Skia sheet flipping around the spine
 * while the pager snaps underneath. All values derive from shared values,
 * so the animation stays on the UI thread regardless of binder size.
 */
export function PageTurnOverlay({ progress, direction, width, height }: Props) {
  const inset = 12;
  const sheetW = width - inset * 2;
  const sheetH = height - inset * 2;

  // cos(π·p): 1 → -1; the sheet narrows to the spine then reopens mirrored.
  const scaleX = useDerivedValue(
    () => Math.cos(Math.PI * progress.value) * direction.value,
  );
  const transform = useDerivedValue(() => [{ scaleX: scaleX.value }]);
  const opacity = useDerivedValue(() =>
    progress.value <= 0.001 || progress.value >= 0.999 ? 0 : 1,
  );
  // Front face bright, back face dimmed.
  const sheetColor = useDerivedValue(() =>
    scaleX.value >= 0 ? '#ffffff' : '#e8e4dc',
  );
  const shadowOpacity = useDerivedValue(
    () => 0.25 * Math.sin(Math.PI * progress.value),
  );

  return (
    <Canvas pointerEvents="none" style={[styles.canvas, { width, height }]}>
      <Group opacity={opacity}>
        <Group origin={vec(width / 2, height / 2)} transform={transform}>
          <RoundedRect
            x={inset}
            y={inset}
            width={sheetW}
            height={sheetH}
            r={8}
            color={sheetColor}
          />
          <RoundedRect x={inset} y={inset} width={sheetW} height={sheetH} r={8}>
            <LinearGradient
              start={vec(inset, 0)}
              end={vec(inset + sheetW, 0)}
              colors={['rgba(0,0,0,0.12)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0.08)']}
            />
          </RoundedRect>
        </Group>
        <RoundedRect
          x={inset}
          y={inset}
          width={sheetW}
          height={sheetH}
          r={8}
          color="black"
          opacity={shadowOpacity}
        />
      </Group>
    </Canvas>
  );
}

const styles = StyleSheet.create({
  canvas: { position: 'absolute', top: 0, left: 0 },
});
