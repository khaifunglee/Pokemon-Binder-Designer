import type { Instruction } from './diff';

/**
 * Human phrasing for move-list instructions. Pure text generation —
 * pockets and pages are numbered 1-based the way a collector counts.
 */

export function locate(ordinal: number, slotsPerPage: number): string {
  const page = Math.floor(ordinal / slotsPerPage) + 1;
  const pocket = (ordinal % slotsPerPage) + 1;
  return `page ${page}, pocket ${pocket}`;
}

export interface InstructionText {
  title: string;
  details?: string[];
}

export function describeInstruction(
  instruction: Instruction,
  slotsPerPage: number,
  nameAt: (ordinal: number) => string,
): InstructionText {
  const loc = (o: number) => locate(o, slotsPerPage);

  switch (instruction.kind) {
    case 'place':
      return {
        title: `Move ${nameAt(instruction.from)}: ${loc(instruction.from)} → ${loc(instruction.to)}`,
      };

    case 'shift': {
      const { fromStart, fromEnd, offset } = instruction;
      const page = Math.floor(fromStart / slotsPerPage) + 1;
      const a = (fromStart % slotsPerPage) + 1;
      const b = (fromEnd % slotsPerPage) + 1;
      const direction = offset === 1 ? 'right' : 'left';
      // Rightward shifts must start from the far end so nothing is
      // overwritten; leftward from the near end.
      const startPocket = offset === 1 ? b : a;
      return {
        title: `Page ${page}: shift pockets ${a}–${b} ${direction} by one`,
        details: [`Start with pocket ${startPocket} and work ${offset === 1 ? 'backwards' : 'forwards'}.`],
      };
    }

    case 'swap':
      return {
        title: `Swap ${nameAt(instruction.a)} (${loc(instruction.a)}) with ${nameAt(instruction.b)} (${loc(instruction.b)})`,
      };

    case 'swapCycle': {
      const ring = instruction.ring;
      const details: string[] = [
        `Take ${nameAt(ring[0])} out of ${loc(ring[0])} and hold it.`,
      ];
      for (let i = 1; i < ring.length; i++) {
        details.push(
          `Put ${nameAt(ring[i - 1])} into ${loc(ring[i])}, taking out ${nameAt(ring[i])}.`,
        );
      }
      details.push(
        `Put ${nameAt(ring[ring.length - 1])} into ${loc(ring[0])} — it's empty now.`,
      );
      return {
        title: `Rotate ${ring.length} cards (keep one in hand)`,
        details,
      };
    }
  }
}
