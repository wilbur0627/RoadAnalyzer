import { GameResult, BigRoadColumn } from './types';
import { derivedRoadEntries } from './derived-road';
import { t } from '../i18n/i18n';

export interface Prediction {
  outcome: 'B' | 'P';
  confidence: number; // 0-75 (capped)
  signals: PredictionSignal[];
}

export interface PredictionSignal {
  name: string;
  outcome: 'B' | 'P';
  weight: number;
  description: string;
}

/** Statistical summary of the shoe */
export interface ShoeStats {
  total: number;
  banker: number;
  player: number;
  tie: number;
  bankerPct: number;
  playerPct: number;
  avgStreak: number;
  longestBankerStreak: number;
  longestPlayerStreak: number;
  currentStreak: { outcome: 'B' | 'P'; length: number } | null;
  columnsCount: number;
  singlesCount: number; // Columns with length 1
  doublesCount: number; // Columns with length 2
  longStreaksCount: number; // Columns with length >= 4
}

/** Hands (ties included) needed before predicting at all */
const MIN_RESULTS_FOR_PREDICTION = 10;
/** Hands (ties included) from which confidence is no longer scaled down */
const FULL_CONFIDENCE_RESULTS = 30;
const MAX_CONFIDENCE = 75;

/**
 * Predict the next outcome based on multiple signals.
 * Returns null if not enough data.
 */
export function predict(
  results: GameResult[],
  columns: BigRoadColumn[],
  isPremium: boolean = false,
): Prediction | null {
  if (results.length < MIN_RESULTS_FOR_PREDICTION) return null;
  const nonTieResults = results.filter(r => r.outcome !== 'T');

  const signals: PredictionSignal[] = [];

  // Signal 1: Streak Analysis (free tier)
  const streakSignal = analyzeStreak(columns);
  if (streakSignal) signals.push(streakSignal);

  // Signal 2: Frequency Analysis (free tier)
  const freqSignal = analyzeFrequency(nonTieResults);
  if (freqSignal) signals.push(freqSignal);

  // Signal 3: Pattern Matching (premium)
  if (isPremium) {
    const patternSignals = analyzePatterns(columns);
    signals.push(...patternSignals);
  }

  // Signal 4: Derived Road Consensus (premium)
  if (isPremium) {
    const consensusSignal = analyzeDerivedConsensus(columns);
    if (consensusSignal) signals.push(consensusSignal);
  }

  // Signal 5: Rhythm Analysis (premium)
  if (isPremium) {
    const rhythmSignal = analyzeRhythm(columns);
    if (rhythmSignal) signals.push(rhythmSignal);
  }

  if (signals.length === 0) return null;

  // Weighted vote
  let bankerScore = 0;
  let playerScore = 0;
  let totalWeight = 0;

  for (const signal of signals) {
    totalWeight += signal.weight;
    if (signal.outcome === 'B') {
      bankerScore += signal.weight;
    } else {
      playerScore += signal.weight;
    }
  }

  const winningOutcome: 'B' | 'P' = bankerScore >= playerScore ? 'B' : 'P';
  const winningScore = Math.max(bankerScore, playerScore);

  // How much the signals agree: 0 when split evenly (a coin flip), 1 when unanimous
  const agreement = (winningScore / totalWeight - 0.5) / 0.5;
  // Patterns in a short history mean little, so scale down until there is enough data
  const dataFactor = Math.min(1, results.length / FULL_CONFIDENCE_RESULTS);
  const confidence = Math.min(
    MAX_CONFIDENCE,
    Math.round(agreement * dataFactor * MAX_CONFIDENCE),
  );

  return {
    outcome: winningOutcome,
    confidence: Math.max(1, confidence),
    signals,
  };
}

/** Display name of a signal; signal names are internal ids such as 'pattern_pingpong' */
export function signalLabel(name: string): string {
  if (name.startsWith('pattern_')) return t('prediction.patternMatch');
  const keys: Record<string, string> = {
    streak: 'prediction.streakAnalysis',
    frequency: 'prediction.frequency',
    derived_consensus: 'prediction.derivedConsensus',
    rhythm: 'prediction.rhythm',
  };
  return keys[name] ? t(keys[name]) : name;
}

