import { Canvas, Group, RoundedRect } from '@shopify/react-native-skia';
import { StyleSheet } from 'react-native';
import { useDerivedValue } from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';

/**
 * Fixed-cost shuffle proxy (CLAUDE.md: ~20 sprites, never per-card):
 * card backs orbit and tumble while the re-sort commits off the render
 * path. `active` (0→1) fades the whole overlay; `progress` loops 0→1.
 */

const SPRITE_COUNT = 16;
const CARD_W = 46;
const CARD_H = CARD_W / (63 / 88);

/** Deterministic pseudo-random in [0,1) per sprite/salt — worklet-safe. */
function rand(i: number, salt: number): number {
  'worklet';
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

interface SpriteProps {
  index: number;
  progress: SharedValue<number>;
  width: number;
  height: number;
}

function Sprite({ index, progress, width, height }: SpriteProps) {
  const transform = useDerivedValue(() => {
    const t = progress.value;
    const baseAngle = (index / SPRITE_COUNT) * Math.PI * 2;
    const speed = 0.6 + rand(index, 1) * 0.9;
    const angle = baseAngle + t * Math.PI * 2 * speed;
    const radius =
      Math.min(width, height) * (0.18 + 0.16 * rand(index, 2)) *
      (1 + 0.25 * Math.sin(t * Math.PI * 2 + rand(index, 3) * Math.PI * 2));
    const x = width / 2 + radius * Math.cos(angle) * 1.35;
    const y = height / 2 + radius * Math.sin(angle) * 0.85;
    const rotate = t * Math.PI * 2 * (rand(index, 4) > 0.5 ? 1.5 : -1.5) + baseAngle;
    const scale = 0.85 + 0.3 * rand(index, 5);
    return [
      { translateX: x },
      { translateY: y },
      { rotate },
      { scale },
      { translateX: -CARD_W / 2 },
      { translateY: -CARD_H / 2 },
    ];
  });

  const color = index % 3 === 0 ? '#3b5ba7' : index % 3 === 1 ? '#2a4894' : '#4a6cb3';

  return (
    <Group transform={transform}>
      <RoundedRect x={0} y={0} width={CARD_W} height={CARD_H} r={4} color={color} />
      <RoundedRect
        x={3}
        y={3}
        width={CARD_W - 6}
        height={CARD_H - 6}
        r={3}
        color="#5d7fc4"
        style="stroke"
        strokeWidth={1.5}
      />
    </Group>
  );
}

interface Props {
  /** 0 hidden … 1 fully visible (drive with withTiming). */
  active: SharedValue<number>;
  /** Looping 0→1 (drive with withRepeat(withTiming(...))). */
  progress: SharedValue<number>;
  width: number;
  height: number;
}

export function ShuffleOverlay({ active, progress, width, height }: Props) {
  const opacity = useDerivedValue(() => active.value);

  return (
    <Canvas pointerEvents="none" style={[styles.canvas, { width, height }]}>
      <Group opacity={opacity}>
        <RoundedRect x={0} y={0} width={width} height={height} r={0} color="rgba(236,239,241,0.88)" />
        {Array.from({ length: SPRITE_COUNT }, (_, i) => (
          <Sprite key={i} index={i} progress={progress} width={width} height={height} />
        ))}
      </Group>
    </Canvas>
  );
}

const styles = StyleSheet.create({
  canvas: { position: 'absolute', top: 0, left: 0 },
});
