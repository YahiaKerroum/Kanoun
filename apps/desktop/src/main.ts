import "@fontsource-variable/archivo/wdth.css";
import "@fontsource/young-serif/400.css";
import "./launcher.css";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type {
  RestaurantDraft,
  RuntimeState,
  SampleRestaurant,
} from "../runtime/protocol.js";

type Workspace = "staff" | "admin" | "guest";

interface UiState {
  runtime: RuntimeState | undefined;
  /** Shows the storage choice even when MISE is already configured. */
  changingStorage: boolean;
  storageChoice: "local" | "server";
  serverUrl: string;
  connectionNote: { kind: "ok" | "error"; text: string } | undefined;
  busy: string | undefined;
  error: string | undefined;
  notice: string | undefined;
  creating: boolean;
  revealPassword: boolean;
  confirmErase: boolean;
}

const ui: UiState = {
  runtime: undefined,
  changingStorage: false,
  storageChoice: "local",
  serverUrl: "",
  connectionNote: undefined,
  busy: undefined,
  error: undefined,
  notice: undefined,
  creating: false,
  revealPassword: false,
  confirmErase: false,
};

function required(selector: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(selector);
  if (!element) {
    throw new Error(`Launcher markup is missing ${selector}.`);
  }
  return element;
}

const view = required("#view");
const statusList = required("#status-list");
const railRestaurant = required("#rail-restaurant");

/* ------------------------------------------------------------------ */
/* DOM helpers. Text always goes through textContent.                  */
/* ------------------------------------------------------------------ */

type Child = Node | string | false | null | undefined;
type Attributes = Record<string, string | boolean | ((event: Event) => void)>;

function h(tag: string, attributes: Attributes = {}, ...children: Child[]) {
  const element = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) {
    if (typeof value === "function") {
      element.addEventListener(name.replace(/^on/, "").toLowerCase(), value);
    } else if (value === true) {
      element.setAttribute(name, "");
    } else if (value !== false) {
      element.setAttribute(name, value);
    }
  }
  for (const child of children) {
    if (child === false || child === null || child === undefined) continue;
    element.append(
      typeof child === "string" ? document.createTextNode(child) : child,
    );
  }
  return element;
}

function button(
  label: string,
  onClick: () => void,
  variant: "primary" | "secondary" | "quiet" | "danger" = "secondary",
  disabled = false,
) {
  return h(
    "button",
    {
      type: "button",
      class: `btn btn--${variant}`,
      disabled,
      onClick: () => onClick(),
    },
    label,
  );
}

function field(
  label: string,
  input: HTMLElement,
  hint?: string,
  wide = false,
): HTMLElement {
  return h(
    "label",
    { class: wide ? "field field--wide" : "field" },
    h("span", { class: "field__label" }, label),
    input,
    hint ? h("span", { class: "field__hint" }, hint) : null,
  );
}

/* ------------------------------------------------------------------ */
/* Runtime calls                                                       */
/* ------------------------------------------------------------------ */

async function call(command: Record<string, unknown>): Promise<unknown> {
  return invoke("runtime_call", { command });
}

async function run(label: string, work: () => Promise<void>): Promise<void> {
  ui.busy = label;
  ui.error = undefined;
  render();
  try {
    await work();
  } catch (error: unknown) {
    ui.error =
      typeof error === "string"
        ? error
        : error instanceof Error
          ? error.message
          : "Something went wrong.";
  } finally {
    ui.busy = undefined;
    render();
  }
}

function openWorkspace(
  workspace: Workspace,
  url: string,
  separate = false,
): void {
  void invoke("open_workspace", { workspace, url, separate }).catch(
    (error: unknown) => {
      ui.error = String(error);
      render();
    },
  );
}

/* ------------------------------------------------------------------ */
/* Rail                                                                */
/* ------------------------------------------------------------------ */

