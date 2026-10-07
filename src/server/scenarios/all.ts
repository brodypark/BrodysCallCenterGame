// Every scam scenario. Adding a scam = adding its module and one line here; nothing else
// changes. (The built server can't search this folder at runtime, so they're listed.)

import { grandma } from "@server/scenarios/grandma";
import type { ScenarioInput } from "@server/scenarios/scenarioSchema";

export const AllScenarios: readonly ScenarioInput[] = [grandma];
