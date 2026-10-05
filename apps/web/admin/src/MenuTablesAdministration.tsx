import QRCode from "qrcode";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type SyntheticEvent,
} from "react";
import { z } from "zod";

type FormEvent<Element extends HTMLFormElement> = SyntheticEvent<Element>;

const copy = {
  menu: {
    title: "Menu",
    detail:
      "Categories and dishes for the whole restaurant, with prices and availability you can change per branch.",
  },
  tables: {
    title: "Tables & QR",
    detail: "The tables in this branch and the QR codes guests scan to order.",
  },
  loading: "Loading…",
  retry: "Try again",
  denied: "Your account can't view this. Ask the owner for access.",
  noFeature:
    "Turn it on under Features to make changes. Existing items stay visible.",
} as const;

const moneySchema = z.object({
  amount: z.string().regex(/^-?\d+(\.\d{1,2})?$/),
  currency: z.string().regex(/^[A-Z]{3}$/),
});
const categorySchema = z.object({
  id: z.uuid(),
  businessAccountId: z.uuid(),
  restaurantId: z.uuid(),
  name: z.string(),
  displayOrder: z.number().int().nonnegative(),
  status: z.enum(["active", "inactive"]),
  version: z.number().int().positive(),
});
const dishSchema = z.object({
  id: z.uuid(),
  businessAccountId: z.uuid(),
  restaurantId: z.uuid(),
  categoryId: z.uuid(),
  name: z.string(),
  description: z.string().nullable().optional(),
  imageUrl: z.url().nullable().optional(),
  basePrice: moneySchema,
  status: z.enum(["active", "inactive"]),
  available: z.boolean(),
  displayOrder: z.number().int().nonnegative(),
  version: z.number().int().positive(),
});
const optionSchema = z.object({
  id: z.uuid(),
  businessAccountId: z.uuid(),
  optionGroupId: z.uuid(),
  name: z.string(),
  priceDelta: moneySchema,
  displayOrder: z.number().int().nonnegative(),
  status: z.enum(["active", "inactive"]),
  version: z.number().int().positive(),
});
const optionGroupSchema = z.object({
  id: z.uuid(),
  businessAccountId: z.uuid(),
  dishId: z.uuid(),
  name: z.string(),
  selectionType: z.enum(["single", "multiple"]),
  isRequired: z.boolean(),
  minimumSelections: z.number().int().nonnegative(),
  maximumSelections: z.number().int().positive(),
  displayOrder: z.number().int().nonnegative(),
  version: z.number().int().positive(),
  options: z.array(optionSchema),
});
const branchOverrideSchema = z.object({
  businessAccountId: z.uuid(),
  branchId: z.uuid(),
  dishId: z.uuid(),
  price: moneySchema.nullish(),
  available: z.boolean().nullish(),
  visible: z.boolean(),
  version: z.number().int().nonnegative(),
});
const tableSchema = z.object({
  id: z.uuid(),
  businessAccountId: z.uuid(),
  branchId: z.uuid(),
  code: z.string(),
  area: z.string().nullable().optional(),
  status: z.enum(["active", "inactive"]),
  outOfService: z.boolean(),
  version: z.number().int().positive(),
  derivedState: z.enum(["inactive", "out_of_service", "occupied", "available"]),
});
const qrCodeSchema = z.object({
  id: z.uuid(),
  businessAccountId: z.uuid(),
  branchId: z.uuid(),
  tableId: z.uuid().nullable().optional(),
  kind: z.enum(["table", "branch"]),
  status: z.enum(["active", "revoked"]),
  createdAtUtc: z.coerce.date(),
  revokedAtUtc: z.coerce.date().nullable().optional(),
  revokedReason: z.string().nullable().optional(),
});
const issuedQrSchema = z.object({
  qrCode: qrCodeSchema,
  rawToken: z.string().min(16),
  qrUrl: z.url(),
});

type Category = z.infer<typeof categorySchema>;
type Dish = z.infer<typeof dishSchema>;
type OptionGroup = z.infer<typeof optionGroupSchema>;
type BranchOverride = z.infer<typeof branchOverrideSchema>;
type TableRecord = z.infer<typeof tableSchema>;
type QrCodeRecord = z.infer<typeof qrCodeSchema>;
type IssuedQr = z.infer<typeof issuedQrSchema>;

export interface MenuTablesPermissions {
  readonly menuView: boolean;
  readonly menuManage: boolean;
  readonly menuManagePrices: boolean;
  readonly menuManageAvailability: boolean;
  readonly tablesView: boolean;
  readonly tablesManage: boolean;
  readonly qrManage: boolean;
}

export interface MenuTablesFeatures {
  readonly menu: boolean;
  readonly qrMenu: boolean;
  readonly tables: boolean;
}

interface MenuTablesAdministrationProps {
  readonly branch: {
    readonly id: string;
    readonly restaurantId: string;
    readonly name: string;
    readonly currency: string;
  };
  readonly permissions: MenuTablesPermissions;
  readonly features: MenuTablesFeatures;
}

interface ConfigurationData {
  readonly categories: readonly Category[];
  readonly dishes: readonly Dish[];
  readonly tables: readonly TableRecord[];
  readonly qrCodes: readonly QrCodeRecord[];
}

type LoadState =
  | { readonly kind: "loading" }
  | { readonly kind: "error"; readonly message: string }
  | { readonly kind: "ready"; readonly data: ConfigurationData };

class AdminApiError extends Error {
  public constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "AdminApiError";
  }
}

function csrfToken(): string {
  return (
    document.cookie
      .split(";")
      .map((value) => value.trim())
      .find((value) => value.startsWith("rms_csrf="))
      ?.slice(9) ?? ""
  );
}

async function requestJson<Output>(
  path: string,
  schema: z.ZodType<Output>,
  init?: RequestInit,
): Promise<Output> {
  const headers = new Headers(init?.headers);
  headers.set("accept", "application/json");
  if (init?.body !== undefined) {
    headers.set("content-type", "application/json");
  }
  if (init?.method && init.method !== "GET") {
    headers.set("x-csrf-token", csrfToken());
  }
  const response = await fetch(path, {
    credentials: "same-origin",
    ...init,
    headers,
  });
  if (!response.ok) {
    const problem = z
      .object({
        title: z.string(),
        detail: z.string().nullable().optional(),
      })
      .safeParse(await response.json().catch(() => undefined));
    throw new AdminApiError(
      response.status,
      problem.success
        ? (problem.data.detail ?? problem.data.title)
        : response.status === 401
          ? "Sign in required."
          : response.status === 403
            ? copy.denied
            : "The request failed. Reload current data and try again.",
    );
  }
  return schema.parse(await response.json());
}

