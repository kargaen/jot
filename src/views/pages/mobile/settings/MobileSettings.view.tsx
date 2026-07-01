import { useState } from "react";
import type { CSSProperties, FormEvent } from "react";
import type { Area, AreaMember, NlpLanguageMode, Project, TaskWithTags } from "../../../../models/shared";
import { openUrl } from "@tauri-apps/plugin-opener";
import { syncWidgetsDebug } from "../../../../services/sync/widgetSync.service";
import { useAuth } from "../../../../hooks/useAuth";
import { useSharingTab } from "../../../../hooks/usePreferences";

const JOT_ISSUES_URL = "https://github.com/kargaen/jot/issues";
import Toggle from "../../../components/ui/Toggle.view";
import Button from "../../../components/ui/Button.view";
import {
  loadNlpLanguageMode,
  saveNlpLanguageMode,
} from "../../../../services/capture/nlpSettings.service";
import {
  type AppThemePreference,
  applyThemePreference,
  loadThemePreference,
  saveThemePreference,
} from "../../../../utils/presentation/theme";

interface AccountActions {
  changePassword: (password: string) => Promise<unknown>;
  signOutAll: () => Promise<unknown>;
}

interface SpaceActions {
  saveArea: (id: string, name: string) => Promise<unknown>;
  removeArea: (id: string) => Promise<unknown>;
  addArea: (name: string) => Promise<unknown>;
}

interface ProjectActions {
  addProject: (name: string, areaId: string | null) => Promise<unknown>;
  renameProject: (id: string, name: string) => Promise<unknown>;
  closeProject: (id: string) => Promise<unknown>;
  closeProjectWithTasks: (id: string, action: "complete" | "release") => Promise<unknown>;
}

interface Props {
  email: string;
  areas: Area[];
  projects: Project[];
  tasks: TaskWithTags[];
  hiddenAreaIds: string[];
  onHiddenChange: (ids: string[]) => void;
  accountActions: AccountActions;
  spaceActions: SpaceActions;
  projectActions: ProjectActions;
  onSignedOut: () => void;
  onAreasChanged: () => void;
}

export default function MobileSettingsView({
  email,
  areas,
  projects,
  tasks,
  hiddenAreaIds,
  onHiddenChange,
  accountActions,
  spaceActions,
  projectActions,
  onSignedOut,
  onAreasChanged,
}: Props) {
  return (
    <div style={styles.shell}>
      <AccountSection email={email} actions={accountActions} onSignedOut={onSignedOut} />
      <AppearanceSection />
      <CaptureSection />
      <SpacesSection
        areas={areas}
        hiddenAreaIds={hiddenAreaIds}
        onHiddenChange={onHiddenChange}
        actions={spaceActions}
        onChanged={onAreasChanged}
      />
      <ProjectsSection
        areas={areas}
        projects={projects}
        tasks={tasks}
        actions={projectActions}
        onChanged={onAreasChanged}
      />
      <SharingSection areas={areas} onSharedChange={onAreasChanged} />
      <FeedbackSection />
      <WidgetSyncDebugSection />
    </div>
  );
}

// ── Widget sync debug (TEMP) ────────────────────────────────────────────────────

function WidgetSyncDebugSection() {
  const [result, setResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <section style={styles.section}>
      <div style={styles.sectionHeader}>Widget sync (debug)</div>
      <div style={styles.card}>
        <div style={styles.cardBody}>
          <Button
            variant="secondary"
            size="sm"
            loading={busy}
            onClick={() => {
              setBusy(true);
              void syncWidgetsDebug()
                .then(setResult)
                .finally(() => setBusy(false));
            }}
          >
            Run widget sync
          </Button>
          {result ? <div style={styles.feedbackText}>{result}</div> : null}
        </div>
      </div>
    </section>
  );
}

// ── Account ───────────────────────────────────────────────────────────────────

