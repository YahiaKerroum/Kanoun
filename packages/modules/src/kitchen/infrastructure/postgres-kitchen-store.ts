import type { KitchenStore } from "../contracts/kitchen-store.js";

export class PostgresKitchenStore implements KitchenStore {
  public async createWorkForOrder(
    transaction: Parameters<KitchenStore["createWorkForOrder"]>[0],
    input: Parameters<KitchenStore["createWorkForOrder"]>[1],
  ): Promise<void> {
    await transaction.sql.query(
      `
        insert into kitchen.work_items (
          id, business_account_id, branch_id, order_id, order_item_id,
          order_reference, item_name, quantity, note, state, version,
          queued_at_utc, updated_at_utc
        )
        select
          item.id, $1, $2, $3, item.order_item_id, $4,
          item.name, item.quantity, item.note, 'queued', 1, $6, $6
        from jsonb_to_recordset($5::jsonb) as item(
          id uuid,
          order_item_id uuid,
          name varchar,
          quantity integer,
          note varchar
        )
      `,
      [
        input.businessAccountId,
        input.branchId,
        input.orderId,
        input.orderReference,
        JSON.stringify(
          input.items.map((item) => ({
            id: item.id,
            order_item_id: item.orderItemId,
            name: item.name,
            quantity: item.quantity,
            note: item.note ?? null,
          })),
        ),
        input.now,
      ],
    );
  }
}