function formString(data: FormData, name: string): string {
  const value = data.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function formNumber(data: FormData, name: string): number {
  return Number(formString(data, name));
}

function describeError(error: unknown): string {
  if (error instanceof z.ZodError) {
    return "The server returned data that does not match the administration contract.";
  }
  return error instanceof Error
    ? error.message
    : "The request failed. Reload and try again.";
}

function formatMoney(amount: string, currency: string): string {
  const numeric = Number(amount);
  return Number.isFinite(numeric)
    ? new Intl.NumberFormat("en", { style: "currency", currency }).format(
        numeric,
      )
    : `${amount} ${currency}`;
}

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

function optionLines(group: OptionGroup): string {
  return group.options
    .map(
      (option) =>
        `${option.name} | ${option.priceDelta.amount} | ${option.status}`,
    )
    .join("\n");
}

function parseOptionLines(
  value: string,
  currency: string,
): {
  readonly name: string;
  readonly priceDelta: { readonly amount: string; readonly currency: string };
  readonly displayOrder: number;
  readonly status: "active" | "inactive";
}[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line, index) => {
      const [rawName, rawAmount, rawStatus] = line
        .split("|")
        .map((part) => part.trim());
      if (!rawName || !rawAmount || !/^-?\d+(\.\d{1,2})?$/.test(rawAmount)) {
        throw new Error(
          `Option line ${index + 1} must use “Name | 0.00 | active”.`,
        );
      }
      const status = rawStatus === "inactive" ? "inactive" : "active";
      return {
        name: rawName,
        priceDelta: { amount: rawAmount, currency },
        displayOrder: index,
        status,
      };
    });
}

