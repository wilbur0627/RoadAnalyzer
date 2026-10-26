import { GameResult } from './types';
import { buildBigRoad } from './big-road';
import { derivedRoadEntries } from './derived-road';

/** The three derived roads and their column offsets, in the order they are shown */
export const DERIVED_ROADS = [
  { key: 'bigEyeBoy', offset: 1 },
  { key: 'smallRoad', offset: 2 },
  { key: 'cockroachPig', offset: 3 },
] as const;

export type DerivedRoadKey = (typeof DERIVED_ROADS)[number]['key'];

/** The color each derived road adds for a hand; null for a road that has not started yet */
export type AskRoadColors = Record<DerivedRoadKey, 'red' | 'blue' | null>;

/**
 * Ask Road (問路): the entry each derived road would add if the next hand were
 * Banker, and if it were Player. It follows from the derived road rules, so it
 * is not a prediction. For a road that has started, the two are always opposite.
 */
export function askRoad(results: GameResult[]): Record<'B' | 'P', AskRoadColors> {
  const { columns } = buildBigRoad(results);
  const before = DERIVED_ROADS.map(({ offset }) => derivedRoadEntries(columns, offset).length);

  const ask = (outcome: 'B' | 'P'): AskRoadColors => {
    const { columns: next } = buildBigRoad([...results, { outcome }]);
    const colors = {} as AskRoadColors;
    DERIVED_ROADS.forEach(({ key, offset }, i) => {
      const entries = derivedRoadEntries(next, offset);
      // A Banker or Player hand adds one Big Road cell, so at most one entry per road
      colors[key] = entries.length > before[i] ? entries[entries.length - 1].color : null;
    });
    return colors;
  };

  return { B: ask('B'), P: ask('P') };
}
