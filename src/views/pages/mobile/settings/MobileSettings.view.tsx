import { useState } from "react";
import type { CSSProperties, FormEvent } from "react";
import type { Area, AreaMember, Feedback, NlpLanguageMode } from "../../../../models/shared";
import { useAuth } from "../../../../hooks/useAuth";
import { useFeedbackTab, useSharingTab } from "../../../../hooks/usePreferences";
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

interface Props {
  email: string;
  areas: Area[];
  accountActions: AccountActions;
  spaceActions: SpaceActions;
  onSignedOut: () => void;
  onAreasChanged: () => void;
}

export default function MobileSettingsView({
  email,
  areas,
  accountActions,
  spaceActions,
  onSignedOut,
  onAreasChanged,
}: Props) {
  return (
    <div style={styles.shell}>
      <AccountSection email={email} actions={accountActions} onSignedOut={onSignedOut} />
      <AppearanceSection />
      <CaptureSection />
      <SpacesSection areas={areas} actions={spaceActions} onChanged={onAreasChanged} />
      <SharingSection areas={areas} onSharedChange={onAreasChanged} />
      <FeedbackSection />
    </div>
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
          <button type="submit" disabled={busy || !newPassword.trim()} style={styles.inlineButton}>
            Update
          </button>
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
  actions,
  onChanged,
}: {
  areas: Area[];
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

  return (
    <section style={styles.section}>
      <div style={styles.sectionHeader}>Spaces</div>
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
                <button
                  type="button"
                  onClick={() => handleSave(area.id)}
                  disabled={busy}
                  style={styles.inlineButton}
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setEditingId(null)}
                  style={styles.cancelButton}
                >
                  ✕
                </button>
              </div>
            ) : (
              <div style={styles.spaceRow}>
                <span style={{ ...styles.dot, background: area.color }} />
                <span style={styles.rowLabel}>{area.name}</span>
                <button type="button" onClick={() => startEdit(area)} style={styles.iconButton}>
                  ✎
                </button>
                <button
                  type="button"
                  onClick={() => handleRemove(area.id)}
                  disabled={busy}
                  style={{ ...styles.iconButton, color: "#b91c1c" }}
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
          <button type="submit" disabled={busy || !newName.trim()} style={styles.inlineButton}>
            Add
          </button>
        </form>
      </div>
    </section>
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
            <button type="submit" disabled={busy || !inviteEmail.trim()} style={styles.inlineButton}>
              {busy ? "…" : "Invite"}
            </button>
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
                  <button type="button" onClick={() => handleRemove(m.id)} style={{ ...styles.iconButton, color: "#b91c1c" }}>
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
      <button type="button" onClick={onAccept} style={styles.inlineButton}>Accept</button>
      <button type="button" onClick={onDecline} style={styles.cancelButton}>Decline</button>
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
        color: accepted ? "#16a34a" : "#d97706",
      }}
    >
      {accepted ? "Active" : "Pending"}
    </span>
  );
}

// ── Feedback ──────────────────────────────────────────────────────────────────

const FEEDBACK_STATUS: Record<Feedback["status"], { label: string; color: string }> = {
  new: { label: "New", color: "#6b7280" },
  reviewing: { label: "Reviewing", color: "#d97706" },
  planned: { label: "Planned", color: "#3b82f6" },
  in_progress: { label: "In Progress", color: "#8b5cf6" },
  done: { label: "Done", color: "#16a34a" },
  declined: { label: "Declined", color: "#57534e" },
};

function FeedbackSection() {
  const { user } = useAuth();
  const { items, text, setText, busy, loading, handleSubmit } = useFeedbackTab();

  return (
    <section style={styles.section}>
      <div style={styles.sectionHeader}>Feedback</div>
      <div style={styles.card}>
        <form onSubmit={handleSubmit} style={styles.passwordRow}>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Idea or bug…"
            style={styles.inlineInput}
          />
          <button type="submit" disabled={busy || !text.trim()} style={styles.inlineButton}>
            {busy ? "…" : "Send"}
          </button>
        </form>

        {loading ? (
          <div style={styles.emptyText}>Loading…</div>
        ) : items.length === 0 ? (
          <div style={styles.emptyText}>No feedback yet. Be the first!</div>
        ) : (
          items.map((item) => {
            const meta = FEEDBACK_STATUS[item.status];
            return (
              <div key={item.id}>
                <div style={styles.divider} />
                <div style={styles.feedbackItem}>
                  <div style={styles.feedbackHead}>
                    <span style={{ ...styles.badge, background: `${meta.color}1f`, color: meta.color }}>
                      {meta.label}
                    </span>
                    {item.user_id === user?.id ? <span style={styles.feedbackYou}>You</span> : null}
                    <span style={styles.feedbackDate}>
                      {new Date(item.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                    </span>
                  </div>
                  <div style={styles.feedbackText}>{item.text}</div>
                  {item.admin_note ? <div style={styles.feedbackNote}>{item.admin_note}</div> : null}
                </div>
              </div>
            );
          })
        )}
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
  card: {
    background: "var(--surface-glass)",
    border: "1px solid var(--surface-border-accent)",
    borderRadius: 18,
    overflow: "hidden",
    padding: "0 16px",
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
  inlineButton: {
    flexShrink: 0,
    padding: "9px 14px",
    borderRadius: 10,
    border: "none",
    background: "linear-gradient(135deg, #5b5bd6, #7a6cff)",
    color: "#fff",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  cancelButton: {
    flexShrink: 0,
    padding: "9px 10px",
    borderRadius: 10,
    border: "1px solid var(--border-default)",
    background: "transparent",
    color: "var(--text-secondary)",
    fontSize: 13,
    cursor: "pointer",
    fontFamily: "inherit",
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
    color: "#b91c1c",
    fontSize: 15,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "inherit",
    textAlign: "left",
  },
  notice: {
    padding: "8px 0",
    fontSize: 13,
    color: "#166534",
  },
  error: {
    padding: "8px 0",
    fontSize: 13,
    color: "#b91c1c",
  },
  emptyText: {
    padding: "14px 0",
    fontSize: 13,
    color: "var(--text-tertiary)",
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
  feedbackItem: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    padding: "12px 0",
  },
  feedbackHead: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  feedbackYou: {
    fontSize: 10,
    color: "var(--text-tertiary)",
  },
  feedbackDate: {
    fontSize: 10,
    color: "var(--text-tertiary)",
    marginLeft: "auto",
  },
  feedbackText: {
    fontSize: 14,
    color: "var(--text-primary)",
    lineHeight: 1.4,
  },
  feedbackNote: {
    fontSize: 13,
    color: "var(--accent)",
    lineHeight: 1.4,
    paddingTop: 6,
    borderTop: "1px solid var(--border-subtle)",
  },
};
