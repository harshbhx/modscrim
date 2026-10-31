type Sql = DurableObjectStorage['sql'];

/** Claim the one permitted real-chat announcement for a drill before attempting the network call. */
export function claimDrillAnnouncement(sql: Sql, drillId: string, now: number): boolean {
  const key = `announce:${drillId}`;
  if (sql.exec('SELECT 1 FROM meta WHERE key = ?', key).toArray().length > 0) return false;
  sql.exec('INSERT INTO meta (key, value) VALUES (?, ?)', key, String(now));
  return true;
}
