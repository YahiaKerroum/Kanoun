import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type SyntheticEvent,
} from "react";
import {
  CustomerRequestError,
  exchangeQrToken,
  getGuestMenu,
  getGuestOrder,
  requestGuestCancellation,
  submitGuestOrder,
  type CustomerMenu,
  type GuestOrder,
  type GuestSession,
} from "./api.js";
import { copy } from "./copy.js";

type Journey =
  | { readonly kind: "exchanging" }
  | { readonly kind: "invalid" }
  | { readonly kind: "exchange-error" }
  | { readonly kind: "confirm"; readonly session: GuestSession }
  | { readonly kind: "loading-menu"; readonly session: GuestSession }
  | {
      readonly kind: "menu";
      readonly session: GuestSession;
      readonly menu: CustomerMenu;
    }
  | {
      readonly kind: "order";
      readonly session: GuestSession;
      readonly order: GuestOrder;
    }
  | { readonly kind: "menu-error"; readonly session: GuestSession };

type MenuDish = CustomerMenu["categories"][number]["dishes"][number];

interface CartItem {
  readonly clientId: string;
  readonly dish: MenuDish;
  readonly optionIds: readonly string[];
  readonly note?: string | undefined;
  readonly quantity: number;
}

function tokenFromLocation(): string | null {
  const match = /^\/qr\/([^/]+)\/?$/.exec(window.location.pathname);
  if (!match?.[1]) return null;
  try {
    const token = decodeURIComponent(match[1]).trim();
    return token.length >= 16 && token.length <= 256 ? token : null;
  } catch {
    return null;
  }
}

function savedName(): string {
  try {
    return window.localStorage.getItem("mise.customer-name") ?? "";
  } catch {
    return "";
  }
}

function persistName(name: string): void {
  try {
    if (name) {
      window.localStorage.setItem("mise.customer-name", name);
    } else {
      window.localStorage.removeItem("mise.customer-name");
    }
  } catch {
    // Private browsing may deny storage; continuing without persistence is safe.
  }
}

function formatMoney(
  amount: string,
  currency: string,
  signDisplay: "auto" | "exceptZero" = "auto",
): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      signDisplay,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(Number(amount));
  } catch {
    return `${amount} ${currency}`;
  }
}

function minorUnits(amount: string): number {
  const negative = amount.startsWith("-");
  const unsigned = negative ? amount.slice(1) : amount;
  const [whole = "0", fraction = ""] = unsigned.split(".");
  const value =
    Number(whole) * 100 + Number(fraction.padEnd(2, "0").slice(0, 2));
  return negative ? -value : value;
}

function cartItemMinorUnits(item: CartItem): number {
  let unit = minorUnits(item.dish.unitPrice.amount);
  for (const group of item.dish.optionGroups) {
    for (const option of group.options) {
      if (item.optionIds.includes(option.id)) {
        unit += minorUnits(option.priceDelta.amount);
      }
    }
  }
  return unit * item.quantity;
}

function formatMinorUnits(value: number, currency: string): string {
  return formatMoney((value / 100).toFixed(2), currency);
}

function LoadingView(props: {
  readonly eyebrow: string;
  readonly title: string;
  readonly body: string;
}) {
  return (
    <section className="journey-panel loading-panel" aria-busy="true">
      <div className="loading-mark" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <p className="eyebrow">{props.eyebrow}</p>
      <h1 tabIndex={-1}>{props.title}</h1>
      <p className="lead">{props.body}</p>
    </section>
  );
}

function ErrorView(props: {
  readonly invalid?: boolean;
  readonly onRetry?: () => void;
}) {
  return (
    <section className="journey-panel error-panel" role="alert">
      <div className="error-symbol" aria-hidden="true">
        !
      </div>
      <p className="eyebrow">{copy.menuAccessEyebrow}</p>
      <h1 tabIndex={-1}>
        {props.invalid ? copy.invalidTitle : copy.unavailableTitle}
      </h1>
      <p className="lead">
        {props.invalid ? copy.invalidBody : copy.unavailableBody}
      </p>
      {props.onRetry ? (
        <button
          className="primary-action"
          type="button"
          onClick={props.onRetry}
        >
          {copy.retry}
        </button>
      ) : null}
    </section>
  );
}

