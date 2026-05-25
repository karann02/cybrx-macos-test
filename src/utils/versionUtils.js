/**
 * Compare semantic versions
 * Returns:
 *  -1 → current < required
 *   0 → equal
 *   1 → current > required
 */
export function compareVersions(current, required) {
  if (!current || !required) return 0;

  const a = current.split(".").map(Number);
  const b = required.split(".").map(Number);

  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] || 0;
    const y = b[i] || 0;

    if (x > y) return 1;
    if (x < y) return -1;
  }

  return 0;
}
