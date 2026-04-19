import { useEffect, useState, useCallback } from "react";
import {
  createArea,
  updateArea,
  deleteArea,
  updatePassword,
  signOutEverywhere,
  fetchAreaMembers,
  inviteMember,
  removeAreaMember,
  fetchPendingInvites,
  acceptInvite,
  declineInvite,
  fetchFeedback,
  submitFeedback,
} from "../lib/supabase";
import { spaceColor } from "../lib/colors";
import Toggle from "../components/Toggle";
import { useAuth } from "../lib/auth";
import type { Area, AreaMember, Feedback } from "../types";

import { enable as enableAutostart, disable as disableAutostart, isEnabled as isAutostart } from "@tauri-apps/plugin-autostart";
type Tab = "spaces" | "sharing" | "reminders" | "feedback" | "account";

export default function Preferences({
  areas,
  hiddenAreaIds,
  onHiddenChange,
  onAreasChange,
  onClose,
}: {
  areas: Area[];
  hiddenAreaIds: string[];
  onHiddenChange: (ids: string[]) => void;
  onAreasChange: () => void;
  onClose: () => void;
}) {
  const { user, signOut } = useAuth();
  const [tab, setTab] = useState<Tab>("spaces");

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: 540, background: "var(--bg-primary)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border-default)", boxShadow: "var(--shadow-lg)", display: "flex", flexDirection: "column", overflow: "hidden" }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", padding: "18px 24px", borderBottom: "1px solid var(--border-subtle)" }}>
          <span style={{ fontSize: 16, fontWeight: 600, flex: 1 }}>Preferences</span>
          <button onClick={onClose} style={{ fontSize: 20, color: "var(--text-tertiary)", lineHeight: 1, padding: "0 4px" }}>×</button>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", borderBottom: "1px solid var(--border-subtle)", padding: "0 24px" }}>
          {(["spaces", "sharing", "reminders", "feedback", "account"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{ padding: "10px 16px 9px", fontSize: 13, fontWeight: tab === t ? 600 : 400, color: tab === t ? "var(--accent)" : "var(--text-secondary)", borderBottom: tab === t ? "2px solid var(--accent)" : "2px solid transparent", marginBottom: -1, textTransform: "capitalize" }}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ height: 420, overflowY: "auto", padding: "20px 24px" }}>
          {tab === "spaces" && (
            <AreasTab areas={areas} hiddenAreaIds={hiddenAreaIds} onHiddenChange={onHiddenChange} onAreasChange={onAreasChange} />
          )}
          {tab === "sharing" && (
            <SharingTab areas={areas} currentUserId={user?.id ?? ""} />
          )}
          {tab === "reminders" && <RemindersTab />}
          {tab === "feedback" && <FeedbackTab currentUserId={user?.id ?? ""} />}
          {tab === "account" && (
            <AccountTab user={user} signOut={signOut} />
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Areas tab ────────────────────────────────────────────────────────────────

function AreasTab({ areas, hiddenAreaIds, onHiddenChange, onAreasChange }: {
  areas: Area[];
  hiddenAreaIds: string[];
  onHiddenChange: (ids: string[]) => void;
  onAreasChange: () => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);

  function startEdit(area: Area) { setEditingId(area.id); setEditName(area.name); }

  async function saveEdit(id: string) {
    if (!editName.trim()) return;
    setBusy(true);
    await updateArea(id, { name: editName.trim() });
    setEditingId(null); onAreasChange(); setBusy(false);
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this space? Projects in it will become unassigned.")) return;
    setBusy(true);
    await deleteArea(id);
    onHiddenChange(hiddenAreaIds.filter((x) => x !== id));
    onAreasChange(); setBusy(false);
  }

  async function handleAdd() {
    if (!newName.trim()) return;
    setBusy(true);
    await createArea(newName.trim());
    setNewName(""); setAdding(false); onAreasChange(); setBusy(false);
  }

  function toggleVisibility(id: string) {
    onHiddenChange(hiddenAreaIds.includes(id) ? hiddenAreaIds.filter((x) => x !== id) : [...hiddenAreaIds, id]);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <p style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 4 }}>
        Toggle visibility to filter which spaces appear on this device.
      </p>

      {areas.length === 0 && !adding && (
        <div style={{ fontSize: 13, color: "var(--text-tertiary)", textAlign: "center", padding: "24px 0" }}>No spaces yet.</div>
      )}

      {areas.map((area) => (
        <div key={area.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: "var(--radius-md)", background: "var(--bg-secondary)", border: "1px solid var(--border-subtle)" }}>
          {editingId === area.id ? (
            <>
              <span style={{ width: 14, height: 14, borderRadius: 4, background: spaceColor(area.id), flexShrink: 0 }} />
              <input autoFocus value={editName} onChange={(e) => setEditName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") saveEdit(area.id); if (e.key === "Escape") setEditingId(null); }} style={inputStyle} />
              <Btn onClick={() => saveEdit(area.id)} disabled={busy} accent>Save</Btn>
              <Btn onClick={() => setEditingId(null)}>Cancel</Btn>
            </>
          ) : (
            <>
              <Toggle on={!hiddenAreaIds.includes(area.id)} onToggle={() => toggleVisibility(area.id)} />
              <span style={{ width: 10, height: 10, borderRadius: 4, background: spaceColor(area.id), flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: 13, color: "var(--text-primary)", opacity: hiddenAreaIds.includes(area.id) ? 0.45 : 1 }}>{area.name}</span>
              <Btn onClick={() => startEdit(area)}>Edit</Btn>
              <Btn onClick={() => handleDelete(area.id)} disabled={busy} danger>Delete</Btn>
            </>
          )}
        </div>
      ))}

      {adding ? (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: "var(--radius-md)", background: "var(--bg-secondary)", border: "1px solid var(--accent)" }}>
          <input autoFocus placeholder="Space name" value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); if (e.key === "Escape") setAdding(false); }} style={{ ...inputStyle, flex: 1 }} />
          <Btn onClick={handleAdd} disabled={busy || !newName.trim()} accent>Add</Btn>
          <Btn onClick={() => setAdding(false)}>Cancel</Btn>
        </div>
      ) : (
        <button onClick={() => setAdding(true)} style={{ alignSelf: "flex-start", fontSize: 13, color: "var(--accent)", padding: "6px 4px" }}>
          + Add space
        </button>
      )}
    </div>
  );
}

