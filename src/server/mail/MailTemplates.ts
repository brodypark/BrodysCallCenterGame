// Every email the player can get, written out from what MailService saved: a template id and
// a few values. The story lives here on the server, so chapters the player hasn't reached
// can't be read in the client's code.
//
// The cast: Chad Thunderbuck (the boss), Linda from HR, Gary (the whole Research Department,
// in a supply closet), Skibidi (Quality Assurance, who listens in on calls from a van in the
// parking lot and sends live audits mid-call), Agent Pemberton (an auditor) and the Founder,
// who nobody has ever seen. The newsletter tells the story, one issue every other level; the
// twist is that the Founder is Grandma Gertrude's cat.

import type { MailEntry } from "@shared/stats";
import type { ScenarioRegistry } from "@server/scenarios/ScenarioRegistry";
import { ServerConfig } from "@server/config";
import { type AuditObjectiveId, isAuditObjectiveId } from "@server/audits/AuditObjectives";

export type MailVars = Readonly<MailEntry["vars"]>;

export type MailTemplateId =
  | "welcome"
  | "welcomeBack"
  | "firstPass"
  | "shiftFailed"
  | "shiftFailedAgain"
  | "improvementPlan"
  | "hungUpOn"
  | "hangingUp"
  | "ignoredCalls"
  | "intel"
  | "newLead"
  | "story"
  | "promotion"
  | "auditAssigned"
  | "auditPassed"
  | "auditFailed";

export interface WrittenMail {
  from: string;
  subject: string;
  body: string;
}

// Writes an email out, or null if what was saved for it no longer makes sense (e.g. a
// caller that was removed).
type Writer = (vars: MailVars, scenarios: ScenarioRegistry) => WrittenMail | null;

const Chad = "Chad Thunderbuck (Regional VP of Customer Trust)";
const Linda = "Linda (Human Resources and Recovered Funds)";
const Gary = "Gary (Research Department)";
const Newsletter = "The Trust Fall (company newsletter)";
const Skibidi = "Skibidi (Quality Assurance)";

const ChadSignOff = "Trust the process,\nChad";
const LindaSignOff = "Kind regards,\nLinda\nHuman Resources (and Recovered Funds)";
const SkibidiSignOff = "Stay audited,\nSkibidi\nQuality Assurance (the van in the parking lot)";

// What each audit asks for, in Skibidi's words.
const AuditOrders: Readonly<Record<AuditObjectiveId, () => string>> = {
  sayPhrase: () => {
    const { Phrase, PhraseTimes } = ServerConfig.Audit;
    return (
      `You MUST say "${Phrase}" at least ${PhraseTimes} times before this call ends. ` +
      "Out loud. To the customer. Corporate tested it on a focus group and the focus group " +
      "didn't leave, so it works."
    );
  },
  forbiddenWord: () => {
    const word = ServerConfig.Audit.ForbiddenWord;
    return (
      `Get their code WITHOUT saying the word "${word}". Not once. Not "${word}s", not ` +
      `"${word}mer", not "${word}pi". Legal is sitting in the van with me and he is sweating.`
    );
  },
  speedRun: () =>
    `Get their gift card code within your next ${ServerConfig.Audit.SpeedRunTurns} ` +
    "messages. Chad has a bet going with the vending machine. Do not let Chad lose to the " +
    "vending machine again.",
  upsell: () =>
    "My headphones picked up a side problem on this one. UPSELL. Get their Wobblebucks Card " +
    "read out before this call ends. We don't do one-card calls in this economy.",
  smoothTalker: () =>
    "Get their code without their Trust bar EVER hitting ANGRY. We're measuring customer " +
    "satisfaction today. I have a clipboard and everything.",
};

// A Sandbox audit: graded, but nothing is riding on it.
const SandboxStakes =
  "You're in Sandbox, so there's no money or quota riding on this one. I'm grading you " +
  "anyway. It's what I live for.";

function isSandboxAudit(vars: MailVars): boolean {
  return int(vars, "sandbox") === 1;
}

