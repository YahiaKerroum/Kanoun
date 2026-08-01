import { createHash } from "node:crypto";
import type { DatabasePool } from "./pool.js";
import type { TransactionContext } from "./sql-executor.js";

export interface OutboxEvent {
  readonly eventId: string;
  readonly eventType: string;
  readonly schemaVersion: number;
  readonly businessAccountId: string;
  readonly restaurantId?: string;
  readonly branchId?: string;
  readonly aggregateId: string;
  readonly aggregateVersion: number;
  readonly occurredAtUtc: Date;
  readonly correlationId: string;
  readonly causationId: string;
  readonly actorId?: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly attemptCount: number;
}

export interface OutboxEventHandler {
  readonly name: string;
  supports(eventType: string): boolean;
  handle(
    transaction: TransactionContext,
    event: OutboxEvent,
    now: Date,
  ): Promise<void>;
}

export interface OutboxProcessorOptions {
  readonly workerId: string;
  readonly handlers: readonly OutboxEventHandler[];
  readonly businessAccountId?: string;
  readonly leaseMilliseconds?: number;
  readonly maximumAttempts?: number;
  readonly now?: () => Date;
  readonly onQuarantined?: (input: {
    readonly eventId: string;
    readonly eventType: string;
    readonly businessAccountId: string;
    readonly restaurantId?: string;
    readonly branchId?: string;
    readonly aggregateId: string;
    readonly aggregateVersion: number;
    readonly attemptCount: number;
    readonly failureCode: string;
  }) => void;
}

interface OutboxRow {
  readonly event_id: string;
  readonly event_type: string;
  readonly schema_version: number;
  readonly business_account_id: string;
  readonly restaurant_id: string | null;
  readonly branch_id: string | null;
  readonly aggregate_id: string;
  readonly aggregate_version: number;
  readonly occurred_at_utc: Date;
  readonly correlation_id: string;
  readonly causation_id: string;
  readonly actor_id: string | null;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly attempt_count: number;
}

function presentEvent(row: OutboxRow): OutboxEvent {
  return {
    eventId: row.event_id,
    eventType: row.event_type,
    schemaVersion: row.schema_version,
    businessAccountId: row.business_account_id,
    ...(row.restaurant_id ? { restaurantId: row.restaurant_id } : {}),
    ...(row.branch_id ? { branchId: row.branch_id } : {}),
    aggregateId: row.aggregate_id,
    aggregateVersion: row.aggregate_version,
    occurredAtUtc: row.occurred_at_utc,
    correlationId: row.correlation_id,
    causationId: row.causation_id,
    ...(row.actor_id ? { actorId: row.actor_id } : {}),
    payload: row.payload,
    attemptCount: row.attempt_count,
  };
}

function failureCode(error: unknown): string {
  if (error instanceof Error && error.name) {
    return error.name.slice(0, 160);
  }
  return "unknown_error";
}

function retryDelayMilliseconds(eventId: string, attempt: number): number {
  const exponential = Math.min(60_000, 1_000 * 2 ** Math.max(0, attempt - 1));
  const jitterSeed = createHash("sha256")
    .update(`${eventId}:${attempt}`)
    .digest()
    .readUInt32BE(0);
  return exponential + (jitterSeed % 501);
}

export class PostgresOutboxProcessor {
  private readonly leaseMilliseconds: number;
  private readonly maximumAttempts: number;
  private readonly now: () => Date;

  public constructor(
    private readonly databasePool: DatabasePool,
    private readonly options: OutboxProcessorOptions,
  ) {
    this.leaseMilliseconds = options.leaseMilliseconds ?? 30_000;
    this.maximumAttempts = options.maximumAttempts ?? 5;
    this.now = options.now ?? (() => new Date());
  }

  public async processNext(): Promise<
    "processed" | "idle" | "retry_scheduled" | "quarantined"
  > {
    const event = await this.claimNext();
    if (!event) return "idle";

    const client = await this.databasePool.connect();
    try {
      await client.query("begin");
      const now = this.now();
      const stillClaimed = await client.query<OutboxRow>(
        `
          select
            event_id, event_type, schema_version, business_account_id,
            restaurant_id, branch_id, aggregate_id, aggregate_version,
            occurred_at_utc, correlation_id, causation_id, actor_id, payload,
            attempt_count
          from platform.outbox_messages
          where event_id = $1
            and processed_at_utc is null
            and quarantined_at_utc is null
            and claimed_by = $2
          for update
        `,
        [event.eventId, this.options.workerId],
      );
      if (!stillClaimed.rows[0]) {
        await client.query("rollback");
        return "idle";
      }

      for (const handler of this.options.handlers) {
        if (!handler.supports(event.eventType)) continue;
        const checkpoint = await client.query(
          `
            select 1
            from platform.inbox_checkpoints
            where event_id = $1 and handler_name = $2
          `,
          [event.eventId, handler.name],
        );
        if (checkpoint.rowCount) continue;
        await handler.handle({ sql: client }, event, now);
        await client.query(
          `
            insert into platform.inbox_checkpoints (
              event_id, handler_name, processed_at_utc
            )
            values ($1, $2, $3)
            on conflict (event_id, handler_name) do nothing
          `,
          [event.eventId, handler.name, now],
        );
      }

      await client.query(
        `
          update platform.outbox_messages
          set processed_at_utc = $2,
              claimed_by = null,
              claimed_until_utc = null,
              last_error_code = null
          where event_id = $1
        `,
        [event.eventId, now],
      );
      await client.query("commit");
      return "processed";
    } catch (error: unknown) {
      await client.query("rollback");
      const now = this.now();
      const nextAttempt = event.attemptCount + 1;
      const quarantined = nextAttempt >= this.maximumAttempts;
      const errorCode = failureCode(error);
      const failure = await this.databasePool.query(
        `
          update platform.outbox_messages
          set attempt_count = attempt_count + 1,
              next_attempt_at_utc =
                $2::timestamptz + ($3::integer * interval '1 millisecond'),
              claimed_by = null,
              claimed_until_utc = null,
              quarantined_at_utc = case when $4 then $2 else null end,
              last_error_code = $5
          where event_id = $1
            and processed_at_utc is null
            and claimed_by = $6
        `,
        [
          event.eventId,
          now,
          retryDelayMilliseconds(event.eventId, nextAttempt),
          quarantined,
          errorCode,
          this.options.workerId,
        ],
      );
      if (failure.rowCount !== 1) return "idle";
      if (quarantined) {
        this.options.onQuarantined?.({
          eventId: event.eventId,
          eventType: event.eventType,
          businessAccountId: event.businessAccountId,
          ...(event.restaurantId ? { restaurantId: event.restaurantId } : {}),
          ...(event.branchId ? { branchId: event.branchId } : {}),
          aggregateId: event.aggregateId,
          aggregateVersion: event.aggregateVersion,
          attemptCount: nextAttempt,
          failureCode: errorCode,
        });
      }
      return quarantined ? "quarantined" : "retry_scheduled";
    } finally {
      client.release();
    }
  }

