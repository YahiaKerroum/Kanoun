import { ApplicationError } from "@rms/modules";
import type { CredentialTokenDelivery } from "@rms/service-workflow";

export interface CredentialTokenDeliveryConfig {
  readonly deliveryUrl?: string;
  readonly deliverySecret?: string;
}

export class WebhookCredentialTokenDelivery implements CredentialTokenDelivery {
  public constructor(private readonly config: CredentialTokenDeliveryConfig) {}

  public async deliverRecoveryToken(
    input: Parameters<CredentialTokenDelivery["deliverRecoveryToken"]>[0],
  ): Promise<void> {
    if (!this.config.deliveryUrl || !this.config.deliverySecret) {
      throw new ApplicationError(
        "service_unavailable",
        503,
        "Credential recovery delivery is unavailable",
        "Contact an administrator or retry after delivery is configured.",
      );
    }

    const response = await fetch(this.config.deliveryUrl, {
      method: "POST",
      redirect: "error",
      headers: {
        authorization: `Bearer ${this.config.deliverySecret}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        type: "credential_recovery",
        businessCode: input.businessCode,
        email: input.email,
        token: input.token,
        expiresAtUtc: input.expiresAtUtc.toISOString(),
      }),
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) {
      throw new ApplicationError(
        "service_unavailable",
        503,
        "Credential recovery delivery is unavailable",
        "Retry the recovery request later.",
      );
    }
  }
}
