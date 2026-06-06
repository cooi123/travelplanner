"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import type { TripMember, Role } from "@/types";

interface Props {
  tripId: string;
  currentUserId: string;
  isOrganizer: boolean;
}

// Supabase returns profile as null for guest rows (no auth user yet).
type AnyMember = Omit<TripMember, "profile"> & {
  profile: { full_name: string | null; email: string | null } | null;
  guest_name: string | null;
  guest_email: string | null;
};

function displayName(m: AnyMember) {
  return m.profile?.full_name ?? m.profile?.email ?? m.guest_name ?? "Unknown";
}

function memberInitials(m: AnyMember) {
  const name = displayName(m);
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

export function MembersSection({ tripId, currentUserId, isOrganizer }: Props) {
  const [members, setMembers] = useState<AnyMember[]>([]);
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAddGuest, setShowAddGuest] = useState(false);
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [addingGuest, setAddingGuest] = useState(false);

  const fetchMembers = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("trip_members")
      .select("*, profile:profiles(*)")
      .eq("trip_id", tripId)
      .order("joined_at");
    setMembers((data as AnyMember[]) ?? []);
    setLoading(false);
  }, [tripId]);

  useEffect(() => { fetchMembers(); }, [fetchMembers]);

  async function generateInviteLink() {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("trip_invites")
      .insert({ trip_id: tripId })
      .select("token")
      .single();
    if (error) { toast.error("Could not generate link"); return; }
    setInviteToken(data.token);
  }

  async function copyInviteLink() {
    if (!inviteToken) return;
    const url = `${window.location.origin}/join/${inviteToken}`;
    await navigator.clipboard.writeText(url);
    toast.success("Invite link copied!");
  }

  async function addGuest() {
    if (!guestName.trim()) return;
    setAddingGuest(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("trip_members")
      .insert({
        trip_id: tripId,
        user_id: null,
        role: "participant",
        guest_name: guestName.trim(),
        guest_email: guestEmail.trim() || null,
      })
      .select("*, profile:profiles(*)")
      .single();

    if (error) {
      toast.error(error.message);
      setAddingGuest(false);
      return;
    }

    setMembers((prev) => [...prev, data as AnyMember]);
    setGuestName("");
    setGuestEmail("");
    setShowAddGuest(false);
    setAddingGuest(false);
    toast.success(`${guestName} added as a guest`);
  }

  async function updateMemberRole(memberId: string, newRole: "participant" | "activity_manager") {
    const supabase = createClient();
    const { error } = await supabase
      .from("trip_members")
      .update({ role: newRole })
      .eq("id", memberId);
    if (error) { toast.error(error.message); return; }
    setMembers((prev) => prev.map((m) => m.id === memberId ? { ...m, role: newRole } : m));
    toast.success("Role updated");
  }

  async function removeGuest(memberId: string) {
    const supabase = createClient();
    const { error } = await supabase.from("trip_members").delete().eq("id", memberId);
    if (error) { toast.error(error.message); return; }
    setMembers((prev) => prev.filter((m) => m.id !== memberId));
    toast.success("Guest removed");
  }

  if (loading) return <p className="text-gray-400 text-sm">Loading members…</p>;

  const realMembers = members.filter((m) => m.user_id !== null);
  const guests = members.filter((m) => m.user_id === null);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">
          Members <span className="text-gray-400 font-normal text-base">({members.length})</span>
        </h2>
        {isOrganizer && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setShowAddGuest(true)}>
              + Add guest
            </Button>
            {inviteToken ? (
              <Button size="sm" variant="outline" onClick={copyInviteLink}>
                Copy invite link
              </Button>
            ) : (
              <Button size="sm" onClick={generateInviteLink}>
                Invite link
              </Button>
            )}
          </div>
        )}
      </div>

      {inviteToken && (
        <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-lg border border-blue-200">
          <Input
            readOnly
            value={`${window.location.origin}/join/${inviteToken}`}
            className="text-sm bg-white"
          />
          <Button size="sm" onClick={copyInviteLink}>Copy</Button>
        </div>
      )}

      {/* Real members */}
      <div className="grid gap-3 sm:grid-cols-2">
        {realMembers.map((m) => {
          const canEditRole = isOrganizer && m.role !== "organizer" && m.user_id !== currentUserId;
          const roleBadgeLabel =
            m.role === "organizer" ? "Organizer" :
            m.role === "activity_manager" ? "Activity manager" :
            "Participant";

          return (
            <Card key={m.id} className={m.user_id === currentUserId ? "border-blue-200 bg-blue-50/30" : ""}>
              <CardContent className="flex items-center gap-3 py-4">
                <Avatar>
                  <AvatarFallback className="bg-blue-100 text-blue-700 text-sm">
                    {memberInitials(m)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">
                    {displayName(m)}
                    {m.user_id === currentUserId && (
                      <span className="ml-1 text-gray-400 font-normal">(you)</span>
                    )}
                  </p>
                  {m.profile?.full_name && (
                    <p className="text-xs text-gray-400 truncate">{m.profile.email}</p>
                  )}
                </div>
                {canEditRole ? (
                  <select
                    value={m.role as Role}
                    onChange={(e) => updateMemberRole(m.id, e.target.value as "participant" | "activity_manager")}
                    className="text-xs border border-gray-200 rounded px-2 py-1 bg-white shrink-0 cursor-pointer focus:outline-none focus:ring-1 focus:ring-gray-300"
                  >
                    <option value="participant">Participant</option>
                    <option value="activity_manager">Activity manager</option>
                  </select>
                ) : (
                  <Badge
                    variant={m.role === "organizer" ? "default" : "secondary"}
                    className={`shrink-0 ${m.role === "activity_manager" ? "bg-blue-100 text-blue-700 border-blue-200 hover:bg-blue-100" : ""}`}
                  >
                    {roleBadgeLabel}
                  </Badge>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Guests */}
      {guests.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm font-medium text-gray-500 uppercase tracking-wide">
            Guests — not signed up yet ({guests.length})
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {guests.map((m) => (
              <Card key={m.id} className="border-dashed border-gray-300 bg-gray-50">
                <CardContent className="flex items-center gap-3 py-4">
                  <Avatar>
                    <AvatarFallback className="bg-gray-200 text-gray-500 text-sm">
                      {memberInitials(m)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-gray-700 truncate">{m.guest_name}</p>
                    {m.guest_email && (
                      <p className="text-xs text-gray-400 truncate">{m.guest_email}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="outline" className="text-gray-500 border-gray-300 text-xs">
                      pending
                    </Badge>
                    {isOrganizer && (
                      <button
                        onClick={() => removeGuest(m.id)}
                        className="text-xs text-red-400 hover:text-red-600"
                        title="Remove guest"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          <p className="text-xs text-gray-400">
            Guests can be assigned to rooms and activities now. Once they sign up and join via invite link, their account will be linked automatically.
          </p>
        </div>
      )}

      {/* Add guest dialog */}
      <Dialog open={showAddGuest} onOpenChange={setShowAddGuest}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add a guest</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Name *</Label>
              <Input
                placeholder="Alice Smith"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addGuest()}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label>Email <span className="text-gray-400 font-normal">(optional — needed to auto-link their account)</span></Label>
              <Input
                type="email"
                placeholder="alice@example.com"
                value={guestEmail}
                onChange={(e) => setGuestEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addGuest()}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddGuest(false)}>Cancel</Button>
            <Button onClick={addGuest} disabled={!guestName.trim() || addingGuest}>
              {addingGuest ? "Adding…" : "Add guest"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
