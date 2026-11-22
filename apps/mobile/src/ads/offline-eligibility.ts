// Mirrors the server's declared 18+ date rule for ad display during an outage.
// The server remains authoritative for all social access.
export function locallyAdult(dateOfBirth: string, now = new Date()): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) return false;
  const birth = new Date(`${dateOfBirth}T00:00:00.000Z`);
  const today = now.toISOString().slice(0, 10);
  if (
    !Number.isFinite(birth.getTime()) ||
    birth.toISOString().slice(0, 10) !== dateOfBirth ||
    dateOfBirth > today ||
    birth.getUTCFullYear() < 1
  ) return false;
  const anniversary = new Date(birth);
  anniversary.setUTCFullYear(birth.getUTCFullYear() + 18);
  return anniversary.toISOString().slice(0, 10) <= today;
}
