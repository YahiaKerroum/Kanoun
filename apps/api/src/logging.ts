import pino, { type Logger } from "pino";

export function createLogger(level: string): Logger {
  return pino({
    level,
    base: null,
    redact: {
      paths: [
        "req.headers.authorization",
        "req.headers.cookie",
        "request.headers.authorization",
        "request.headers.cookie",
        "req.headers.x-bootstrap-secret",
        "req.headers.x-csrf-token",
        "request.headers.x-bootstrap-secret",
        "request.headers.x-csrf-token",
        "req.body.password",
        "req.body.token",
        "sessionToken",
        "csrfToken",
        "invitationToken",
        "recoveryToken",
        "token",
        "password",
        "secret",
      ],
      censor: "[REDACTED]",
    },
  });
}