export function MenuTablesAdministration({
  branch,
  permissions,
  features,
}: MenuTablesAdministrationProps) {
  const [loadState, setLoadState] = useState<LoadState>({ kind: "loading" });
  const [selectedDishId, setSelectedDishId] = useState<string>();
  const [selectedTableId, setSelectedTableId] = useState<string>();
  const [optionGroups, setOptionGroups] = useState<readonly OptionGroup[]>([]);
  const [branchOverride, setBranchOverride] = useState<BranchOverride | null>(
    null,
  );
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailSequence, setDetailSequence] = useState(0);
  const [message, setMessage] = useState("");
  const [pendingAction, setPendingAction] = useState<string>();
  const [issuedQr, setIssuedQr] = useState<
    { readonly result: IssuedQr; readonly dataUrl: string } | undefined
  >();

  const loadConfiguration = useCallback(async () => {
    setLoadState({ kind: "loading" });
    try {
      const [categories, dishes, tables, qrCodes] = await Promise.all([
        permissions.menuView
          ? requestJson(
              `/api/v1/staff/restaurants/${branch.restaurantId}/menu/categories`,
              z.object({ items: z.array(categorySchema) }),
            )
          : Promise.resolve({ items: [] as Category[] }),
        permissions.menuView
          ? requestJson(
              `/api/v1/staff/restaurants/${branch.restaurantId}/menu/dishes`,
              z.object({ items: z.array(dishSchema) }),
            )
          : Promise.resolve({ items: [] as Dish[] }),
        permissions.tablesView
          ? requestJson(
              `/api/v1/staff/branches/${branch.id}/tables`,
              z.object({ items: z.array(tableSchema) }),
            )
          : Promise.resolve({ items: [] as TableRecord[] }),
        permissions.qrManage
          ? requestJson(
              `/api/v1/staff/branches/${branch.id}/qr-codes`,
              z.object({ items: z.array(qrCodeSchema) }),
            )
          : Promise.resolve({ items: [] as QrCodeRecord[] }),
      ]);
      const data = {
        categories: categories.items,
        dishes: dishes.items,
        tables: tables.items,
        qrCodes: qrCodes.items,
      };
      setLoadState({ kind: "ready", data });
      setSelectedDishId((current) =>
        data.dishes.some((dish) => dish.id === current)
          ? current
          : data.dishes[0]?.id,
      );
      setSelectedTableId((current) =>
        data.tables.some((table) => table.id === current)
          ? current
          : data.tables[0]?.id,
      );
    } catch (error) {
      setLoadState({ kind: "error", message: describeError(error) });
    }
  }, [
    branch.id,
    branch.restaurantId,
    permissions.menuView,
    permissions.qrManage,
    permissions.tablesView,
  ]);

  useEffect(() => {
    void loadConfiguration();
  }, [loadConfiguration]);

  useEffect(() => {
    if (!selectedDishId || !permissions.menuView) {
      setOptionGroups([]);
      setBranchOverride(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    void Promise.all([
      requestJson(
        `/api/v1/staff/menu/dishes/${selectedDishId}/option-groups`,
        z.object({ items: z.array(optionGroupSchema) }),
      ),
      requestJson(
        `/api/v1/staff/branches/${branch.id}/menu/dishes/${selectedDishId}/override`,
        branchOverrideSchema,
      ).catch((error: unknown) => {
        if (error instanceof AdminApiError && error.status === 404) {
          return null;
        }
        throw error;
      }),
    ])
      .then(([groups, override]) => {
        if (!cancelled) {
          setOptionGroups(groups.items);
          setBranchOverride(override);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setMessage(describeError(error));
          setOptionGroups([]);
          setBranchOverride(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setDetailLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [branch.id, detailSequence, permissions.menuView, selectedDishId]);

  const data = loadState.kind === "ready" ? loadState.data : undefined;
  const selectedDish = data?.dishes.find((dish) => dish.id === selectedDishId);
  const selectedTable = data?.tables.find(
    (table) => table.id === selectedTableId,
  );

  async function mutate(
    action: string,
    work: () => Promise<unknown>,
    success: string,
  ) {
    setPendingAction(action);
    setMessage(`${action}…`);
    try {
      await work();
      await loadConfiguration();
      setDetailSequence((current) => current + 1);
      setMessage(success);
    } catch (error) {
      setMessage(describeError(error));
    } finally {
      setPendingAction(undefined);
    }
  }

  function createCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    void mutate(
      "Creating category",
      () =>
        requestJson(
          `/api/v1/staff/restaurants/${branch.restaurantId}/menu/categories`,
          categorySchema,
          {
            method: "POST",
            body: JSON.stringify({
              name: formString(values, "name"),
              displayOrder: formNumber(values, "displayOrder"),
            }),
          },
        ),
      "Category created.",
    ).then(() => {
      if (!pendingAction) form.reset();
    });
  }

  function updateCategory(
    event: FormEvent<HTMLFormElement>,
    category: Category,
  ) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    void mutate(
      `Saving ${category.name}`,
      () =>
        requestJson(
          `/api/v1/staff/menu/categories/${category.id}`,
          categorySchema,
          {
            method: "PATCH",
            headers: { "if-match": `"${category.version}"` },
            body: JSON.stringify({
              name: formString(values, "name"),
              displayOrder: formNumber(values, "displayOrder"),
              status: formString(values, "status"),
            }),
          },
        ),
      "Category saved.",
    );
  }

  function createDish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const description = formString(values, "description");
    const imageUrl = formString(values, "imageUrl");
    void mutate(
      "Creating dish",
      () =>
        requestJson(
          `/api/v1/staff/restaurants/${branch.restaurantId}/menu/dishes`,
          dishSchema,
          {
            method: "POST",
            body: JSON.stringify({
              categoryId: formString(values, "categoryId"),
              name: formString(values, "name"),
              ...(description ? { description } : {}),
              ...(imageUrl ? { imageUrl } : {}),
              basePrice: {
                amount: formString(values, "basePrice"),
                currency: branch.currency,
              },
              displayOrder: formNumber(values, "displayOrder"),
            }),
          },
        ),
      "Dish created.",
    ).then(() => {
      if (!pendingAction) form.reset();
    });
  }

  function updateDish(event: FormEvent<HTMLFormElement>, dish: Dish) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const description = formString(values, "description");
    const imageUrl = formString(values, "imageUrl");
    const payload: Record<string, unknown> = {};
    if (permissions.menuManage) {
      Object.assign(payload, {
        name: formString(values, "name"),
        description: description || null,
        imageUrl: imageUrl || null,
        categoryId: formString(values, "categoryId"),
        displayOrder: formNumber(values, "displayOrder"),
        status: formString(values, "status"),
      });
    }
    if (permissions.menuManagePrices) {
      payload.basePrice = {
        amount: formString(values, "basePrice"),
        currency: branch.currency,
      };
    }
    if (permissions.menuManageAvailability) {
      payload.available = values.get("available") === "on";
    }
    void mutate(
      `Saving ${dish.name}`,
      () =>
        requestJson(`/api/v1/staff/menu/dishes/${dish.id}`, dishSchema, {
          method: "PATCH",
          headers: { "if-match": `"${dish.version}"` },
          body: JSON.stringify(payload),
        }),
      "Dish saved.",
    );
  }

  function createOptionGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedDish) return;
    const values = new FormData(event.currentTarget);
    try {
      const options = parseOptionLines(
        formString(values, "options"),
        branch.currency,
      ).map((option) => ({
        name: option.name,
        priceDelta: option.priceDelta,
        displayOrder: option.displayOrder,
      }));
      void mutate(
        "Creating option group",
        () =>
          requestJson("/api/v1/staff/menu/option-groups", optionGroupSchema, {
            method: "POST",
            body: JSON.stringify({
              dishId: selectedDish.id,
              name: formString(values, "name"),
              selectionType: formString(values, "selectionType"),
              isRequired: values.get("isRequired") === "on",
              minimumSelections: formNumber(values, "minimumSelections"),
              maximumSelections: formNumber(values, "maximumSelections"),
              displayOrder: formNumber(values, "displayOrder"),
              options,
            }),
          }),
        "Option group created.",
      ).then(() => setSelectedDishId(selectedDish.id));
    } catch (error) {
      setMessage(describeError(error));
    }
  }

  function updateOptionGroup(
    event: FormEvent<HTMLFormElement>,
    group: OptionGroup,
  ) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    void mutate(
      `Saving ${group.name}`,
      () =>
        requestJson(
          `/api/v1/staff/menu/option-groups/${group.id}`,
          optionGroupSchema,
          {
            method: "PATCH",
            headers: { "if-match": `"${group.version}"` },
            body: JSON.stringify({
              name: formString(values, "name"),
              isRequired: values.get("isRequired") === "on",
              minimumSelections: formNumber(values, "minimumSelections"),
              maximumSelections: formNumber(values, "maximumSelections"),
              displayOrder: formNumber(values, "displayOrder"),
            }),
          },
        ),
      "Option group saved.",
    ).then(() => setSelectedDishId(group.dishId));
  }

  function replaceOptions(
    event: FormEvent<HTMLFormElement>,
    group: OptionGroup,
  ) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    try {
      const options = parseOptionLines(
        formString(values, "options"),
        branch.currency,
      );
      void mutate(
        `Replacing ${group.name} options`,
        () =>
          requestJson(
            `/api/v1/staff/menu/option-groups/${group.id}/options`,
            optionGroupSchema,
            {
              method: "PUT",
              body: JSON.stringify({ options }),
            },
          ),
        "Options replaced.",
      ).then(() => setSelectedDishId(group.dishId));
    } catch (error) {
      setMessage(describeError(error));
    }
  }

  function saveBranchOverride(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedDish) return;
    const values = new FormData(event.currentTarget);
    const rawPrice = formString(values, "price");
    const availability = formString(values, "availability");
    const payload: Record<string, unknown> = {
      expectedVersion: branchOverride?.version ?? 0,
      visible: values.get("visible") === "on",
    };
    if (permissions.menuManagePrices) {
      payload.price = rawPrice
        ? { amount: rawPrice, currency: branch.currency }
        : null;
    }
    if (permissions.menuManageAvailability) {
      payload.available =
        availability === "inherit" ? null : availability === "available";
    }
    void mutate(
      "Saving branch override",
      () =>
        requestJson(
          `/api/v1/staff/branches/${branch.id}/menu/dishes/${selectedDish.id}/override`,
          branchOverrideSchema,
          { method: "PUT", body: JSON.stringify(payload) },
        ),
      "Branch override saved.",
    ).then(() => setSelectedDishId(selectedDish.id));
  }

  function createTable(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const area = formString(values, "area");
    void mutate(
      "Creating table",
      () =>
        requestJson(`/api/v1/staff/branches/${branch.id}/tables`, tableSchema, {
          method: "POST",
          body: JSON.stringify({
            code: formString(values, "code"),
            ...(area ? { area } : {}),
          }),
        }),
      "Table created.",
    );
  }

  function updateTable(event: FormEvent<HTMLFormElement>, table: TableRecord) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const area = formString(values, "area");
    void mutate(
      `Saving table ${table.code}`,
      () =>
        requestJson(`/api/v1/staff/tables/${table.id}`, tableSchema, {
          method: "PATCH",
          headers: { "if-match": `"${table.version}"` },
          body: JSON.stringify({
            code: formString(values, "code"),
            area: area || null,
            status: formString(values, "status"),
            outOfService: values.get("outOfService") === "on",
          }),
        }),
      "Table saved.",
    );
  }

  async function issueQr(kind: "branch" | "table", table?: TableRecord) {
    const target = table ? `table ${table.code}` : `branch ${branch.name}`;
    if (
      !window.confirm(
        `Issue a new QR code for ${target}? Any current active code for this target will be revoked.`,
      )
    ) {
      return;
    }
    setPendingAction(`Issuing ${target} QR`);
    setMessage(`Issuing ${target} QR…`);
    try {
      const result = await requestJson(
        table
          ? `/api/v1/staff/tables/${table.id}/qr-codes`
          : `/api/v1/staff/branches/${branch.id}/qr-codes`,
        issuedQrSchema,
        { method: "POST" },
      );
      const dataUrl = await QRCode.toDataURL(result.qrUrl, {
        errorCorrectionLevel: "M",
        margin: 2,
        width: 512,
        color: { dark: "#1e1b14", light: "#ffffff" },
      });
      setIssuedQr({ result, dataUrl });
      await loadConfiguration();
      setMessage(
        `New ${kind} QR issued. Download or print it now; the raw token is shown only in this issuance response.`,
      );
    } catch (error) {
      setMessage(describeError(error));
    } finally {
      setPendingAction(undefined);
    }
  }

  function revokeQr(event: FormEvent<HTMLFormElement>, qrCode: QrCodeRecord) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    void mutate(
      "Revoking QR code",
      () =>
        requestJson(
          `/api/v1/staff/qr-codes/${qrCode.id}/revocations`,
          qrCodeSchema,
          {
            method: "POST",
            body: JSON.stringify({ reason: formString(values, "reason") }),
          },
        ),
      "QR code revoked. It can no longer create a guest session.",
    );
  }

  async function copyIssuedUrl() {
    if (!issuedQr) return;
    try {
      await navigator.clipboard.writeText(issuedQr.result.qrUrl);
      setMessage("Link copied.");
    } catch {
      setMessage(
        "Copy was blocked by the browser. Select the URL field and copy it manually.",
      );
    }
  }

  function printIssuedQr() {
    if (!issuedQr) return;
    const printWindow = window.open(
      "",
      "mise-qr-print",
      "width=720,height=840",
    );
    if (!printWindow) {
      setMessage("Allow pop-ups for this site, then try printing again.");
      return;
    }
    const document = printWindow.document;
    document.title = "Table QR code — MISE";
    const main = document.createElement("main");
    main.style.cssText =
      "font-family:system-ui,sans-serif;text-align:center;padding:40px;color:#1e1b14";
    const title = document.createElement("h1");
    title.textContent =
      issuedQr.result.qrCode.kind === "table"
        ? `Table ${selectedTable?.code ?? ""}`
        : branch.name;
    const detail = document.createElement("p");
    detail.textContent =
      issuedQr.result.qrCode.kind === "table"
        ? "Scan to verify this table and browse the current menu."
        : "Scan to browse this branch menu.";
    const image = document.createElement("img");
    image.src = issuedQr.dataUrl;
    image.alt = "";
    image.style.cssText =
      "display:block;width:480px;max-width:100%;margin:24px auto";
    const url = document.createElement("p");
    url.textContent = issuedQr.result.qrUrl;
    url.style.cssText = "font-size:10px;overflow-wrap:anywhere";
    main.append(title, detail, image, url);
    document.body.replaceChildren(main);
    image.addEventListener("load", () => {
      printWindow.focus();
      printWindow.print();
    });
  }

  if (loadState.kind === "loading") {
    return (
      <section className="admin-loading" aria-live="polite">
        {copy.loading}
      </section>
    );
  }
  if (loadState.kind === "error") {
    return (
      <section className="admin-load-error" aria-labelledby="admin-load-error">
        <h3 id="admin-load-error">This page couldn't load</h3>
        <p>{loadState.message}</p>
        <button type="button" onClick={() => void loadConfiguration()}>
          {copy.retry}
        </button>
      </section>
    );
  }

  return (
    <>
      <p
        className="status-line operational-status"
        role="status"
        aria-live="polite"
      >
        {message}
      </p>
      <MenuAdministration
        branch={branch}
        data={loadState.data}
        permissions={permissions}
        featureEnabled={features.menu}
        selectedDish={selectedDish}
        selectedDishId={selectedDishId}
        optionGroups={optionGroups}
        branchOverride={branchOverride}
        detailLoading={detailLoading}
        pending={pendingAction !== undefined}
        onSelectDish={setSelectedDishId}
        onCreateCategory={createCategory}
        onUpdateCategory={updateCategory}
        onCreateDish={createDish}
        onUpdateDish={updateDish}
        onCreateOptionGroup={createOptionGroup}
        onUpdateOptionGroup={updateOptionGroup}
        onReplaceOptions={replaceOptions}
        onSaveBranchOverride={saveBranchOverride}
      />
      <TablesAdministration
        branch={branch}
        data={loadState.data}
        permissions={permissions}
        features={features}
        selectedTable={selectedTable}
        selectedTableId={selectedTableId}
        issuedQr={issuedQr}
        pending={pendingAction !== undefined}
        onSelectTable={setSelectedTableId}
        onCreateTable={createTable}
        onUpdateTable={updateTable}
        onIssueQr={issueQr}
        onRevokeQr={revokeQr}
        onCopyIssuedUrl={copyIssuedUrl}
        onPrintIssuedQr={printIssuedQr}
      />
    </>
  );
}

