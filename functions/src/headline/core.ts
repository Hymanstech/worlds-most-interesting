export const EXPERIMENT_ID = 'trump-headline-v1';
export const MIN_AMOUNT_CENTS = 100;
export type Side = 'yes' | 'no';

export function isSide(value: unknown): value is Side {
  return value === 'yes' || value === 'no';
}

export function validAmount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) &&
    value >= MIN_AMOUNT_CENTS;
}

export function parseUsdAmount(value: string): number | null {
  if (!/^\d+(\.\d{1,2})?$/.test(value)) return null;
  const [dollars, fraction = ''] = value.split('.');
  const digits = (dollars + fraction.padEnd(2, '0')).replace(/^0+/, '') || '0';
  if (digits.length > 16) return null;
  const cents = Number(digits);
  return Number.isSafeInteger(cents) ? cents : null;
}

export function winningSide(yes: number, no: number, incumbent: Side = 'yes'): Side {
  return yes > no ? 'yes' : no > yes ? 'no' : incumbent;
}

// The disclosed operator credit is part of YES's score, never a paid charge.
// NO must reach $2 as well as outscore YES; cent amounts remain welcome.
export function experimentWinner(yes: number, no: number, incumbent: Side, startingCredit: number): Side {
  if (startingCredit > 0 && no < startingCredit + MIN_AMOUNT_CENTS) return 'yes';
  return winningSide(yes, no, incumbent);
}

export function countedAmount(captured: number, refunded: number, disputeStatus?: string): number {
  if (disputeStatus && disputeStatus !== 'won' && disputeStatus !== 'warning_closed') return 0;
  return Math.max(0, captured - refunded);
}

export type ExperimentState = {
  experimentId: string;
  mode: string;
  yesCents: number;
  noCents: number;
  yesStartingCreditCents: number;
  scoringMode: 'points' | 'legacy';
  yesStartingPoints: number;
  noStartingPoints: number;
  yesScoreCents: number;
  noScoreCents: number;
  winner: Side;
  paymentCount: number;
  paymentsEnabled: boolean;
  endsAt: string | null;
  webhookReady: boolean;
};

export function readState(raw: Record<string, unknown> = {}): ExperimentState {
  const cents = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0;
  const yesCents = cents(raw.yesCents);
  const noCents = cents(raw.noCents);
  const yesStartingCreditCents = cents(raw.yesStartingCreditCents);
  const scoringMode = raw.scoringMode === 'points' ? 'points' : 'legacy';
  const yesStartingPoints = scoringMode === 'points' ? cents(raw.yesStartingPoints) : 0;
  const noStartingPoints = scoringMode === 'points' ? cents(raw.noStartingPoints) : 0;
  const yesScoreCents = scoringMode === 'points' ? yesStartingPoints * 100 + Math.max(0, yesCents - yesStartingCreditCents) : yesCents;
  const noScoreCents = scoringMode === 'points' ? noStartingPoints * 100 + noCents : noCents;
  if (!Number.isSafeInteger(yesScoreCents) || !Number.isSafeInteger(noScoreCents)) throw new Error('Score exceeds safe integer range');
  return {
    experimentId: typeof raw.experimentId === 'string' ? raw.experimentId : EXPERIMENT_ID,
    mode: typeof raw.mode === 'string' ? raw.mode : 'headline-duel',
    yesCents, noCents, yesStartingCreditCents,
    scoringMode, yesStartingPoints, noStartingPoints, yesScoreCents, noScoreCents,
    winner: scoringMode === 'points' ? winningSide(yesScoreCents, noScoreCents, isSide(raw.winner) ? raw.winner : 'yes') : experimentWinner(yesCents, noCents, isSide(raw.winner) ? raw.winner : 'yes', yesStartingCreditCents),
    paymentCount: cents(raw.paymentCount),
    paymentsEnabled: raw.paymentsEnabled === true,
    endsAt: typeof raw.endsAt === 'string' && Number.isFinite(Date.parse(raw.endsAt)) ? raw.endsAt : null,
    webhookReady: raw.webhookReady === true,
  };
}

export function isOpen(state: ExperimentState, now = Date.now()): boolean {
  return state.mode === 'headline-duel' && state.experimentId === EXPERIMENT_ID &&
    state.paymentsEnabled && state.webhookReady && (!state.endsAt || now < Date.parse(state.endsAt));
}
