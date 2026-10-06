import {
  useEffect,
  useState,
  type ReactNode,
  type SyntheticEvent,
} from "react";
import {
  authPath,
  pushLocation,
  replaceLocation,
  safeInternalPath,
  type StaffAuthRoute,
} from "./auth-navigation.js";

type RequestState = "idle" | "pending" | "success" | "error";

function formText(data: FormData, name: string): string {
  const value = data.get(name);
  return typeof value === "string" ? value : "";
}

class AuthRequestError extends Error {
  public constructor(public readonly status: number) {
    super("Authentication request failed.");
    this.name = "AuthRequestError";
  }
}

async function submitAuthRequest(
  path: string,
  body: Readonly<Record<string, string>>,
): Promise<void> {
  const response = await fetch(path, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new AuthRequestError(response.status);
}

function requestErrorMessage(error: unknown, action: string): string {
  if (error instanceof AuthRequestError) {
    if (error.status === 401) {
      return "The business code, email, or password is wrong. Check them and try again.";
    }
    if (error.status === 404) {
      return "This link is invalid, expired, or already used. Request a new link or contact an administrator.";
    }
    if (error.status === 409) {
      return "This account state changed before the request completed. Refresh and try again.";
    }
    if (error.status === 429) {
      return "Too many attempts. Wait a moment and try again.";
    }
    if (error.status === 503) {
      return "Recovery delivery is temporarily unavailable. Try again later or contact an administrator.";
    }
  }
  if (error instanceof AuthRequestError) {
    if (error.status === 422) {
      return "Check what you entered. The business code uses only letters, numbers, and dashes, and the email must be complete.";
    }
    if (error.status === 403) {
      return "This page has expired. Reload it and try again.";
    }
    return `${action} failed on the restaurant server (error ${String(error.status)}). Try again, and restart Kanoun if it keeps happening.`;
  }
  return `${action} could not reach the restaurant server. Check your connection and try again.`;
}

function useCapturedToken(parameter: "token"): string {
  const [token] = useState(
    () =>
      new URLSearchParams(window.location.search).get(parameter)?.trim() ?? "",
  );
  useEffect(() => {
    if (!token) return;
    const url = new URL(window.location.href);
    url.searchParams.delete(parameter);
    const query = url.searchParams.toString();
    window.history.replaceState(
      {},
      "",
      `${url.pathname}${query ? `?${query}` : ""}${url.hash}`,
    );
  }, [parameter, token]);
  return token;
}

function AuthLayout({
  title,
  detail,
  children,
}: {
  readonly title: string;
  readonly detail: string;
  readonly children: ReactNode;
}) {
  return (
    <div className="auth-stage">
      <main className="auth-shell" aria-labelledby="auth-title">
        <section className="auth-intro">
          <a className="auth-brand" href="/">
            <span className="kanoun-mark" aria-hidden="true" />
            <span className="kanoun-wordmark">Kanoun</span>
            <span className="auth-brand__workspace">Floor & kitchen</span>
          </a>
          <h1 id="auth-title">{title}</h1>
          <p>{detail}</p>
        </section>
        <section className="auth-card">{children}</section>
      </main>
    </div>
  );
}

function AuthHeading({
  title,
  detail,
}: {
  readonly title: string;
  readonly detail: string;
}) {
  return (
    <header className="auth-card__heading">
      <h2>{title}</h2>
      <p>{detail}</p>
    </header>
  );
}

function FormFeedback({
  state,
  message,
}: {
  readonly state: RequestState;
  readonly message: string;
}) {
  return (
    <p
      className={`auth-feedback auth-feedback--${state}`}
      role={state === "error" ? "alert" : "status"}
      aria-live="polite"
    >
      {message}
    </p>
  );
}

const businessCodePattern = /^[a-z0-9][a-z0-9-]{2,63}$/i;
const rememberedCodeKey = "mise.businessCode";

/**
 * Values for the sign-in form: the desktop launcher links here with the
 * business code (and email) filled in, and a device remembers the last
 * business code that signed in successfully. Only well-formed values are used.
 */
function signInPrefill(): {
  readonly businessCode: string;
  readonly email: string;
} {
  const query = new URLSearchParams(window.location.search);
  let remembered = "";
  try {
    remembered = window.localStorage.getItem(rememberedCodeKey) ?? "";
  } catch {
    // Storage can be unavailable; the field simply starts empty.
  }
  const code = query.get("businessCode")?.trim() ?? remembered;
  const email = query.get("email")?.trim() ?? "";
  return {
    businessCode: businessCodePattern.test(code) ? code.toLowerCase() : "",
    email: email.length <= 320 && /^[^\s@]+@[^\s@]+$/.test(email) ? email : "",
  };
}

function rememberBusinessCode(code: string): void {
  try {
    window.localStorage.setItem(rememberedCodeKey, code.trim().toLowerCase());
  } catch {
    // Remembering is a convenience only.
  }
}

/** Explains a business code that cannot be right, before it is sent. */
function businessCodeProblem(code: string): string | undefined {
  const value = code.trim();
  if (businessCodePattern.test(value)) return undefined;
  if (/\s/.test(value)) {
    return `"${value}" looks like a restaurant name. The business code is a short code with dashes instead of spaces, like dar-nedjma-demo. Ask your manager for yours; on a Kanoun desktop it is shown in the launcher.`;
  }
  return "The business code uses only letters, numbers, and dashes, like dar-nedjma-demo.";
}

function SignInForm() {
  const prefill = signInPrefill();
  const [state, setState] = useState<RequestState>("idle");
  const [message, setMessage] = useState("");
  const notice = new URLSearchParams(window.location.search).get("notice");
  const returnTo = safeInternalPath(
    new URLSearchParams(window.location.search).get("returnTo"),
  );

  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const codeProblem = businessCodeProblem(formText(data, "businessCode"));
    if (codeProblem) {
      setState("error");
      setMessage(codeProblem);
      return;
    }
    setState("pending");
    setMessage("Signing in…");
    try {
      await submitAuthRequest("/api/v1/auth/login", {
        businessCode: formText(data, "businessCode"),
        email: formText(data, "email"),
        password: formText(data, "password"),
      });
      rememberBusinessCode(formText(data, "businessCode"));
      replaceLocation(returnTo);
    } catch (error) {
      setState("error");
      setMessage(requestErrorMessage(error, "Sign-in"));
    }
  }

  return (
    <>
      <AuthHeading
        title="Sign in"
        detail="Use your business code, work email, and password."
      />
      {notice === "invitation-accepted" ? (
        <p className="auth-notice" role="status">
          Invitation accepted. Sign in to continue.
        </p>
      ) : null}
      {notice === "recovery-complete" ? (
        <p className="auth-notice" role="status">
          Password updated. Sign in with your new password.
        </p>
      ) : null}
      <form className="auth-form" onSubmit={(event) => void submit(event)}>
        <label>
          Business code
          <input
            name="businessCode"
            autoComplete="organization"
            autoCapitalize="none"
            spellCheck={false}
            defaultValue={prefill.businessCode}
            aria-describedby="business-code-help"
            required
          />
          <span className="field-help" id="business-code-help">
            A short code like dar-nedjma-demo, not the restaurant name.
          </span>
        </label>
        <label>
          Work email
          <input
            name="email"
            type="email"
            autoComplete="username"
            defaultValue={prefill.email}
            required
          />
        </label>
        <label>
          Password
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </label>
        <button type="submit" disabled={state === "pending"}>
          {state === "pending" ? "Checking access…" : "Sign in"}
        </button>
        <FormFeedback state={state} message={message} />
      </form>
      <div className="auth-links">
        <a href={authPath("recover", returnTo)}>Forgot password?</a>
        <a href={authPath("invite-accept", returnTo)}>Accept an invitation</a>
      </div>
    </>
  );
}

