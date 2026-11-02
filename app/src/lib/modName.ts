/** A moderator's display name; simulated mods get " (sim)" unless the name already carries it. */
export function modName(name: string, isSim: boolean): string {
  return isSim && !/\(sim\)\s*$/.test(name) ? `${name} (sim)` : name;
}

/** "1 false ban", "2 false bans". */
export function falseBans(count: number): string {
  return `${count} false ${count === 1 ? 'ban' : 'bans'}`;
}
