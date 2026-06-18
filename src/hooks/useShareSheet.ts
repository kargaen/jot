import { useCallback, useEffect, useState } from "react";
import type { AreaMember, ProjectMember } from "../models/shared";
import {
  fetchAreaMembers,
  fetchProjectMembers,
  inviteMember,
  inviteProjectMember,
  removeAreaMember,
  removeProjectMember,
} from "../services/backend/supabase.service";

export type ShareTarget =
  | { kind: "area"; id: string; name: string }
  | { kind: "project"; id: string; name: string };

export function useShareSheet(target: ShareTarget) {
  const [members, setMembers] = useState<Array<AreaMember | ProjectMember>>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteError, setInviteError] = useState("");
  const [busy, setBusy] = useState(false);

  const loadMembers = useCallback(async () => {
    const next =
      target.kind === "area"
        ? await fetchAreaMembers(target.id)
        : await fetchProjectMembers(target.id);
    setMembers(next);
  }, [target]);

  useEffect(() => {
    void loadMembers().catch(() => {});
  }, [loadMembers]);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setBusy(true);
    setInviteError("");
    const err =
      target.kind === "area"
        ? await inviteMember(target.id, inviteEmail.trim())
        : await inviteProjectMember(target.id, inviteEmail.trim());
    setBusy(false);
    if (err) {
      setInviteError(err);
      return;
    }
    setInviteEmail("");
    await loadMembers();
  }

  async function handleRemove(memberId: string) {
    if (target.kind === "area") await removeAreaMember(memberId);
    else await removeProjectMember(memberId);
    setMembers((prev) => prev.filter((m) => m.id !== memberId));
  }

  return { members, inviteEmail, setInviteEmail, inviteError, setInviteError, busy, handleInvite, handleRemove };
}
