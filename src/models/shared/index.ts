export interface Area {
  id: string;
  user_id: string;
  name: string;
  color: string;
  email: string | null;
  sort_order: number;
  created_at: string;
}

export interface Project {
  id: string;
  user_id: string;
  area_id: string | null;
  name: string;
  color: string;
  status: "active" | "archived" | "completed";
  sort_order: number;
  created_at: string;
}

export interface Task {
  id: string;
  user_id: string;
  project_id: string | null;
  area_id: string | null;
  parent_task_id: string | null;
  title: string;
  description: Record<string, unknown> | null;
  icon: string | null;
  notes: string | null;
  status: "todo" | "completed" | "cancelled";
  priority: "none" | "low" | "medium" | "high";
  responsible_user_id: string | null;
  responsible_email: string | null;
  due_date: string | null;
  due_time: string | null;
  scheduled_date: string | null;
  recurrence_rule: string | null;
  estimated_mins: number | null;
  // EPIC-013: ordinal effort scale (not time). NULL = no effort set. See
  // src/models/tasks/taskEffort.ts for the weights/capacity predicate.
  effort: "light" | "medium" | "heavy" | null;
  sort_order: number;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Tag {
  id: string;
  user_id: string;
  name: string;
  color: string;
  created_at: string;
}

export interface TaskTag {
  task_id: string;
  tag_id: string;
}

export interface TaskWithTags extends Task {
  tags: Tag[];
  subtasks?: TaskWithTags[];
  subtask_count?: number;
  project?: Project | null;
}

export interface AreaMember {
  id: string;
  area_id: string;
  owner_user_id: string;
  user_id: string | null;
  invited_email: string;
  status: "pending" | "accepted";
  created_at: string;
}

export interface ProjectMember {
  id: string;
  project_id: string;
  owner_user_id: string;
  user_id: string | null;
  invited_email: string;
  status: "pending" | "accepted";
  created_at: string;
}

export interface AssignablePerson {
  user_id: string;
  email: string;
  source: "self" | "area" | "project";
}

export interface ProjectWithTasks extends Project {
  tasks: Task[];
  area?: Area | null;
}

export interface ParsedInput {
  title: string;
  project: Project | null;
  suggestedProjectName: string | null;
  dueDate: string | null;
  dueTime: string | null;
  priority: Task["priority"];
  tags: Tag[];
  suggestedTagNames: string[];
  recurrenceRule: string | null;
  projectMatchConfidence: number;
  // When the title is long, a suggested split into a capped title and the
  // remainder for the description (both keep literal "..." markers). Null
  // otherwise. Detection lives in the NLP layer so all capture surfaces share it.
  longSplit: { title: string; descriptionText: string } | null;
}

export type NlpLanguageMode = "auto" | "en" | "da";

export type QuickActionId =
  | "new-task"
  | "open-dashboard"
  | "today"
  | "upcoming"
  | "check-pulse";

export interface QuickAction {
  id: QuickActionId;
  label: string;
  shortcut?: string;
}

// A personal API token for the Conduit API. The plaintext token is shown once
// at creation and never stored — only token_hash lives in the database.
export interface ApiToken {
  id: string;
  user_id: string;
  name: string;
  token_hash: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}
