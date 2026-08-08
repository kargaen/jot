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

const source = readFileSync("src/hooks/useDashboard.ts", "utf8");

// Realtime polls WAL for as long as any client is subscribed, so a subscription
// that outlives visibility bills for the whole time the window is open. These
// assertions pin the lifecycle, not the reload behaviour.

assertExcludes(
  "dashboard does not subscribe unconditionally on mount",
  source,
  "const unsubscribe = subscribeToDashboardTaskChanges(",
);
assertIncludes(
  "dashboard subscribes only through attach()",
  source,
  "if (!unsubscribe) unsubscribe = subscribeToDashboardTaskChanges(reload);",
);
assertIncludes(
  "dashboard attaches on mount only while visible",
  source,
  'if (document.visibilityState === "visible") attach();',
);
assertIncludes(
  "dashboard tracks visibility transitions",
  source,
  'document.addEventListener("visibilitychange", handleVisibilityChange);',
);
assertIncludes(
  "dashboard releases the subscription when hidden",
  source,
  "document.removeEventListener",
);
assertIncludes(
  "dashboard reloads once on return to catch up missed changes",
  source,
  "attach();\n        reload();",
);

// Focus is the wrong signal: a visible but unfocused window should still update live.
assertExcludes("dashboard does not key realtime on focus", source, 'addEventListener("focus"');
assertExcludes("dashboard does not key realtime on blur", source, 'addEventListener("blur"');

console.log("Dashboard realtime lifecycle tests passed: 8/8");
