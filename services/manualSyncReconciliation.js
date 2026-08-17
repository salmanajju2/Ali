/**
 * Reconcile a complete server snapshot with local state.
 *
 * A full Aiven PostgreSQL response is authoritative for every transaction that
 * is already synced. Only offline/unsynced local work is retained locally until
 * it can be replayed. This prevents a successfully deleted row from being
 * reintroduced by an old IndexedDB record during a manual sync.
 */
export function reconcileAuthoritativeFullSync(serverTransactions, localTransactions) {
  const pendingLocalTransactions = localTransactions.filter(transaction => !transaction.isSynced);
  const pendingIds = new Set(pendingLocalTransactions.map(transaction => transaction.id));

  return [
    ...serverTransactions.filter(transaction => !pendingIds.has(transaction.id)),
    ...pendingLocalTransactions,
  ];
}