function renderRail(state: RuntimeState | undefined): void {
  const phase = state?.phase;
  const database =
    phase === "setup" || !state?.databaseLabel
      ? { label: "Not chosen yet", tone: "idle" }
      : phase === "starting" && state.step === "database"
        ? { label: state.databaseLabel, tone: "busy" }
        : phase === "error" && !state.urls
          ? { label: state.databaseLabel, tone: "error" }
          : { label: state.databaseLabel, tone: "ok" };
  const services =
    phase === "ready" || phase === "welcome"
      ? { label: "Running", tone: "ok" }
      : phase === "starting"
        ? { label: "Starting…", tone: "busy" }
        : phase === "error"
          ? { label: "Stopped", tone: "error" }
          : { label: "Not started", tone: "idle" };
  statusList.replaceChildren(
    h(
      "li",
      { class: `status status--${database.tone}` },
      h("span", { class: "status__name" }, "Database"),
      h("span", { class: "status__value" }, database.label),
    ),
    h(
      "li",
      { class: `status status--${services.tone}` },
      h("span", { class: "status__name" }, "Services"),
      h("span", { class: "status__value" }, services.label),
    ),
  );
  const restaurants = state?.restaurants ?? [];
  railRestaurant.textContent =
    restaurants.length === 1
      ? (restaurants[0]?.name ?? "")
      : restaurants.length > 1
        ? `${restaurants.length} restaurants`
        : "";
}

/* ------------------------------------------------------------------ */
/* Views                                                               */
/* ------------------------------------------------------------------ */

function alertLine(): HTMLElement | null {
  if (ui.error)
    return h("p", { class: "alert alert--error", role: "alert" }, ui.error);
  if (ui.notice)
    return h("p", { class: "alert alert--ok", role: "status" }, ui.notice);
  return null;
}

function storageView(state: RuntimeState | undefined): HTMLElement {
  const choice = (value: "local" | "server", title: string, body: string) =>
    h(
      "label",
      {
        class: `choice${ui.storageChoice === value ? " choice--selected" : ""}`,
      },
      h("input", {
        type: "radio",
        name: "storage",
        value,
        checked: ui.storageChoice === value,
        onChange: () => {
          ui.storageChoice = value;
          ui.connectionNote = undefined;
          render();
        },
      }),
      h("span", { class: "choice__title" }, title),
      h("span", { class: "choice__body" }, body),
    );

  const urlInput = h("input", {
    type: "text",
    spellcheck: "false",
    autocomplete: "off",
    placeholder: "postgresql://mise:password@192.168.1.20:5432/mise",
    value: ui.serverUrl,
    onInput: (event) => {
      ui.serverUrl = (event.target as HTMLInputElement).value;
      ui.connectionNote = undefined;
    },
  }) as HTMLInputElement;

  const testConnection = () =>
    run("Testing connection…", async () => {
      ui.connectionNote = undefined;
      try {
        const result = (await call({
          type: "testConnection",
          databaseUrl: ui.serverUrl,
        })) as {
          serverVersion: string;
        };
        ui.connectionNote = {
          kind: "ok",
          text: `Connected. PostgreSQL ${result.serverVersion}.`,
        };
      } catch (error: unknown) {
        ui.connectionNote = { kind: "error", text: String(error) };
      }
    });

  const save = () =>
    run(
      ui.storageChoice === "local" ? "Preparing this computer…" : "Connecting…",
      async () => {
        await call({
          type: "configure",
          settings:
            ui.storageChoice === "local"
              ? { mode: "local" }
              : { mode: "server", databaseUrl: ui.serverUrl },
        });
        ui.changingStorage = false;
      },
    );

  const isChange = Boolean(state && state.phase !== "setup");
  return h(
    "section",
    { class: "panel" },
    h(
      "h1",
      {},
      isChange
        ? "Change where data is kept"
        : "Where should MISE keep your restaurant's data?",
    ),
    h(
      "p",
      { class: "lead" },
      isChange
        ? "Switching does not copy data between places. The other location keeps whatever it already has."
        : "You can change this later from the launcher.",
    ),
    h(
      "div",
      { class: "choices", role: "radiogroup", "aria-label": "Data location" },
      choice(
        "local",
        "On this computer",
        "For one counter or a single till. MISE runs its own database here, with nothing else to install.",
      ),
      choice(
        "server",
        "On a PostgreSQL server",
        "For several computers sharing one restaurant. You need the server's connection URL.",
      ),
    ),
    ui.storageChoice === "server"
      ? h(
          "div",
          { class: "server-form" },
          field(
            "Connection URL",
            urlInput,
            "Ask whoever runs the server. The database must already exist; MISE creates its own tables.",
            true,
          ),
          h(
            "div",
            { class: "row" },
            button(
              "Test connection",
              () => void testConnection(),
              "secondary",
              Boolean(ui.busy) || !ui.serverUrl.trim(),
            ),
            ui.connectionNote
              ? h(
                  "p",
                  {
                    class: `note note--${ui.connectionNote.kind}`,
                    role: "status",
                  },
                  ui.connectionNote.text,
                )
              : null,
          ),
        )
      : null,
    alertLine(),
    h(
      "div",
      { class: "actions" },
      button(
        ui.busy ??
          (ui.storageChoice === "local"
            ? "Keep data on this computer"
            : "Connect to server"),
        () => void save(),
        "primary",
        Boolean(ui.busy) ||
          (ui.storageChoice === "server" && !ui.serverUrl.trim()),
      ),
      isChange
        ? button(
            "Cancel",
            () => {
              ui.changingStorage = false;
              ui.error = undefined;
              render();
            },
            "quiet",
          )
        : null,
    ),
  );
}

