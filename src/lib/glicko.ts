// Glicko-2, the rating system lichess uses. Implemented for single-match
// rating periods so a learner's number moves the instant they solve something.

export interface Rating {
  rating: number;
  rd: number;
  vol: number;
}

export const DEFAULT_RATING: Rating = { rating: 1200, rd: 350, vol: 0.06 };

const TAU = 0.5;
const SCALE = 173.7178;

const g = (phi: number) => 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));
const E = (mu: number, muJ: number, phiJ: number) => 1 / (1 + Math.exp(-g(phiJ) * (mu - muJ)));

/**
 * Update `player` after a single game against `opponent`.
 * score: 1 win, 0.5 draw, 0 loss.
 */
export function updateRating(player: Rating, opponent: Rating, score: number): Rating {
  const mu = (player.rating - 1500) / SCALE;
  const phi = player.rd / SCALE;
  const muJ = (opponent.rating - 1500) / SCALE;
  const phiJ = opponent.rd / SCALE;

  const gj = g(phiJ);
  const ej = E(mu, muJ, phiJ);

  const v = 1 / (gj * gj * ej * (1 - ej));
  const delta = v * gj * (score - ej);

  // Illinois algorithm for the new volatility.
  const a = Math.log(player.vol * player.vol);
  const f = (x: number) => {
    const ex = Math.exp(x);
    const num = ex * (delta * delta - phi * phi - v - ex);
    const den = 2 * Math.pow(phi * phi + v + ex, 2);
    return num / den - (x - a) / (TAU * TAU);
  };

  let A = a;
  let B: number;
  if (delta * delta > phi * phi + v) {
    B = Math.log(delta * delta - phi * phi - v);
  } else {
    let k = 1;
    while (f(a - k * TAU) < 0 && k < 100) k += 1;
    B = a - k * TAU;
  }

  let fA = f(A);
  let fB = f(B);
  let guard = 0;
  while (Math.abs(B - A) > 1e-6 && guard < 100) {
    const C = A + ((A - B) * fA) / (fB - fA);
    const fC = f(C);
    if (fC * fB <= 0) {
      A = B;
      fA = fB;
    } else {
      fA /= 2;
    }
    B = C;
    fB = fC;
    guard += 1;
  }

  const newVol = Math.exp(A / 2);
  const phiStar = Math.sqrt(phi * phi + newVol * newVol);
  const newPhi = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);
  const newMu = mu + newPhi * newPhi * gj * (score - ej);

  return {
    rating: Math.round(Math.max(400, newMu * SCALE + 1500)),
    rd: Number(Math.max(30, Math.min(350, newPhi * SCALE)).toFixed(2)),
    vol: Number(newVol.toFixed(6)),
  };
}

/** Expected score, used for the "win probability" readout before a puzzle. */
export function expectedScore(player: Rating, opponent: Rating): number {
  const mu = (player.rating - 1500) / SCALE;
  const muJ = (opponent.rating - 1500) / SCALE;
  const phiJ = opponent.rd / SCALE;
  return Number(E(mu, muJ, phiJ).toFixed(3));
}

export function ratingBand(rating: number): { name: string; next: number | null } {
  const bands: Array<[number, string]> = [
    [0, 'Initiate'],
    [1000, 'Apprentice'],
    [1200, 'Builder'],
    [1400, 'Engineer'],
    [1600, 'Architect'],
    [1800, 'Systems Architect'],
    [2000, 'Principal'],
    [2200, 'Grandmaster'],
  ];
  let name = bands[0][1];
  let next: number | null = null;
  for (let i = 0; i < bands.length; i += 1) {
    if (rating >= bands[i][0]) {
      name = bands[i][1];
      next = bands[i + 1]?.[0] ?? null;
    }
  }
  return { name, next };
}
