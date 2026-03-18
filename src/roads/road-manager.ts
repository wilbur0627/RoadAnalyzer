import { GameResult, RoadAnalysis } from './types';
import { buildBigRoad } from './big-road';
import { buildBeadPlate } from './bead-plate';
import { buildBigEyeBoy, buildSmallRoad, buildCockroachPig } from './derived-road';

/**
 * RoadManager — orchestrates all 5 road types from a sequence of game results.
 */
export class RoadManager {
  private results: GameResult[] = [];

  /** Add a new game result */
  addResult(result: GameResult): void {
    this.results.push(result);
  }

  /** Set all results at once (e.g., from detection) */
  setResults(results: GameResult[]): void {
    this.results = [...results];
  }

  /** Get current results */
  getResults(): GameResult[] {
    return [...this.results];
  }

  /** Clear all results */
  clear(): void {
    this.results = [];
  }

  /** Get the number of results */
  get count(): number {
    return this.results.length;
  }

  /** Analyze all 5 road types */
  analyze(): RoadAnalysis {
    const { grid: bigRoad, columns } = buildBigRoad(this.results);
    const beadPlate = buildBeadPlate(this.results);
    const bigEyeBoy = buildBigEyeBoy(columns);
    const smallRoad = buildSmallRoad(columns);
    const cockroachPig = buildCockroachPig(columns);

    return {
      bigRoad,
      beadPlate,
      bigEyeBoy,
      smallRoad,
      cockroachPig,
      columns,
    };
  }
}
