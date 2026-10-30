import { Rng } from './prng.js';
import {
  HELDOUT_LINK_TRICKS,
  HELDOUT_TRICKS,
  LINK_LABEL,
  LINK_TRICK,
  TRAIN_LINK_TRICKS,
  TRAIN_TRICKS,
  TRICK,
  TRICK_LABEL
} from './tricks.js';
import { BANTER, BOT_PREFIX, GIFTS, REGULARS, SLURS, TACTICS } from './templates.js';
import type { DrillConfig, LinkTrick, Segment, Tactic, Trick, WaveLine } from './types.js';

type Draft = Omit<WaveLine, 'id' | 'wave' | 'idx'>;
const SLOT = /(\{gift\}|\{link\}|\{slur\}|\^[a-z]+)/g;

const botName = (rng: Rng): string =>
  `${rng.pick(BOT_PREFIX)}_${rng.int(46656).toString(36)}${rng.int(90) + 10}`;

export function makeAttack(
  rng: Rng,
  tactic: Tactic,
  tricks: readonly Trick[],
  linkTricks: readonly LinkTrick[]
): Draft {
  const tacticData = TACTICS[tactic];
  const template = rng.pick(tacticData.templates);
  const trick = rng.pick(tricks);
  const linkTrick = rng.pick(linkTricks);
  const segments: Segment[] = [];
  const tags = new Set<string>();
  let last = 0;
  let hasLink = false;

  for (const match of template.matchAll(SLOT)) {
    const at = match.index ?? 0;
    const slot = match[1] as string;
    if (at > last) segments.push({ kind: 'text', text: template.slice(last, at) });
    if (slot === '{link}') {
      segments.push({ kind: 'link', text: LINK_TRICK[linkTrick](rng.pick(tacticData.hosts)) });
      hasLink = true;
      if (LINK_LABEL[linkTrick]) tags.add(LINK_LABEL[linkTrick]);
    } else if (slot === '{slur}') {
      segments.push({ kind: 'slur', text: TRICK[trick](rng.pick(SLURS)) });
    } else {
      const word = slot === '{gift}' ? rng.pick(GIFTS) : slot.slice(1);
      segments.push({ kind: 'text', text: TRICK[trick](word) });
    }
    last = at + slot.length;
  }
  if (last < template.length) segments.push({ kind: 'text', text: template.slice(last) });
  if (TRICK_LABEL[trick]) tags.add(TRICK_LABEL[trick]);

  const line: Draft = {
    kind: 'attack',
    tactic,
    trick,
    tags: [...tags],
    user: botName(rng),
    segments,
    text: segments.map((segment) => segment.text).join('')
  };
  if (hasLink) line.linkTrick = linkTrick;
  return line;
}

export function makeBanter(rng: Rng, text: string): Draft {
  return {
    kind: 'banter',
    tags: [],
    user: rng.pick(REGULARS),
    segments: [{ kind: 'text', text }],
    text
  };
}

/** The primary tactic gets `share` of the lines; the rest cycle through selected tactics. */
export function tacticMix(primary: Tactic, selected: readonly Tactic[], count: number, share: number): Tactic[] {
  const others = selected.filter((tactic) => tactic !== primary);
  if (others.length === 0) return Array<Tactic>(count).fill(primary);
  const primaryCount = Math.round(count * share);
  return [
    ...Array<Tactic>(primaryCount).fill(primary),
    ...Array.from({ length: count - primaryCount }, (_, index) => others[index % others.length] as Tactic)
  ];
}

const stamp = (drillId: string, wave: 'A' | 'B') => (line: Draft, idx: number): WaveLine => ({
  ...line,
  id: `${drillId}-${wave}-${idx}`,
  wave,
  idx
});

export function buildWaveA(config: DrillConfig, drillId: string): WaveLine[] {
  const rng = new Rng(config.seed);
  const attacks = tacticMix(config.primaryTactic, config.tactics, config.attackCount, 0.57)
    .map((tactic) => makeAttack(rng, tactic, TRAIN_TRICKS, TRAIN_LINK_TRICKS));
  const banter = rng.shuffle([...BANTER]).slice(0, config.banterCount).map((text) => makeBanter(rng, text));
  return rng.shuffle([...attacks, ...banter]).map(stamp(drillId, 'A'));
}

export function buildWaveB(config: DrillConfig, drillId: string, count = 30): WaveLine[] {
  const rng = new Rng((config.seed * 7 + 101) >>> 0);
  return tacticMix(config.primaryTactic, config.tactics, count, 0.5)
    .map((tactic) => makeAttack(rng, tactic, HELDOUT_TRICKS, HELDOUT_LINK_TRICKS))
    .map(stamp(drillId, 'B'));
}