// ─── Sharing tab ──────────────────────────────────────────────────────────────

function SharingTab({ areas, currentUserId }: { areas: Area[]; currentUserId: string }) {
  const [selectedAreaId, setSelectedAreaId] = useState<string>(areas[0]?.id ?? "");
  const [members, setMembers] = useState<AreaMember[]>([]);
  const [pendingInvites, setPendingInvites] = useState<AreaMember[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteError, setInviteError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadingMembers, setLoadingMembers] = useState(false);

  // My areas (owned) vs shared-with-me
  const ownedAreas = areas.filter((a) => a.user_id === currentUserId);

  useEffect(() => {
    fetchPendingInvites().then(setPendingInvites).catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedAreaId) return;
    setLoadingMembers(true);
    fetchAreaMembers(selectedAreaId)
      .then(setMembers)
      .catch(() => {})
      .finally(() => setLoadingMembers(false));
  }, [selectedAreaId]);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviteError("");
    if (!inviteEmail.trim()) return;
    setBusy(true);
    const err = await inviteMember(selectedAreaId, inviteEmail.trim());
    setBusy(false);
    if (err) { setInviteError(err); return; }
    setInviteEmail("");
    const updated = await fetchAreaMembers(selectedAreaId);
    setMembers(updated);
  }

  async function handleRemove(memberId: string) {
    await removeAreaMember(memberId);
    setMembers((prev) => prev.filter((m) => m.id !== memberId));
  }

  async function handleAccept(invite: AreaMember) {
    await acceptInvite(invite.id);
    setPendingInvites((prev) => prev.filter((i) => i.id !== invite.id));
  }

  async function handleDecline(invite: AreaMember) {
    await declineInvite(invite.id);
    setPendingInvites((prev) => prev.filter((i) => i.id !== invite.id));
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      {/* Pending invites for me */}
      {pendingInvites.length > 0 && (
        <div>
          <SectionLabel>Pending invitations</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
            {pendingInvites.map((inv) => (
              <div key={inv.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: "var(--radius-md)", background: "var(--accent-light)", border: "1px solid var(--accent)" }}>
                <span style={{ flex: 1, fontSize: 13 }}>
                  Invited to space <strong>{inv.area_id}</strong>
                </span>
                <Btn onClick={() => handleAccept(inv)} accent>Accept</Btn>
                <Btn onClick={() => handleDecline(inv)} danger>Decline</Btn>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Owned areas — manage sharing */}
      {ownedAreas.length === 0 ? (
        <div style={{ fontSize: 13, color: "var(--text-tertiary)", textAlign: "center", padding: "24px 0" }}>
          You have no spaces to share. Create one in the Spaces tab first.
        </div>
      ) : (
        <>
          {/* Area selector */}
          <div>
            <SectionLabel>Share space</SectionLabel>
            <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
              {ownedAreas.map((a) => (
                <button
                  key={a.id}
                  onClick={() => setSelectedAreaId(a.id)}
                  style={{
                    padding: "5px 12px", borderRadius: 20, fontSize: 13,
                    border: `1px solid ${a.id === selectedAreaId ? spaceColor(a.id) : "var(--border-default)"}`,
                    background: a.id === selectedAreaId ? `${spaceColor(a.id)}18` : "transparent",
                    color: a.id === selectedAreaId ? spaceColor(a.id) : "var(--text-secondary)",
                    fontWeight: a.id === selectedAreaId ? 600 : 400,
                    display: "flex", alignItems: "center", gap: 6,
                  }}
                >
                  <span style={{ width: 8, height: 8, borderRadius: 3, background: spaceColor(a.id), flexShrink: 0 }} />
                  {a.name}
                </button>
              ))}
            </div>
          </div>

          {/* Invite form */}
          <form onSubmit={handleInvite} style={{ display: "flex", gap: 8 }}>
            <input
              type="email"
              placeholder="Invite by email address"
              value={inviteEmail}
              onChange={(e) => { setInviteEmail(e.target.value); setInviteError(""); }}
              style={{ ...inputStyle, flex: 1 }}
            />
            <button
              type="submit"
              disabled={busy || !inviteEmail.trim()}
              style={{ padding: "7px 16px", background: "var(--accent)", color: "#fff", borderRadius: "var(--radius-sm)", fontSize: 13, fontWeight: 500, opacity: busy || !inviteEmail.trim() ? 0.6 : 1 }}
            >
              {busy ? "Sending…" : "Invite"}
            </button>
          </form>
          {inviteError && <div style={{ fontSize: 12, color: "var(--priority-high)", marginTop: -12 }}>{inviteError}</div>}

          {/* Members list */}
          {loadingMembers ? (
            <div style={{ fontSize: 13, color: "var(--text-tertiary)" }}>Loading…</div>
          ) : members.length === 0 ? (
            <div style={{ fontSize: 13, color: "var(--text-tertiary)" }}>No one has been invited to this space yet.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <SectionLabel>Members</SectionLabel>
              {members.map((m) => (
                <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: "var(--radius-md)", background: "var(--bg-secondary)", border: "1px solid var(--border-subtle)" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {m.invited_email}
                    </div>
                    <div style={{ fontSize: 11, marginTop: 2 }}>
                      <StatusBadge status={m.status} />
                    </div>
                  </div>
                  <Btn onClick={() => handleRemove(m.id)} danger>Remove</Btn>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Account tab ──────────────────────────────────────────────────────────────

function AccountTab({ user, signOut }: { user: { email?: string } | null; signOut: () => void }) {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwError, setPwError] = useState("");
  const [pwSuccess, setPwSuccess] = useState(false);
  const [pwBusy, setPwBusy] = useState(false);
  const [signOutBusy, setSignOutBusy] = useState(false);

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwError(""); setPwSuccess(false);
    if (newPassword.length < 8) { setPwError("Password must be at least 8 characters."); return; }
    if (newPassword !== confirmPw) { setPwError("Passwords do not match."); return; }
    setPwBusy(true);
    const err = await updatePassword(newPassword);
    setPwBusy(false);
    if (err) { setPwError(err); return; }
    setPwSuccess(true); setNewPassword(""); setConfirmPw("");
  }

  async function handleSignOutEverywhere() {
    if (!window.confirm("This will sign you out on all devices. Continue?")) return;
    setSignOutBusy(true);
    await signOutEverywhere();
    signOut();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div>
        <SectionLabel>Signed in as</SectionLabel>
        <div style={{ marginTop: 6, fontSize: 14, color: "var(--text-primary)", padding: "8px 12px", background: "var(--bg-secondary)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-subtle)" }}>
          {user?.email ?? "—"}
        </div>
      </div>

      <form onSubmit={handleChangePassword} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <SectionLabel>Change password</SectionLabel>
        <input type="password" placeholder="New password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} style={inputStyle} />
        <input type="password" placeholder="Confirm new password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} style={inputStyle} />
        {pwError && <div style={{ fontSize: 12, color: "var(--priority-high)" }}>{pwError}</div>}
        {pwSuccess && <div style={{ fontSize: 12, color: "#22c55e" }}>Password updated.</div>}
        <button type="submit" disabled={pwBusy || !newPassword} style={{ alignSelf: "flex-start", padding: "7px 16px", background: "var(--accent)", color: "#fff", borderRadius: "var(--radius-sm)", fontSize: 13, fontWeight: 500, opacity: pwBusy || !newPassword ? 0.6 : 1 }}>
          {pwBusy ? "Saving…" : "Update password"}
        </button>
      </form>

      <div style={{ paddingTop: 8, borderTop: "1px solid var(--border-subtle)" }}>
        <SectionLabel>Sessions</SectionLabel>
        <p style={{ fontSize: 12, color: "var(--text-tertiary)", margin: "6px 0 10px" }}>Signs you out on all devices and browsers.</p>
        <button onClick={handleSignOutEverywhere} disabled={signOutBusy} style={{ padding: "7px 16px", background: "rgba(220,38,38,0.08)", color: "var(--priority-high)", border: "1px solid rgba(220,38,38,0.2)", borderRadius: "var(--radius-sm)", fontSize: 13, fontWeight: 500 }}>
          {signOutBusy ? "Signing out…" : "Sign out everywhere"}
        </button>
      </div>
    </div>
  );
}

// ─── Reminders tab ───────────────────────────────────────────────────────────

const DURATION_OPTIONS = [
  { value: "60",  label: "1 minute" },
  { value: "120", label: "2 minutes" },
  { value: "180", label: "3 minutes" },
  { value: "300", label: "5 minutes" },
];

function RemindersTab() {
  const [autostart, setAutostart] = useState(false);
  const [autostartError, setAutostartError] = useState<string | null>(null);
  const [enabled,  setEnabled]  = useState(localStorage.getItem("jot_reminder_enabled")  !== "false");
  const [time,     setTime]     = useState(localStorage.getItem("jot_reminder_time")      ?? "08:00");
  const [duration, setDuration] = useState(localStorage.getItem("jot_reminder_duration") ?? "180");

  useEffect(() => { isAutostart().then(setAutostart).catch(() => {}); }, []);
  const toggleAutostart = useCallback(async () => {
    const next = !autostart;
    setAutostartError(null);
    try {
      if (next) await enableAutostart(); else await disableAutostart();
      setAutostart(next);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setAutostartError(msg);
      // Re-read actual state so the toggle reflects reality
      isAutostart().then(setAutostart).catch(() => {});
    }
  }, [autostart]);

  function save(patch: { enabled?: boolean; time?: string; duration?: string }) {
    const e = patch.enabled  ?? enabled;
    const t = patch.time     ?? time;
    const d = patch.duration ?? duration;
    if (e) localStorage.removeItem("jot_reminder_enabled");
    else   localStorage.setItem("jot_reminder_enabled", "false");
    localStorage.setItem("jot_reminder_time",     t);
    localStorage.setItem("jot_reminder_duration", d);
  }

  const rowStyle: React.CSSProperties = {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "12px 0", borderBottom: "1px solid var(--border-subtle)",
  };
  const labelStyle: React.CSSProperties = { fontSize: 13, color: "var(--text-primary)" };
  const hintStyle:  React.CSSProperties = { fontSize: 12, color: "var(--text-tertiary)", marginTop: 2 };

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {/* Start with Windows */}
      <div style={rowStyle}>
        <div>
          <div style={labelStyle}>Start with Windows</div>
          <div style={hintStyle}>Launch Jot automatically when you log in</div>
          {autostartError && (
            <div style={{ fontSize: 11, color: "#dc2626", marginTop: 4 }}>
              Failed: {autostartError}
            </div>
          )}
        </div>
        <Toggle on={autostart} onToggle={toggleAutostart} />
      </div>

      {/* Enable toggle */}
      <div style={rowStyle}>
        <div>
          <div style={labelStyle}>Daily reminder</div>
          <div style={hintStyle}>Show a popup with today's agenda at a set time</div>
        </div>
        <Toggle on={enabled} onToggle={() => { const next = !enabled; setEnabled(next); save({ enabled: next }); }} />
      </div>

      {/* Time picker */}
      <div style={{ ...rowStyle, opacity: enabled ? 1 : 0.4, pointerEvents: enabled ? "auto" : "none" }}>
        <div style={labelStyle}>Reminder time</div>
        <input
          type="time"
          value={time}
          onChange={(e) => { setTime(e.target.value); save({ time: e.target.value }); }}
          style={{
            padding: "5px 8px", borderRadius: "var(--radius-sm)",
            border: "1px solid var(--border-default)",
            background: "var(--bg-secondary)",
            fontSize: 13, color: "var(--text-primary)", fontFamily: "inherit",
          }}
        />
      </div>

      {/* Countdown duration */}
      <div style={{ ...rowStyle, borderBottom: "none", opacity: enabled ? 1 : 0.4, pointerEvents: enabled ? "auto" : "none" }}>
        <div>
          <div style={labelStyle}>Countdown duration</div>
          <div style={hintStyle}>How long the popup waits before auto-dismissing</div>
        </div>
        <select
          value={duration}
          onChange={(e) => { setDuration(e.target.value); save({ duration: e.target.value }); }}
          style={{
            padding: "5px 8px", borderRadius: "var(--radius-sm)",
            border: "1px solid var(--border-default)",
            background: "var(--bg-secondary)",
            fontSize: 13, color: "var(--text-primary)", fontFamily: "inherit",
          }}
        >
          {DURATION_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      <p style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 16, lineHeight: 1.5 }}>
        The countdown pauses automatically when you're away from your keyboard, so you'll never miss it.
        Use <strong>Snooze 1h</strong> on the popup to defer it when you're in a flow.
      </p>
    </div>
  );
}

// ─── Feedback tab ────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<Feedback["status"], string> = {
  new: "New",
  reviewing: "Reviewing",
  planned: "Planned",
  in_progress: "In Progress",
  done: "Done",
  declined: "Declined",
};
const STATUS_COLORS: Record<Feedback["status"], string> = {
  new: "#6b7280",
  reviewing: "#d97706",
  planned: "#3b82f6",
  in_progress: "#8b5cf6",
  done: "#16a34a",
  declined: "#57534e",
};

function FeedbackTab({ currentUserId }: { currentUserId: string }) {
  const [items, setItems] = useState<Feedback[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchFeedback()
      .then(setItems)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true);
    try {
      const item = await submitFeedback(text.trim());
      setItems((prev) => [item, ...prev]);
      setText("");
    } catch {}
    setBusy(false);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <p style={{ fontSize: 12, color: "var(--text-tertiary)", lineHeight: 1.5 }}>
        Ideas, bugs, feature requests — anything goes. You can see what others have submitted and track status.
      </p>

      {/* Submit form */}
      <form onSubmit={handleSubmit} style={{ display: "flex", gap: 8 }}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Describe your idea or bug…"
          style={{ ...inputStyle, flex: 1 }}
        />
        <button
          type="submit"
          disabled={busy || !text.trim()}
          style={{
            padding: "7px 16px", background: "var(--accent)", color: "#fff",
            borderRadius: "var(--radius-sm)", fontSize: 13, fontWeight: 500,
            opacity: busy || !text.trim() ? 0.6 : 1, flexShrink: 0,
          }}
        >
          {busy ? "Sending…" : "Submit"}
        </button>
      </form>

      {/* Feedback list */}
      {loading ? (
        <div style={{ fontSize: 13, color: "var(--text-tertiary)", textAlign: "center", padding: "20px 0" }}>Loading…</div>
      ) : items.length === 0 ? (
        <div style={{ fontSize: 13, color: "var(--text-tertiary)", textAlign: "center", padding: "20px 0" }}>No feedback yet. Be the first!</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {items.map((item) => (
            <div
              key={item.id}
              style={{
                padding: "10px 12px", borderRadius: "var(--radius-md)",
                background: "var(--bg-secondary)", border: "1px solid var(--border-subtle)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <span style={{
                  fontSize: 11, fontWeight: 600, padding: "1px 7px", borderRadius: 10,
                  background: `${STATUS_COLORS[item.status]}18`,
                  color: STATUS_COLORS[item.status],
                }}>
                  {STATUS_LABELS[item.status]}
                </span>
                {item.user_id === currentUserId && (
                  <span style={{ fontSize: 10, color: "var(--text-tertiary)" }}>You</span>
                )}
                <span style={{ fontSize: 10, color: "var(--text-tertiary)", marginLeft: "auto" }}>
                  {new Date(item.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                </span>
              </div>
              <div style={{ fontSize: 13, color: "var(--text-primary)", lineHeight: 1.4 }}>
                {item.text}
              </div>
              {item.admin_note && (
                <div style={{ fontSize: 12, color: "var(--accent)", marginTop: 6, paddingTop: 6, borderTop: "1px solid var(--border-subtle)", lineHeight: 1.4 }}>
                  {item.admin_note}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


// ─── Small helpers ────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.07em" }}>
      {children}
    </div>
  );
}

function StatusBadge({ status }: { status: "pending" | "accepted" }) {
  return (
    <span style={{
      display: "inline-block", padding: "1px 7px", borderRadius: 10, fontSize: 11, fontWeight: 500,
      background: status === "accepted" ? "rgba(34,197,94,0.12)" : "rgba(217,119,6,0.12)",
      color: status === "accepted" ? "#16a34a" : "#d97706",
    }}>
      {status === "accepted" ? "Active" : "Pending"}
    </span>
  );
}


function Btn({ children, onClick, disabled, accent, danger }: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  accent?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        fontSize: 12, padding: "4px 10px", borderRadius: "var(--radius-sm)", fontWeight: accent ? 600 : 400,
        color: danger ? "var(--priority-high)" : accent ? "var(--accent)" : "var(--text-tertiary)",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {children}
    </button>
  );
}


const inputStyle: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: "var(--radius-sm)",
  border: "1px solid var(--border-default)",
  background: "var(--bg-secondary)",
  color: "var(--text-primary)",
  fontSize: 13,
  fontFamily: "inherit",
  outline: "none",
};
