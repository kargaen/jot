import { useCallback, useEffect, useState } from "react";
import type { Area, AreaMember, Feedback, ProjectMember } from "../models/shared";
import { logger } from "../utils/observability/logger";
import {
  acceptInvite,
  acceptProjectInvite,
  createArea,
  declineInvite,
  declineProjectInvite,
  deleteArea,
  fetchAreaMembers,
  fetchFeedback,
  fetchPendingInvites,
  fetchPendingProjectInvites,
  inviteMember,
  removeAreaMember,
  signOutEverywhere,
  submitFeedback,
  updateArea,
  updatePassword,
} from "../services/backend/supabase.service";

// ── AreasTab ──────────────────────────────────────────────────────────────────

export function useAreasTabActions() {
  return {
    saveArea: (id: string, name: string) => updateArea(id, { name }),
    removeArea: (id: string) => deleteArea(id),
    addArea: (name: string) => createArea(name),
  };
}

// ── SharingTab ────────────────────────────────────────────────────────────────

export function useSharingTab(
  areas: Area[],
  currentUserId: string,
  onSharedChange: () => void,
) {
  const ownedAreas = areas.filter((a) => a.user_id === currentUserId);

  const [selectedAreaId, setSelectedAreaId] = useState<string>(areas[0]?.id ?? "");
  const [members, setMembers] = useState<AreaMember[]>([]);
  const [pendingInvites, setPendingInvites] = useState<AreaMember[]>([]);
  const [pendingProjectInvites, setPendingProjectInvites] = useState<ProjectMember[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteError, setInviteError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadingMembers, setLoadingMembers] = useState(false);

  useEffect(() => {
    fetchPendingInvites().then(setPendingInvites).catch((err: unknown) => { logger.warn("preferences", "fetchPendingInvites failed", err instanceof Error ? err.message : err); });
    fetchPendingProjectInvites().then(setPendingProjectInvites).catch((err: unknown) => { logger.warn("preferences", "fetchPendingProjectInvites failed", err instanceof Error ? err.message : err); });
  }, []);

  useEffect(() => {
    if (!selectedAreaId) return;
    setLoadingMembers(true);
    fetchAreaMembers(selectedAreaId)
      .then(setMembers)
      .catch((err: unknown) => { logger.warn("preferences", "fetchAreaMembers failed", err instanceof Error ? err.message : err); })
      .finally(() => setLoadingMembers(false));
  }, [selectedAreaId]);

  const refreshMembers = useCallback(async () => {
    const updated = await fetchAreaMembers(selectedAreaId);
    setMembers(updated);
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
    await refreshMembers();
  }

  async function handleRemove(memberId: string) {
    await removeAreaMember(memberId);
    setMembers((prev) => prev.filter((m) => m.id !== memberId));
  }

  async function handleAccept(invite: AreaMember) {
    await acceptInvite(invite.id);
    setPendingInvites((prev) => prev.filter((i) => i.id !== invite.id));
    onSharedChange();
  }

  async function handleDecline(invite: AreaMember) {
    await declineInvite(invite.id);
    setPendingInvites((prev) => prev.filter((i) => i.id !== invite.id));
  }

  async function handleAcceptProject(invite: ProjectMember) {
    await acceptProjectInvite(invite.id);
    setPendingProjectInvites((prev) => prev.filter((i) => i.id !== invite.id));
    onSharedChange();
  }

  async function handleDeclineProject(invite: ProjectMember) {
    await declineProjectInvite(invite.id);
    setPendingProjectInvites((prev) => prev.filter((i) => i.id !== invite.id));
  }

  return {
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
  };
}

// ── AccountTab ────────────────────────────────────────────────────────────────

export function useAccountTabActions() {
  return {
    changePassword: (password: string) => updatePassword(password),
    signOutAll: () => signOutEverywhere(),
  };
}

// ── FeedbackTab ───────────────────────────────────────────────────────────────

export function useFeedbackTab() {
  const [items, setItems] = useState<Feedback[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchFeedback()
      .then(setItems)
      .catch((err: unknown) => { logger.warn("preferences", "fetchFeedback failed", err instanceof Error ? err.message : err); })
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

  return { items, text, setText, busy, loading, handleSubmit };
}