  private async claimNext(): Promise<OutboxEvent | undefined> {
    const client = await this.databasePool.connect();
    try {
      await client.query("begin");
      const now = this.now();
      const claimed = await client.query<OutboxRow>(
        `
          select
            candidate.event_id, candidate.event_type, candidate.schema_version,
            candidate.business_account_id, candidate.restaurant_id,
            candidate.branch_id, candidate.aggregate_id,
            candidate.aggregate_version, candidate.occurred_at_utc,
            candidate.correlation_id, candidate.causation_id,
            candidate.actor_id, candidate.payload, candidate.attempt_count
          from platform.outbox_messages candidate
          where candidate.processed_at_utc is null
            and candidate.quarantined_at_utc is null
            and candidate.next_attempt_at_utc <= $1
            and ($2::uuid is null or candidate.business_account_id = $2)
            and (
              candidate.claimed_until_utc is null
              or candidate.claimed_until_utc <= $1
            )
            and not exists (
              select 1
              from platform.outbox_messages prior
              where prior.business_account_id = candidate.business_account_id
                and prior.aggregate_id = candidate.aggregate_id
                and prior.processed_at_utc is null
                and (
                  prior.aggregate_version < candidate.aggregate_version
                  or (
                    prior.aggregate_version = candidate.aggregate_version
                    and (
                      prior.occurred_at_utc < candidate.occurred_at_utc
                      or (
                        prior.occurred_at_utc = candidate.occurred_at_utc
                        and prior.event_id < candidate.event_id
                      )
                    )
                  )
                )
            )
          order by candidate.occurred_at_utc, candidate.aggregate_version,
            candidate.event_id
          for update of candidate skip locked
          limit 1
        `,
        [now, this.options.businessAccountId ?? null],
      );
      const row = claimed.rows[0];
      if (!row) {
        await client.query("rollback");
        return undefined;
      }
      await client.query(
        `
          update platform.outbox_messages
          set claimed_by = $2,
              claimed_until_utc =
                $1::timestamptz + ($3::integer * interval '1 millisecond')
          where event_id = $4
        `,
        [now, this.options.workerId, this.leaseMilliseconds, row.event_id],
      );
      await client.query("commit");
      return presentEvent(row);
    } catch (error: unknown) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  public async replayQuarantined(eventId: string): Promise<boolean> {
    return this.replayEvent(eventId, true);
  }

  public async replayEvent(
    eventId: string,
    requireQuarantined = false,
  ): Promise<boolean> {
    const client = await this.databasePool.connect();
    try {
      await client.query("begin");
      const result = await client.query(
        `
          update platform.outbox_messages
          set processed_at_utc = null,
              quarantined_at_utc = null,
              claimed_by = null,
              claimed_until_utc = null,
              attempt_count = 0,
              next_attempt_at_utc = $2,
              last_error_code = null
          where event_id = $1
            and ($3::boolean = false or quarantined_at_utc is not null)
        `,
        [eventId, this.now(), requireQuarantined],
      );
      if (result.rowCount !== 1) {
        await client.query("rollback");
        return false;
      }
      await client.query(
        `
          delete from platform.inbox_checkpoints
          where event_id = $1
        `,
        [eventId],
      );
      await client.query("commit");
      return true;
    } catch (error: unknown) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  public async pruneProcessed(beforeUtc: Date): Promise<number> {
    const result = await this.databasePool.query<{ removed_count: string }>(
      `
        with removed as (
          delete from platform.outbox_messages
          where processed_at_utc < $1
            and quarantined_at_utc is null
          returning event_id
        ),
        removed_checkpoints as (
          delete from platform.inbox_checkpoints checkpoint
          using removed
          where checkpoint.event_id = removed.event_id
          returning checkpoint.event_id
        )
        select count(*)::text as removed_count
        from removed
      `,
      [beforeUtc],
    );
    return Number(result.rows[0]?.removed_count ?? "0");
  }
}
