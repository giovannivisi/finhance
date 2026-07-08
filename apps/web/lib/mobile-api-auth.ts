import "server-only";

import { RECENT_AUTH_REQUIRED_CODE } from "@finhance/shared/users";
import { resolveMobileBearerUser } from "./mobile-auth";
import {
  hasRecentMobileIssuedAt,
  type MobileTokenClaims,
} from "./mobile-auth.core";

export const MOBILE_SESSION_INVALID_CODE = "MOBILE_SESSION_INVALID";

const NO_STORE_HEADERS = { "cache-control": "no-store" };

export async function resolveMobileApiUser(
  request: Request,
  options: { requireRecentAuth?: boolean } = {},
): Promise<
  | { ok: true; user: MobileTokenClaims }
  | {
      ok: false;
      response: Response;
    }
> {
  const bearer = await resolveMobileBearerUser(
    request.headers.get("authorization"),
  );

  if (!bearer.present) {
    return {
      ok: false,
      response: Response.json(
        { message: "Authentication is required." },
        { status: 401, headers: NO_STORE_HEADERS },
      ),
    };
  }

  if (bearer.invalid) {
    return {
      ok: false,
      response: Response.json(
        {
          message: "Mobile session is invalid or expired.",
          code: MOBILE_SESSION_INVALID_CODE,
        },
        { status: 401, headers: NO_STORE_HEADERS },
      ),
    };
  }

  if (
    options.requireRecentAuth &&
    !hasRecentMobileIssuedAt(bearer.user.issuedAt)
  ) {
    return {
      ok: false,
      response: Response.json(
        {
          message: "Confirm it is you before continuing.",
          code: RECENT_AUTH_REQUIRED_CODE,
        },
        { status: 403, headers: NO_STORE_HEADERS },
      ),
    };
  }

  return { ok: true, user: bearer.user };
}
