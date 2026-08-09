import {
  useEffect,
  useState,
  type ReactNode,
  type SyntheticEvent,
} from "react";
import {
  authPath,
  replaceLocation,
  safeInternalPath,
  type AdminAuthRoute,
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
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new AuthRequestError(response.status);
}

function requestErrorMessage(error: unknown, action: string): string {
  if (error instanceof AuthRequestError) {
    if (error.status === 401)
      return "The supplied credentials could not be verified. Check the business code, email, and password.";
    if (error.status === 404)
      return "This link is invalid, expired, or already used. Request a new link or contact an administrator.";
    if (error.status === 409)
      return "This account state changed before the request completed. Refresh and try again.";
    if (error.status === 429)
      return "Too many attempts. Wait a moment and try again.";
    if (error.status === 503)
      return "Recovery delivery is temporarily unavailable. Try again later or contact an administrator.";
  }
  return `${action} could not be completed. Check your connection and try again.`;
}

function useCapturedToken(): string {
  const [token] = useState(
    () =>
      new URLSearchParams(window.location.search).get("token")?.trim() ?? "",
  );
  useEffect(() => {
    if (!token) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("token");
    const query = url.searchParams.toString();
    window.history.replaceState(
      {},
      "",
      `${url.pathname}${query ? `?${query}` : ""}${url.hash}`,
    );
  }, [token]);
  return token;
}

function Layout({
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
          <a
            className="auth-brand"
            href="/"
            aria-label="MISE administration access"
          >
            <span className="brand-mark" aria-hidden="true">
              M
            </span>
            <span>MISE administration</span>
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

function Heading({
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

function Feedback({
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
  const query = new URLSearchParams(window.location.search);
  const returnTo = safeInternalPath(query.get("returnTo"));
  const notice = query.get("notice");

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
      <Heading
        title="Sign in securely"
        detail="People, branches, permissions, and configuration remain tenant-scoped and audited."
      />
      {notice === "session-ended" ? (
        <p className="auth-notice" role="status">
          Your previous session ended. Sign in again to continue.
        </p>
      ) : null}
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
        <Feedback state={state} message={message} />
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
      <Heading
        title="Recover administration access"
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
        <Feedback state={state} message={message} />
      </form>
      <div className="auth-links">
        <a href={authPath("sign-in")}>Back to sign in</a>
        <a href={authPath("recover-complete")}>Already have a recovery link?</a>
      </div>
    </>
  );
}

function CompleteForm({ invitation }: { readonly invitation: boolean }) {
  const capturedToken = useCapturedToken();
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
      setMessage(
        `Paste the complete ${invitation ? "invitation" : "recovery"} link token.`,
      );
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
    setMessage(invitation ? "Accepting invitation…" : "Updating password…");
    try {
      await submitAuthRequest(
        invitation
          ? "/api/v1/invitations/accept"
          : "/api/v1/auth/recovery-completions",
        { token: nextToken, password },
      );
      replaceLocation(
        invitation
          ? "/auth/sign-in?notice=invitation-accepted"
          : "/auth/sign-in?notice=recovery-complete",
      );
    } catch (error) {
      setState("error");
      setMessage(
        requestErrorMessage(error, invitation ? "Invitation" : "Recovery"),
      );
    }
  }
  return (
    <>
      <Heading
        title={
          invitation ? "Activate an employee account" : "Set a new password"
        }
        detail={
          invitation
            ? "Set a password for the existing employee profile. No permissions are added by accepting the invitation."
            : "The recovery link is single-use. Completing it ends existing sessions."
        }
      />
      <form className="auth-form" onSubmit={(event) => void submit(event)}>
        <label>
          {invitation ? "Invitation" : "Recovery"} token
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
          {invitation ? "Password" : "New password"}
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
          {state === "pending"
            ? "Working…"
            : invitation
              ? "Accept invitation"
              : "Update password"}
        </button>
        <Feedback state={state} message={message} />
      </form>
      <div className="auth-links">
        <a href={authPath("sign-in")}>Back to sign in</a>
      </div>
    </>
  );
}

export function AdminAuthRoutes({ route }: { readonly route: AdminAuthRoute }) {
  const content =
    route === "sign-in" ? (
      <SignInForm />
    ) : route === "recover" ? (
      <RecoveryRequestForm />
    ) : (
      <CompleteForm invitation={route === "invite-accept"} />
    );
  const title =
    route === "sign-in"
      ? "Restaurant access starts with verified scope."
      : route === "recover"
        ? "Recover access safely"
        : route === "recover-complete"
          ? "Complete recovery"
          : "Accept a staff invitation";
  const detail =
    route === "sign-in"
      ? "Your tenant, branch, and effective responsibilities are resolved by the server."
      : "Use a server-issued, single-use account action. No tenant or branch is taken from the URL.";
  return (
    <Layout
      eyebrow="MISE · ADMINISTRATION ACCESS"
      title={title}
      detail={detail}
    >
      {content}
    </Layout>
  );
}
