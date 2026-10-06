import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type SyntheticEvent,
} from "react";
import { AnimatePresence, motion, MotionConfig } from "framer-motion";
import {
  CustomerRequestError,
  exchangeQrToken,
  getGuestMenu,
  getGuestOrder,
  requestGuestBill,
  requestGuestCancellation,
  submitGuestOrder,
  type CustomerMenu,
  type GuestOrder,
  type GuestSession,
} from "./api.js";
import { copy } from "./copy.js";

// Motion answers the guest's actions: a screen settling in, a sheet rising,
// the receipt printing once. Short ease-out tweens only.
const easeOut = [0.22, 1, 0.36, 1] as const;
const settle = { duration: 0.24, ease: easeOut } as const;

const panelMotion = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0, transition: settle },
  exit: { opacity: 0, transition: { duration: 0.12 } },
} as const;

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

type HeadingFocusCallback = (heading: HTMLHeadingElement | null) => void;

type MenuDish = CustomerMenu["categories"][number]["dishes"][number];
type OptionGroup = MenuDish["optionGroups"][number];

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

function unitMinorUnits(dish: MenuDish, optionIds: readonly string[]): number {
  let unit = minorUnits(dish.unitPrice.amount);
  for (const group of dish.optionGroups) {
    for (const option of group.options) {
      if (optionIds.includes(option.id)) {
        unit += minorUnits(option.priceDelta.amount);
      }
    }
  }
  return unit;
}

function cartItemMinorUnits(item: CartItem): number {
  return unitMinorUnits(item.dish, item.optionIds) * item.quantity;
}

function formatMinorUnits(value: number, currency: string): string {
  return formatMoney((value / 100).toFixed(2), currency);
}

function selectionsValid(dish: MenuDish, optionIds: readonly string[]) {
  return dish.optionGroups.every((group) => {
    const count = group.options.filter((option) =>
      optionIds.includes(option.id),
    ).length;
    return count >= group.minimum && count <= group.maximum;
  });
}

function toggleOption(
  current: readonly string[],
  group: OptionGroup,
  id: string,
): readonly string[] {
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
}

function BrandLockup(props: { readonly href: string; readonly label: string }) {
  return (
    <a href={props.href} className="brand-link" aria-label={props.label}>
      <span className="kanoun-mark" aria-hidden="true" />
      <span className="kanoun-wordmark">{copy.brand}</span>
    </a>
  );
}

function LoadingView(props: {
  readonly title: string;
  readonly body: string;
  readonly onHeadingMount: HeadingFocusCallback;
}) {
  return (
    <motion.section
      className="journey-panel loading-panel"
      aria-busy="true"
      {...panelMotion}
    >
      <div className="loading-ember" aria-hidden="true" />
      <h1 ref={props.onHeadingMount} tabIndex={-1}>
        {props.title}
      </h1>
      <p className="lead">{props.body}</p>
    </motion.section>
  );
}

function ErrorView(props: {
  readonly title: string;
  readonly body: string;
  readonly action?: string;
  readonly onAction?: () => void;
  readonly onHeadingMount: HeadingFocusCallback;
}) {
  return (
    <motion.section
      className="journey-panel error-panel"
      role="alert"
      {...panelMotion}
    >
      <h1 ref={props.onHeadingMount} tabIndex={-1}>
        {props.title}
      </h1>
      <p className="lead">{props.body}</p>
      {props.onAction && props.action ? (
        <button
          className="primary-action"
          type="button"
          onClick={props.onAction}
        >
          {props.action}
        </button>
      ) : null}
    </motion.section>
  );
}

