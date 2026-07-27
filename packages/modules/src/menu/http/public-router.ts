import { Router, type Request } from "express";
import { ApplicationError } from "../../shared/application-error.js";
import {
  requireGuestSession,
  type GuestRequest,
  type GuestRequestContext,
} from "../../ordering/index.js";
import type { CustomerMenu } from "../domain/models.js";

export interface PublicMenuHttpUseCases {
  getGuestMenu(guestContext: GuestRequestContext): Promise<CustomerMenu>;
}

export interface PublicMenuRouterDependencies {
  readonly useCases: PublicMenuHttpUseCases;
}

function guestContext(request: Request): GuestRequestContext {
  const context = (request as GuestRequest).guestContext;
  if (!context) {
    throw new ApplicationError(
      "authentication_required",
      401,
      "Authentication required",
    );
  }
  return context;
}

export function createPublicMenuRouter(
  dependencies: PublicMenuRouterDependencies,
): Router {
  const router = Router();

  router.get(
    "/public/menu",
    requireGuestSession(),
    async (request, response) => {
      response.send(
        await dependencies.useCases.getGuestMenu(guestContext(request)),
      );
    },
  );

  return router;
}