interface MenuAdministrationProps {
  readonly branch: MenuTablesAdministrationProps["branch"];
  readonly data: ConfigurationData;
  readonly permissions: MenuTablesPermissions;
  readonly featureEnabled: boolean;
  readonly selectedDish: Dish | undefined;
  readonly selectedDishId: string | undefined;
  readonly optionGroups: readonly OptionGroup[];
  readonly branchOverride: BranchOverride | null;
  readonly detailLoading: boolean;
  readonly pending: boolean;
  readonly onSelectDish: (dishId: string) => void;
  readonly onCreateCategory: (event: FormEvent<HTMLFormElement>) => void;
  readonly onUpdateCategory: (
    event: FormEvent<HTMLFormElement>,
    category: Category,
  ) => void;
  readonly onCreateDish: (event: FormEvent<HTMLFormElement>) => void;
  readonly onUpdateDish: (
    event: FormEvent<HTMLFormElement>,
    dish: Dish,
  ) => void;
  readonly onCreateOptionGroup: (event: FormEvent<HTMLFormElement>) => void;
  readonly onUpdateOptionGroup: (
    event: FormEvent<HTMLFormElement>,
    group: OptionGroup,
  ) => void;
  readonly onReplaceOptions: (
    event: FormEvent<HTMLFormElement>,
    group: OptionGroup,
  ) => void;
  readonly onSaveBranchOverride: (event: FormEvent<HTMLFormElement>) => void;
}

