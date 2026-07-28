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
  type CustomerMenu,
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
  | { readonly kind: "menu-error"; readonly session: GuestSession };

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
  readonly dish: CustomerMenu["categories"][number]["dishes"][number];
}) {
  const { dish } = props;
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
                <section key={group.id} className="option-group">
                  <div>
                    <h4>{group.name}</h4>
                    <span>
                      {group.minimum > 0 ? copy.required : copy.optional}
                      {" · "}
                      {group.minimum === 1 && group.maximum === 1
                        ? copy.oneChoice
                        : copy.choiceRange(group.minimum, group.maximum)}
                    </span>
                  </div>
                  <ul>
                    {group.options.map((option) => (
                      <li key={option.id}>
                        <span>{option.name}</span>
                        <span>
                          {formatMoney(
                            option.priceDelta.amount,
                            option.priceDelta.currency,
                            "exceptZero",
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </details>
        ) : null}
      </div>
    </article>
  );
}

function MenuView(props: {
  readonly session: GuestSession;
  readonly menu: CustomerMenu;
  readonly onReload: () => void;
}) {
  const hasDishes = props.menu.categories.some(
    (category) => category.dishes.length > 0,
  );
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
                    <DishRow key={dish.id} dish={dish} />
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

      <footer>
        <span>{copy.brand}</span>
        <p>{copy.browseOnlyNotice}</p>
      </footer>
    </div>
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
        onReload={() => void loadMenu(journey.session)}
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