function AccountSection({
  email,
  actions,
  onSignedOut,
}: {
  email: string;
  actions: AccountActions;
  onSignedOut: () => void;
}) {
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleChangePassword(e: FormEvent) {
    e.preventDefault();
    if (!newPassword.trim() || busy) return;
    setBusy(true);
    setNotice(null);
    setError(null);
    try {
      await actions.changePassword(newPassword.trim());
      setNewPassword("");
      setNotice("Password updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update password");
    } finally {
      setBusy(false);
    }
  }

  async function handleSignOut() {
    setBusy(true);
    try {
      await actions.signOutAll();
      onSignedOut();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section style={styles.section}>
      <div style={styles.sectionHeader}>Account</div>
      <div style={styles.card}>
        <div style={styles.row}>
          <span style={styles.rowLabel}>Email</span>
          <span style={styles.rowValue}>{email}</span>
        </div>
        <div style={styles.divider} />
        <form onSubmit={handleChangePassword} style={styles.passwordRow}>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="New password"
            autoComplete="new-password"
            style={styles.inlineInput}
          />
          <Button type="submit" variant="primary" size="sm" disabled={busy || !newPassword.trim()}>
            Update
          </Button>
        </form>
        {notice ? <div style={styles.notice}>{notice}</div> : null}
        {error ? <div style={styles.error}>{error}</div> : null}
        <div style={styles.divider} />
        <button type="button" onClick={handleSignOut} disabled={busy} style={styles.destructiveButton}>
          Sign out everywhere
        </button>
      </div>
    </section>
  );
}

// ── Appearance ──────────────────────────────────────────────────────────────────

const THEME_OPTIONS: { value: AppThemePreference; label: string; hint: string }[] = [
  { value: "system", label: "System", hint: "Follow your device setting." },
  { value: "light", label: "Light", hint: "Keep the interface bright." },
  { value: "dark", label: "Dark", hint: "Use the darker theme." },
];

function AppearanceSection() {
  const [theme, setTheme] = useState<AppThemePreference>(loadThemePreference);

  function selectTheme(next: AppThemePreference) {
    setTheme(next);
    saveThemePreference(next);
    applyThemePreference(next);
  }

  return (
    <section style={styles.section}>
      <div style={styles.sectionHeader}>Appearance</div>
      <div style={styles.card}>
        {THEME_OPTIONS.map((option, i) => {
          const active = theme === option.value;
          return (
            <div key={option.value}>
              {i > 0 ? <div style={styles.divider} /> : null}
              <button type="button" onClick={() => selectTheme(option.value)} style={styles.themeRow}>
                <span style={styles.themeText}>
                  <span style={styles.themeLabel}>{option.label}</span>
                  <span style={styles.themeHint}>{option.hint}</span>
                </span>
                <span style={{ ...styles.themeCheck, opacity: active ? 1 : 0 }}>✓</span>
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ── Capture ─────────────────────────────────────────────────────────────────────

const LANGUAGE_OPTIONS: { value: NlpLanguageMode; label: string; hint: string }[] = [
  { value: "auto", label: "Auto", hint: "Use the current broad parser behavior." },
  { value: "en", label: "English only", hint: "Only accept English date, time, and priority phrases." },
  { value: "da", label: "Danish only", hint: "Only accept Danish date, time, and priority phrases." },
];

function CaptureSection() {
  const [mode, setMode] = useState<NlpLanguageMode>(loadNlpLanguageMode);

  function selectMode(next: NlpLanguageMode) {
    setMode(next);
    saveNlpLanguageMode(next);
  }

  return (
    <section style={styles.section}>
      <div style={styles.sectionHeader}>Capture</div>
      <div style={styles.card}>
        {LANGUAGE_OPTIONS.map((option, i) => {
          const active = mode === option.value;
          return (
            <div key={option.value}>
              {i > 0 ? <div style={styles.divider} /> : null}
              <button type="button" onClick={() => selectMode(option.value)} style={styles.themeRow}>
                <span style={styles.themeText}>
                  <span style={styles.themeLabel}>{option.label}</span>
                  <span style={styles.themeHint}>{option.hint}</span>
                </span>
                <span style={{ ...styles.themeCheck, opacity: active ? 1 : 0 }}>✓</span>
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ── Spaces ────────────────────────────────────────────────────────────────────

function SpacesSection({
  areas,
  hiddenAreaIds,
  onHiddenChange,
  actions,
  onChanged,
}: {
  areas: Area[];
  hiddenAreaIds: string[];
  onHiddenChange: (ids: string[]) => void;
  actions: SpaceActions;
  onChanged: () => void;
}) {
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    if (!newName.trim() || busy) return;
    setBusy(true);
    try {
      await actions.addArea(newName.trim());
      setNewName("");
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function handleSave(id: string) {
    if (!editingName.trim() || busy) return;
    setBusy(true);
    try {
      await actions.saveArea(id, editingName.trim());
      setEditingId(null);
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(id: string) {
    if (busy) return;
    setBusy(true);
    try {
      await actions.removeArea(id);
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  function startEdit(area: Area) {
    setEditingId(area.id);
    setEditingName(area.name);
  }

  function toggleVisibility(id: string) {
    onHiddenChange(
      hiddenAreaIds.includes(id)
        ? hiddenAreaIds.filter((x) => x !== id)
        : [...hiddenAreaIds, id],
    );
  }

  return (
    <section style={styles.section}>
      <div style={styles.sectionHeader}>Spaces</div>
      <div style={styles.sectionHint}>Turn a space off to hide it on this device.</div>
      <div style={styles.card}>
        {areas.map((area, i) => (
          <div key={area.id}>
            {i > 0 ? <div style={styles.divider} /> : null}
            {editingId === area.id ? (
              <div style={styles.passwordRow}>
                <input
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  style={styles.inlineInput}
                  autoFocus
                />
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={() => handleSave(area.id)}
                  disabled={busy}
                >
                  Save
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setEditingId(null)}>
                  ✕
                </Button>
              </div>
            ) : (
              <div style={styles.spaceRow}>
                <Toggle on={!hiddenAreaIds.includes(area.id)} onToggle={() => toggleVisibility(area.id)} />
                <span style={{ ...styles.dot, background: area.color }} />
                <span style={{ ...styles.rowLabel, opacity: hiddenAreaIds.includes(area.id) ? 0.45 : 1 }}>{area.name}</span>
                <button type="button" onClick={() => startEdit(area)} style={styles.iconButton}>
                  ✎
                </button>
                <button
                  type="button"
                  onClick={() => handleRemove(area.id)}
                  disabled={busy}
                  style={{ ...styles.iconButton, color: "var(--danger-strong)" }}
                >
                  ✕
                </button>
              </div>
            )}
          </div>
        ))}
        {areas.length > 0 ? <div style={styles.divider} /> : null}
        <form onSubmit={handleAdd} style={styles.passwordRow}>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New space name"
            style={styles.inlineInput}
          />
          <Button type="submit" variant="primary" size="sm" disabled={busy || !newName.trim()}>
            Add
          </Button>
        </form>
      </div>
    </section>
  );
}

// ── Projects ──────────────────────────────────────────────────────────────────

function ProjectsSection({
  areas,
  projects,
  tasks,
  actions,
  onChanged,
}: {
  areas: Area[];
  projects: Project[];
  tasks: TaskWithTags[];
  actions: ProjectActions;
  onChanged: () => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [closing, setClosing] = useState<{ id: string; name: string; count: number } | null>(null);

  const openCount = (projectId: string) =>
    tasks.filter((t) => t.project_id === projectId && t.status === "todo").length;

  async function handleAdd(e: FormEvent, areaId: string) {
    e.preventDefault();
    const name = (drafts[areaId] ?? "").trim();
    if (!name || busy) return;
    setBusy(true);
    try {
      await actions.addProject(name, areaId);
      setDrafts((d) => ({ ...d, [areaId]: "" }));
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function handleRename(id: string) {
    if (!editingName.trim() || busy) return;
    setBusy(true);
    try {
      await actions.renameProject(id, editingName.trim());
      setEditingId(null);
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function handleCloseClick(project: Project) {
    if (busy) return;
    const count = openCount(project.id);
    if (count === 0) {
      setBusy(true);
      try {
        await actions.closeProject(project.id);
        onChanged();
      } finally {
        setBusy(false);
      }
      return;
    }
    setClosing({ id: project.id, name: project.name, count });
  }

  async function handleCloseConfirm(action: "complete" | "release") {
    if (!closing || busy) return;
    setBusy(true);
    try {
      await actions.closeProjectWithTasks(closing.id, action);
      setClosing(null);
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section style={styles.section}>
      <div style={styles.sectionHeader}>Projects</div>
      <div style={styles.sectionHint}>Add, rename or archive projects within each space.</div>
      {areas.length === 0 ? (
        <div style={styles.card}>
          <div style={styles.emptyText}>Create a space first.</div>
        </div>
      ) : (
        areas.map((area) => {
          const list = projects.filter((p) => p.area_id === area.id && p.status === "active");
          return (
            <div key={area.id} style={styles.projectArea}>
              <div style={styles.projectAreaLabel}>
                <span style={{ ...styles.dot, background: area.color }} />
                {area.name}
              </div>
              <div style={styles.card}>
                {list.map((project, i) => (
                  <div key={project.id}>
                    {i > 0 ? <div style={styles.divider} /> : null}
                    {editingId === project.id ? (
                      <div style={styles.passwordRow}>
                        <input
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          style={styles.inlineInput}
                          autoFocus
                        />
                        <Button type="button" variant="primary" size="sm" onClick={() => handleRename(project.id)} disabled={busy}>
                          Save
                        </Button>
                        <Button type="button" variant="ghost" size="sm" onClick={() => setEditingId(null)}>
                          ✕
                        </Button>
                      </div>
                    ) : (
                      <div style={styles.spaceRow}>
                        <span style={{ ...styles.dot, background: project.color }} />
                        <span style={styles.rowLabel}>{project.name}</span>
                        <button
                          type="button"
                          onClick={() => { setEditingId(project.id); setEditingName(project.name); }}
                          style={styles.iconButton}
                          aria-label="Rename project"
                        >
                          ✎
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCloseClick(project)}
                          disabled={busy}
                          style={styles.archiveButton}
                        >
                          Close
                        </button>
                      </div>
                    )}
                  </div>
                ))}
                {list.length > 0 ? <div style={styles.divider} /> : null}
                <form onSubmit={(e) => handleAdd(e, area.id)} style={styles.passwordRow}>
                  <input
                    value={drafts[area.id] ?? ""}
                    onChange={(e) => setDrafts((d) => ({ ...d, [area.id]: e.target.value }))}
                    placeholder="New project"
                    style={styles.inlineInput}
                  />
                  <Button type="submit" variant="primary" size="sm" disabled={busy || !(drafts[area.id] ?? "").trim()}>
                    Add
                  </Button>
                </form>
              </div>
            </div>
          );
        })
      )}

      {closing ? (
        <CloseProjectDialog
          name={closing.name}
          count={closing.count}
          busy={busy}
          onComplete={() => handleCloseConfirm("complete")}
          onRelease={() => handleCloseConfirm("release")}
          onCancel={() => setClosing(null)}
        />
      ) : null}
    </section>
  );
}

function CloseProjectDialog({
  name,
  count,
  busy,
  onComplete,
  onRelease,
  onCancel,
}: {
  name: string;
  count: number;
  busy: boolean;
  onComplete: () => void;
  onRelease: () => void;
  onCancel: () => void;
}) {
  return (
    <div style={styles.dialogBackdrop} onClick={onCancel}>
      <div style={styles.dialog} onClick={(e) => e.stopPropagation()}>
        <div style={styles.dialogTitle}>Close “{name}”</div>
        <p style={styles.dialogBody}>
          This project has {count} remaining task{count !== 1 ? "s" : ""}. What should happen to {count !== 1 ? "them" : "it"}?
        </p>
        <button type="button" onClick={onComplete} disabled={busy} style={styles.dialogPrimary}>
          Complete all tasks and close
          <span style={styles.dialogSub}>Mark them done — they move to the Logbook</span>
        </button>
        <button type="button" onClick={onRelease} disabled={busy} style={styles.dialogSecondary}>
          Move tasks out and close
          <span style={styles.dialogSubMuted}>Tasks stay in their space, unlinked from the project</span>
        </button>
        <button type="button" onClick={onCancel} style={styles.dialogCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Sharing ───────────────────────────────────────────────────────────────────

function SharingSection({ areas, onSharedChange }: { areas: Area[]; onSharedChange: () => void }) {
  const { user } = useAuth();
  const {
    ownedAreas,
    selectedAreaId,
    setSelectedAreaId,
    members,
    pendingInvites,
    pendingProjectInvites,
    inviteEmail,
    setInviteEmail,
    inviteError,
    setInviteError,
    busy,
    loadingMembers,
    handleInvite,
    handleRemove,
    handleAccept,
    handleDecline,
    handleAcceptProject,
    handleDeclineProject,
  } = useSharingTab(areas, user?.id ?? "", onSharedChange);

  const hasPending = pendingInvites.length > 0 || pendingProjectInvites.length > 0;

  return (
    <section style={styles.section}>
      <div style={styles.sectionHeader}>Sharing</div>

      {hasPending ? (
        <div style={{ ...styles.card, marginBottom: 12 }}>
          {pendingInvites.map((inv, i) => (
            <div key={inv.id}>
              {i > 0 ? <div style={styles.divider} /> : null}
              <InviteRow label="Invited to a shared space" onAccept={() => handleAccept(inv)} onDecline={() => handleDecline(inv)} />
            </div>
          ))}
          {pendingProjectInvites.map((inv, i) => (
            <div key={inv.id}>
              {(i > 0 || pendingInvites.length > 0) ? <div style={styles.divider} /> : null}
              <InviteRow label="Invited to a shared project" onAccept={() => handleAcceptProject(inv)} onDecline={() => handleDeclineProject(inv)} />
            </div>
          ))}
        </div>
      ) : null}

      {ownedAreas.length === 0 ? (
        <div style={styles.card}>
          <div style={styles.emptyText}>You have no spaces to share. Create one above first.</div>
        </div>
      ) : (
        <div style={styles.card}>
          {/* Space selector */}
          <div style={styles.chipRow}>
            {ownedAreas.map((a) => {
              const active = a.id === selectedAreaId;
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setSelectedAreaId(a.id)}
                  style={{
                    ...styles.spaceChip,
                    borderColor: active ? a.color : "var(--border-default)",
                    background: active ? `${a.color}1f` : "transparent",
                    color: active ? "var(--text-primary)" : "var(--text-secondary)",
                    fontWeight: active ? 600 : 400,
                  }}
                >
                  <span style={{ ...styles.dot, background: a.color }} />
                  {a.name}
                </button>
              );
            })}
          </div>

          <div style={styles.divider} />

          {/* Invite form */}
          <form onSubmit={handleInvite} style={styles.passwordRow}>
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => { setInviteEmail(e.target.value); setInviteError(""); }}
              placeholder="Invite by email"
              autoComplete="off"
              style={styles.inlineInput}
            />
            <Button type="submit" variant="primary" size="sm" disabled={busy || !inviteEmail.trim()}>
              {busy ? "…" : "Invite"}
            </Button>
          </form>
          {inviteError ? <div style={styles.error}>{inviteError}</div> : null}

          {/* Members */}
          {loadingMembers ? (
            <div style={styles.emptyText}>Loading…</div>
          ) : members.length === 0 ? (
            <div style={styles.emptyText}>No one invited to this space yet.</div>
          ) : (
            members.map((m: AreaMember) => (
              <div key={m.id}>
                <div style={styles.divider} />
                <div style={styles.memberRow}>
                  <div style={styles.memberInfo}>
                    <span style={styles.memberEmail}>{m.invited_email}</span>
                    <MemberBadge status={m.status} />
                  </div>
                  <button type="button" onClick={() => handleRemove(m.id)} style={{ ...styles.iconButton, color: "var(--danger-strong)" }}>
                    ✕
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </section>
  );
}

function InviteRow({ label, onAccept, onDecline }: { label: string; onAccept: () => void; onDecline: () => void }) {
  return (
    <div style={styles.inviteRow}>
      <span style={styles.rowLabel}>{label}</span>
      <Button type="button" variant="primary" size="sm" onClick={onAccept}>Accept</Button>
      <Button type="button" variant="ghost" size="sm" onClick={onDecline}>Decline</Button>
    </div>
  );
}

function MemberBadge({ status }: { status: AreaMember["status"] }) {
  const accepted = status === "accepted";
  return (
    <span
      style={{
        ...styles.badge,
        background: accepted ? "rgba(22,163,74,0.14)" : "rgba(217,119,6,0.14)",
        color: accepted ? "var(--success)" : "var(--warning)",
      }}
    >
      {accepted ? "Active" : "Pending"}
    </span>
  );
}

// ── Feedback ──────────────────────────────────────────────────────────────────

function FeedbackSection() {
  return (
    <section style={styles.section}>
      <div style={styles.sectionHeader}>Feedback</div>
      <div style={styles.card}>
        <div style={styles.cardBody}>
          <div style={styles.feedbackText}>
            Found a bug or have an idea? Feedback for Jot is tracked on GitHub.
          </div>
          <Button variant="primary" size="sm" onClick={() => void openUrl(JOT_ISSUES_URL)}>
            Open GitHub Issues
          </Button>
        </div>
      </div>
    </section>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles: Record<string, CSSProperties> = {
  shell: {
    padding: "24px 16px 48px",
    display: "flex",
    flexDirection: "column",
    gap: 24,
  },
  section: {},
  sectionHeader: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: "var(--text-tertiary)",
    marginBottom: 8,
    paddingLeft: 4,
  },
  sectionHint: {
    fontSize: 12,
    color: "var(--text-tertiary)",
    margin: "-2px 0 8px",
    paddingLeft: 4,
  },
  card: {
    background: "var(--surface-glass)",
    border: "1px solid var(--surface-border-accent)",
    borderRadius: 18,
    overflow: "hidden",
    padding: "0 16px",
  },
  // The card supplies horizontal padding only; row children supply the vertical
  // rhythm. Free-form card content (text + actions) goes in cardBody, which
  // restores that vertical padding so the card isn't flush top/bottom.
  cardBody: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 12,
    padding: "14px 0",
  },
  feedbackText: {
    fontSize: 13,
    color: "var(--text-tertiary)",
    lineHeight: 1.4,
  },
  row: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "14px 0",
  },
  spaceRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "12px 0",
  },
  dot: {
    flexShrink: 0,
    width: 10,
    height: 10,
    borderRadius: "50%",
  },
  rowLabel: {
    flex: 1,
    fontSize: 15,
    color: "var(--text-primary)",
  },
  rowValue: {
    fontSize: 14,
    color: "var(--text-secondary)",
  },
  divider: {
    height: 1,
    background: "var(--border-subtle)",
    marginLeft: 0,
  },
  passwordRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 0",
  },
  inlineInput: {
    flex: 1,
    padding: "9px 12px",
    borderRadius: 10,
    border: "1px solid var(--border-default)",
    background: "var(--bg-primary)",
    color: "var(--text-primary)",
    fontSize: 14,
    fontFamily: "inherit",
    outline: "none",
    minWidth: 0,
  },
  iconButton: {
    flexShrink: 0,
    width: 32,
    height: 32,
    padding: 0,
    border: "none",
    background: "transparent",
    color: "var(--text-secondary)",
    fontSize: 16,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  themeRow: {
    width: "100%",
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "12px 0",
    border: "none",
    background: "transparent",
    cursor: "pointer",
    fontFamily: "inherit",
    textAlign: "left",
  },
  themeText: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: 2,
    minWidth: 0,
  },
  themeLabel: {
    fontSize: 15,
    color: "var(--text-primary)",
  },
  themeHint: {
    fontSize: 12,
    color: "var(--text-tertiary)",
  },
  themeCheck: {
    flexShrink: 0,
    fontSize: 16,
    fontWeight: 700,
    color: "var(--accent)",
  },
  destructiveButton: {
    width: "100%",
    padding: "14px 0",
    border: "none",
    background: "transparent",
    color: "var(--danger-strong)",
    fontSize: 15,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "inherit",
    textAlign: "left",
  },
  notice: {
    padding: "8px 0",
    fontSize: 13,
    color: "var(--success-strong)",
  },
  error: {
    padding: "8px 0",
    fontSize: 13,
    color: "var(--danger-strong)",
  },
  emptyText: {
    padding: "14px 0",
    fontSize: 13,
    color: "var(--text-tertiary)",
  },
  projectArea: {
    marginBottom: 14,
  },
  projectAreaLabel: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 13,
    fontWeight: 600,
    color: "var(--text-secondary)",
    margin: "0 4px 6px",
  },
  archiveButton: {
    flexShrink: 0,
    padding: "6px 10px",
    border: "none",
    background: "transparent",
    color: "var(--text-tertiary)",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  dialogBackdrop: {
    position: "fixed",
    inset: 0,
    zIndex: 60,
    background: "rgba(0,0,0,0.45)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  dialog: {
    width: "100%",
    maxWidth: 360,
    background: "var(--bg-primary)",
    borderRadius: 18,
    border: "1px solid var(--border-default)",
    boxShadow: "0 18px 48px rgba(0,0,0,0.3)",
    padding: "22px 20px",
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  dialogTitle: {
    fontSize: 16,
    fontWeight: 700,
    color: "var(--text-primary)",
  },
  dialogBody: {
    fontSize: 13,
    color: "var(--text-secondary)",
    lineHeight: 1.5,
    margin: "0 0 8px",
  },
  dialogPrimary: {
    width: "100%",
    textAlign: "left",
    padding: "11px 14px",
    borderRadius: 12,
    border: "none",
    background: "linear-gradient(135deg, var(--accent), var(--accent-2))",
    color: "#fff",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "inherit",
    display: "flex",
    flexDirection: "column",
    gap: 2,
  },
  dialogSecondary: {
    width: "100%",
    textAlign: "left",
    padding: "11px 14px",
    borderRadius: 12,
    border: "1px solid var(--border-default)",
    background: "var(--bg-secondary)",
    color: "var(--text-primary)",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "inherit",
    display: "flex",
    flexDirection: "column",
    gap: 2,
  },
  dialogSub: {
    fontSize: 11,
    fontWeight: 400,
    opacity: 0.85,
  },
  dialogSubMuted: {
    fontSize: 11,
    fontWeight: 400,
    color: "var(--text-tertiary)",
  },
  dialogCancel: {
    width: "100%",
    padding: "9px 14px",
    marginTop: 2,
    border: "none",
    background: "transparent",
    color: "var(--text-tertiary)",
    fontSize: 14,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  chipRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    padding: "12px 0",
  },
  spaceChip: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "6px 12px",
    borderRadius: 20,
    border: "1px solid var(--border-default)",
    background: "transparent",
    fontSize: 13,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  inviteRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "12px 0",
  },
  memberRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "12px 0",
  },
  memberInfo: {
    flex: 1,
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  memberEmail: {
    fontSize: 14,
    color: "var(--text-primary)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  badge: {
    alignSelf: "flex-start",
    padding: "1px 8px",
    borderRadius: 10,
    fontSize: 11,
    fontWeight: 600,
  },
};