function ConfirmationView(props: {
  readonly session: GuestSession;
  readonly name: string;
  readonly onNameChange: (name: string) => void;
  readonly onContinue: () => void;
  readonly onHeadingMount: HeadingFocusCallback;
}) {
  const tableSpecific = props.session.tableCode !== null;

  function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    props.onContinue();
  }

  return (
    <motion.section
      className="journey-panel confirmation-panel"
      {...panelMotion}
    >
      <h1 ref={props.onHeadingMount} tabIndex={-1}>
        {tableSpecific ? copy.tableTitle : copy.browseTitle}
      </h1>
      {tableSpecific ? (
        <div
          className="table-tent"
          aria-label={`${copy.tableLabel} ${props.session.tableCode}`}
        >
          <span>{copy.tableLabel}</span>
          <strong>{props.session.tableCode}</strong>
        </div>
      ) : null}
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
    </motion.section>
  );
}

function DishRow(props: {
  readonly dish: MenuDish;
  readonly orderingEnabled: boolean;
  readonly inCart: number;
  readonly onOpen: () => void;
  readonly onQuickAdd: () => void;
}) {
  const { dish } = props;
  const canOrder = props.orderingEnabled && dish.available;
  const quick = dish.optionGroups.every((group) => group.minimum === 0);

  return (
    <article
      className={`dish-row${dish.available ? "" : " is-unavailable"}`}
      aria-label={`${dish.name}${dish.available ? "" : `, ${copy.unavailableDish}`}`}
    >
      <button type="button" className="dish-row__open" onClick={props.onOpen}>
        {dish.imageUrl ? (
          <img
            className="dish-row__image"
            src={dish.imageUrl}
            alt=""
            loading="lazy"
          />
        ) : null}
        <span className="dish-row__copy">
          <span className="dish-row__title">
            <h3>{dish.name}</h3>
            <span className="dish-row__leader" aria-hidden="true" />
            <strong>
              {formatMoney(dish.unitPrice.amount, dish.unitPrice.currency)}
            </strong>
          </span>
          {dish.description ? (
            <span className="dish-row__description">{dish.description}</span>
          ) : null}
          {!dish.available ? (
            <span className="dish-row__note">{copy.unavailableDish}</span>
          ) : dish.optionGroups.length > 0 ? (
            <span className="dish-row__note">
              {dish.optionGroups.map((group) => group.name).join(", ")}
            </span>
          ) : null}
        </span>
      </button>
      {canOrder ? (
        <button
          type="button"
          className={`dish-row__add${props.inCart > 0 ? " has-items" : ""}`}
          aria-label={
            props.inCart > 0
              ? `${copy.addDish(dish.name)}, ${copy.inOrder(props.inCart)}`
              : copy.addDish(dish.name)
          }
          onClick={quick ? props.onQuickAdd : props.onOpen}
        >
          {props.inCart > 0 ? (
            <motion.span
              key={props.inCart}
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.18, ease: easeOut }}
            >
              {props.inCart}
            </motion.span>
          ) : (
            <span aria-hidden="true">+</span>
          )}
        </button>
      ) : null}
    </article>
  );
}

