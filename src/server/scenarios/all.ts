// Every scam scenario. Adding a scam = adding its module and one line here; nothing else
// changes. (The built server can't search this folder at runtime, so they're listed.)

import { brody } from "@server/scenarios/brody";
import { cj } from "@server/scenarios/cj";
import { evan } from "@server/scenarios/evan";
import { grandma } from "@server/scenarios/grandma";
import { grandpa } from "@server/scenarios/grandpa";
import { hubble } from "@server/scenarios/hubble";
import { hudson } from "@server/scenarios/hudson";
import { jordan } from "@server/scenarios/jordan";
import { pete } from "@server/scenarios/pete";
import { sarah } from "@server/scenarios/sarah";
import type { ScenarioInput } from "@server/scenarios/scenarioSchema";
import { uncleMike } from "@server/scenarios/uncleMike";
import { villain } from "@server/scenarios/villain";

export const AllScenarios: readonly ScenarioInput[] = [
  grandma,
  grandpa,
  hubble,
  hudson,
  sarah,
  pete,
  brody,
  uncleMike,
  evan,
  cj,
  jordan,
  villain,
];