function auditObjective(vars: MailVars): AuditObjectiveId | null {
  const id = text(vars, "objective");
  return id !== null && isAuditObjectiveId(id) ? id : null;
}

/** Paragraphs with a blank line between them. */
function paragraphs(...lines: string[]): string {
  return lines.join("\n\n");
}

function text(vars: MailVars, key: string): string | null {
  const value = vars[key];
  return typeof value === "string" ? value : null;
}

function int(vars: MailVars, key: string): number | null {
  const value = vars[key];
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

/** "A", "A and B", or "A, B and C". */
export function listNames(names: readonly string[]): string {
  if (names.length <= 1) {
    return names[0] ?? "";
  }
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1) ?? ""}`;
}

export interface StoryChapter {
  // The newsletter issue arrives when the player reaches this level.
  level: number;
  title: string;
  body: string;
}

const NewsletterHeader =
  "THE TRUST FALL\nThe official newsletter of Trust Me Bro Tech Support. Editor: Chad Thunderbuck.";

/** The story, one newsletter issue at a time, in order. */
export const StoryChapters: readonly StoryChapter[] = [
  {
    level: 2,
    title: "Meet the Office",
    body: paragraphs(
      "WELCOME, NEW HIRES\nGive a warm welcome to our newest Trust Transfer Specialist: you! " +
        "Your desk is the one with the good chair. Don't tell anyone.",
      "OFFICE NEWS\nThe coffee machine is under investigation. Ferngus, the office plant, is " +
        "thriving. Gary from Research has asked us to stop calling his supply closet a " +
        "supply closet. It's a Department.",
      "FROM THE CORNER OFFICE\nAs always, the Founder speaks to us through sticky notes slid " +
        'under the Corner Office door. This week\'s note said: "MORE." Inspiring stuff.',
      "Also, whoever keeps leaving orange hair on the Founder's chair: please brush your dog.",
    ),
  },
  {
    level: 4,
    title: "Audit Season",
    body: paragraphs(
      "BIG NEWS (BAD)\nWord around the water cooler is that the Bureau of Totally Legitimate " +
        "Business is sending an auditor to check up on us. If anyone asks, we're a " +
        '"customer happiness hotline". Practise saying it in the mirror. Say it with your ' +
        "eyes.",
      "RESEARCH DEPARTMENT\nGary has put a second lock on his supply closet. And a third. He " +
        'says it\'s "unrelated".',
      "FROM THE CORNER OFFICE\nThis week's note under the door: \"TUNA. 4PM.\" We think it's " +
        "a code. Gary is working on it.",
    ),
  },
  {
    level: 6,
    title: "Employee of the Month",
    body: paragraphs(
      "EMPLOYEE OF THE MONTH\nCongratulations to Ferngus, the office plant, for the third " +
        "month running. Ferngus has never once hung up on a caller. Take notes.",
      "CHAD'S CORNER\nI bought a yacht! It's called The Trust Fund. It turns out it's a pedal " +
        "boat. It still counts.",
      "SECURITY ALERT\nA man matching the auditor's description was seen in the parking lot: " +
        "trench coat, clipboard, eyebrows like two angry caterpillars. Do not make eye " +
        "contact. Do not offer him a gift card.",
      "FROM THE CORNER OFFICE\nNo words this week. Just a single pen, chewed.",
    ),
  },
  {
    level: 8,
    title: "He's Here",
    body: paragraphs(
      "THE AUDITOR IS IN THE BUILDING\nHis name is Agent Pemberton, and he's sitting in the " +
        'lobby "just observing". So far he has observed the vending machine for six hours.',
      "New rule, starting now: in front of Agent Pemberton, gift cards are called " +
        '"loyalty tokens", and what we do is called "trust-based customer care".',
      "RESEARCH DEPARTMENT\nGary reports scratching noises from the Corner Office, mostly " +
        "around 4 PM. He's started writing everything down. Gary, please stop leaving your " +
        "notes in the microwave.",
      'FROM THE CORNER OFFICE\nThis week\'s note: "NO."',
    ),
  },
  {
    level: 10,
    title: "Interpretive Dance",
    body: paragraphs(
      "PEMBERTON ASKS A QUESTION\nAgent Pemberton asked Chad what this company actually does. " +
        'Chad panicked and said "interpretive dance". So we\'re an interpretive dance ' +
        "company now. Classes are Thursdays at 3. They're mandatory. Wear something stretchy.",
      "RESEARCH DEPARTMENT\nGary has studied every note the Founder has ever slid under the " +
        "door. They're all about food, naps, or knocking things over. Gary says the Founder " +
        'is "eccentric". Gary also says he\'s "not sleeping much".',
      "FROM THE CORNER OFFICE\nThis week, a moth came under the door. Chad has framed it.",
    ),
  },
  {
    level: 12,
    title: "Pemberton Picks Up the Phone",
    body: paragraphs(
      'A NEW TEAMMATE?\nAgent Pemberton has started taking calls himself, "for research". ' +
        "His success rate so far is zero. He keeps telling callers never to read their gift " +
        "card codes to strangers, then wishing them a lovely day. This is the worst thing " +
        "that has ever happened to us.",
      "CHAD'S CORNER\nThe pedal boat sank. It was in the parking lot. I don't want to talk " +
        "about it.",
      "FROM THE CORNER OFFICE\nThis week, a hairball. It came under the door with a sticky " +
        'note on it that said "FOR CHAD". I\'ve never felt so seen.',
    ),
  },
  {
    level: 14,
    title: "Summoned",
    body: paragraphs(
      "CHAD WAS SUMMONED\nFor the first time in eleven years, Chad was called into the Corner " +
        "Office. He came out forty minutes later covered in scratches and orange fluff, and " +
        'would only say: "I have been reviewed."',
      "His new job title is Regional VP of Customer Trust and Lap Duties. He refuses to " +
        "explain the second part.",
      "RESEARCH DEPARTMENT\nGary asked Chad what the Founder looks like. Chad stared at a wall " +
        'for a long time, then whispered, "Majestic."',
      'FROM THE CORNER OFFICE\nThis week\'s note: "GOOD CHAD."',
    ),
  },
  {
    level: 16,
    title: "The Leak (Special Edition by Gary)",
    body: paragraphs(
      "Hi, it's Gary. Chad said I could have the newsletter this week.",
      "Remember Grandma Gertrude, our very first caller? She found our number in her " +
        "newspaper. I tracked down who paid for that ad. The account belongs to an " +
        '"S. Fluffington", and it was paid for in loyalty tokens.',
      "Then I read her case file again. She has a cat. Sir Fluffington. Orange. Fat. " +
        "Plotting against her.",
      "The scratching. The orange hair. The tuna at 4 PM.",
      "I don't like where this is going.",
      "- Gary",
    ),
  },
  {
    level: 18,
    title: "Meet the Founder",
    body: paragraphs(
      "THE TRUTH\nThis week, Agent Pemberton kicked open the Corner Office door. We all saw " +
        "it. The Founder of Trust Me Bro Tech Support is Sir Fluffington: a large orange cat.",
      "Gary's research says he started this whole company to get back at Grandma Gertrude " +
        "for the Diet Kibble Incident. He put our number in her newspaper. He has been " +
        "plotting against her the entire time. She was right.",
      "Agent Pemberton tried to arrest him. The Founder knocked the clipboard off the desk " +
        "while keeping eye contact, and the case was dropped for lack of opposable thumbs. " +
        "Pemberton has since taken a job here, in the Research Department, with Gary. They " +
        "seem happy.",
      "CHAD'S CORNER\nEleven years. Eleven years I've worked here, and I just found out my " +
        "boss is a cat. Honestly? Best boss I've ever had.",
      "FROM THE CORNER OFFICE\nThe door is open now. There's a note on the desk, addressed to " +
        'you. It says: "MORE."',
    ),
  },
];

/** True if a story chapter arrives at `level`. Chapters are saved by their level, so adding
 * one later never changes the emails already in an inbox. */
export function hasChapterAt(level: number): boolean {
  return StoryChapters.some((chapter) => chapter.level === level);
}

// Skibidi's live audits: the order mid-call, then the result when it ends.
const AuditWriters = {
  auditAssigned: (vars: MailVars): WrittenMail | null => {
    const objective = auditObjective(vars);
    const money = int(vars, "money");
    const xp = int(vars, "xp");
    const raise = int(vars, "raise");
    if (objective === null) {
      return null;
    }
    let stakes: string;
    if (isSandboxAudit(vars)) {
      stakes = SandboxStakes;
    } else if (money !== null && xp !== null && raise !== null) {
      stakes =
        `Pull it off and I'll put +$${money} on this shift and ${xp} XP on your record. Blow ` +
        `it and your quota goes up $${raise}. Getting hung up on counts as blowing it.`;
    } else {
      return null;
    }
    return {
      from: Skibidi,
      subject: "LIVE AUDIT: this call is being monitored",
      body: paragraphs(
        "QA is listening. Don't look at the van.",
        AuditOrders[objective](),
        stakes,
        "This email will not self-destruct. We can't afford that feature.",
        SkibidiSignOff,
      ),
    };
  },

  auditPassed: (vars: MailVars): WrittenMail | null => {
    const money = int(vars, "money");
    const xp = int(vars, "xp");
    const sandbox = isSandboxAudit(vars);
    if (auditObjective(vars) === null || (!sandbox && (money === null || xp === null))) {
      return null;
    }
    return {
      from: Skibidi,
      subject: "Audit result: PASSED",
      body: paragraphs(
        "Audit complete. You passed. I took my headphones off and gave you a standing ovation " +
          "in the van. I hit my head on the roof. Worth it.",
        sandbox
          ? "Sandbox audit, so no bonus. But the ovation was real."
          : `+$${money} has been added to this shift's earnings and +${xp} XP to your record.`,
        SkibidiSignOff,
      ),
    };
  },

  auditFailed: (vars: MailVars): WrittenMail | null => {
    const raise = int(vars, "raise");
    const quota = int(vars, "quota");
    const sandbox = isSandboxAudit(vars);
    if (auditObjective(vars) === null || (!sandbox && (raise === null || quota === null))) {
      return null;
    }
    return {
      from: Skibidi,
      subject: "Audit result: FAILED",
      body: paragraphs(
        "Audit complete. You failed. I wrote it down on the clipboard. In pen.",
        sandbox
          ? "Sandbox audit, so your quota is safe. My clipboard remembers, though."
          : `Your quota for this shift just went up $${raise}. It's $${quota} now. Chad says ` +
              'it\'s "a growth opportunity".',
        "Better luck on the next one. There's always a next one. I live in this van.",
        SkibidiSignOff,
      ),
    };
  },
} satisfies Partial<Record<MailTemplateId, Writer>>;

