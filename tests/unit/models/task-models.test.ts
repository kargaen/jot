import {
  countTasksByProject,
  friendlyDue,
  friendlyRecurrence,
  normalizeTaskLink,
  sectionLabel,
  sortTasksBySchedule,
} from "../../../src/models/tasks/taskPresentation";
import {
  filterVisibleProjects,
  filterVisibleTasks,
} from "../../../src/models/tasks/taskVisibility";
import type { Project, TaskWithTags } from "../../../src/models/shared";

const RealDate = Date;
const MOCK_NOW = new RealDate("2026-04-30T12:00:00Z");

(globalThis as { Date: DateConstructor }).Date = class MockDate extends RealDate {
  constructor(...args: ConstructorParameters<DateConstructor>) {
    if (args.length === 0) {
      super(MOCK_NOW.getTime());
    } else if (args.length === 1) {
      super(args[0]);
    } else {
      // @ts-ignore esbuild handles Date spreads fine in tests.
      super(...args);
    }
  }
  static now() { return MOCK_NOW.getTime(); }
  static parse = RealDate.parse.bind(RealDate);
  static UTC = RealDate.UTC.bind(RealDate);
} as DateConstructor;

function assertEqual<T>(label: string, actual: T, expected: T) {
  const left = JSON.stringify(actual);
  const right = JSON.stringify(expected);
  if (left !== right) {
    throw new Error(`${label}: expected ${right}, got ${left}`);
  }
}

const projects: Project[] = [
  { id: "area-visible-project", area_id: "area-visible", name: "Visible project" } as Project,
  { id: "area-hidden-project", area_id: "area-hidden", name: "Hidden project" } as Project,
  { id: "orphan-project", area_id: null, name: "Orphan project" } as Project,
];

const tasks: TaskWithTags[] = [
  {
    id: "overdue",
    project_id: "area-visible-project",
    area_id: null,
    due_date: "2026-04-29",
    due_time: "10:30",
    sort_order: 3000,
    created_at: "2026-04-01T10:00:00Z",
    title: "Overdue task",
  } as TaskWithTags,
  {
    id: "today-early",
    project_id: null,
    area_id: "area-visible",
    due_date: "2026-04-30",
    due_time: "08:00",
    sort_order: 2000,
    created_at: "2026-04-02T10:00:00Z",
    title: "Today early",
  } as TaskWithTags,
  {
    id: "today-late",
    project_id: "area-visible-project",
    area_id: null,
    due_date: "2026-04-30",
    due_time: "17:00",
    sort_order: 1000,
    created_at: "2026-04-03T10:00:00Z",
    title: "Today late",
  } as TaskWithTags,
  {
    id: "someday-hidden",
    project_id: "area-hidden-project",
    area_id: null,
    due_date: null,
    due_time: null,
    sort_order: 1000,
    created_at: "2026-04-04T10:00:00Z",
    title: "Someday hidden",
  } as TaskWithTags,
];

assertEqual("friendlyDue", friendlyDue("2026-05-01", "09:15"), "Fri 1 May at 09:15");
assertEqual("friendlyRecurrence", friendlyRecurrence("FREQ=DAILY;INTERVAL=3"), "Repeats every 3 days");
assertEqual("normalizeTaskLink bare domain", normalizeTaskLink("jot.app"), "https://jot.app");
assertEqual("normalizeTaskLink preserves https", normalizeTaskLink("https://jot.app"), "https://jot.app");
assertEqual("sectionLabel overdue", sectionLabel("2026-04-29"), "Overdue");
assertEqual("sectionLabel today", sectionLabel("2026-04-30"), "Today");
assertEqual("sectionLabel upcoming", sectionLabel("2026-05-02"), "Upcoming");
assertEqual(
  "sortTasksBySchedule",
  sortTasksBySchedule(tasks).map((task) => task.id),
  ["overdue", "today-early", "today-late", "someday-hidden"],
);
assertEqual(
  "countTasksByProject",
  countTasksByProject(tasks),
  {
    "area-visible-project": 2,
    "area-hidden-project": 1,
  },
);
assertEqual(
  "filterVisibleProjects",
  filterVisibleProjects(projects, ["area-hidden"]).map((project) => project.id),
  ["area-visible-project"],
);
assertEqual(
  "filterVisibleTasks",
  filterVisibleTasks(tasks, projects, ["area-hidden"]).map((task) => task.id),
  ["overdue", "today-early", "today-late"],
);

console.log("Task model tests passed: 10/10");