function ConfirmationView(props: {
  readonly session: GuestSession;
  readonly name: string;
  readonly onNameChange: (name: string) => void;
  readonly onContinue: () => void;
}) {
  const tableSpecific = props.session.tableCode !== null;

  function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    props.onContinue();
  }

  return (
    <section className="journey-panel confirmation-panel">
      <p className="eyebrow">
        {tableSpecific ? copy.tableEyebrow : copy.browseEyebrow}
      </p>
      <h1 tabIndex={-1}>
        {tableSpecific ? copy.tableTitle : copy.browseTitle}
      </h1>
      {tableSpecific ? (
        <div
          className="table-lockup"
          aria-label={`${copy.tableLabel} ${props.session.tableCode}`}
        >
          <span>{copy.tableLabel}</span>
          <strong>{props.session.tableCode}</strong>
        </div>
      ) : (
        <div className="branch-mark" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      )}
      <p className="lead">{tableSpecific ? copy.tableBody : copy.browseBody}</p>
      <form onSubmit={submit}>
        <label htmlFor="customer-name">{copy.nameLabel}</label>
        <input
          id="customer-name"
          name="customerName"
          type="text"
          autoComplete="name"
          maxLength={100}
          placeholder={copy.namePlaceholder}
          value={props.name}
          onChange={(event) => props.onNameChange(event.currentTarget.value)}
          aria-describedby="customer-name-hint"
        />
        <span id="customer-name-hint" className="field-hint">
          {copy.nameHint}
        </span>
        <button className="primary-action" type="submit">
          {tableSpecific ? copy.confirmTable : copy.continueBrowsing}
        </button>
      </form>
      {tableSpecific ? <p className="scan-note">{copy.wrongTable}</p> : null}
    </section>
  );
}