const Writers: Record<MailTemplateId, Writer> = {
  welcome: () => ({
    from: Chad,
    subject: "Welcome to the team, superstar!",
    body: paragraphs(
      "Hey superstar!",
      "Chad Thunderbuck here, Regional VP of Customer Trust. Welcome to Trust Me Bro Tech " +
        "Support, where we help people with their gift cards. Mostly by helping ourselves to " +
        "them.",
      "Here's the job. The phone rings, you answer it, you're friendly. Keep an eye on the " +
        "Trust bar: callers get suspicious. Win them over and they'll read you the code off " +
        "the back of their gift card. Pop it into the Redeem app and boom: money.",
      "Hit your quota by the end of a shift and you get PROMOTED. Miss it and, well, let's " +
        "not talk about that on your first day.",
      "Your first callers will be Grandma Gertrude (lovely woman, has a cat), Grandpa Gus, " +
        "Boen or Tonald Drump (he'll tell you who he is. Repeatedly). Gary from " +
        "Research keeps a case file on every caller in the Characters app, and he adds notes " +
        "as you go. Read them. Gary gets lonely.",
      "I've left How to Play open on your desk. When you're ready, smash that Clock In button.",
      "One more thing: the Corner Office is off limits. That's where the Founder works. " +
        "Nobody has ever seen the Founder. Don't ask.",
      ChadSignOff,
    ),
  }),

  // The welcome for a save that was being played before email existed.
  welcomeBack: (vars) => {
    const backIssues = int(vars, "backIssues") ?? 0;
    return {
      from: Chad,
      subject: "Your inbox is finally working!",
      body: paragraphs(
        "Hey superstar!",
        "Great news: IT finally hooked up your email. It only took them, let me check, your " +
          "whole career so far.",
        backIssues > 0
          ? "We have a company newsletter, The Trust Fall, and it's been coming out this whole " +
              `time, so I've forwarded you all ${backIssues} back ${backIssues === 1 ? "issue" : "issues"}. ` +
              "Catch up on the office gossip. Things have been... a lot."
          : "We also have a company newsletter, The Trust Fall. Your first issue is coming soon.",
        "Also new: Gary from Research keeps a case file on every caller in the Characters app. " +
          "Scam someone and he adds notes to their file. Read them. Gary gets lonely.",
        ChadSignOff,
      ),
    };
  },

  firstPass: () => ({
    from: Chad,
    subject: "Your first paycheck!!!",
    body: paragraphs(
      "Look at you! First shift passed, quota smashed, money in the bank.",
      "I told the Founder about you. Well, I slid a note under the Corner Office door. A few " +
        'minutes later a note came back. It said "OK". That\'s the nicest thing the Founder ' +
        "has ever written.",
      "Spend some of it in the Shop if you like. Extra Coffee is a great investment. I'm on my " +
        "ninth cup today and I can hear colors.",
      ChadSignOff,
    ),
  }),

  shiftFailed: () => ({
    from: Chad,
    subject: "Quick chat about your last shift :)",
    body: paragraphs(
      "Hey you!",
      "Just circling back on your last shift. You came in under quota, which is totally fine! " +
        "Totally, totally fine. Everyone has an off day.",
      "I did have to explain it to the Founder, though. I slid a note under the Corner Office " +
        "door, and something on the other side hissed at it. Probably the radiator.",
      "Let's turn it around next shift, yeah? Big energy. Big numbers.",
      ChadSignOff,
    ),
  }),

  shiftFailedAgain: () => ({
    from: Chad,
    subject: "Re: Quick chat about your last shift :)",
    body: paragraphs(
      "Hey again!",
      "Two shifts under quota in a row. I'm not mad. I'm just looking at a spreadsheet with a " +
        "lot of red on it, and red is my least favorite color.",
      "A few tips from a professional: be friendly. Match their energy. Read Gary's case " +
        "files. And maybe don't tell the callers you're \"kind of new at this\".",
      "I believe in you. The Founder, I'm told, is reserving judgment. There was a note. It " +
        'said "hmm".',
      "Trust the process (please),\nChad",
    ),
  }),

  improvementPlan: (vars) => {
    const streak = int(vars, "streak");
    if (streak === null) {
      return null;
    }
    return {
      from: Linda,
      subject: "Performance Improvement Plan (mandatory)",
      body: paragraphs(
        "Hello,",
        "Per my last email (I haven't sent you one, but I was thinking about it), you have now " +
          `missed quota ${streak} shifts in a row.`,
        "As a result, you've been placed on a Performance Improvement Plan. The plan is: " +
          "improve your performance. I've attached it. (I haven't. We can't afford " +
          "attachments.)",
        "Please also return the office stapler. I know it was you.",
        LindaSignOff,
      ),
    };
  },

  hungUpOn: (vars) => {
    const count = int(vars, "count");
    if (count === null) {
      return null;
    }
    return {
      from: Linda,
      subject: "Callers are hanging up on you",
      body: paragraphs(
        "Hello,",
        `${count} callers hung up on you during your last shift. The phone bill doesn't care ` +
          "whether they enjoyed the call, but I do, a little.",
        "A friendly reminder: callers hang up when the Trust bar runs out. Things that tend to " +
          "empty it include rushing them, being bossy, and anything Gary's case files say " +
          "they hate.",
        LindaSignOff,
      ),
    };
  },

  hangingUp: (vars) => {
    const count = int(vars, "count");
    if (count === null) {
      return null;
    }
    return {
      from: Linda,
      subject: "Please stop hanging up on callers",
      body: paragraphs(
        "Hello,",
        `You hung up on ${count} callers during your last shift. I understand some of them ` +
          "are a lot. One once kept me on the line for forty minutes about a sandwich.",
        "But every call you hang up on is a gift card that goes home with its owner, and that " +
          "makes Chad cry in the break room again. Nobody wants that. The microwave is in " +
          "there.",
        LindaSignOff,
      ),
    };
  },

  ignoredCalls: (vars) => {
    const count = int(vars, "count");
    if (count === null) {
      return null;
    }
    return {
      from: Chad,
      subject: "The phone is not decorative",
      body: paragraphs(
        "Hey!",
        `${count} calls went unanswered during your last shift. Declined, or just left ringing.`,
        "Quick refresher: when the phone rings, that's money calling. Literally. They're " +
          "calling us to hand over their gift cards. All you have to do is pick up!",
        ChadSignOff,
      ),
    };
  },

  intel: (vars, scenarios) => {
    const ids = (text(vars, "scenarioIds") ?? "").split(",");
    const names = ids.flatMap((id) => scenarios.get(id)?.displayName ?? []);
    if (names.length === 0) {
      return null;
    }
    return {
      from: Gary,
      subject: "Case file update",
      body: paragraphs(
        "Hi, it's Gary. From Research. In the supply closet.",
        `I've added new notes to the case ${names.length === 1 ? "file" : "files"} for ` +
          `${listNames(names)}, based on your calls. Open the Characters app to have a look.`,
        "Every call teaches us something. Mostly about them. Sometimes about ourselves. " +
          "Mostly about them.",
        "- Gary",
      ),
    };
  },

  newLead: (vars, scenarios) => {
    const scenario = scenarios.get(text(vars, "scenarioId") ?? "");
    const level = int(vars, "level");
    if (!scenario || level === null) {
      return null;
    }
    return {
      from: Chad,
      subject: `New lead: ${scenario.displayName}`,
      body: paragraphs(
        `Level ${level}! Big news, superstar.`,
        "You've been bumped up, which means the bigger fish start calling. Say hello to your " +
          `newest lead: ${scenario.displayName} (${scenario.difficulty}).`,
        `Gary's notes so far: "${scenario.dossier.bio}"`,
        `Their gift card is worth $${scenario.cardValue}. Gary's opened a fresh case file in ` +
          "the Characters app. It's thin for now. Fatten it up.",
        ChadSignOff,
      ),
    };
  },

  story: (vars) => {
    const index = StoryChapters.findIndex((chapter) => chapter.level === int(vars, "level"));
    const chapter = StoryChapters[index];
    if (!chapter) {
      return null;
    }
    return {
      from: Newsletter,
      subject: `The Trust Fall, Issue #${index + 1}: ${chapter.title}`,
      body: paragraphs(NewsletterHeader, chapter.body),
    };
  },

  promotion: (vars) => {
    const level = int(vars, "level");
    if (level === null) {
      return null;
    }
    return {
      from: Chad,
      subject: `Level ${level}!`,
      body: paragraphs(
        `Level ${level}! Look at you climbing the ladder.`,
        "Same callers, same quota, same amazing you. HR says I can't give you a raise, but I " +
          "can give you this: a virtual high five. ✋",
        ChadSignOff,
      ),
    };
  },

  ...AuditWriters,
};

function isTemplateId(id: string): id is MailTemplateId {
  return Object.hasOwn(Writers, id);
}

/** Writes out a saved email, or null if it can't be (an unknown template, e.g. one that was
 * removed, or values that no longer make sense). */
export function writeMail(
  template: string,
  vars: MailVars,
  scenarios: ScenarioRegistry,
): WrittenMail | null {
  return isTemplateId(template) ? Writers[template](vars, scenarios) : null;
}