function DishSheet(props: {
  readonly dish: MenuDish | null;
  readonly orderingEnabled: boolean;
  readonly currency: string;
  readonly onClose: () => void;
  readonly onAdd: (item: CartItem) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [quantity, setQuantity] = useState(1);
  const [optionIds, setOptionIds] = useState<readonly string[]>([]);
  const [note, setNote] = useState("");
  const dish = props.dish;

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (dish && !element.open) {
      setQuantity(1);
      setOptionIds([]);
      setNote("");
      element.showModal();
    } else if (!dish && element.open) {
      element.close();
    }
  }, [dish]);

  const canOrder = Boolean(dish?.available) && props.orderingEnabled;
  const valid = dish ? selectionsValid(dish, optionIds) : false;
  const total = dish ? unitMinorUnits(dish, optionIds) * quantity : 0;

  return (
    <dialog
      ref={dialog}
      className="sheet dish-sheet"
      aria-labelledby="dish-sheet-title"
      onClose={props.onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) props.onClose();
      }}
    >
      {dish ? (
        <form
          className="sheet__body"
          onSubmit={(event) => {
            event.preventDefault();
            if (!canOrder || !valid) return;
            props.onAdd({
              clientId: crypto.randomUUID(),
              dish,
              optionIds,
              note: note.trim() || undefined,
              quantity,
            });
          }}
        >
          <button
            type="button"
            className="sheet__close"
            aria-label={copy.closeDish}
            onClick={props.onClose}
          >
            <span aria-hidden="true">×</span>
          </button>
          {dish.imageUrl ? (
            <img className="dish-sheet__image" src={dish.imageUrl} alt="" />
          ) : null}
          <header className="dish-sheet__header">
            <h2 id="dish-sheet-title">{dish.name}</h2>
            <strong>
              {formatMoney(dish.unitPrice.amount, dish.unitPrice.currency)}
            </strong>
          </header>
          {dish.description ? (
            <p className="dish-sheet__description">{dish.description}</p>
          ) : null}
          {!dish.available ? (
            <p className="dish-sheet__soldout">{copy.unavailableDish}</p>
          ) : null}
          {dish.optionGroups.map((group) => {
            const single = group.minimum === 1 && group.maximum === 1;
            return (
              <fieldset key={group.id} className="option-group">
                <legend>
                  <strong>{group.name}</strong>
                  <span>
                    {group.minimum > 0 ? copy.required : copy.optional},{" "}
                    {single
                      ? copy.oneChoice.toLowerCase()
                      : copy.choiceRange(group.minimum, group.maximum)}
                  </span>
                </legend>
                {group.options.map((option) => (
                  <label key={option.id} className="option-choice">
                    <input
                      type={single ? "radio" : "checkbox"}
                      name={`${dish.id}-${group.id}`}
                      checked={optionIds.includes(option.id)}
                      disabled={!canOrder}
                      onChange={() =>
                        setOptionIds((current) =>
                          toggleOption(current, group, option.id),
                        )
                      }
                    />
                    <span>{option.name}</span>
                    {minorUnits(option.priceDelta.amount) !== 0 ? (
                      <span className="option-choice__price">
                        {formatMoney(
                          option.priceDelta.amount,
                          option.priceDelta.currency,
                          "exceptZero",
                        )}
                      </span>
                    ) : null}
                  </label>
                ))}
              </fieldset>
            );
          })}
          {canOrder ? (
            <>
              <label className="dish-sheet__note">
                <span>{copy.noteLabel}</span>
                <textarea
                  maxLength={500}
                  rows={2}
                  value={note}
                  placeholder={copy.notePlaceholder}
                  onChange={(event) => setNote(event.currentTarget.value)}
                />
                <small>{copy.noteDisclaimer}</small>
              </label>
              <div className="sheet__footer">
                <div
                  className="stepper"
                  role="group"
                  aria-label={copy.quantity}
                >
                  <button
                    type="button"
                    aria-label={copy.decrease}
                    disabled={quantity <= 1}
                    onClick={() =>
                      setQuantity((value) => Math.max(1, value - 1))
                    }
                  >
                    −
                  </button>
                  <output aria-live="polite">{quantity}</output>
                  <button
                    type="button"
                    aria-label={copy.increase}
                    disabled={quantity >= 99}
                    onClick={() =>
                      setQuantity((value) => Math.min(99, value + 1))
                    }
                  >
                    +
                  </button>
                </div>
                <button
                  className="primary-action"
                  type="submit"
                  disabled={!valid}
                >
                  {copy.addFor(
                    quantity,
                    formatMinorUnits(total, props.currency),
                  )}
                </button>
              </div>
            </>
          ) : null}
        </form>
      ) : null}
    </dialog>
  );
}

