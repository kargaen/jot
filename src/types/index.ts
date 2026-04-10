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
  due_date: string | null;
  due_time: string | null;
  scheduled_date: string | null;
  recurrence_rule: string | null;
  estimated_mins: number | null;
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

export interface Feedback {
  id: string;
  user_id: string;
  text: string;
  status: "new" | "reviewing" | "planned" | "in_progress" | "done" | "declined";
  admin_note: string | null;
  created_at: string;
}

export interface AreaMember {
  id: string;
  area_id: string;
  owner_user_id: string;
  member_user_id: string | null;
  invited_email: string;
  status: "pending" | "accepted";
  created_at: string;
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
}

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
