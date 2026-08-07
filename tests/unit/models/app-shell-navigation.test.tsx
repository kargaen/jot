import { readFileSync } from "node:fs";

function assertIncludes(label: string, haystack: string, needle: string) {
  if (!haystack.includes(needle)) {
    throw new Error(`${label}: expected to find ${needle}`);
  }
}

const source = readFileSync("src/router/AppShell.view.tsx", "utf8");

assertIncludes("AppShell imports Inbox icon", source, "Inbox");
assertIncludes("AppShell nav reaches Inbox", source, 'to: "/inbox", label: "Inbox"');
assertIncludes("AppShell nav reaches Lingering", source, 'to: "/lingering", label: "Lingering"');

console.log("AppShell navigation tests passed: 3/3");
