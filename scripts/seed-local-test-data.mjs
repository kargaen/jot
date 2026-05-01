import { createClient } from "@supabase/supabase-js";
import { ensureLocalSupabaseEnvFile, parseDotEnvFile, GENERATED_ENV_PATH } from "./local-supabase-env.mjs";

ensureLocalSupabaseEnvFile();

const env = parseDotEnvFile(GENERATED_ENV_PATH);
const apiUrl = env.E2E_SUPABASE_URL;
const serviceRoleKey = env.E2E_SUPABASE_SERVICE_ROLE_KEY;
const testEmail = env.E2E_TEST_EMAIL;
const testPassword = env.E2E_TEST_PASSWORD;

if (!apiUrl || !serviceRoleKey || !testEmail || !testPassword) {
  throw new Error("Local E2E environment is incomplete. Run `npm run db:env:e2e` first.");
}

const admin = createClient(apiUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const fixtureIds = {
  areaPrimary: "11111111-1111-4111-8111-111111111111",
  areaSecondary: "22222222-2222-4222-8222-222222222222",
  projectLaunch: "33333333-3333-4333-8333-333333333333",
  projectOps: "44444444-4444-4444-8444-444444444444",
  tagFocus: "55555555-5555-4555-8555-555555555555",
  tagErrand: "66666666-6666-4666-8666-666666666666",
  taskToday: "77777777-7777-4777-8777-777777777777",
  taskProject: "88888888-8888-4888-8888-888888888888",
  taskCompleted: "99999999-9999-4999-8999-999999999999",
};

async function ensureUser() {
  const { data: listData, error: listError } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });
  if (listError) throw listError;

  const existing = listData.users.find((user) => user.email === testEmail);
  if (existing) {
    const { error: updateError } = await admin.auth.admin.updateUserById(existing.id, {
      email_confirm: true,
      password: testPassword,
    });
    if (updateError) throw updateError;
    return existing.id;
  }

  const { data, error } = await admin.auth.admin.createUser({
    email: testEmail,
    password: testPassword,
    email_confirm: true,
  });
  if (error) throw error;
  if (!data.user) throw new Error("Supabase did not return the seeded E2E user.");
  return data.user.id;
}

async function clearFixtures(userId) {
  await admin.from("task_tags").delete().in("task_id", [
    fixtureIds.taskToday,
    fixtureIds.taskProject,
    fixtureIds.taskCompleted,
  ]);
  await admin.from("tasks").delete().eq("user_id", userId);
  await admin.from("projects").delete().eq("user_id", userId);
  await admin.from("tags").delete().eq("user_id", userId);
  await admin.from("feedback").delete().eq("user_id", userId);
  await admin.from("area_members").delete().eq("owner_user_id", userId);
  await admin.from("areas").delete().eq("user_id", userId);
}

async function seedFixtures(userId) {
  const now = new Date().toISOString();

  const { error: areasError } = await admin.from("areas").upsert([
    {
      id: fixtureIds.areaPrimary,
      user_id: userId,
      name: "E2E Personal",
      color: "#5B5BD6",
      email: testEmail,
      sort_order: 0,
    },
    {
      id: fixtureIds.areaSecondary,
      user_id: userId,
      name: "E2E Work",
      color: "#0EA5E9",
      email: testEmail,
      sort_order: 1,
    },
  ]);
  if (areasError) throw areasError;

  const { error: projectsError } = await admin.from("projects").upsert([
    {
      id: fixtureIds.projectLaunch,
      user_id: userId,
      area_id: fixtureIds.areaPrimary,
      name: "Launch",
      color: "#F97316",
      status: "active",
      sort_order: 0,
    },
    {
      id: fixtureIds.projectOps,
      user_id: userId,
      area_id: fixtureIds.areaSecondary,
      name: "Ops",
      color: "#22C55E",
      status: "active",
      sort_order: 1,
    },
  ]);
  if (projectsError) throw projectsError;

  const { error: tagsError } = await admin.from("tags").upsert([
    {
      id: fixtureIds.tagFocus,
      user_id: userId,
      name: "focus",
      color: "#8B5CF6",
    },
    {
      id: fixtureIds.tagErrand,
      user_id: userId,
      name: "errand",
      color: "#14B8A6",
    },
  ], {
    onConflict: "id",
  });
  if (tagsError) throw tagsError;

  const { error: tasksError } = await admin.from("tasks").upsert([
    {
      id: fixtureIds.taskToday,
      user_id: userId,
      area_id: fixtureIds.areaPrimary,
      project_id: null,
      parent_task_id: null,
      title: "Seeded inbox task",
      description: null,
      icon: "Inbox",
      notes: "Created by the local E2E seed script.",
      status: "todo",
      priority: "medium",
      due_date: null,
      due_time: null,
      scheduled_date: null,
      recurrence_rule: null,
      estimated_mins: 15,
      sort_order: 0,
      completed_at: null,
      created_at: now,
      updated_at: now,
    },
    {
      id: fixtureIds.taskProject,
      user_id: userId,
      area_id: null,
      project_id: fixtureIds.projectLaunch,
      parent_task_id: null,
      title: "Seeded project task",
      description: null,
      icon: "Rocket",
      notes: "This proves project-scoped reads in the local DB harness.",
      status: "todo",
      priority: "high",
      due_date: null,
      due_time: null,
      scheduled_date: null,
      recurrence_rule: null,
      estimated_mins: 25,
      sort_order: 1,
      completed_at: null,
      created_at: now,
      updated_at: now,
    },
    {
      id: fixtureIds.taskCompleted,
      user_id: userId,
      area_id: fixtureIds.areaSecondary,
      project_id: null,
      parent_task_id: null,
      title: "Seeded completed task",
      description: null,
      icon: "Check",
      notes: null,
      status: "completed",
      priority: "low",
      due_date: null,
      due_time: null,
      scheduled_date: null,
      recurrence_rule: null,
      estimated_mins: 5,
      sort_order: 2,
      completed_at: now,
      created_at: now,
      updated_at: now,
    },
  ], {
    onConflict: "id",
  });
  if (tasksError) throw tasksError;

  const { error: taskTagsError } = await admin.from("task_tags").upsert([
    {
      task_id: fixtureIds.taskToday,
      tag_id: fixtureIds.tagErrand,
    },
    {
      task_id: fixtureIds.taskProject,
      tag_id: fixtureIds.tagFocus,
    },
  ], {
    onConflict: "task_id,tag_id",
  });
  if (taskTagsError) throw taskTagsError;
}

const userId = await ensureUser();
await clearFixtures(userId);
await seedFixtures(userId);

console.log(`Seeded local E2E fixtures for ${testEmail}`);
