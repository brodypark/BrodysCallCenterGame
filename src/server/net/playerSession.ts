// The HTTP side of player identity: the route that hands out the player id cookie, and
// reading that cookie back when a socket connects. Needs @fastify/cookie registered with
// the secret first.

import type { FastifyInstance } from "fastify";
import { ApiRoutes } from "@shared/api";
import { ServerConfig } from "@server/config";
import { isSameOrigin } from "@server/net/origin";
import { newPlayerId, readPlayerId } from "@server/services/playerCookie";

const NoContent = 204;
const Forbidden = 403;

/** The client calls this before connecting. A browser without a valid cookie gets a new id;
 * one with a valid cookie keeps its id, and the cookie's lifetime starts again. Only this
 * site's own pages may call it (browsers always send Origin on a POST), so another site
 * can't swap a player's cookie for a new one. */
export function registerSessionRoute(app: FastifyInstance, options: { secure: boolean }): void {
  const { Name, MaxAgeSeconds } = ServerConfig.PlayerCookie;
  app.post(ApiRoutes.Session, (request, reply) => {
    if (!isSameOrigin(request.headers.origin, request.headers.host)) {
      return reply.code(Forbidden).send();
    }
    const playerId =
      readPlayerId(request.cookies[Name], (value) => request.unsignCookie(value)) ?? newPlayerId();
    void reply.setCookie(Name, playerId, {
      signed: true,
      httpOnly: true,
      sameSite: "lax",
      secure: options.secure,
      path: "/",
      maxAge: MaxAgeSeconds,
    });
    return reply.code(NoContent).send();
  });
}

/** The player id in a request's Cookie header, if it's there and correctly signed. */
export function playerIdFromCookieHeader(
  app: FastifyInstance,
  header: string | undefined,
): string | undefined {
  if (header === undefined) {
    return undefined;
  }
  const signed = app.parseCookie(header)[ServerConfig.PlayerCookie.Name];
  return readPlayerId(signed, (value) => app.unsignCookie(value));
}
