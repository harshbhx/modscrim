/**
 * Display name of a room participant. Kai's stored name already ends in "(sim)"
 * (SRS FR-39, wire data), so the label is added only when it is missing: it is
 * shown exactly once everywhere. The wire data is never changed.
 */
export function displayName(person: { name: string; isSim?: boolean }): string {
  const base = person.name.replace(/\s*\(sim\)\s*$/i, '');
  return person.isSim ? `${base} (sim)` : base;
}