/** Calculate shoe statistics */
export function calculateStats(
  results: GameResult[],
  columns: BigRoadColumn[],
): ShoeStats {
  // Single pass over results
  let banker = 0, player = 0, tie = 0;
  for (const r of results) {
    if (r.outcome === 'B') banker++;
    else if (r.outcome === 'P') player++;
    else tie++;
  }
  const total = results.length;
  const nonTie = banker + player;

  // Single pass over columns
  let longestBankerStreak = 0, longestPlayerStreak = 0;
  let singlesCount = 0, doublesCount = 0, longStreaksCount = 0;
  let totalCells = 0;

  for (const col of columns) {
    const len = col.cells.length;
    totalCells += len;
    if (col.outcome === 'B' && len > longestBankerStreak) longestBankerStreak = len;
    if (col.outcome === 'P' && len > longestPlayerStreak) longestPlayerStreak = len;
    if (len === 1) singlesCount++;
    else if (len === 2) doublesCount++;
    if (len >= 4) longStreaksCount++;
  }

  const avgStreak = columns.length > 0 ? totalCells / columns.length : 0;
  const lastCol = columns.length > 0 ? columns[columns.length - 1] : null;

  return {
    total, banker, player, tie,
    bankerPct: nonTie > 0 ? (banker / nonTie) * 100 : 0,
    playerPct: nonTie > 0 ? (player / nonTie) * 100 : 0,
    avgStreak: Math.round(avgStreak * 10) / 10,
    longestBankerStreak,
    longestPlayerStreak,
    currentStreak: lastCol ? { outcome: lastCol.outcome, length: lastCol.cells.length } : null,
    columnsCount: columns.length,
    singlesCount, doublesCount, longStreaksCount,
  };
}

// ── Signal Analyzers ──

/** Analyze current streak and predict continuation or reversal */
function analyzeStreak(columns: BigRoadColumn[]): PredictionSignal | null {
  if (columns.length < 2) return null;

  const lastCol = columns[columns.length - 1];
  const streakLen = lastCol.cells.length;
  const avgStreak = columns.reduce((sum, col) => sum + col.cells.length, 0) / columns.length;

  if (streakLen > avgStreak * 1.5) {
    const reverseOutcome: 'B' | 'P' = lastCol.outcome === 'B' ? 'P' : 'B';
    return {
      name: 'streak',
      outcome: reverseOutcome,
      weight: 0.3,
      description: t('signal.streakExceedsAvg', streakLen, avgStreak.toFixed(1)),
    };
  } else {
    return {
      name: 'streak',
      outcome: lastCol.outcome,
      weight: 0.25,
      description: t('signal.streakWithAvg', streakLen, avgStreak.toFixed(1)),
    };
  }
}

/** Simple frequency analysis */
function analyzeFrequency(nonTieResults: GameResult[]): PredictionSignal | null {
  if (nonTieResults.length < 10) return null;

  const recent = nonTieResults.slice(-20);
  const bankerCount = recent.filter(r => r.outcome === 'B').length;
  const bankerPct = bankerCount / recent.length;

  if (bankerPct > 0.6) {
    return {
      name: 'frequency',
      outcome: 'B',
      weight: 0.15,
      description: t('signal.bankerPctRecent', (bankerPct * 100).toFixed(0), recent.length),
    };
  } else if (bankerPct < 0.4) {
    return {
      name: 'frequency',
      outcome: 'P',
      weight: 0.15,
      description: t('signal.playerPctRecent', ((1 - bankerPct) * 100).toFixed(0), recent.length),
    };
  }

  return null;
}

/** Look for multiple repeating patterns in the Big Road columns (premium) */
function analyzePatterns(columns: BigRoadColumn[]): PredictionSignal[] {
  const signals: PredictionSignal[] = [];
  if (columns.length < 4) return signals;

  // Ping-pong: B-P-B-P (all single)
  const lastFour = columns.slice(-4);
  const isPingPong = lastFour.every(col => col.cells.length === 1) &&
    lastFour[0].outcome !== lastFour[1].outcome &&
    lastFour[1].outcome !== lastFour[2].outcome &&
    lastFour[2].outcome !== lastFour[3].outcome;

  if (isPingPong) {
    signals.push({
      name: 'pattern_pingpong',
      outcome: lastFour[3].outcome === 'B' ? 'P' : 'B',
      weight: 0.35,
      description: t('signal.pingPong'),
    });
  }

  // Double: BB-PP-BB-PP (all pairs)
  const isDouble = lastFour.every(col => col.cells.length === 2) &&
    lastFour[0].outcome !== lastFour[1].outcome;
  if (isDouble) {
    signals.push({
      name: 'pattern_double',
      outcome: lastFour[3].outcome === 'B' ? 'P' : 'B',
      weight: 0.3,
      description: t('signal.double'),
    });
  }

  // Triple: BBB-PPP-BBB (all triples)
  {
    const isTriple = lastFour.every(col => col.cells.length === 3) &&
      lastFour[0].outcome !== lastFour[1].outcome;
    if (isTriple) {
      signals.push({
        name: 'pattern_triple',
        outcome: lastFour[3].outcome === 'B' ? 'P' : 'B',
        weight: 0.3,
        description: t('signal.triple'),
      });
    }
  }

  // Increasing streak: each column longer than the previous
  if (columns.length >= 3) {
    const lastThree = columns.slice(-3);
    const lengths = lastThree.map(c => c.cells.length);
    if (lengths[0] < lengths[1] && lengths[1] < lengths[2]) {
      signals.push({
        name: 'pattern_increasing',
        outcome: lastThree[2].outcome,
        weight: 0.2,
        description: t('signal.increasing', lengths.join('→')),
      });
    }
  }

  // Zigzag: alternating increasing/decreasing column lengths
  if (columns.length >= 5) {
    const lastFive = columns.slice(-5);
    const lens = lastFive.map(c => c.cells.length);
    const isZigzag =
      ((lens[0] < lens[1] && lens[1] > lens[2] && lens[2] < lens[3] && lens[3] > lens[4]) ||
       (lens[0] > lens[1] && lens[1] < lens[2] && lens[2] > lens[3] && lens[3] < lens[4]));
    if (isZigzag) {
      signals.push({
        name: 'pattern_zigzag',
        outcome: lastFive[4].outcome,
        weight: 0.2,
        description: t('signal.zigzag', lens.join(',')),
      });
    }
  }

  // Only return the strongest pattern signal to avoid double-counting
  if (signals.length > 1) {
    signals.sort((a, b) => b.weight - a.weight);
    return [signals[0]];
  }

  return signals;
}