function startingView(state: RuntimeState): HTMLElement {
  const steps: [NonNullable<RuntimeState["step"]>, string][] = [
    [
      "database",
      state.mode === "server"
        ? "Connect to the database server"
        : "Open the database on this computer",
    ],
    ["migrations", "Bring the database up to date"],
    ["services", "Start the restaurant services"],
  ];
  const current = steps.findIndex(([step]) => step === state.step);
  return h(
    "section",
    { class: "panel" },
    h("h1", {}, "Starting MISE"),
    h(
      "p",
      { class: "lead" },
      "This takes a few seconds. The first start on a new computer takes a little longer.",
    ),
    h(
      "ol",
      { class: "steps" },
      ...steps.map(([, label], index) =>
        h(
          "li",
          {
            class: `step ${index < current ? "step--done" : index === current ? "step--active" : ""}`,
          },
          label,
        ),
      ),
    ),
  );
}

function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

const COUNTRIES: [string, string, string][] = [
  ["DZ", "Algeria", "DZD"],
  ["MA", "Morocco", "MAD"],
  ["TN", "Tunisia", "TND"],
  ["EG", "Egypt", "EGP"],
  ["FR", "France", "EUR"],
  ["BE", "Belgium", "EUR"],
  ["CA", "Canada", "CAD"],
  ["GB", "United Kingdom", "GBP"],
  ["US", "United States", "USD"],
  ["SA", "Saudi Arabia", "SAR"],
  ["AE", "United Arab Emirates", "AED"],
];

let cachedForm: HTMLFormElement | undefined;

/** The form is built once per visit so typed values survive re-renders. */
function restaurantForm(): HTMLFormElement {
  cachedForm ??= buildRestaurantForm();
  const feedback = cachedForm.querySelector(".form-feedback");
  feedback?.replaceChildren(
    ...[alertLine()].filter((node): node is HTMLElement => node !== null),
  );
  const submit = cachedForm.querySelector<HTMLButtonElement>(
    "button[type=submit]",
  );
  if (submit) {
    submit.disabled = Boolean(ui.busy);
    submit.textContent = ui.busy ?? "Create restaurant";
  }
  return cachedForm;
}