function DishRow(props: {
  readonly dish: MenuDish;
  readonly orderingEnabled: boolean;
  readonly onAdd: (item: CartItem) => void;
}) {
  const { dish } = props;
  const [quantity, setQuantity] = useState(1);
  const [optionIds, setOptionIds] = useState<readonly string[]>([]);
  const [note, setNote] = useState("");

  const selectionsValid = dish.optionGroups.every((group) => {
    const count = group.options.filter((option) =>
      optionIds.includes(option.id),
    ).length;
    return count >= group.minimum && count <= group.maximum;
  });

  function selectOption(group: MenuDish["optionGroups"][number], id: string) {
    setOptionIds((current) => {
      const groupIds = group.options.map((option) => option.id);
      if (group.maximum === 1) {
        if (group.minimum === 0 && current.includes(id)) {
          return current.filter((value) => value !== id);
        }
        return [...current.filter((value) => !groupIds.includes(value)), id];
      }
      return current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id];
    });
  }

  function add() {
    props.onAdd({
      clientId: crypto.randomUUID(),
      dish,
      optionIds,
      note: note.trim() || undefined,
      quantity,
    });
    setQuantity(1);
    setOptionIds([]);
    setNote("");
  }

  return (
    <article
      className={`dish-row${dish.available ? "" : " is-unavailable"}`}
      aria-label={`${dish.name}${dish.available ? "" : `, ${copy.unavailableDish}`}`}
    >
      <div className="dish-copy">
        <div className="dish-title-line">
          <h3>{dish.name}</h3>
          <strong>
            {formatMoney(dish.unitPrice.amount, dish.unitPrice.currency)}
          </strong>
        </div>
        {dish.description ? <p>{dish.description}</p> : null}
        {!dish.available ? (
          <p className="availability">
            <span aria-hidden="true">—</span> {copy.unavailableDish}
          </p>
        ) : null}
        {dish.optionGroups.length > 0 ? (
          <details>
            <summary>{copy.optionDetails}</summary>
            <div className="option-groups">
              {dish.optionGroups.map((group) => (
                <fieldset key={group.id} className="option-group">
                  <legend>
                    <strong>{group.name}</strong>
                    <span>
                      {group.minimum > 0 ? copy.required : copy.optional}
                      {" · "}
                      {group.minimum === 1 && group.maximum === 1
                        ? copy.oneChoice
                        : copy.choiceRange(group.minimum, group.maximum)}
                    </span>
                  </legend>
                  {group.options.map((option) => (
                    <label key={option.id} className="option-choice">
                      <input
                        type={
                          group.minimum === 1 && group.maximum === 1
                            ? "radio"
                            : "checkbox"
                        }
                        name={`${dish.id}-${group.id}`}
                        checked={optionIds.includes(option.id)}
                        onChange={() => selectOption(group, option.id)}
                      />
                      <span>{option.name}</span>
                      <span>
                        {formatMoney(
                          option.priceDelta.amount,
                          option.priceDelta.currency,
                          "exceptZero",
                        )}
                      </span>
                    </label>
                  ))}
                </fieldset>
              ))}
            </div>
          </details>
        ) : null}
        {props.orderingEnabled && dish.available ? (
          <div className="dish-order-controls">
            <label>
              <span>{copy.quantity}</span>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={99}
                value={quantity}
                onChange={(event) =>
                  setQuantity(
                    Math.max(
                      1,
                      Math.min(99, Number(event.currentTarget.value) || 1),
                    ),
                  )
                }
              />
            </label>
            <label className="dish-note">
              <span>{copy.noteLabel}</span>
              <textarea
                maxLength={500}
                rows={2}
                value={note}
                placeholder={copy.notePlaceholder}
                onChange={(event) => setNote(event.currentTarget.value)}
              />
            </label>
            <p className="note-disclaimer">{copy.noteDisclaimer}</p>
            <button
              type="button"
              className="add-action"
              disabled={!selectionsValid}
              onClick={add}
            >
              {copy.addToOrder}
            </button>
          </div>
        ) : null}
      </div>
    </article>
  );
}