function MenuAdministration({
  branch,
  data,
  permissions,
  featureEnabled,
  selectedDish,
  selectedDishId,
  optionGroups,
  branchOverride,
  detailLoading,
  pending,
  onSelectDish,
  onCreateCategory,
  onUpdateCategory,
  onCreateDish,
  onUpdateDish,
  onCreateOptionGroup,
  onUpdateOptionGroup,
  onReplaceOptions,
  onSaveBranchOverride,
}: MenuAdministrationProps) {
  const sortedCategories = useMemo(
    () =>
      [...data.categories].sort(
        (left, right) =>
          left.displayOrder - right.displayOrder ||
          left.name.localeCompare(right.name),
      ),
    [data.categories],
  );
  const sortedDishes = useMemo(
    () =>
      [...data.dishes].sort(
        (left, right) =>
          left.displayOrder - right.displayOrder ||
          left.name.localeCompare(right.name),
      ),
    [data.dishes],
  );

  // Controlled category name for suggestion pills
  const [categoryName, setCategoryName] = useState("");
  // Live preview URL for new dish image
  const [newDishImageUrl, setNewDishImageUrl] = useState("");
  // Live preview URL for selected dish image edit — syncs when dish selection changes
  const [editDishImageUrl, setEditDishImageUrl] = useState(
    selectedDish?.imageUrl ?? "",
  );

  useEffect(() => {
    setEditDishImageUrl(selectedDish?.imageUrl ?? "");
  }, [selectedDish?.id, selectedDish?.imageUrl]);

  const SUGGESTED_CATEGORIES = [
    "Starters",
    "Salads",
    "Soups",
    "Pizza",
    "Pasta",
    "Sandwiches",
    "Burgers",
    "Grills",
    "Seafood",
    "Wraps",
    "Desserts",
    "Drinks",
    "Specials",
  ] as const;

  return (
    <section
      id="menu"
      className="admin-section operational-admin-section"
      aria-labelledby="menu-admin-title"
    >
      <div className="section-heading">
        <div>
          <h3 id="menu-admin-title" className="visually-hidden">
            {copy.menu.title}
          </h3>
          <p className="section-detail">{copy.menu.detail}</p>
        </div>
        <span>
          {data.categories.length}{" "}
          {data.categories.length === 1 ? "category" : "categories"} ·{" "}
          {data.dishes.length} {data.dishes.length === 1 ? "dish" : "dishes"}
        </span>
      </div>
      {!permissions.menuView ? (
        <p className="empty-state">{copy.denied}</p>
      ) : (
        <>
          {!featureEnabled ? (
            <p className="feature-boundary" role="status">
              {copy.noFeature}
            </p>
          ) : null}

          <div className="admin-subsection">
            <div className="subsection-heading">
              <div>
                <h4>Categories</h4>
                <p>How the menu is grouped, in the order guests see it.</p>
              </div>
            </div>
            {permissions.menuManage ? (
              <form
                className="compact-form compact-form--category"
                onSubmit={(event) => {
                  onCreateCategory(event);
                  setCategoryName("");
                }}
              >
                <div
                  className="category-suggestions"
                  aria-label="Common category names"
                >
                  {SUGGESTED_CATEGORIES.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      className="suggestion-pill"
                      onClick={() => setCategoryName(suggestion)}
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
                <label>
                  Category name
                  <input
                    name="name"
                    maxLength={160}
                    required
                    value={categoryName}
                    onChange={(event) =>
                      setCategoryName(event.currentTarget.value)
                    }
                  />
                </label>
                <label>
                  Display order
                  <input
                    name="displayOrder"
                    type="number"
                    min={0}
                    max={10000}
                    defaultValue={data.categories.length}
                    required
                  />
                </label>
                <button type="submit" disabled={pending || !featureEnabled}>
                  Add category
                </button>
              </form>
            ) : null}
            <div className="configuration-rows">
              {sortedCategories.map((category) => (
                <form
                  className="configuration-row"
                  key={`${category.id}:${category.version}`}
                  onSubmit={(event) => onUpdateCategory(event, category)}
                >
                  <label>
                    <span>Name</span>
                    <input
                      name="name"
                      defaultValue={category.name}
                      maxLength={160}
                      disabled={!permissions.menuManage}
                      required
                    />
                  </label>
                  <label>
                    <span>Order</span>
                    <input
                      name="displayOrder"
                      type="number"
                      min={0}
                      max={10000}
                      defaultValue={category.displayOrder}
                      disabled={!permissions.menuManage}
                      required
                    />
                  </label>
                  <label>
                    <span>Status</span>
                    <select
                      name="status"
                      defaultValue={category.status}
                      disabled={!permissions.menuManage}
                    >
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </label>
                  <button
                    type="submit"
                    disabled={
                      pending || !permissions.menuManage || !featureEnabled
                    }
                  >
                    Save
                  </button>
                </form>
              ))}
              {sortedCategories.length === 0 ? (
                <p className="empty-state">No categories configured.</p>
              ) : null}
            </div>
          </div>

          <div className="admin-subsection">
            <div className="subsection-heading">
              <div>
                <h4>Dishes</h4>
                <p>
                  Prices here apply to every branch. Change a price for one
                  branch further down.
                </p>
              </div>
            </div>
            {permissions.menuManage && sortedCategories.length > 0 ? (
              <form
                className="compact-form compact-form--dish"
                onSubmit={(event) => {
                  onCreateDish(event);
                  setNewDishImageUrl("");
                }}
              >
                <label>
                  Dish name
                  <input name="name" maxLength={160} required />
                </label>
                <label>
                  Category
                  <select name="categoryId" required>
                    {sortedCategories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Base price ({branch.currency})
                  <input
                    name="basePrice"
                    inputMode="decimal"
                    pattern="\d+(\.\d{1,2})?"
                    placeholder="0.00"
                    required
                  />
                </label>
                <label>
                  Display order
                  <input
                    name="displayOrder"
                    type="number"
                    min={0}
                    max={10000}
                    defaultValue={data.dishes.length}
                    required
                  />
                </label>
                <label className="compact-form__wide">
                  Description (optional)
                  <input name="description" maxLength={1000} />
                </label>
                <label className="compact-form__wide compact-form__image-row">
                  Image URL (optional)
                  <div className="image-input-row">
                    <input
                      name="imageUrl"
                      type="url"
                      maxLength={2048}
                      placeholder="https://example.com/image.jpg"
                      value={newDishImageUrl}
                      onChange={(event) =>
                        setNewDishImageUrl(event.currentTarget.value)
                      }
                    />
                    {newDishImageUrl ? (
                      <img
                        className="dish-image-preview"
                        src={newDishImageUrl}
                        alt="Dish preview"
                        onError={(event) => {
                          event.currentTarget.style.display = "none";
                        }}
                        onLoad={(event) => {
                          event.currentTarget.style.display = "";
                        }}
                      />
                    ) : null}
                  </div>
                </label>
                <button type="submit" disabled={pending || !featureEnabled}>
                  Add dish
                </button>
              </form>
            ) : null}
            <div
              className="record-selector"
              role="group"
              aria-label="Menu dishes"
            >
              {sortedDishes.map((dish) => (
                <button
                  type="button"
                  className={dish.id === selectedDishId ? "is-selected" : ""}
                  key={dish.id}
                  onClick={() => onSelectDish(dish.id)}
                >
                  <span>
                    <strong>{dish.name}</strong>
                    <small>
                      {data.categories.find(
                        (category) => category.id === dish.categoryId,
                      )?.name ?? "Unknown category"}
                    </small>
                  </span>
                  <span>
                    {formatMoney(
                      dish.basePrice.amount,
                      dish.basePrice.currency,
                    )}
                    {" · "}
                    {dish.status === "active" && dish.available
                      ? "available"
                      : "unavailable"}
                  </span>
                </button>
              ))}
              {sortedDishes.length === 0 ? (
                <p className="empty-state">No dishes configured.</p>
              ) : null}
            </div>
          </div>

          {selectedDish ? (
            <div className="admin-subsection selected-record">
              <div className="subsection-heading">
                <div>
                  <h4>{selectedDish.name}</h4>
                </div>
                <span>Version {selectedDish.version}</span>
              </div>
              <form
                className="record-editor"
                key={`${selectedDish.id}:${selectedDish.version}`}
                onSubmit={(event) => onUpdateDish(event, selectedDish)}
              >
                <label>
                  Name
                  <input
                    name="name"
                    defaultValue={selectedDish.name}
                    maxLength={160}
                    disabled={!permissions.menuManage}
                    required
                  />
                </label>
                <label>
                  Category
                  <select
                    name="categoryId"
                    defaultValue={selectedDish.categoryId}
                    disabled={!permissions.menuManage}
                  >
                    {sortedCategories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Base price ({branch.currency})
                  <input
                    name="basePrice"
                    defaultValue={selectedDish.basePrice.amount}
                    inputMode="decimal"
                    pattern="\d+(\.\d{1,2})?"
                    disabled={!permissions.menuManagePrices}
                    required
                  />
                </label>
                <label>
                  Display order
                  <input
                    name="displayOrder"
                    type="number"
                    min={0}
                    max={10000}
                    defaultValue={selectedDish.displayOrder}
                    disabled={!permissions.menuManage}
                    required
                  />
                </label>
                <label className="record-editor__wide">
                  Description
                  <textarea
                    name="description"
                    defaultValue={selectedDish.description ?? ""}
                    maxLength={1000}
                    disabled={!permissions.menuManage}
                  />
                </label>
                <label className="record-editor__wide record-editor__image-row">
                  Image URL
                  <div className="image-input-row">
                    <input
                      name="imageUrl"
                      type="url"
                      maxLength={2048}
                      placeholder="https://example.com/image.jpg"
                      defaultValue={selectedDish.imageUrl ?? ""}
                      disabled={!permissions.menuManage}
                      onChange={(event) =>
                        setEditDishImageUrl(event.currentTarget.value)
                      }
                    />
                    {editDishImageUrl ? (
                      <img
                        className="dish-image-preview"
                        src={editDishImageUrl}
                        alt="Dish preview"
                        onError={(event) => {
                          event.currentTarget.style.display = "none";
                        }}
                        onLoad={(event) => {
                          event.currentTarget.style.display = "";
                        }}
                      />
                    ) : null}
                  </div>
                </label>
                <label>
                  Status
                  <select
                    name="status"
                    defaultValue={selectedDish.status}
                    disabled={!permissions.menuManage}
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </label>
                <label className="check-control">
                  <input
                    name="available"
                    type="checkbox"
                    defaultChecked={selectedDish.available}
                    disabled={!permissions.menuManageAvailability}
                  />
                  Temporarily available
                </label>
                <button
                  type="submit"
                  disabled={
                    pending ||
                    !featureEnabled ||
                    (!permissions.menuManage &&
                      !permissions.menuManagePrices &&
                      !permissions.menuManageAvailability)
                  }
                >
                  Save dish
                </button>
              </form>

              <div className="nested-management">
                <div className="subsection-heading">
                  <div>
                    <h4>Options</h4>
                    <p>
                      One option per line, as: name | extra price | active or
                      inactive. For example: Extra cheese | 150 | active
                    </p>
                  </div>
                </div>
                {detailLoading ? (
                  <p className="empty-state">Loading dish options…</p>
                ) : (
                  <>
                    {permissions.menuManage ? (
                      <form
                        className="option-editor"
                        onSubmit={onCreateOptionGroup}
                      >
                        <label>
                          Group name
                          <input name="name" maxLength={160} required />
                        </label>
                        <label>
                          Selection
                          <select name="selectionType">
                            <option value="single">Single</option>
                            <option value="multiple">Multiple</option>
                          </select>
                        </label>
                        <label>
                          Minimum
                          <input
                            name="minimumSelections"
                            type="number"
                            min={0}
                            max={50}
                            defaultValue={0}
                            required
                          />
                        </label>
                        <label>
                          Maximum
                          <input
                            name="maximumSelections"
                            type="number"
                            min={1}
                            max={50}
                            defaultValue={1}
                            required
                          />
                        </label>
                        <label>
                          Display order
                          <input
                            name="displayOrder"
                            type="number"
                            min={0}
                            max={10000}
                            defaultValue={optionGroups.length}
                            required
                          />
                        </label>
                        <label className="check-control">
                          <input name="isRequired" type="checkbox" />
                          Required
                        </label>
                        <label className="option-editor__wide">
                          Options
                          <textarea
                            name="options"
                            required
                            placeholder={`Small | 0.00 | active\nLarge | 2.50 | active`}
                          />
                        </label>
                        <button
                          type="submit"
                          disabled={pending || !featureEnabled}
                        >
                          Add option group
                        </button>
                      </form>
                    ) : null}
                    {optionGroups.map((group) => (
                      <div
                        className="option-group"
                        key={`${group.id}:${group.version}`}
                      >
                        <form
                          className="option-editor"
                          onSubmit={(event) =>
                            onUpdateOptionGroup(event, group)
                          }
                        >
                          <label>
                            Group name
                            <input
                              name="name"
                              defaultValue={group.name}
                              maxLength={160}
                              disabled={!permissions.menuManage}
                              required
                            />
                          </label>
                          <label>
                            Minimum
                            <input
                              name="minimumSelections"
                              type="number"
                              min={0}
                              max={50}
                              defaultValue={group.minimumSelections}
                              disabled={!permissions.menuManage}
                              required
                            />
                          </label>
                          <label>
                            Maximum
                            <input
                              name="maximumSelections"
                              type="number"
                              min={1}
                              max={50}
                              defaultValue={group.maximumSelections}
                              disabled={!permissions.menuManage}
                              required
                            />
                          </label>
                          <label>
                            Display order
                            <input
                              name="displayOrder"
                              type="number"
                              min={0}
                              max={10000}
                              defaultValue={group.displayOrder}
                              disabled={!permissions.menuManage}
                              required
                            />
                          </label>
                          <label className="check-control">
                            <input
                              name="isRequired"
                              type="checkbox"
                              defaultChecked={group.isRequired}
                              disabled={!permissions.menuManage}
                            />
                            Required
                          </label>
                          <button
                            type="submit"
                            disabled={
                              pending ||
                              !permissions.menuManage ||
                              !featureEnabled
                            }
                          >
                            Save group
                          </button>
                        </form>
                        <form
                          className="replace-options"
                          onSubmit={(event) => onReplaceOptions(event, group)}
                        >
                          <label>
                            Current options
                            <textarea
                              name="options"
                              defaultValue={optionLines(group)}
                              disabled={!permissions.menuManage}
                              required
                            />
                          </label>
                          <button
                            type="submit"
                            disabled={
                              pending ||
                              !permissions.menuManage ||
                              !featureEnabled
                            }
                          >
                            Replace options
                          </button>
                        </form>
                      </div>
                    ))}
                  </>
                )}
              </div>

              <div className="nested-management">
                <div className="subsection-heading">
                  <div>
                    <h4>Changes for {branch.name}</h4>
                    <p>Leave the price empty to use the restaurant price.</p>
                  </div>
                  <span>Version {branchOverride?.version ?? 0}</span>
                </div>
                <form
                  className="record-editor"
                  key={`${selectedDish.id}:${branchOverride?.version ?? 0}`}
                  onSubmit={onSaveBranchOverride}
                >
                  <label>
                    Price ({branch.currency})
                    <input
                      name="price"
                      inputMode="decimal"
                      pattern="\d+(\.\d{1,2})?"
                      defaultValue={branchOverride?.price?.amount ?? ""}
                      placeholder="Inherit base price"
                      disabled={!permissions.menuManagePrices}
                    />
                  </label>
                  <label>
                    Availability
                    <select
                      name="availability"
                      defaultValue={
                        branchOverride?.available === undefined ||
                        branchOverride.available === null
                          ? "inherit"
                          : branchOverride.available
                            ? "available"
                            : "unavailable"
                      }
                      disabled={!permissions.menuManageAvailability}
                    >
                      <option value="inherit">Inherit</option>
                      <option value="available">Available</option>
                      <option value="unavailable">Unavailable</option>
                    </select>
                  </label>
                  <label className="check-control">
                    <input
                      name="visible"
                      type="checkbox"
                      defaultChecked={branchOverride?.visible ?? true}
                      disabled={!permissions.menuManagePrices}
                    />
                    Visible in this branch
                  </label>
                  <button
                    type="submit"
                    disabled={
                      pending ||
                      !featureEnabled ||
                      (!permissions.menuManagePrices &&
                        !permissions.menuManageAvailability)
                    }
                  >
                    Save branch override
                  </button>
                </form>
              </div>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

interface TablesAdministrationProps {
  readonly branch: MenuTablesAdministrationProps["branch"];
  readonly data: ConfigurationData;
  readonly permissions: MenuTablesPermissions;
  readonly features: MenuTablesFeatures;
  readonly selectedTable: TableRecord | undefined;
  readonly selectedTableId: string | undefined;
  readonly issuedQr:
    { readonly result: IssuedQr; readonly dataUrl: string } | undefined;
  readonly pending: boolean;
  readonly onSelectTable: (tableId: string) => void;
  readonly onCreateTable: (event: FormEvent<HTMLFormElement>) => void;
  readonly onUpdateTable: (
    event: FormEvent<HTMLFormElement>,
    table: TableRecord,
  ) => void;
  readonly onIssueQr: (
    kind: "branch" | "table",
    table?: TableRecord,
  ) => Promise<void>;
  readonly onRevokeQr: (
    event: FormEvent<HTMLFormElement>,
    qrCode: QrCodeRecord,
  ) => void;
  readonly onCopyIssuedUrl: () => Promise<void>;
  readonly onPrintIssuedQr: () => void;
}

function TablesAdministration({
  branch,
  data,
  permissions,
  features,
  selectedTable,
  selectedTableId,
  issuedQr,
  pending,
  onSelectTable,
  onCreateTable,
  onUpdateTable,
  onIssueQr,
  onRevokeQr,
  onCopyIssuedUrl,
  onPrintIssuedQr,
}: TablesAdministrationProps) {
  const activeQrCodes = data.qrCodes.filter(
    (qrCode) => qrCode.status === "active",
  ).length;

  return (
    <section
      id="tables"
      className="admin-section operational-admin-section"
      aria-labelledby="tables-admin-title"
    >
      <div className="section-heading">
        <div>
          <h3 id="tables-admin-title" className="visually-hidden">
            {copy.tables.title}
          </h3>
          <p className="section-detail">{copy.tables.detail}</p>
        </div>
        <span>
          {data.tables.length} {data.tables.length === 1 ? "table" : "tables"} ·{" "}
          {activeQrCodes} active QR
        </span>
      </div>
      {!permissions.tablesView && !permissions.qrManage ? (
        <p className="empty-state">{copy.denied}</p>
      ) : (
        <>
          {!features.tables ? (
            <p className="feature-boundary" role="status">
              Tables are disabled. {copy.noFeature}
            </p>
          ) : null}
          <div className="admin-subsection">
            <div className="subsection-heading">
              <div>
                <h4>Tables</h4>
                <p>
                  Whether a table is free or seated updates automatically from
                  orders.
                </p>
              </div>
            </div>
            {permissions.tablesManage ? (
              <form
                className="compact-form compact-form--table"
                onSubmit={onCreateTable}
              >
                <label>
                  Table code
                  <input name="code" maxLength={32} required />
                </label>
                <label>
                  Area (optional)
                  <input name="area" maxLength={120} />
                </label>
                <button type="submit" disabled={pending || !features.tables}>
                  Add table
                </button>
              </form>
            ) : null}
            {permissions.tablesView ? (
              <div className="record-selector" role="group" aria-label="Tables">
                {data.tables.map((table) => (
                  <button
                    type="button"
                    className={
                      table.id === selectedTableId ? "is-selected" : ""
                    }
                    key={table.id}
                    onClick={() => onSelectTable(table.id)}
                  >
                    <span>
                      <strong>{table.code}</strong>
                      <small>{table.area ?? "Unassigned area"}</small>
                    </span>
                    <span>{table.derivedState.replaceAll("_", " ")}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          {selectedTable && permissions.tablesView ? (
            <div className="admin-subsection selected-record">
              <div className="subsection-heading">
                <div>
                  <h4>{selectedTable.code}</h4>
                </div>
                <span>
                  {selectedTable.derivedState.replaceAll("_", " ")} · v
                  {selectedTable.version}
                </span>
              </div>
              <form
                className="record-editor"
                key={`${selectedTable.id}:${selectedTable.version}`}
                onSubmit={(event) => onUpdateTable(event, selectedTable)}
              >
                <label>
                  Code
                  <input
                    name="code"
                    defaultValue={selectedTable.code}
                    maxLength={32}
                    disabled={!permissions.tablesManage}
                    required
                  />
                </label>
                <label>
                  Area
                  <input
                    name="area"
                    defaultValue={selectedTable.area ?? ""}
                    maxLength={120}
                    disabled={!permissions.tablesManage}
                  />
                </label>
                <label>
                  Status
                  <select
                    name="status"
                    defaultValue={selectedTable.status}
                    disabled={!permissions.tablesManage}
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </label>
                <label className="check-control">
                  <input
                    name="outOfService"
                    type="checkbox"
                    defaultChecked={selectedTable.outOfService}
                    disabled={!permissions.tablesManage}
                  />
                  Out of service
                </label>
                <button
                  type="submit"
                  disabled={
                    pending || !permissions.tablesManage || !features.tables
                  }
                >
                  Save table
                </button>
                {permissions.qrManage ? (
                  <button
                    className="secondary-action"
                    type="button"
                    disabled={
                      pending ||
                      !features.tables ||
                      !features.qrMenu ||
                      selectedTable.status === "inactive"
                    }
                    onClick={() => void onIssueQr("table", selectedTable)}
                  >
                    Issue / rotate table QR
                  </button>
                ) : null}
              </form>
            </div>
          ) : null}

          {permissions.qrManage ? (
            <div className="admin-subsection">
              <div className="subsection-heading">
                <div>
                  <h4>QR codes</h4>
                  <p>
                    A branch QR code shows the menu. A table QR code also lets
                    guests order to that table.
                  </p>
                </div>
                <button
                  className="secondary-action"
                  type="button"
                  disabled={pending || !features.menu || !features.qrMenu}
                  onClick={() => void onIssueQr("branch")}
                >
                  New branch QR code
                </button>
              </div>

              {issuedQr ? (
                <section
                  className="issued-qr"
                  aria-labelledby="issued-qr-title"
                >
                  <div>
                    <h5 id="issued-qr-title">
                      {issuedQr.result.qrCode.kind === "table"
                        ? `Table ${selectedTable?.code ?? ""}`
                        : branch.name}
                    </h5>
                    <p>
                      Download or print it now. For security, this exact code
                      can't be shown again; you can always create a new one.
                    </p>
                    <label>
                      Guest link
                      <input
                        value={issuedQr.result.qrUrl}
                        readOnly
                        onFocus={(event) => event.currentTarget.select()}
                      />
                    </label>
                    <div className="qr-actions">
                      <a
                        href={issuedQr.dataUrl}
                        download={`mise-${issuedQr.result.qrCode.kind}-${issuedQr.result.qrCode.id}.png`}
                      >
                        Download PNG
                      </a>
                      <button type="button" onClick={onPrintIssuedQr}>
                        Print QR
                      </button>
                      <button
                        type="button"
                        onClick={() => void onCopyIssuedUrl()}
                      >
                        Copy URL
                      </button>
                    </div>
                  </div>
                  <img
                    src={issuedQr.dataUrl}
                    alt={`QR code for ${
                      issuedQr.result.qrCode.kind === "table"
                        ? `table ${selectedTable?.code ?? ""}`
                        : branch.name
                    }`}
                    width={240}
                    height={240}
                  />
                </section>
              ) : null}

              <div className="qr-history">
                {data.qrCodes.map((qrCode) => {
                  const table = data.tables.find(
                    (item) => item.id === qrCode.tableId,
                  );
                  return (
                    <article key={qrCode.id}>
                      <div>
                        <strong>
                          {qrCode.kind === "table"
                            ? `Table ${table?.code ?? "unknown"}`
                            : "Branch browse QR"}
                        </strong>
                        <small>
                          {qrCode.status} · issued{" "}
                          {formatDate(qrCode.createdAtUtc)}
                        </small>
                        {qrCode.revokedReason ? (
                          <small>Reason: {qrCode.revokedReason}</small>
                        ) : null}
                      </div>
                      {qrCode.status === "active" ? (
                        <form onSubmit={(event) => onRevokeQr(event, qrCode)}>
                          <label>
                            Revocation reason
                            <input
                              name="reason"
                              minLength={8}
                              maxLength={500}
                              placeholder="Why this code must stop working"
                              required
                            />
                          </label>
                          <button type="submit" disabled={pending}>
                            Revoke
                          </button>
                        </form>
                      ) : (
                        <span className="fixed-value">
                          Revoked{" "}
                          {qrCode.revokedAtUtc
                            ? formatDate(qrCode.revokedAtUtc)
                            : ""}
                        </span>
                      )}
                    </article>
                  );
                })}
                {data.qrCodes.length === 0 ? (
                  <p className="empty-state">No QR codes issued yet.</p>
                ) : null}
              </div>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
