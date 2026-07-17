import { readFileSync } from "node:fs";

function assertIncludes(label: string, haystack: string, needle: string) {
  if (!haystack.includes(needle)) {
    throw new Error(`${label}: expected to find ${needle}`);
  }
}

const inboxRoute = readFileSync("src/router/Inbox.route.tsx", "utf8");
const routes = readFileSync("src/router/routes.tsx", "utf8");

assertIncludes("Inbox route uses the shared inbox predicate", inboxRoute, "isInbox");
assertIncludes("Inbox route filters visible tasks", inboxRoute, "data.visibleTasks.filter(isInbox)");
assertIncludes("Inbox route opens task detail", inboxRoute, 'navigate(`/tasks/${id}`)');
assertIncludes("routes imports InboxRoute", routes, 'import InboxRoute from "./Inbox.route"');
assertIncludes("routes renders InboxRoute", routes, 'path: "inbox", handle: { title: "Inbox", exportTasks: inboxExport }, element: <InboxRoute />');
assertIncludes("routes exports the Inbox task list", routes, "function inboxExport");

console.log("Inbox route tests passed: 6/6");
