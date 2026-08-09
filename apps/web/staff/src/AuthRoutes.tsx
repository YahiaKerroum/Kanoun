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
      return "The supplied credentials could not be verified. Check the business code, email, and password.";
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
  return `${action} could not be completed. Check your connection and try again.`;
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
  eyebrow,
  title,
  detail,
  children,
}: {
  readonly eyebrow: string;
  readonly title: string;
  readonly detail: string;
  readonly children: ReactNode;
}) {
  return (
    <div className="auth-stage">
      <main className="auth-shell" aria-labelledby="auth-title">
        <section className="auth-intro">
          <a className="auth-brand" href="/" aria-label="MISE staff access">
            <span className="brand-mark" aria-hidden="true">
              M
            </span>
            <span>MISE staff</span>
          </a>
          <p className="eyebrow">{eyebrow}</p>
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
      <p className="eyebrow">Protected access</p>
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

function SignInForm() {
  const [state, setState] = useState<RequestState>("idle");
  const [message, setMessage] = useState("");
  const notice = new URLSearchParams(window.location.search).get("notice");
  const returnTo = safeInternalPath(
    new URLSearchParams(window.location.search).get("returnTo"),
  );

  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setState("pending");
    setMessage("Signing in…");
    try {
      await submitAuthRequest("/api/v1/auth/login", {
        businessCode: formText(data, "businessCode"),
        email: formText(data, "email"),
        password: formText(data, "password"),
      });
      replaceLocation(returnTo);
    } catch (error) {
      setState("error");
      setMessage(requestErrorMessage(error, "Sign-in"));
    }
  }

  return (
    <>
      <AuthHeading
        title="Sign in to your workspace"
        detail="Use the staff account assigned to your restaurant. Branch access is resolved by the server."
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
          <input name="businessCode" autoComplete="organization" required />
        </label>
        <label>
          Work email
          <input name="email" type="email" autoComplete="username" required />
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
        title="Recover staff access"
        detail="Enter the business code and work email. Account eligibility is never disclosed."
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
        detail="The recovery link is single-use. Completing it ends existing staff sessions."
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
        title="Activate your staff account"
        detail="Set a password for the existing employee profile. Your administrator’s responsibilities remain unchanged."
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
      ? "Sign in securely"
      : route === "recover"
        ? "Recover access safely"
        : route === "recover-complete"
          ? "Complete recovery"
          : "Accept a staff invitation";
  const detail =
    route === "sign-in"
      ? "Your session, branch, and effective responsibilities are resolved by the restaurant server."
      : "Use a server-issued, single-use account action. No tenant or branch is taken from the URL.";
  return (
    <AuthLayout eyebrow="MISE · STAFF ACCESS" title={title} detail={detail}>
      {content}
    </AuthLayout>
  );
}

export function goToStaffSignIn(returnTo: string): void {
  pushLocation(authPath("sign-in", returnTo));
}
