/**
 * Return the remaining debounce delay for a foreground recovery attempt.
 * A trailing attempt is deliberately retained so a rapid background/foreground
 * transition cannot suppress the final authoritative transaction refresh.
 */
export function getRealtimeRecoveryDelay(now, lastRecoveryAt, debounceMs) {
  const elapsed = Math.max(0, Number(now) - Number(lastRecoveryAt || 0));
  return Math.max(0, Number(debounceMs) - elapsed);
}