function RecoveryRequestForm() {
  const [state, setState] = useState<RequestState>("idle");
  const [message, setMessage] = useState("");

  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setState("pending");
    setMessage("Submitting recovery request…");
    try {
      await submitAuthRequest("/api/v1/auth/recovery-requests", {
        businessCode: formText(data, "businessCode"),
        email: formText(data, "email"),
      });
      setState("success");
      setMessage(
        "If the account is eligible, recovery instructions will be delivered. This response does not confirm whether an account exists.",
      );
    } catch (error) {
      setState("error");
      setMessage(requestErrorMessage(error, "Recovery request"));
    }
  }

  return (
    <>
      <AuthHeading
        title="Reset your password"
        detail="Enter your business code and work email. If the account exists, a reset link is sent to your restaurant's account contact."
      />
      <form className="auth-form" onSubmit={(event) => void submit(event)}>
        <label>
          Business code
          <input name="businessCode" autoComplete="organization" required />
        </label>
        <label>
          Work email
          <input name="email" type="email" autoComplete="username" required />
        </label>
        <button type="submit" disabled={state === "pending"}>
          {state === "pending" ? "Requesting…" : "Request recovery"}
        </button>
        <FormFeedback state={state} message={message} />
      </form>
      <div className="auth-links">
        <a href={authPath("sign-in")}>Back to sign in</a>
        <a href={authPath("recover-complete")}>Already have a recovery link?</a>
      </div>
    </>
  );
}

