import { saveCreateTaskDraft } from "../../../src/controllers/tasks/saveCreateTask.controller";
import {
  buildCreateTaskInput,
  resolveTaskProjectSelection,
} from "../../../src/models/tasks/taskCreation";
import type { CreateTaskInput } from "../../../src/services/backend/supabase.service";
import type { Project, Task } from "../../../src/models/shared";

function assertEqual<T>(label: string, actual: T, expected: T) {
  const left = JSON.stringify(actual);
  const right = JSON.stringify(expected);
  if (left !== right) {
    throw new Error(`${label}: expected ${right}, got ${left}`);
  }
}

const projects: Project[] = [
  { id: "proj-1", name: "Work" } as Project,
  { id: "proj-2", name: "Personal" } as Project,
];

assertEqual(
  "resolveTaskProjectSelection exact match",
  resolveTaskProjectSelection(projects, " work "),
  {
    matchedProject: projects[0],
    suggestedProject: null,
  },
);

assertEqual(
  "buildCreateTaskInput",
  buildCreateTaskInput(
    {
      title: "  Review launch plan  ",
      areaId: "area-1",
      dueDate: "2026-05-01",
      dueTime: "09:00",
      priority: "high",
      recurrenceRule: "FREQ=WEEKLY",
      tagIds: ["tag-1"],
    },
    "proj-1",
    "Rocket",
  ),
  {
    title: "Review launch plan",
    parentTaskId: null,
    projectId: "proj-1",
    areaId: "area-1",
    icon: "Rocket",
    dueDate: "2026-05-01",
    dueTime: "09:00",
    priority: "high",
    recurrenceRule: "FREQ=WEEKLY",
    tagIds: ["tag-1"],
  } as CreateTaskInput,
);

let createProjectCalls = 0;
let createTaskCalls = 0;
let lastCreateTaskInput: CreateTaskInput | null = null;

const existingProjectResult = await saveCreateTaskDraft(
  {
    async createProject() {
      createProjectCalls += 1;
      throw new Error("createProject should not be called for an exact project match");
    },
    async createTask(input) {
      createTaskCalls += 1;
      lastCreateTaskInput = input;
      return { id: "task-1", title: input.title } as Task;
    },
  },
  {
    projects,
    title: "Ship docs",
    projectName: "Work",
    dueDate: "2026-05-02",
    priority: "medium",
    canCreateProjectsAndTags: true,
  },
);

assertEqual("existing project createProject calls", createProjectCalls, 0);
assertEqual("existing project createTask calls", createTaskCalls, 1);
assertEqual("existing project resolved id", lastCreateTaskInput?.projectId ?? null, "proj-1");
assertEqual("existing project result", existingProjectResult.createdProject, null);

const createdProject = { id: "proj-new", name: "Launch" } as Project;
const createdProjectResult = await saveCreateTaskDraft(
  {
    async createProject(name) {
      createProjectCalls += 1;
      assertEqual("createProject name", name, "Launch");
      return createdProject;
    },
    async createTask(input) {
      createTaskCalls += 1;
      lastCreateTaskInput = input;
      return { id: "task-2", title: input.title } as Task;
    },
  },
  {
    projects,
    title: "Launch checklist",
    projectName: "Launch",
    areaId: "area-1",
    canCreateProjectsAndTags: true,
  },
);

assertEqual("created project id used", lastCreateTaskInput?.projectId ?? null, "proj-new");
assertEqual("created project result", createdProjectResult.createdProject, createdProject);

const fallbackResult = await saveCreateTaskDraft(
  {
    async createProject() {
      throw new Error("createProject should not run when project creation is disabled");
    },
    async createTask(input) {
      lastCreateTaskInput = input;
      return { id: "task-3", title: input.title } as Task;
    },
  },
  {
    projects,
    title: "Inbox task",
    projectName: "Brand new project",
    areaId: "area-2",
    canCreateProjectsAndTags: false,
  },
);

assertEqual("fallback save keeps null project id", lastCreateTaskInput?.projectId ?? null, null);
assertEqual("fallback save keeps area id", lastCreateTaskInput?.areaId ?? null, "area-2");
assertEqual("fallback result created project", fallbackResult.createdProject, null);

console.log("Task create controller tests passed: 9/9");
