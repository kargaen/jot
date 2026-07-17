import { readFileSync } from "node:fs";

function assertIncludes(label: string, haystack: string, needle: string) {
  if (!haystack.includes(needle)) {
    throw new Error(`${label}: expected to find ${needle}`);
  }
}

function assertExcludes(label: string, haystack: string, needle: string) {
  if (haystack.includes(needle)) {
    throw new Error(`${label}: expected not to find ${needle}`);
  }
}

const source = readFileSync("src/router/Logbook.route.tsx", "utf8");

assertIncludes("Logbook route lazily loads logbook tasks", source, "void loadLogbook()");
assertIncludes("Logbook route renders completed logbook tasks", source, "tasks={data.logbookTasks}");
assertIncludes("Logbook route uses logbook loading state", source, "loading={data.logbookLoading}");
assertExcludes("Logbook route does not render open visible tasks", source, "tasks={data.visibleTasks}");

console.log("Logbook route tests passed: 4/4");
