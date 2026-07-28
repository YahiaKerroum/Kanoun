import { describe, expect, it } from "vitest";
import type { CustomerMenu } from "./models.js";
import { resolveOrderItemSnapshotsFromMenu } from "./order-snapshots.js";

const menu: CustomerMenu = {
  version: 4,
  currency: "DZD",
  categories: [
    {
      id: "category",
      name: "Mains",
      dishes: [
        {
          id: "dish",
          name: "Couscous",
          unitPrice: { amount: "1000.00", currency: "DZD" },
          available: true,
          optionGroups: [
            {
              id: "size",
              name: "Size",
              minimum: 1,
              maximum: 1,
              options: [
                {
                  id: "large",
                  name: "Large",
                  priceDelta: { amount: "250.00", currency: "DZD" },
                },
              ],
            },
            {
              id: "extras",
              name: "Extras",
              minimum: 0,
              maximum: 2,
              options: [
                {
                  id: "sauce",
                  name: "Sauce",
                  priceDelta: { amount: "50.00", currency: "DZD" },
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

describe("order item snapshot resolution", () => {
  it("recalculates option, unit, line, and order totals in fixed precision", () => {
    expect(
      resolveOrderItemSnapshotsFromMenu(menu, 4, [
        {
          dishId: "dish",
          quantity: 2,
          optionIds: ["large", "sauce"],
          note: "No parsley",
        },
      ]),
    ).toEqual({
      kind: "resolved",
      total: { amount: "2600.00", currency: "DZD" },
      items: [
        {
          sourceDishId: "dish",
          sourceMenuVersion: 4,
          dishName: "Couscous",
          basePrice: { amount: "1000.00", currency: "DZD" },
          unitPrice: { amount: "1300.00", currency: "DZD" },
          quantity: 2,
          selectedOptions: [
            {
              optionGroupId: "size",
              optionGroupName: "Size",
              optionId: "large",
              optionName: "Large",
              priceDelta: { amount: "250.00", currency: "DZD" },
            },
            {
              optionGroupId: "extras",
              optionGroupName: "Extras",
              optionId: "sauce",
              optionName: "Sauce",
              priceDelta: { amount: "50.00", currency: "DZD" },
            },
          ],
          note: "No parsley",
          taxInclusive: true,
          lineTotal: { amount: "2600.00", currency: "DZD" },
        },
      ],
    });
  });

  it("reports a stale menu before resolving any item", () => {
    expect(
      resolveOrderItemSnapshotsFromMenu(menu, 3, [
        { dishId: "dish", quantity: 1, optionIds: ["large"] },
      ]),
    ).toEqual({ kind: "menu_changed", currentVersion: 4 });
  });

  it("rejects missing required selections and foreign options", () => {
    expect(
      resolveOrderItemSnapshotsFromMenu(menu, 4, [
        { dishId: "dish", quantity: 1, optionIds: [] },
      ]),
    ).toMatchObject({ kind: "invalid_options", dishId: "dish" });
    expect(
      resolveOrderItemSnapshotsFromMenu(menu, 4, [
        { dishId: "dish", quantity: 1, optionIds: ["large", "foreign"] },
      ]),
    ).toMatchObject({ kind: "invalid_options", dishId: "dish" });
  });

  it("rejects unavailable dishes", () => {
    const category = menu.categories[0];
    const dish = category?.dishes[0];
    if (!category || !dish) {
      throw new Error("The snapshot fixture requires one category and dish.");
    }
    const unavailable: CustomerMenu = {
      ...menu,
      categories: [
        {
          ...category,
          dishes: [{ ...dish, available: false }],
        },
      ],
    };
    expect(
      resolveOrderItemSnapshotsFromMenu(unavailable, 4, [
        { dishId: "dish", quantity: 1, optionIds: ["large"] },
      ]),
    ).toEqual({ kind: "dish_unavailable", dishId: "dish" });
  });
});
