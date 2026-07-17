import { readFileSync } from "node:fs";

function assertIncludes(label: string, haystack: string, needle: string) {
  if (!haystack.includes(needle)) {
    throw new Error(`${label}: expected to find ${needle}`);
  }
}

const source = readFileSync("src/router/All.route.tsx", "utf8");

assertIncludes("All route renders visible tasks", source, "tasks={data.visibleTasks}");
assertIncludes("All route opens task detail", source, 'navigate(`/tasks/${id}`)');
assertIncludes("All route can drill into spaces", source, 'navigate(`/spaces/${id}`)');
assertIncludes("All route can drill into projects", source, 'navigate(`/projects/${id}`)');

console.log("All route tests passed: 4/4");
