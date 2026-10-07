import fastifyCookie from "@fastify/cookie";
import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ApiRoutes } from "@shared/api";
import { ServerConfig } from "@server/config";
import { playerIdFromCookieHeader, registerSessionRoute } from "@server/net/playerSession";

const Host = "localhost:5173";
const SameSite = `http://${Host}`;
const Secret = "a-test-secret-that-is-long-enough-to-sign";

let app: FastifyInstance;

beforeEach(async () => {
  app = Fastify();
  await app.register(fastifyCookie, { secret: Secret });
  registerSessionRoute(app, { secure: true });
  await app.ready();
});

afterEach(async () => {
  await app.close();
});

async function postSession(headers: Record<string, string>): Promise<{
  status: number;
  cookie: string | undefined;
}> {
  const response = await app.inject({ method: "POST", url: ApiRoutes.Session, headers });
  const setCookie = response.headers["set-cookie"];
  const cookie = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  return { status: response.statusCode, cookie };
}

describe("session route", () => {
  it("gives a new browser a signed, httpOnly player cookie", async () => {
    const { status, cookie } = await postSession({ host: Host, origin: SameSite });
    expect(status).toBe(204);
    expect(cookie).toMatch(new RegExp(`^${ServerConfig.PlayerCookie.Name}=`));
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Lax/);
    expect(cookie).toMatch(/Secure/);
    const header = cookie?.split(";")[0];
    expect(playerIdFromCookieHeader(app, header)).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("keeps the same id for a browser that already has one", async () => {
    const first = (await postSession({ host: Host, origin: SameSite })).cookie?.split(";")[0] ?? "";
    const second = await postSession({ host: Host, origin: SameSite, cookie: first });
    expect(playerIdFromCookieHeader(app, second.cookie?.split(";")[0])).toBe(
      playerIdFromCookieHeader(app, first),
    );
  });

  it("refuses requests from other sites, or without an Origin", async () => {
    expect((await postSession({ host: Host, origin: "https://evil.example" })).status).toBe(403);
    expect((await postSession({ host: Host })).status).toBe(403);
  });

  it("doesn't read an id from a missing or forged cookie", () => {
    expect(playerIdFromCookieHeader(app, undefined)).toBeUndefined();
    const forged = `${ServerConfig.PlayerCookie.Name}=11111111-1111-4111-8111-111111111111.forged`;
    expect(playerIdFromCookieHeader(app, forged)).toBeUndefined();
  });
});