/** Check derived road consensus, using actual streak direction */
function analyzeDerivedConsensus(columns: BigRoadColumn[]): PredictionSignal | null {
  // The newest entry of each derived road (Big Eye Boy, Small Road, Cockroach Pig).
  // Taken from the entry order, not the grid: a dragon tail can reach further
  // right than the columns drawn after it.
  const colors = [1, 2, 3]
    .map((offset) => derivedRoadEntries(columns, offset).at(-1)?.color)
    .filter(Boolean);

  if (colors.length < 2) return null;

  const redCount = colors.filter(c => c === 'red').length;
  const blueCount = colors.filter(c => c === 'blue').length;

  const lastCol = columns.length > 0 ? columns[columns.length - 1] : null;
  if (!lastCol) return null;

  if (redCount === colors.length) {
    // All red = consistency → predict current streak continues
    return {
      name: 'derived_consensus',
      outcome: lastCol.outcome,
      weight: 0.35,
      description: t('signal.derivedConsistent', colors.length, lastCol.outcome === 'B' ? t('outcome.bankerShort') : t('outcome.playerShort')),
    };
  } else if (blueCount === colors.length) {
    // All blue = chaos → predict streak breaks
    const reverse: 'B' | 'P' = lastCol.outcome === 'B' ? 'P' : 'B';
    return {
      name: 'derived_consensus',
      outcome: reverse,
      weight: 0.3,
      description: t('signal.derivedChaotic', colors.length, reverse === 'B' ? t('outcome.bankerShort') : t('outcome.playerShort')),
    };
  }

  return null;
}

/** Analyze rhythm — how column lengths change over time (premium) */
function analyzeRhythm(columns: BigRoadColumn[]): PredictionSignal | null {
  if (columns.length < 6) return null;

  const recent = columns.slice(-6);
  const lengths = recent.map(c => c.cells.length);

  // Check for a repeating length cycle: e.g., [2,1,2,1,2,1]
  // Check period-2 cycle
  const period2Match =
    lengths[0] === lengths[2] && lengths[2] === lengths[4] &&
    lengths[1] === lengths[3] && lengths[3] === lengths[5];

  if (period2Match) {
    // Next column should follow the pattern
    const expectedLen = lengths[0]; // Same as position 0, 2, 4
    const isLong = expectedLen > 1;
    // If the expected column is long, predict continuation of current direction
    const lastCol = columns[columns.length - 1];
    const predictedOutcome: 'B' | 'P' = lastCol.outcome === 'B' ? 'P' : 'B';

    return {
      name: 'rhythm',
      outcome: predictedOutcome,
      weight: 0.25,
      description: t('signal.rhythm', lengths.join(','), 2),
    };
  }

  // Check period-3 cycle
  {
    const period3Match =
      lengths[0] === lengths[3] &&
      lengths[1] === lengths[4] &&
      lengths[2] === lengths[5];

    if (period3Match) {
      const lastCol = columns[columns.length - 1];
      return {
        name: 'rhythm',
        outcome: lastCol.outcome === 'B' ? 'P' : 'B',
        weight: 0.2,
        description: t('signal.rhythm', lengths.join(','), 3),
      };
    }
  }

  return null;
}
