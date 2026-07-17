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
  isDueToday,
  isInbox,
  isOverdue,
  isUpcoming,
} from "../../../src/models/tasks/taskVisibility";
import { groupTasksByAreaAndProject } from "../../../src/models/tasks/taskGrouping";
import type { Area, Project, TaskWithTags } from "../../../src/models/shared";

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
    status: "todo",
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
    status: "todo",
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
    status: "todo",
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
    status: "todo",
    project_id: "area-hidden-project",
    area_id: null,
    due_date: null,
    due_time: null,
    sort_order: 1000,
    created_at: "2026-04-04T10:00:00Z",
    title: "Someday hidden",
  } as TaskWithTags,
];

const builtInViewTasks: TaskWithTags[] = [
  ...tasks,
  {
    id: "scheduled-today",
    status: "todo",
    project_id: null,
    area_id: null,
    scheduled_date: "2026-04-30",
    due_date: null,
    due_time: null,
    sort_order: 1000,
    created_at: "2026-04-05T10:00:00Z",
    title: "Scheduled today",
  } as TaskWithTags,
  {
    id: "future",
    status: "todo",
    project_id: "area-visible-project",
    area_id: null,
    due_date: "2026-05-02",
    due_time: null,
    sort_order: 1000,
    created_at: "2026-04-06T10:00:00Z",
    title: "Future task",
  } as TaskWithTags,
  {
    id: "completed-inbox",
    status: "completed",
    project_id: null,
    area_id: null,
    due_date: null,
    due_time: null,
    sort_order: 1000,
    created_at: "2026-04-07T10:00:00Z",
    title: "Completed inbox task",
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
assertEqual(
  "built-in Today membership",
  builtInViewTasks
    .filter((task) => isOverdue(task, "2026-04-30") || isDueToday(task, "2026-04-30"))
    .map((task) => task.id),
  ["overdue", "today-early", "today-late", "scheduled-today"],
);
assertEqual(
  "built-in Upcoming membership",
  builtInViewTasks.filter((task) => isUpcoming(task, "2026-04-30")).map((task) => task.id),
  ["future"],
);
assertEqual(
  "built-in Inbox membership",
  builtInViewTasks.filter(isInbox).map((task) => task.id),
  ["today-early", "scheduled-today"],
);

// ── groupTasksByAreaAndProject ──────────────────────────────────────────────
// area-1 has two active projects + a direct (no-project) task + an archived
// project's task (must vanish); area-2 has one project with zero open tasks
// (must not produce an empty group) plus a direct task; area-3 has neither
// tasks nor projects (must not appear at all); an unassigned project and a
// fully bare task both land under the synthetic "No Area" bucket.
const groupingAreas: Area[] = [
  { id: "area-1", name: "Work", color: "#111111" } as Area,
  { id: "area-2", name: "Home", color: "#222222" } as Area,
  { id: "area-3", name: "Unused", color: "#333333" } as Area,
];

const groupingProjects: Project[] = [
  { id: "proj-work-a", area_id: "area-1", name: "Launch", color: "#444444", status: "active" } as Project,
  { id: "proj-work-b", area_id: "area-1", name: "Ops", color: "#555555", status: "active" } as Project,
  { id: "proj-archived", area_id: "area-1", name: "Retired", color: "#666666", status: "archived" } as Project,
  { id: "proj-empty", area_id: "area-2", name: "Empty", color: "#777777", status: "active" } as Project,
  { id: "proj-orphan", area_id: null, name: "Freelance", color: "#888888", status: "active" } as Project,
];

const groupingTasks: TaskWithTags[] = [
  { id: "t1", status: "todo", project_id: "proj-work-a", area_id: null } as TaskWithTags,
  // area_id disagrees with the project's own area — must be ignored once a project is set.
  { id: "t2", status: "todo", project_id: "proj-work-b", area_id: "area-2" } as TaskWithTags,
  { id: "t3", status: "todo", project_id: null, area_id: "area-1" } as TaskWithTags,
  { id: "t4", status: "todo", project_id: "proj-orphan", area_id: null } as TaskWithTags,
  { id: "t5", status: "todo", project_id: null, area_id: null } as TaskWithTags,
  // archived project's task and a completed task: both excluded from every group.
  { id: "t6", status: "todo", project_id: "proj-archived", area_id: null } as TaskWithTags,
  { id: "t7", status: "completed", project_id: "proj-work-a", area_id: null } as TaskWithTags,
  { id: "t8", status: "todo", project_id: null, area_id: "area-2" } as TaskWithTags,
].map((t) => ({ ...t, tags: [] }));

const groups = groupTasksByAreaAndProject(groupingTasks, groupingAreas, groupingProjects);

assertEqual(
  "groupTasksByAreaAndProject: area keys, in input order, no-task area-3 and synthetic No Area last",
  groups.map((g) => g.key),
  ["area-area-1", "area-area-2", "area-none"],
);
assertEqual(
  "groupTasksByAreaAndProject: area-1 project subgroups (archived project excluded, No Project last)",
  groups[0].projectGroups.map((pg) => pg.key),
  ["project-proj-work-a", "project-proj-work-b", "noproject-area-1"],
);
assertEqual("groupTasksByAreaAndProject: Launch tasks", groups[0].projectGroups[0].tasks.map((t) => t.id), ["t1"]);
assertEqual(
  "groupTasksByAreaAndProject: Ops tasks (task.area_id ignored once project is set)",
  groups[0].projectGroups[1].tasks.map((t) => t.id),
  ["t2"],
);
assertEqual(
  "groupTasksByAreaAndProject: area-1 No Project (direct area task)",
  groups[0].projectGroups[2].tasks.map((t) => t.id),
  ["t3"],
);
assertEqual(
  "groupTasksByAreaAndProject: area-2 has only No Project (empty project produces no subgroup)",
  groups[1].projectGroups.map((pg) => pg.key),
  ["noproject-area-2"],
);
assertEqual("groupTasksByAreaAndProject: area-2 No Project tasks", groups[1].projectGroups[0].tasks.map((t) => t.id), ["t8"]);
assertEqual(
  "groupTasksByAreaAndProject: synthetic No Area subgroups (orphan project, then No Project)",
  groups[2].areaId,
  null,
);
assertEqual(
  "groupTasksByAreaAndProject: No Area subgroup keys",
  groups[2].projectGroups.map((pg) => pg.key),
  ["project-proj-orphan", "noproject-none"],
);
assertEqual("groupTasksByAreaAndProject: Freelance (orphan project) tasks", groups[2].projectGroups[0].tasks.map((t) => t.id), ["t4"]);
assertEqual("groupTasksByAreaAndProject: bare task", groups[2].projectGroups[1].tasks.map((t) => t.id), ["t5"]);
assertEqual(
  "groupTasksByAreaAndProject: archived-project and completed tasks never appear anywhere",
  groups.flatMap((g) => g.projectGroups).flatMap((pg) => pg.tasks.map((t) => t.id)).sort(),
  ["t1", "t2", "t3", "t4", "t5", "t8"],
);
assertEqual("groupTasksByAreaAndProject: empty input", groupTasksByAreaAndProject([], [], []), []);

console.log("Task model tests passed: 26/26");