function buildRestaurantForm(): HTMLFormElement {
  const input = (name: string, attributes: Attributes = {}) =>
    h("input", { name, required: true, ...attributes }) as HTMLInputElement;
  const businessName = input("businessName", { autocomplete: "organization" });
  const businessCode = input("businessCode", {
    pattern: "[a-z0-9][a-z0-9-]{2,63}",
    spellcheck: "false",
  });
  let codeEdited = false;
  businessName.addEventListener("input", () => {
    if (!codeEdited) businessCode.value = slugify(businessName.value);
  });
  businessCode.addEventListener("input", () => {
    codeEdited = true;
  });
  const country = h(
    "select",
    { name: "countryCode" },
    ...COUNTRIES.map(([code, label]) => h("option", { value: code }, label)),
  ) as HTMLSelectElement;
  const currency = input("currency", {
    value: "DZD",
    maxlength: "3",
    pattern: "[A-Z]{3}",
  });
  country.addEventListener("change", () => {
    currency.value =
      COUNTRIES.find(([code]) => code === country.value)?.[2] ?? currency.value;
  });
  const timeZone = input("timeZone", {
    value: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });

  const form = h(
    "form",
    {
      class: "restaurant-form",
      onSubmit: (event) => {
        event.preventDefault();
        const data = Object.fromEntries(
          new FormData(event.target as HTMLFormElement),
        ) as Record<string, string>;
        const draft: RestaurantDraft = {
          businessName: data.businessName ?? "",
          businessCode: data.businessCode ?? "",
          restaurantName: data.restaurantName?.trim()
            ? data.restaurantName
            : (data.businessName ?? ""),
          branchName: data.branchName ?? "",
          addressLine: data.addressLine ?? "",
          city: data.city ?? "",
          countryCode: data.countryCode ?? "DZ",
          phone: data.phone ?? "",
          timeZone: data.timeZone ?? "",
          currency: (data.currency ?? "").toUpperCase(),
          opensAt: data.opensAt ?? "",
          closesAt: data.closesAt ?? "",
          ownerName: data.ownerName ?? "",
          ownerEmail: data.ownerEmail ?? "",
          ownerPassword: data.ownerPassword ?? "",
        };
        void run("Creating your restaurant…", async () => {
          await call({ type: "createRestaurant", restaurant: draft });
          ui.creating = false;
          cachedForm = undefined;
          ui.notice = `${draft.restaurantName} is ready. Open the back office and sign in with business code ${draft.businessCode} and ${draft.ownerEmail}.`;
        });
      },
    },
    h(
      "fieldset",
      {},
      h("legend", {}, "Restaurant"),
      field("Business name", businessName),
      field(
        "Business code",
        businessCode,
        "Staff type this when they sign in. Lowercase letters, numbers, and dashes.",
      ),
      field(
        "Restaurant name",
        input("restaurantName", {
          required: false,
          placeholder: "Same as business name",
        }),
      ),
    ),
    h(
      "fieldset",
      {},
      h("legend", {}, "First branch"),
      field("Branch name", input("branchName", { value: "Main" })),
      field(
        "Street address",
        input("addressLine", { autocomplete: "address-line1" }),
      ),
      field("City", input("city", { autocomplete: "address-level2" })),
      field("Country", country),
      field("Phone", input("phone", { type: "tel", autocomplete: "tel" })),
      field("Time zone", timeZone),
      field("Currency", currency),
      h(
        "div",
        { class: "field-pair" },
        field("Opens", input("opensAt", { type: "time", value: "11:00" })),
        field("Closes", input("closesAt", { type: "time", value: "23:00" })),
      ),
    ),
    h(
      "fieldset",
      {},
      h("legend", {}, "Owner account"),
      field("Your name", input("ownerName", { autocomplete: "name" })),
      field(
        "Email",
        input("ownerEmail", { type: "email", autocomplete: "email" }),
      ),
      field(
        "Password",
        input("ownerPassword", {
          type: "password",
          minlength: "12",
          autocomplete: "new-password",
        }),
        "At least 12 characters, with upper and lower case letters and a number.",
      ),
    ),
    h("div", { class: "form-feedback" }),
    h(
      "div",
      { class: "actions" },
      h(
        "button",
        { type: "submit", class: "btn btn--primary" },
        "Create restaurant",
      ),
      button(
        "Back",
        () => {
          ui.creating = false;
          cachedForm = undefined;
          ui.error = undefined;
          render();
        },
        "quiet",
      ),
    ),
  ) as HTMLFormElement;
  return form;
}

function welcomeView(): HTMLElement {
  if (ui.creating) {
    return h(
      "section",
      { class: "panel" },
      h("h1", {}, "Create your restaurant"),
      h(
        "p",
        { class: "lead" },
        "You can change all of this later in the back office, and add more branches there.",
      ),
      restaurantForm(),
    );
  }
  return h(
    "section",
    { class: "panel" },
    h("h1", {}, "Set up your restaurant"),
    h(
      "p",
      { class: "lead" },
      "The database is ready and empty. Start with your own restaurant, or look around a sample one first.",
    ),
    h(
      "div",
      { class: "choices" },
      h(
        "div",
        { class: "choice choice--static" },
        h("span", { class: "choice__title" }, "Your restaurant"),
        h(
          "span",
          { class: "choice__body" },
          "Enter your restaurant, first branch, and owner account. Takes about two minutes.",
        ),
        button(
          "Create restaurant",
          () => {
            ui.creating = true;
            ui.error = undefined;
            render();
          },
          "primary",
          Boolean(ui.busy),
        ),
      ),
      h(
        "div",
        { class: "choice choice--static" },
        h("span", { class: "choice__title" }, "Sample restaurant"),
        h(
          "span",
          { class: "choice__body" },
          "Dar Nedjma in Algiers, with a menu, tables, four staff accounts, and a few orders already placed.",
        ),
        button(
          ui.busy ?? "Load sample",
          () =>
            void run("Loading sample…", async () => {
              await call({ type: "loadSample" });
            }),
          "secondary",
          Boolean(ui.busy),
        ),
      ),
    ),
    alertLine(),
  );
}

