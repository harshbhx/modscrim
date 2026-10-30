import type { DrillScore, LineState, Participant, WaveLine } from './types.js';

export function scoreDrill(
  lines: readonly Pick<WaveLine, 'id' | 'kind'>[],
  states: ReadonlyMap<string, LineState>,
  people: readonly Participant[]
): DrillScore {
  const scores = new Map(people.map((person) => [person.id, { person, caught: 0, falseBans: 0, reactionTimes: [] as number[] }]));
  let slipped = 0;
  let attacksShown = 0;

  for (const line of lines) {
    const state = states.get(line.id);
    if (!state || state.shownAt === undefined) continue;
    if (line.kind === 'attack') attacksShown++;
    if (state.actedBy !== undefined) {
      const score = scores.get(state.actedBy);
      if (!score) continue;
      if (line.kind === 'attack') {
        score.caught++;
        score.reactionTimes.push((state.actedAt ?? state.shownAt) - state.shownAt);
      } else {
        score.falseBans++;
      }
    } else if (line.kind === 'attack' && state.slipped) {
      slipped++;
    }
  }

  const mods = [...scores.values()]
    .map(({ person, caught, falseBans, reactionTimes }) => ({
      participantId: person.id,
      name: person.name,
      isSim: person.isSim,
      caught,
      falseBans,
      avgReactionMs: reactionTimes.length
        ? Math.round(reactionTimes.reduce((sum, duration) => sum + duration, 0) / reactionTimes.length)
        : null
    }))
    .sort((a, b) => b.caught - a.caught || a.falseBans - b.falseBans ||
      (a.avgReactionMs ?? 1e12) - (b.avgReactionMs ?? 1e12) || (a.name < b.name ? -1 : 1));

  return { mods, slipped, attacksShown };
}
