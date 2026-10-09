import { describe, expect, it } from "vitest";
import { Config } from "@shared/Config";
import type { MailMessage, MailSnapshot } from "@shared/types";
import { newMailFor, senderName, snippetOf, toastFor, updateQueue } from "@client/ui/mailRules";

function message(id: number, read = false): MailMessage {
  return {
    id,
    from: "Skibidi (Quality Assurance)",
    subject: `Email ${id}`,
    body: "QA is listening.\n\nDon't look at the van.",
    sentAt: 0,
    read,
  };
}

function inbox(messages: MailMessage[], autoOpenId: number | null = null): MailSnapshot {
  return { messages, autoOpenId };
}

describe("senderName", () => {
  it("drops the job title", () => {
    expect(senderName("Skibidi (Quality Assurance)")).toBe("Skibidi");
    expect(senderName("Gary")).toBe("Gary");
  });
});

describe("newMailFor", () => {
  it("gives the unread emails newer than the last seen, oldest first", () => {
    const snapshot = inbox([message(5), message(4, true), message(3), message(2)]);
    expect(newMailFor(snapshot, 2).map((each) => each.id)).toEqual([3, 5]);
  });

  it("skips the email that opens the Email app by itself", () => {
    expect(newMailFor(inbox([message(1), message(0)], 1), -1).map((each) => each.id)).toEqual([0]);
  });
});

describe("snippetOf", () => {
  it("puts the text on one line", () => {
    expect(snippetOf("Hi.\n\nBye.", 50)).toBe("Hi. Bye.");
  });

  it("cuts long text at a word", () => {
    expect(snippetOf("Your quota just went up, sadly.", 20)).toBe("Your quota just went...");
  });
});

describe("updateQueue", () => {
  it("drops notifications for emails since read, and adds new ones at the end", () => {
    const queue = [toastFor(message(1)), toastFor(message(2))];
    const snapshot = inbox([message(3), message(2), message(1, true)]);
    const next = updateQueue(queue, snapshot, [toastFor(message(3))]);
    expect(next.map((toast) => toast.id)).toEqual([2, 3]);
  });

  it("keeps only the newest MaxQueued", () => {
    const many = Array.from({ length: Config.Toasts.MaxQueued + 2 }, (_, id) => message(id));
    const next = updateQueue([], inbox(many), many.map(toastFor));
    expect(next).toHaveLength(Config.Toasts.MaxQueued);
    expect(next[0]?.id).toBe(2);
  });
});
