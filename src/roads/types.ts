/** Baccarat game outcome */
export type Outcome = 'B' | 'P' | 'T'; // Banker, Player, Tie

/** A single game result */
export interface GameResult {
  outcome: Outcome;
  bankerPair?: boolean;
  playerPair?: boolean;
  natural?: boolean;
}

/** A cell in a road grid */
export interface RoadCell {
  /** Display color: red=Banker, blue=Player, green=Tie */
  color: 'red' | 'blue' | 'green';
  /** Tie count on this cell (for Big Road, ties stack on previous cell) */
  tieCount?: number;
  /** Whether banker had a pair */
  bankerPair?: boolean;
  /** Whether player had a pair */
  playerPair?: boolean;
}

/** A road grid is a 2D array [column][row] */
export type RoadGrid = (RoadCell | null)[][];

/** Derived road cell — only red or blue */
export interface DerivedRoadCell {
  color: 'red' | 'blue';
}

export type DerivedRoadGrid = (DerivedRoadCell | null)[][];

/** Big Road column entry for tracking column structure */
export interface BigRoadColumn {
  outcome: 'B' | 'P';
  cells: RoadCell[];
  tiesAtEnd: number;
}

/** Result of road analysis */
export interface RoadAnalysis {
  bigRoad: RoadGrid;
  beadPlate: RoadGrid;
  bigEyeBoy: DerivedRoadGrid;
  smallRoad: DerivedRoadGrid;
  cockroachPig: DerivedRoadGrid;
  columns: BigRoadColumn[];
}