function MenuView(props: {
  readonly session: GuestSession;
  readonly menu: CustomerMenu;
  readonly customerName: string;
  readonly onReload: () => void;
  readonly onAccepted: (order: GuestOrder) => void;
}) {
  const [cart, setCart] = useState<readonly CartItem[]>([]);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [submissionState, setSubmissionState] = useState<
    "idle" | "pending" | "failed" | "conflict"
  >("idle");
  const idempotencyKey = useRef<string | undefined>(undefined);
  const reviewDialog = useRef<HTMLDialogElement>(null);
  const reviewTrigger = useRef<HTMLButtonElement>(null);
  const hasDishes = props.menu.categories.some(
    (category) => category.dishes.length > 0,
  );
  const orderingEnabled = props.session.tableId !== null;
  const cartTotal = cart.reduce(
    (sum, item) => sum + cartItemMinorUnits(item),
    0,
  );
  const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  useEffect(() => {
    const dialog = reviewDialog.current;
    if (!dialog) return;
    if (reviewOpen && !dialog.open) {
      dialog.showModal();
    } else if (!reviewOpen && dialog.open) {
      dialog.close();
    }
  }, [reviewOpen]);

  function closeReview() {
    setReviewOpen(false);
  }

  function changeQuantity(clientId: string, delta: number) {
    setCart((current) =>
      current.map((item) =>
        item.clientId === clientId
          ? {
              ...item,
              quantity: Math.max(1, Math.min(99, item.quantity + delta)),
            }
          : item,
      ),
    );
  }

  async function submit() {
    if (cart.length === 0 || submissionState === "pending") return;
    const key = idempotencyKey.current ?? crypto.randomUUID();
    idempotencyKey.current = key;
    setSubmissionState("pending");
    try {
      const order = await submitGuestOrder(
        props.session,
        {
          menuVersion: props.menu.version,
          customerName: props.customerName.trim() || undefined,
          items: cart.map((item) => ({
            dishId: item.dish.id,
            quantity: item.quantity,
            optionIds: item.optionIds,
            note: item.note,
          })),
        },
        key,
      );
      idempotencyKey.current = undefined;
      setSubmissionState("idle");
      props.onAccepted(order);
    } catch (error) {
      setSubmissionState(
        error instanceof CustomerRequestError && error.code === "menu_changed"
          ? "conflict"
          : "failed",
      );
    }
  }

  return (
    <div className="menu-shell">
      <header className="menu-header">
        <div>
          <a
            href="#menu-content"
            className="brand-link"
            aria-label={copy.brandMenuTopLabel}
          >
            {copy.brand}
          </a>
          <p>{copy.menuUpdated}</p>
        </div>
        {props.session.tableCode ? (
          <div className="table-chip">
            <span>{copy.tableLabel}</span>
            <strong>{props.session.tableCode}</strong>
          </div>
        ) : (
          <span className="browse-chip">{copy.browseOnly}</span>
        )}
      </header>

      <main id="menu-content" className="menu-content">
        <section className="menu-intro">
          <p className="eyebrow">{copy.menuEyebrow}</p>
          <h1 tabIndex={-1}>{copy.menuTitle}</h1>
          {props.menu.categories.length > 1 ? (
            <nav aria-label={copy.menuCategoriesLabel}>
              {props.menu.categories.map((category) => (
                <a key={category.id} href={`#category-${category.id}`}>
                  {category.name}
                </a>
              ))}
            </nav>
          ) : null}
        </section>

        {hasDishes ? (
          <div className="category-list">
            {props.menu.categories.map((category, index) => (
              <section
                className="menu-category"
                id={`category-${category.id}`}
                key={category.id}
              >
                <div className="category-heading">
                  <span aria-hidden="true">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <h2>{category.name}</h2>
                </div>
                <div>
                  {category.dishes.map((dish) => (
                    <DishRow
                      key={dish.id}
                      dish={dish}
                      orderingEnabled={orderingEnabled}
                      onAdd={(item) => setCart((current) => [...current, item])}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <section className="empty-menu">
            <h2>{copy.emptyMenuTitle}</h2>
            <p>{copy.emptyMenuBody}</p>
            <button
              type="button"
              className="text-action"
              onClick={props.onReload}
            >
              {copy.reloadMenu}
            </button>
          </section>
        )}
      </main>

      {orderingEnabled && cart.length > 0 ? (
        <div className="cart-bar" aria-live="polite">
          <div>
            <strong>
              {itemCount} {itemCount === 1 ? "item" : "items"}
            </strong>
            <span>{formatMinorUnits(cartTotal, props.menu.currency)}</span>
          </div>
          <button
            ref={reviewTrigger}
            type="button"
            onClick={() => setReviewOpen(true)}
          >
            {copy.reviewOrder}
          </button>
        </div>
      ) : null}

      <dialog
        ref={reviewDialog}
        className="cart-review"
        aria-labelledby="cart-title"
        onCancel={closeReview}
        onClose={() => {
          setReviewOpen(false);
          reviewTrigger.current?.focus();
        }}
      >
        {reviewOpen ? (
          <>
            <div className="cart-review__header">
              <div>
                <p className="eyebrow">
                  {copy.tableLabel} {props.session.tableCode}
                </p>
                <h2 id="cart-title">{copy.cartTitle}</h2>
              </div>
              <button type="button" onClick={closeReview}>
                {copy.closeReview}
              </button>
            </div>
            <div className="cart-items">
              {cart.map((item) => (
                <article key={item.clientId}>
                  <div>
                    <h3>{item.dish.name}</h3>
                    {item.optionIds.length > 0 ? (
                      <p>
                        {item.dish.optionGroups
                          .flatMap((group) => group.options)
                          .filter((option) =>
                            item.optionIds.includes(option.id),
                          )
                          .map((option) => option.name)
                          .join(", ")}
                      </p>
                    ) : null}
                    {item.note ? <p>{item.note}</p> : null}
                  </div>
                  <div className="cart-item-actions">
                    <button
                      type="button"
                      aria-label={`Decrease ${item.dish.name} quantity`}
                      onClick={() => changeQuantity(item.clientId, -1)}
                    >
                      −
                    </button>
                    <span aria-label={`${copy.quantity} ${item.quantity}`}>
                      {item.quantity}
                    </span>
                    <button
                      type="button"
                      aria-label={`Increase ${item.dish.name} quantity`}
                      onClick={() => changeQuantity(item.clientId, 1)}
                    >
                      +
                    </button>
                    <button
                      type="button"
                      className="remove-action"
                      onClick={() =>
                        setCart((current) =>
                          current.filter(
                            (candidate) => candidate.clientId !== item.clientId,
                          ),
                        )
                      }
                    >
                      {copy.removeItem}
                    </button>
                  </div>
                  <strong>
                    {formatMinorUnits(
                      cartItemMinorUnits(item),
                      props.menu.currency,
                    )}
                  </strong>
                </article>
              ))}
            </div>
            <div className="cart-total">
              <span>Total</span>
              <strong>
                {formatMinorUnits(cartTotal, props.menu.currency)}
              </strong>
            </div>
            {submissionState === "conflict" ? (
              <p className="submit-message" role="alert">
                {copy.orderConflict}{" "}
                <button type="button" onClick={props.onReload}>
                  {copy.reloadMenu}
                </button>
              </p>
            ) : null}
            {submissionState === "failed" ? (
              <p className="submit-message" role="alert">
                {copy.orderFailure}
              </p>
            ) : null}
            <button
              type="button"
              className="primary-action submit-order"
              disabled={cart.length === 0 || submissionState === "pending"}
              onClick={() => void submit()}
            >
              {submissionState === "pending"
                ? copy.submittingOrder
                : copy.submitOrder}
            </button>
          </>
        ) : null}
      </dialog>

      <footer>
        <span>{copy.brand}</span>
        <p>{orderingEnabled ? copy.noteDisclaimer : copy.browseOnlyNotice}</p>
      </footer>
    </div>
  );
}

function OrderView(props: {
  readonly session: GuestSession;
  readonly initialOrder: GuestOrder;
  readonly onOrderMore: () => void;
}) {
  const [order, setOrder] = useState(props.initialOrder);
  const [refreshState, setRefreshState] = useState<
    "idle" | "pending" | "stale"
  >("idle");
  const [reason, setReason] = useState("");
  const [cancellationState, setCancellationState] = useState<
    "idle" | "pending" | "sent" | "failed"
  >(order.cancellationRequested ? "sent" : "idle");
  const cancellationKey = useRef<string | undefined>(undefined);

  async function refresh() {
    setRefreshState("pending");
    try {
      setOrder(await getGuestOrder(order.id));
      setRefreshState("idle");
    } catch {
      setRefreshState("stale");
    }
  }

  useEffect(() => {
    const timer = window.setInterval(() => {
      void getGuestOrder(order.id)
        .then((nextOrder) => {
          setOrder(nextOrder);
          setRefreshState("idle");
        })
        .catch(() => setRefreshState("stale"));
    }, 10_000);
    return () => window.clearInterval(timer);
  }, [order.id]);

  async function cancel() {
    const key = cancellationKey.current ?? crypto.randomUUID();
    cancellationKey.current = key;
    setCancellationState("pending");
    try {
      await requestGuestCancellation(
        props.session,
        order.id,
        reason.trim(),
        key,
      );
      cancellationKey.current = undefined;
      setCancellationState("sent");
      setOrder((current) => ({ ...current, cancellationRequested: true }));
    } catch {
      setCancellationState("failed");
    }
  }

  const status =
    order.closure === "cancelled"
      ? copy.cancelledStatus
      : order.approval === "rejected"
        ? copy.rejectedStatus
        : order.fulfilment === "served"
          ? copy.servedStatus
          : order.fulfilment === "ready"
            ? copy.readyStatus
            : order.fulfilment === "preparing"
              ? copy.preparingStatus
              : copy.receivedStatus;

  return (
    <main className="order-confirmation">
      <header>
        <a href="/" className="brand-link" aria-label={copy.brandHomeLabel}>
          {copy.brand}
        </a>
        <div className="table-chip">
          <span>{copy.tableLabel}</span>
          <strong>{order.tableCode}</strong>
        </div>
      </header>
      <section className="order-receipt">
        <p className="eyebrow">{copy.orderAccepted}</p>
        <h1>{copy.orderReference}</h1>
        <strong className="order-reference">{order.reference}</strong>
        <div className="order-status" aria-live="polite">
          <span>{copy.orderProgress}</span>
          <strong>{status}</strong>
        </div>
        {order.customerSafeStatusReason ? (
          <p className="status-reason">{order.customerSafeStatusReason}</p>
        ) : null}
        <p
          className={`order-freshness${refreshState === "stale" ? " is-stale" : ""}`}
          role="status"
        >
          {refreshState === "stale"
            ? copy.statusMayBeStale
            : copy.statusUpdatesAutomatically}
        </p>
        <div className="receipt-items">
          {order.items.map((item) => (
            <article key={item.id}>
              <span>{item.quantity}×</span>
              <div>
                <strong>{item.name}</strong>
                {item.selectedOptions.length > 0 ? (
                  <p>
                    {item.selectedOptions
                      .map((option) => option.optionName)
                      .join(", ")}
                  </p>
                ) : null}
                {item.note ? <p>{item.note}</p> : null}
              </div>
              <strong>
                {formatMoney(item.total.amount, item.total.currency)}
              </strong>
            </article>
          ))}
        </div>
        <div className="cart-total">
          <span>Total</span>
          <strong>
            {formatMoney(order.total.amount, order.total.currency)}
          </strong>
        </div>
        <div className="order-actions">
          <button
            type="button"
            className="text-action"
            disabled={refreshState === "pending"}
            onClick={() => void refresh()}
          >
            {refreshState === "pending"
              ? copy.refreshingStatus
              : copy.refreshStatus}
          </button>
          <button
            type="button"
            className="primary-action"
            onClick={props.onOrderMore}
          >
            {copy.addAnotherOrder}
          </button>
        </div>
      </section>
      {order.closure === "active" && cancellationState !== "sent" ? (
        <section className="cancellation-request">
          <h2>{copy.cancellationTitle}</h2>
          <label htmlFor="cancellation-reason">{copy.cancellationReason}</label>
          <textarea
            id="cancellation-reason"
            maxLength={500}
            rows={3}
            value={reason}
            placeholder={copy.cancellationPlaceholder}
            onChange={(event) => setReason(event.currentTarget.value)}
          />
          {cancellationState === "failed" ? (
            <p role="alert">{copy.cancellationFailure}</p>
          ) : null}
          <button
            type="button"
            disabled={
              reason.trim().length === 0 || cancellationState === "pending"
            }
            onClick={() => void cancel()}
          >
            {cancellationState === "pending"
              ? copy.cancellationPending
              : copy.requestCancellation}
          </button>
        </section>
      ) : cancellationState === "sent" || order.cancellationRequested ? (
        <p className="cancellation-sent" role="status">
          {copy.cancellationSent}
        </p>
      ) : null}
    </main>
  );
}

export function App() {
  const token = useMemo(tokenFromLocation, []);
  const [attempt, setAttempt] = useState(0);
  const [name, setName] = useState(savedName);
  const [journey, setJourney] = useState<Journey>(
    token ? { kind: "exchanging" } : { kind: "invalid" },
  );
  const headingFocusPending = useRef(false);

  useEffect(() => {
    if (!token) return;
    let current = true;
    setJourney({ kind: "exchanging" });
    void exchangeQrToken(token)
      .then((session) => {
        if (current) {
          headingFocusPending.current = true;
          setJourney({ kind: "confirm", session });
        }
      })
      .catch(() => {
        if (current) {
          headingFocusPending.current = true;
          setJourney({ kind: "exchange-error" });
        }
      });
    return () => {
      current = false;
    };
  }, [attempt, token]);

  useEffect(() => {
    if (!headingFocusPending.current) return;
    headingFocusPending.current = false;
    document.querySelector<HTMLElement>("h1[tabindex='-1']")?.focus({
      preventScroll: true,
    });
  }, [journey.kind]);

  async function loadMenu(session: GuestSession) {
    persistName(name.trim());
    setJourney({ kind: "loading-menu", session });
    try {
      const menu = await getGuestMenu();
      headingFocusPending.current = true;
      setJourney({ kind: "menu", session, menu });
    } catch (error) {
      if (error instanceof CustomerRequestError && error.status === 401) {
        headingFocusPending.current = true;
        setJourney({ kind: "exchange-error" });
        return;
      }
      headingFocusPending.current = true;
      setJourney({ kind: "menu-error", session });
    }
  }

  if (journey.kind === "menu") {
    return (
      <MenuView
        session={journey.session}
        menu={journey.menu}
        customerName={name}
        onReload={() => void loadMenu(journey.session)}
        onAccepted={(order) =>
          setJourney({ kind: "order", session: journey.session, order })
        }
      />
    );
  }

  if (journey.kind === "order") {
    return (
      <OrderView
        session={journey.session}
        initialOrder={journey.order}
        onOrderMore={() => void loadMenu(journey.session)}
      />
    );
  }

  return (
    <main className="journey-shell">
      <a className="journey-brand" href="/" aria-label={copy.brandHomeLabel}>
        {copy.brand}
      </a>
      <div className="journey-frame">
        {journey.kind === "exchanging" ? (
          <LoadingView
            eyebrow={copy.loadingQrEyebrow}
            title={copy.loadingQrTitle}
            body={copy.loadingQrBody}
          />
        ) : null}
        {journey.kind === "invalid" ? <ErrorView invalid /> : null}
        {journey.kind === "exchange-error" ? (
          <ErrorView onRetry={() => setAttempt((value) => value + 1)} />
        ) : null}
        {journey.kind === "confirm" ? (
          <ConfirmationView
            session={journey.session}
            name={name}
            onNameChange={setName}
            onContinue={() => void loadMenu(journey.session)}
          />
        ) : null}
        {journey.kind === "loading-menu" ? (
          <LoadingView
            eyebrow={copy.loadingMenuEyebrow}
            title={copy.loadingMenuTitle}
            body={copy.loadingMenuBody}
          />
        ) : null}
        {journey.kind === "menu-error" ? (
          <section className="journey-panel error-panel" role="alert">
            <div className="error-symbol" aria-hidden="true">
              !
            </div>
            <p className="eyebrow">{copy.menuUpdateEyebrow}</p>
            <h1 tabIndex={-1}>{copy.menuLoadErrorTitle}</h1>
            <p className="lead">{copy.menuLoadErrorBody}</p>
            <button
              className="primary-action"
              type="button"
              onClick={() => void loadMenu(journey.session)}
            >
              {copy.reloadMenu}
            </button>
          </section>
        ) : null}
      </div>
      <p className="journey-footnote">{copy.browseOnlyNotice}</p>
      <div className="sr-only" aria-live="polite">
        {journey.kind === "confirm" ? copy.tableVerifiedAnnouncement : ""}
      </div>
    </main>
  );
}
