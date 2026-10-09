// GET /backup: downloads a copy of the saves database, for the admin only (ADMIN_SECRET as a
// Bearer token). Not registered at all without a secret.

import { randomUUID, timingSafeEqual } from "node:crypto";
import { createReadStream } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import type { DataService } from "@server/services/DataService";

const BackupRoute = "/backup";
const Unauthorized = 401;
const ServerError = 500;

/** Whether an Authorization header carries `secret` as a Bearer token. Compared in constant
 * time, so response timing can't reveal how much of a guess was right. */
export function isAuthorized(header: string | undefined, secret: string): boolean {
  if (header === undefined) {
    return false;
  }
  const given = Buffer.from(header);
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export function registerBackupRoute(
  app: FastifyInstance,
  options: { adminSecret: string; data: DataService },
): void {
  app.get(BackupRoute, async (request, reply) => {
    if (!isAuthorized(request.headers.authorization, options.adminSecret)) {
      return reply.status(Unauthorized).send({ error: "Unauthorized" });
    }
    const file = path.join(tmpdir(), `scamgpt-backup-${randomUUID()}.sqlite`);
    try {
      await options.data.backup(file);
    } catch (error) {
      request.log.error({ err: error }, "Backup failed");
      await rm(file, { force: true });
      return reply.status(ServerError).send({ error: "Backup failed." });
    }
    const stream = createReadStream(file);
    // The copy is only for this download.
    stream.on("close", () => {
      rm(file, { force: true }).catch((error: unknown) => {
        request.log.warn({ err: error, file }, "Couldn't delete a backup copy");
      });
    });
    return reply
      .header("Content-Type", "application/vnd.sqlite3")
      .header("Content-Disposition", 'attachment; filename="scamgpt.sqlite"')
      .header("Cache-Control", "no-store")
      .send(stream);
  });
}
