declare const transactionContext: unique symbol;

/**
 * Opaque capability passed by ServiceWorkflow to public module contracts.
 * Infrastructure owns the concrete database transaction.
 */
export interface TransactionContext {
  readonly [transactionContext]: true;
}