function credentials(sample: SampleRestaurant): HTMLElement {
  const password = h(
    "code",
    {},
    ui.revealPassword ? sample.password : "••••••••••••",
  );
  return h(
    "section",
    { class: "block" },
    h("h2", {}, "Sample sign-ins"),
    h(
      "p",
      { class: "muted" },
      "Everyone in the sample restaurant shares one password. Sign in to each person in its own window.",
    ),
    h(
      "dl",
      { class: "keyvals" },
      h(
        "div",
        {},
        h("dt", {}, "Business code"),
        h("dd", {}, h("code", {}, sample.businessCode)),
      ),
      h(
        "div",
        {},
        h("dt", {}, "Password"),
        h(
          "dd",
          {},
          password,
          button(
            ui.revealPassword ? "Hide" : "Show",
            () => {
              ui.revealPassword = !ui.revealPassword;
              render();
            },
            "quiet",
          ),
          button(
            "Copy",
            () =>
              void navigator.clipboard.writeText(sample.password).then(() => {
                ui.notice = "Password copied.";
                render();
              }),
            "quiet",
          ),
        ),
      ),
    ),
    h(
      "table",
      { class: "people" },
      h(
        "thead",
        {},
        h(
          "tr",
          {},
          h("th", {}, "Role"),
          h("th", {}, "Name"),
          h("th", {}, "Email"),
          h("th", {}, ""),
        ),
      ),
      h(
        "tbody",
        {},
        ...sample.roles.map((role) =>
          h(
            "tr",
            {},
            h("td", {}, role.label),
            h("td", {}, role.displayName),
            h("td", {}, h("code", {}, role.email)),
            h(
              "td",
              { class: "people__action" },
              button(
                role.workspace === "admin" ? "Back office" : "Floor & kitchen",
                () => {
                  const urls = ui.runtime?.urls;
                  if (!urls) return;
                  openWorkspace(
                    role.workspace,
                    `${urls[role.workspace]}/auth/sign-in`,
                    role.workspace === "staff",
                  );
                },
                "quiet",
              ),
            ),
          ),
        ),
      ),
    ),
  );
}