function MenuView(props: {
  readonly session: GuestSession;
  readonly menu: CustomerMenu;
  readonly customerName: string;
  readonly onReload: () => void;
  readonly onAccepted: (order: GuestOrder) => void;
  readonly onHeadingMount: HeadingFocusCallback;
}) {
  const [cart, setCart] = useState<readonly CartItem[]>([]);
  const [openDish, setOpenDish] = useState<MenuDish | null>(null);
  const categories = useMemo(
    () =>
      props.menu.categories.filter((category) => category.dishes.length > 0),
    [props.menu.categories],
  );
  const [activeCategory, setActiveCategory] = useState<string | null>(
    categories[0]?.id ?? null,
  );
  const [announcement, setAnnouncement] = useState("");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [submissionState, setSubmissionState] = useState<
    "idle" | "pending" | "failed" | "conflict" | "rejected"
  >("idle");
  const [rejectionMessage, setRejectionMessage] = useState("");
  const idempotencyKey = useRef<string | undefined>(undefined);
  const reviewDialog = useRef<HTMLDialogElement>(null);
  const reviewTrigger = useRef<HTMLButtonElement>(null);
  const tabs = useRef<HTMLElement>(null);
  const orderingEnabled = props.session.tableId !== null;
  const cartTotal = cart.reduce(
    (sum, item) => sum + cartItemMinorUnits(item),
    0,
  );
  const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const countByDish = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of cart) {
      counts.set(item.dish.id, (counts.get(item.dish.id) ?? 0) + item.quantity);
    }
    return counts;
  }, [cart]);

  useEffect(() => {
    const dialog = reviewDialog.current;
    if (!dialog) return;
    if (reviewOpen && !dialog.open) {
      dialog.showModal();
    } else if (!reviewOpen && dialog.open) {
      dialog.close();
    }
  }, [reviewOpen]);

  // The tab for the section under the sticky header follows the scroll.
  useEffect(() => {
    const sections = categories
      .map((category) => document.getElementById(`category-${category.id}`))
      .filter((section): section is HTMLElement => section !== null);
    if (sections.length === 0 || !("IntersectionObserver" in window)) return;
    // Callbacks only report sections that changed, so remember which are in
    // view and pick the first of those in menu order.
    const visible = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = entry.target.id.replace("category-", "");
          if (entry.isIntersecting) visible.add(id);
          else visible.delete(id);
        }
        const first = categories.find((category) => visible.has(category.id));
        if (first) setActiveCategory(first.id);
      },
      { rootMargin: "-140px 0px -55% 0px" },
    );
    for (const section of sections) observer.observe(section);
    return () => observer.disconnect();
  }, [categories]);

  useEffect(() => {
    const strip = tabs.current;
    const tab = strip?.querySelector<HTMLElement>(
      `[data-category="${activeCategory ?? ""}"]`,
    );
    if (!strip || !tab) return;
    strip.scrollTo({
      left: tab.offsetLeft - strip.clientWidth / 2 + tab.clientWidth / 2,
      behavior: "smooth",
    });
  }, [activeCategory]);

  function add(item: CartItem) {
    setCart((current) => {
      const same = current.find(
        (candidate) =>
          candidate.dish.id === item.dish.id &&
          candidate.note === item.note &&
          candidate.optionIds.length === item.optionIds.length &&
          candidate.optionIds.every((id) => item.optionIds.includes(id)),
      );
      return same
        ? current.map((candidate) =>
            candidate === same
              ? {
                  ...candidate,
                  quantity: Math.min(99, candidate.quantity + item.quantity),
                }
              : candidate,
          )
        : [...current, item];
    });
    setAnnouncement(copy.added(item.dish.name));
    setSubmissionState("idle");
  }

  function changeQuantity(clientId: string, delta: number) {
    setCart((current) =>
      current.flatMap((item) => {
        if (item.clientId !== clientId) return [item];
        const quantity = Math.min(99, item.quantity + delta);
        return quantity < 1 ? [] : [{ ...item, quantity }];
      }),
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
      if (
        error instanceof CustomerRequestError &&
        error.code === "menu_changed"
      ) {
        setSubmissionState("conflict");
        return;
      }
      // Network failures and server errors are worth retrying; a refusal
      // (closed restaurant, sold-out dish, expired link) is not, so it gets
      // its own explanation instead of "check your connection".
      const rejection = rejectionFor(error);
      if (rejection) {
        // The server refused this attempt; a retry needs a fresh key.
        idempotencyKey.current = undefined;
        setRejectionMessage(rejection);
        setSubmissionState("rejected");
        return;
      }
      setSubmissionState("failed");
    }
  }

  return (
    <div className="menu-stage kanoun-stage">
      <header className="menu-header">
        <BrandLockup href="#menu-content" label={copy.brandMenuTopLabel} />
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
        <h1 ref={props.onHeadingMount} tabIndex={-1}>
          {copy.menuTitle}
        </h1>
        {categories.length > 1 ? (
          <nav
            ref={tabs}
            aria-label={copy.menuCategoriesLabel}
            className="category-tabs"
          >
            {categories.map((category) => (
              <a
                key={category.id}
                href={`#category-${category.id}`}
                data-category={category.id}
                className="category-tab"
                aria-current={
                  activeCategory === category.id ? "true" : undefined
                }
                onClick={() => setActiveCategory(category.id)}
              >
                {activeCategory === category.id ? (
                  <motion.span
                    className="category-tab__pill"
                    layoutId="category-pill"
                    transition={{ duration: 0.22, ease: easeOut }}
                  />
                ) : null}
                <span className="category-tab__label">{category.name}</span>
              </a>
            ))}
          </nav>
        ) : null}

        {categories.length > 0 ? (
          <div className="category-list">
            {categories.map((category) => (
              <section
                className="menu-category"
                id={`category-${category.id}`}
                key={category.id}
                aria-labelledby={`category-title-${category.id}`}
              >
                <header className="category-heading">
                  <h2 id={`category-title-${category.id}`}>{category.name}</h2>
                  <span>{copy.dishCount(category.dishes.length)}</span>
                </header>
                <div className="category-dishes">
                  {category.dishes.map((dish) => (
                    <DishRow
                      key={dish.id}
                      dish={dish}
                      orderingEnabled={orderingEnabled}
                      inCart={countByDish.get(dish.id) ?? 0}
                      onOpen={() => setOpenDish(dish)}
                      onQuickAdd={() =>
                        add({
                          clientId: crypto.randomUUID(),
                          dish,
                          optionIds: [],
                          quantity: 1,
                        })
                      }
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
              className="secondary-action"
              onClick={props.onReload}
            >
              {copy.reloadMenu}
            </button>
          </section>
        )}

        <footer className="menu-footer">
          <p>{orderingEnabled ? copy.noteDisclaimer : copy.browseOnlyNotice}</p>
        </footer>
      </main>

      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>

      <AnimatePresence>
        {orderingEnabled && cart.length > 0 ? (
          <motion.div
            className="cart-bar"
            initial={{ y: "120%" }}
            animate={{ y: 0, transition: settle }}
            exit={{ y: "120%", transition: { duration: 0.16 } }}
          >
            <div className="cart-bar__summary">
              <motion.strong
                key={itemCount}
                initial={{ y: -6, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.18, ease: easeOut }}
              >
                {copy.itemCount(itemCount)}
              </motion.strong>
              <span>{formatMinorUnits(cartTotal, props.menu.currency)}</span>
            </div>
            <button
              ref={reviewTrigger}
              type="button"
              onClick={() => setReviewOpen(true)}
            >
              {copy.reviewOrder}
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <DishSheet
        dish={openDish}
        orderingEnabled={orderingEnabled}
        currency={props.menu.currency}
        onClose={() => setOpenDish(null)}
        onAdd={(item) => {
          add(item);
          setOpenDish(null);
        }}
      />

      <dialog
        ref={reviewDialog}
        className="sheet cart-review"
        aria-labelledby="cart-title"
        onCancel={() => setReviewOpen(false)}
        onClose={() => {
          setReviewOpen(false);
          reviewTrigger.current?.focus();
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) setReviewOpen(false);
        }}
      >
        {reviewOpen ? (
          <div className="sheet__body">
            <header className="cart-review__header">
              <div>
                <p className="cart-review__table">
                  {copy.tableLabel} {props.session.tableCode}
                </p>
                <h2 id="cart-title">{copy.cartTitle}</h2>
              </div>
              <button
                type="button"
                className="sheet__close"
                aria-label={copy.closeReview}
                onClick={() => setReviewOpen(false)}
              >
                <span aria-hidden="true">×</span>
              </button>
            </header>
            {cart.length === 0 ? (
              <p className="cart-review__empty">{copy.cartEmpty}</p>
            ) : (
              <ul className="cart-items">
                <AnimatePresence initial={false}>
                  {cart.map((item) => (
                    <motion.li
                      key={item.clientId}
                      layout
                      exit={{ opacity: 0, transition: { duration: 0.12 } }}
                    >
                      <div className="cart-items__copy">
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
                        {item.note ? (
                          <p className="cart-items__note">{item.note}</p>
                        ) : null}
                      </div>
                      <strong className="cart-items__price">
                        {formatMinorUnits(
                          cartItemMinorUnits(item),
                          props.menu.currency,
                        )}
                      </strong>
                      <div
                        className="stepper stepper--small"
                        role="group"
                        aria-label={`${copy.quantity}, ${item.dish.name}`}
                      >
                        <button
                          type="button"
                          aria-label={
                            item.quantity === 1
                              ? `${copy.removeItem} ${item.dish.name}`
                              : `${copy.decrease}, ${item.dish.name}`
                          }
                          onClick={() => changeQuantity(item.clientId, -1)}
                        >
                          −
                        </button>
                        <output>{item.quantity}</output>
                        <button
                          type="button"
                          aria-label={`${copy.increase}, ${item.dish.name}`}
                          onClick={() => changeQuantity(item.clientId, 1)}
                        >
                          +
                        </button>
                      </div>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            )}
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
            {submissionState === "rejected" ? (
              <p className="submit-message" role="alert">
                {rejectionMessage}
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
          </div>
        ) : null}
      </dialog>
    </div>
  );
}

function orderStep(order: GuestOrder): number {
  if (order.fulfilment === "served") return 3;
  if (order.fulfilment === "ready") return 2;
  if (order.fulfilment === "preparing") return 1;
  return 0;
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
  const [billState, setBillState] = useState<
    "idle" | "pending" | "sent" | "failed"
  >(order.billRequest ? "sent" : "idle");
  const billKey = useRef<string | undefined>(undefined);

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

  async function requestBill() {
    const key = billKey.current ?? crypto.randomUUID();
    billKey.current = key;
    setBillState("pending");
    try {
      const bill = await requestGuestBill(props.session, order.id, key);
      billKey.current = undefined;
      setBillState("sent");
      setOrder((current) => ({
        ...current,
        billRequest: {
          id: bill.id,
          status: bill.status,
          requestedAt: bill.requestedAt,
        },
      }));
    } catch {
      setBillState("failed");
    }
  }

  const halted =
    order.closure === "cancelled"
      ? copy.cancelledStatus
      : order.approval === "rejected"
        ? copy.rejectedStatus
        : null;
  const step = orderStep(order);
  const sentAt = new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(order.submittedAt));

  return (
    <MotionConfig reducedMotion="user">
      <div className="order-stage kanoun-stage">
        <header className="menu-header">
          <BrandLockup href="/" label={copy.brandHomeLabel} />
          <div className="table-chip">
            <span>{copy.tableLabel}</span>
            <strong>{order.tableCode}</strong>
          </div>
        </header>
        <main className="order-confirmation">
          <h1>{halted ?? copy.sentTitle}</h1>
          {halted ? null : <p className="lead">{copy.sentBody}</p>}

          {halted ? null : (
            <ol className="order-progress" aria-label={copy.orderProgress}>
              {copy.orderSteps.map((label, index) => (
                <li
                  key={label}
                  className={
                    index < step
                      ? "is-done"
                      : index === step
                        ? "is-current"
                        : undefined
                  }
                  aria-current={index === step ? "step" : undefined}
                >
                  <span className="order-progress__dot" aria-hidden="true">
                    {index === step ? (
                      <motion.span
                        layoutId="progress-ember"
                        className="order-progress__ember"
                        transition={{ duration: 0.4, ease: easeOut }}
                      />
                    ) : null}
                  </span>
                  <span>{label}</span>
                </li>
              ))}
            </ol>
          )}
          <p className="sr-only" aria-live="polite">
            {halted ?? copy.orderSteps[step]}
          </p>
          {order.customerSafeStatusReason ? (
            <p className="status-reason">{order.customerSafeStatusReason}</p>
          ) : null}

          <motion.section
            className="order-receipt kanoun-ticket"
            aria-label={copy.orderReference}
            initial={{ clipPath: "inset(0 0 100% 0)", y: -16 }}
            animate={{
              clipPath: "inset(0 0 0% 0)",
              y: 0,
              transition: { duration: 0.7, ease: easeOut, delay: 0.1 },
            }}
          >
            <header className="order-receipt__header kanoun-ticket__face">
              <span>
                {copy.tableLabel} {order.tableCode}
              </span>
              <span>{sentAt}</span>
              <strong className="order-reference">{order.reference}</strong>
            </header>
            <ul className="receipt-items kanoun-ticket__face">
              {order.items.map((item) => (
                <li key={item.id}>
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
                  <span>
                    {formatMoney(item.total.amount, item.total.currency)}
                  </span>
                </li>
              ))}
            </ul>
            <div className="order-receipt__total kanoun-ticket__face">
              <span>Total</span>
              <strong>
                {formatMoney(order.total.amount, order.total.currency)}
              </strong>
            </div>
          </motion.section>

          <p
            className={`order-freshness${refreshState === "stale" ? " is-stale" : ""}`}
            role="status"
          >
            {refreshState === "stale"
              ? copy.statusMayBeStale
              : copy.statusUpdatesAutomatically}{" "}
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
          </p>

          <div className="order-actions">
            {order.closure === "active" ? (
              billState === "sent" || order.billRequest ? (
                <p className="order-actions__sent" role="status">
                  {copy.billSent}
                </p>
              ) : (
                <button
                  type="button"
                  className={step >= 3 ? "primary-action" : "secondary-action"}
                  disabled={billState === "pending"}
                  onClick={() => void requestBill()}
                >
                  {billState === "pending"
                    ? copy.billPending
                    : copy.requestBill}
                </button>
              )
            ) : null}
            <button
              type="button"
              className={step >= 3 ? "secondary-action" : "primary-action"}
              onClick={props.onOrderMore}
            >
              {copy.addAnotherOrder}
            </button>
            {billState === "failed" ? (
              <p className="submit-message" role="alert">
                {copy.billFailure}
              </p>
            ) : null}
          </div>

          {order.closure === "active" && cancellationState !== "sent" ? (
            <details className="cancellation-request">
              <summary>{copy.somethingWrong}</summary>
              <div>
                <label htmlFor="cancellation-reason">
                  {copy.cancellationReason}
                </label>
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
                  className="secondary-action"
                  disabled={
                    reason.trim().length === 0 ||
                    cancellationState === "pending"
                  }
                  onClick={() => void cancel()}
                >
                  {cancellationState === "pending"
                    ? copy.cancellationPending
                    : copy.requestCancellation}
                </button>
              </div>
            </details>
          ) : cancellationState === "sent" || order.cancellationRequested ? (
            <p className="cancellation-sent" role="status">
              {copy.cancellationSent}
            </p>
          ) : null}
        </main>
      </div>
    </MotionConfig>
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
  const focusHeading = useCallback<HeadingFocusCallback>((heading) => {
    if (!heading || !headingFocusPending.current) return;
    headingFocusPending.current = false;
    heading.focus({ preventScroll: true });
  }, []);

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

  async function loadMenu(session: GuestSession) {
    persistName(name.trim());
    setJourney({ kind: "loading-menu", session });
    try {
      const menu = await getGuestMenu();
      headingFocusPending.current = true;
      setJourney({ kind: "menu", session, menu });
      window.scrollTo({ top: 0 });
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
      <MotionConfig reducedMotion="user">
        <MenuView
          session={journey.session}
          menu={journey.menu}
          customerName={name}
          onReload={() => void loadMenu(journey.session)}
          onHeadingMount={focusHeading}
          onAccepted={(order) => {
            window.scrollTo({ top: 0 });
            setJourney({ kind: "order", session: journey.session, order });
          }}
        />
      </MotionConfig>
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

  const browsing =
    journey.kind === "confirm" && journey.session.tableCode === null;

  return (
    <MotionConfig reducedMotion="user">
      <main className="journey-shell kanoun-stage">
        <BrandLockup href="/" label={copy.brandHomeLabel} />
        <div className="journey-frame">
          <AnimatePresence mode="wait" initial={false}>
            {journey.kind === "exchanging" ? (
              <LoadingView
                key="exchanging"
                title={copy.loadingQrTitle}
                body={copy.loadingQrBody}
                onHeadingMount={focusHeading}
              />
            ) : journey.kind === "invalid" ? (
              <ErrorView
                key="invalid"
                title={copy.invalidTitle}
                body={copy.invalidBody}
                onHeadingMount={focusHeading}
              />
            ) : journey.kind === "exchange-error" ? (
              <ErrorView
                key="exchange-error"
                title={copy.unavailableTitle}
                body={copy.unavailableBody}
                action={copy.retry}
                onAction={() => setAttempt((value) => value + 1)}
                onHeadingMount={focusHeading}
              />
            ) : journey.kind === "confirm" ? (
              <ConfirmationView
                key="confirm"
                session={journey.session}
                name={name}
                onNameChange={setName}
                onContinue={() => void loadMenu(journey.session)}
                onHeadingMount={focusHeading}
              />
            ) : journey.kind === "loading-menu" ? (
              <LoadingView
                key="loading-menu"
                title={copy.loadingMenuTitle}
                body={copy.loadingMenuBody}
                onHeadingMount={focusHeading}
              />
            ) : (
              <ErrorView
                key="menu-error"
                title={copy.menuLoadErrorTitle}
                body={copy.menuLoadErrorBody}
                action={copy.reloadMenu}
                onAction={() => void loadMenu(journey.session)}
                onHeadingMount={focusHeading}
              />
            )}
          </AnimatePresence>
        </div>
        {browsing ? (
          <p className="journey-footnote">{copy.browseOnlyNotice}</p>
        ) : null}
        <div className="sr-only" aria-live="polite">
          {journey.kind === "confirm" ? copy.tableVerifiedAnnouncement : ""}
        </div>
      </main>
    </MotionConfig>
  );
}

/** A guest-facing reason for a refused order, or undefined to retry. */
function rejectionFor(error: unknown): string | undefined {
  if (!(error instanceof CustomerRequestError)) return undefined;
  if (error.status === 401 || error.code === "authentication_required") {
    return copy.orderSessionExpired;
  }
  if (error.status >= 500 || error.status === 429) return undefined;
  if (/not accepting new orders|when the branch is open/i.test(error.message)) {
    return copy.orderBranchClosed;
  }
  switch (error.code) {
    case "dish_unavailable":
      return copy.orderDishUnavailable;
    case "table_unavailable":
      return copy.orderTableUnavailable;
    default:
      return copy.orderRejected;
  }
}