function RecoveryCompleteForm() {
  const capturedToken = useCapturedToken("token");
  const [token, setToken] = useState(capturedToken);
  const [state, setState] = useState<RequestState>("idle");
  const [message, setMessage] = useState("");

  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const nextToken = (formText(data, "token") || token).trim();
    const password = formText(data, "password");
    const confirmation = formText(data, "confirmation");
    if (nextToken.length < 32) {
      setState("error");
      setMessage("Paste the complete recovery link token.");
      return;
    }
    if (
      password.length < 12 ||
      !/[a-z]/.test(password) ||
      !/[A-Z]/.test(password) ||
      !/[0-9]/.test(password)
    ) {
      setState("error");
      setMessage(
        "Use at least 12 characters with a lowercase letter, uppercase letter, and number.",
      );
      return;
    }
    if (password !== confirmation) {
      setState("error");
      setMessage("Password confirmation must match.");
      return;
    }
    setToken(nextToken);
    setState("pending");
    setMessage("Updating password…");
    try {
      await submitAuthRequest("/api/v1/auth/recovery-completions", {
        token: nextToken,
        password,
      });
      replaceLocation("/auth/sign-in?notice=recovery-complete");
    } catch (error) {
      setState("error");
      setMessage(requestErrorMessage(error, "Recovery"));
    }
  }

  return (
    <>
      <AuthHeading
        title="Set a new password"
        detail="This link works once. Saving a new password signs you out everywhere else."
      />
      <form className="auth-form" onSubmit={(event) => void submit(event)}>
        <label>
          Recovery token
          <input
            name="token"
            value={token}
            onChange={(event) => setToken(event.currentTarget.value)}
            autoComplete="off"
            spellCheck={false}
            required
            aria-describedby="recovery-token-help"
          />
        </label>
        <p id="recovery-token-help" className="field-help">
          Tokens are held in memory only and removed from the URL after capture.
        </p>
        <label>
          New password
          <input
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={12}
            required
          />
        </label>
        <label>
          Confirm new password
          <input
            name="confirmation"
            type="password"
            autoComplete="new-password"
            minLength={12}
            required
          />
        </label>
        <button type="submit" disabled={state === "pending"}>
          {state === "pending" ? "Updating…" : "Update password"}
        </button>
        <FormFeedback state={state} message={message} />
      </form>
      <div className="auth-links">
        <a href={authPath("sign-in")}>Back to sign in</a>
      </div>
    </>
  );
}

function InvitationAcceptForm() {
  const capturedToken = useCapturedToken("token");
  const [token, setToken] = useState(capturedToken);
  const [state, setState] = useState<RequestState>("idle");
  const [message, setMessage] = useState("");

  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const nextToken = (formText(data, "token") || token).trim();
    const password = formText(data, "password");
    const confirmation = formText(data, "confirmation");
    if (nextToken.length < 32) {
      setState("error");
      setMessage("Paste the complete invitation link token.");
      return;
    }
    if (
      password.length < 12 ||
      !/[a-z]/.test(password) ||
      !/[A-Z]/.test(password) ||
      !/[0-9]/.test(password)
    ) {
      setState("error");
      setMessage(
        "Use at least 12 characters with a lowercase letter, uppercase letter, and number.",
      );
      return;
    }
    if (password !== confirmation) {
      setState("error");
      setMessage("Password confirmation must match.");
      return;
    }
    setToken(nextToken);
    setState("pending");
    setMessage("Accepting invitation…");
    try {
      await submitAuthRequest("/api/v1/invitations/accept", {
        token: nextToken,
        password,
      });
      replaceLocation("/auth/sign-in?notice=invitation-accepted");
    } catch (error) {
      setState("error");
      setMessage(requestErrorMessage(error, "Invitation"));
    }
  }

  return (
    <>
      <AuthHeading
        title="Set your password"
        detail="Choose a password to finish setting up your account. At least 12 characters, with upper and lower case letters and a number."
      />
      <form className="auth-form" onSubmit={(event) => void submit(event)}>
        <label>
          Invitation token
          <input
            name="token"
            value={token}
            onChange={(event) => setToken(event.currentTarget.value)}
            autoComplete="off"
            spellCheck={false}
            required
          />
        </label>
        <p className="field-help">
          This one-time token is held in memory only and removed from the URL
          after capture.
        </p>
        <label>
          Password
          <input
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={12}
            required
          />
        </label>
        <label>
          Confirm password
          <input
            name="confirmation"
            type="password"
            autoComplete="new-password"
            minLength={12}
            required
          />
        </label>
        <button type="submit" disabled={state === "pending"}>
          {state === "pending" ? "Activating…" : "Accept invitation"}
        </button>
        <FormFeedback state={state} message={message} />
      </form>
      <div className="auth-links">
        <a href={authPath("sign-in")}>Back to sign in</a>
      </div>
    </>
  );
}

export function StaffAuthRoutes({ route }: { readonly route: StaffAuthRoute }) {
  const content =
    route === "sign-in" ? (
      <SignInForm />
    ) : route === "recover" ? (
      <RecoveryRequestForm />
    ) : route === "recover-complete" ? (
      <RecoveryCompleteForm />
    ) : (
      <InvitationAcceptForm />
    );
  const title =
    route === "sign-in"
      ? "Today's service starts here."
      : route === "recover"
        ? "Locked out?"
        : route === "recover-complete"
          ? "Choose a new password"
          : "You've been invited";
  const detail =
    route === "sign-in"
      ? "Orders, tables, the kitchen, and payments for your branch."
      : "Reset links and invitations work once and expire. Ask a manager for a new one if yours has stopped working.";
  return (
    <AuthLayout title={title} detail={detail}>
      {content}
    </AuthLayout>
  );
}

export function goToStaffSignIn(returnTo: string): void {
  pushLocation(authPath("sign-in", returnTo));
}