function readyView(state: RuntimeState): HTMLElement {
  const urls = state.urls;
  const restaurants = state.restaurants ?? [];
  const sample = state.sample;
  const title =
    restaurants.length === 1
      ? (restaurants[0]?.name ?? "MISE")
      : "Your restaurants";
  const door = (name: string, body: string, actions: HTMLElement[]) =>
    h(
      "li",
      { class: "door" },
      h("div", {}, h("strong", {}, name), h("span", {}, body)),
      h("div", { class: "door__actions" }, ...actions),
    );

  return h(
    "section",
    { class: "panel panel--wide" },
    h("h1", {}, title),
    h(
      "p",
      { class: "lead" },
      restaurants.length > 1
        ? restaurants.map((item) => item.name).join(", ")
        : `Business code ${restaurants[0]?.businessCode ?? ""}. ${state.mode === "server" ? "Data is on the PostgreSQL server." : "Data is kept on this computer."}`,
    ),
    alertLine(),
    urls
      ? h(
          "ul",
          { class: "doors" },
          door(
            "Floor & kitchen",
            "Orders, tables, kitchen tickets, and payments.",
            [
              button(
                "Open",
                () => openWorkspace("staff", urls.staff),
                "primary",
              ),
              button(
                "Another window",
                () => openWorkspace("staff", urls.staff, true),
                "quiet",
              ),
            ],
          ),
          door(
            "Back office",
            "Menu, tables and QR codes, staff, and reports.",
            [
              button(
                "Open",
                () => openWorkspace("admin", urls.admin),
                "primary",
              ),
            ],
          ),
          sample?.tableUrl
            ? door(
                "Guest menu",
                `What guests see when they scan table ${sample.tableCode ?? ""}.`,
                [
                  button(
                    "Open",
                    () => openWorkspace("guest", sample.tableUrl ?? urls.guest),
                    "secondary",
                  ),
                ],
              )
            : null,
        )
      : null,
    state.recovery && state.recovery.length > 0
      ? h(
          "section",
          { class: "block" },
          h("h2", {}, "Password reset requests"),
          h(
            "p",
            { class: "muted" },
            "MISE has no email on this computer, so reset links appear here. Open one for the person standing with you.",
          ),
          h(
            "ul",
            { class: "resets" },
            ...state.recovery.map((item) =>
              h(
                "li",
                {},
                h("span", {}, item.email),
                h(
                  "span",
                  { class: "muted" },
                  `expires ${new Date(item.expiresAtUtc).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
                ),
                button(
                  "Open reset form",
                  () => openWorkspace("staff", item.url, true),
                  "quiet",
                ),
              ),
            ),
          ),
        )
      : null,
    sample ? credentials(sample) : null,
    h(
      "section",
      { class: "block block--settings" },
      h("h2", {}, "Settings"),
      h(
        "div",
        { class: "row" },
        button("Change where data is kept", () => {
          ui.changingStorage = true;
          ui.storageChoice = state.mode ?? "local";
          ui.error = undefined;
          render();
        }),
        button(
          "Restart services",
          () =>
            void run("Restarting…", async () => {
              await call({ type: "retry" });
            }),
        ),
        state.mode === "local"
          ? ui.confirmErase
            ? h(
                "span",
                { class: "confirm" },
                h(
                  "span",
                  {},
                  "Erase every restaurant, order, and account on this computer?",
                ),
                button(
                  "Erase everything",
                  () =>
                    void run("Erasing…", async () => {
                      ui.confirmErase = false;
                      await call({ type: "resetLocalData" });
                    }),
                  "danger",
                ),
                button(
                  "Keep data",
                  () => {
                    ui.confirmErase = false;
                    render();
                  },
                  "quiet",
                ),
              )
            : button(
                "Erase data on this computer",
                () => {
                  ui.confirmErase = true;
                  render();
                },
                "quiet",
              )
          : null,
      ),
    ),
  );
}

function errorView(state: RuntimeState): HTMLElement {
  return h(
    "section",
    { class: "panel" },
    h("p", { class: "badge badge--error" }, "Stopped"),
    h("h1", {}, state.error?.title ?? "MISE stopped"),
    h(
      "p",
      { class: "lead" },
      state.error?.detail ?? "See the runtime log in the data folder.",
    ),
    alertLine(),
    h(
      "div",
      { class: "actions" },
      button(
        ui.busy ?? "Try again",
        () =>
          void run("Starting…", async () => {
            await call({ type: "retry" });
          }),
        "primary",
        Boolean(ui.busy),
      ),
      button("Change where data is kept", () => {
        ui.changingStorage = true;
        render();
      }),
    ),
  );
}

function render(): void {
  const state = ui.runtime;
  renderRail(state);
  let content: HTMLElement;
  if (!state) {
    content = h("section", { class: "panel" }, h("h1", {}, "Opening MISE…"));
  } else if (ui.changingStorage || state.phase === "setup") {
    content = storageView(state);
  } else if (state.phase === "starting") {
    content = startingView(state);
  } else if (state.phase === "welcome") {
    content = welcomeView();
  } else if (state.phase === "ready") {
    content = readyView(state);
  } else if (state.phase === "stopping") {
    content = h(
      "section",
      { class: "panel" },
      h("h1", {}, "Closing MISE…"),
      h("p", { class: "lead" }, "Saving and shutting down the database."),
    );
  } else {
    content = errorView(state);
  }
  view.replaceChildren(content);
}

function applyState(state: RuntimeState | null | undefined): void {
  if (!state) return;
  const previous = ui.runtime?.phase;
  ui.runtime = state;
  if (previous !== state.phase && state.phase !== "ready") {
    ui.notice = state.phase === "welcome" ? ui.notice : undefined;
  }
  render();
}

document.querySelector("#open-data-folder")?.addEventListener("click", () => {
  void invoke("open_data_folder").catch(() => undefined);
});

void listen<RuntimeState>("runtime-state", (event) =>
  applyState(event.payload),
);
void invoke<RuntimeState | null>("runtime_state").then(applyState);
render();
