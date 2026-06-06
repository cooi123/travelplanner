"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import type { Accommodation, TripMember, Profile } from "@/types";

type MemberWithProfile = TripMember & {
  profile: Profile | null;
  guest_name: string | null;
  guest_email: string | null;
};
type Assignment = { id: string; accommodation_id: string; member_id: string; member?: MemberWithProfile };
type AccomWithAssignments = Accommodation & { assignments: Assignment[] };

interface Props {
  tripId: string;
  accommodations: AccomWithAssignments[];
  members: MemberWithProfile[];
  currentMemberId: string;
  isOrganizer: boolean;
}

function memberName(m: MemberWithProfile) {
  return m.profile?.full_name ?? m.profile?.email ?? m.guest_name ?? "Unknown";
}

function memberInitials(m: MemberWithProfile) {
  const name = memberName(m);
  return name.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2);
}

function fmtDate(d: string | null) {
  if (!d) return null;
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ---- Edit + Assign modal ---------------------------------------------------

interface AccomModalProps {
  accom: AccomWithAssignments;
  members: MemberWithProfile[];
  onClose: () => void;
  onSaved: () => void;
  onDelete: (id: string) => void;
}

function AccomModal({ accom, members, onClose, onSaved, onDelete }: AccomModalProps) {
  const router = useRouter();

  // Edit fields — seeded from current values
  const [name, setName] = useState(accom.name);
  const [type, setType] = useState(accom.type ?? "");
  const [address, setAddress] = useState(accom.address ?? "");
  const [checkIn, setCheckIn] = useState(accom.check_in ?? "");
  const [checkOut, setCheckOut] = useState(accom.check_out ?? "");
  const [capacity, setCapacity] = useState(String(accom.capacity));
  const [notes, setNotes] = useState(accom.notes ?? "");
  const [saving, setSaving] = useState(false);

  // Assignment state — start from current assignments
  const [assignedIds, setAssignedIds] = useState<Set<string>>(
    new Set(accom.assignments.map((a) => a.member_id))
  );
  const [assigning, setAssigning] = useState(false);

  async function handleSaveDetails() {
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("accommodations")
      .update({
        name,
        type: type || null,
        address: address || null,
        check_in: checkIn || null,
        check_out: checkOut || null,
        capacity: parseInt(capacity) || 1,
        notes: notes || null,
      })
      .eq("id", accom.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Saved");
    onSaved();
  }

  async function handleSaveAssignments() {
    setAssigning(true);
    const supabase = createClient();

    const originalIds = new Set(accom.assignments.map((a) => a.member_id));
    const toAdd = [...assignedIds].filter((id) => !originalIds.has(id));
    const toRemove = accom.assignments.filter((a) => !assignedIds.has(a.member_id));

    if (toAdd.length > 0) {
      const { error } = await supabase.from("accommodation_assignments").insert(
        toAdd.map((member_id) => ({ accommodation_id: accom.id, member_id }))
      );
      if (error) { toast.error(error.message); setAssigning(false); return; }
    }
    for (const a of toRemove) {
      const { error } = await supabase.from("accommodation_assignments").delete().eq("id", a.id);
      if (error) { toast.error(error.message); setAssigning(false); return; }
    }
    setAssigning(false);
    toast.success("Assignments updated");
    onSaved();
  }

  function toggleMember(id: string) {
    setAssignedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  const occupancy = assignedIds.size;
  const cap = parseInt(capacity) || accom.capacity;
  const overCapacity = occupancy > cap;

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{accom.name}</DialogTitle>
        </DialogHeader>

        {/* ---- Details section ---- */}
        <div className="space-y-3">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Details</p>
          <div className="space-y-2">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Type</Label>
              <Input placeholder="hotel / airbnb / tent" value={type} onChange={(e) => setType(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Capacity</Label>
              <Input type="number" min="1" value={capacity} onChange={(e) => setCapacity(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Address</Label>
            <Input placeholder="123 Beach Rd" value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Check-in</Label>
              <Input type="date" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Check-out</Label>
              <Input type="date" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Notes</Label>
            <Input placeholder="WiFi password, parking info…" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <div className="flex justify-end">
            <Button size="sm" onClick={handleSaveDetails} disabled={!name || saving}>
              {saving ? "Saving…" : "Save details"}
            </Button>
          </div>
        </div>

        <Separator />

        {/* ---- Member assignment section ---- */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Members</p>
            <span className={`text-xs font-medium ${overCapacity ? "text-red-500" : "text-gray-400"}`}>
              {occupancy}/{cap} assigned{overCapacity ? " — over capacity" : ""}
            </span>
          </div>

          <div className="space-y-1 max-h-56 overflow-y-auto pr-1">
            {members.map((m) => {
              const checked = assignedIds.has(m.id);
              return (
                <label
                  key={m.id}
                  className="flex items-center gap-3 rounded-lg px-3 py-2 cursor-pointer hover:bg-gray-50 transition-colors"
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() => toggleMember(m.id)}
                  />
                  <Avatar className="h-7 w-7 shrink-0">
                    <AvatarFallback className={`text-xs ${checked ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                      {memberInitials(m)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-sm font-medium flex-1 truncate">{memberName(m)}</span>
                  {checked && (
                    <Badge variant="outline" className="text-green-700 border-green-200 text-xs shrink-0">
                      assigned
                    </Badge>
                  )}
                </label>
              );
            })}
          </div>

          {overCapacity && (
            <p className="text-xs text-red-500 bg-red-50 rounded px-3 py-2">
              You&apos;ve assigned more people than the capacity allows. Increase the capacity or uncheck some members.
            </p>
          )}
        </div>

        <DialogFooter className="gap-2 flex-row items-center justify-between">
          <Button
            variant="ghost"
            className="text-red-500 hover:text-red-700 text-sm mr-auto"
            onClick={() => onDelete(accom.id)}
          >
            Delete room
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Close</Button>
            <Button onClick={handleSaveAssignments} disabled={assigning || overCapacity}>
              {assigning ? "Saving…" : "Save assignments"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---- Main client -----------------------------------------------------------

export function AccommodationsClient({ tripId, accommodations: initial, members, currentMemberId, isOrganizer }: Props) {
  const router = useRouter();
  const [accoms, setAccoms] = useState(initial);

  // Sync local state when the server re-fetches after router.refresh().
  useEffect(() => { setAccoms(initial); }, [initial]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [addLoading, setAddLoading] = useState(false);

  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState("");
  const [newAddress, setNewAddress] = useState("");
  const [newCheckIn, setNewCheckIn] = useState("");
  const [newCheckOut, setNewCheckOut] = useState("");
  const [newCapacity, setNewCapacity] = useState("2");
  const [newNotes, setNewNotes] = useState("");

  async function handleAdd() {
    setAddLoading(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("accommodations")
      .insert({
        trip_id: tripId,
        name: newName,
        type: newType || null,
        address: newAddress || null,
        check_in: newCheckIn || null,
        check_out: newCheckOut || null,
        capacity: parseInt(newCapacity) || 1,
        notes: newNotes || null,
      })
      .select()
      .single();
    if (error) { toast.error(error.message); setAddLoading(false); return; }
    setAccoms([...accoms, { ...data, assignments: [] }]);
    setShowAdd(false);
    setNewName(""); setNewType(""); setNewAddress(""); setNewCheckIn(""); setNewCheckOut(""); setNewCapacity("2"); setNewNotes("");
    setAddLoading(false);
    toast.success("Accommodation added");
  }

  async function deleteAccom(id: string) {
    const supabase = createClient();
    const { error } = await supabase.from("accommodations").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    setAccoms(accoms.filter((a) => a.id !== id));
    toast.success("Deleted");
  }

  function handleSaved() {
    router.refresh();
  }

  // Participant view
  if (!isOrganizer) {
    const myAccoms = accoms.filter((a) => a.assignments.some((x) => x.member_id === currentMemberId));
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Your accommodation</h2>
        {myAccoms.length === 0 && (
          <p className="text-gray-500 text-sm">The organizer hasn&apos;t assigned you to a room yet.</p>
        )}
        {myAccoms.map((myAccom) => (
          <Card key={myAccom.id} className="border-blue-200 bg-blue-50/30">
            <CardContent className="pt-4 space-y-3">
              <div>
                <p className="font-semibold text-gray-900">{myAccom.name}</p>
                {myAccom.type && <p className="text-xs text-gray-400 capitalize">{myAccom.type}</p>}
              </div>
              {myAccom.address && <p className="text-sm text-gray-600">📍 {myAccom.address}</p>}
              {(myAccom.check_in || myAccom.check_out) && (
                <p className="text-sm text-gray-600">
                  🗓 {fmtDate(myAccom.check_in)}{myAccom.check_in && myAccom.check_out && " – "}{fmtDate(myAccom.check_out)}
                </p>
              )}
              {myAccom.notes && <p className="text-sm text-gray-500">{myAccom.notes}</p>}
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">Sharing with:</p>
                <div className="flex flex-wrap gap-2">
                  {myAccom.assignments.filter((a) => a.member_id !== currentMemberId).map((a) => a.member && (
                    <div key={a.id} className="flex items-center gap-1.5">
                      <Avatar className="h-6 w-6">
                        <AvatarFallback className="text-xs bg-blue-100 text-blue-700">
                          {memberInitials(a.member)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm">{memberName(a.member)}</span>
                    </div>
                  ))}
                  {myAccom.assignments.filter((a) => a.member_id !== currentMemberId).length === 0 && (
                    <p className="text-sm text-gray-400">Just you</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  // Organizer view
  const unassignedMembers = members.filter(
    (m) => !accoms.some((a) => a.assignments.some((x) => x.member_id === m.id))
  );

  const editingAccom = accoms.find((a) => a.id === editingId) ?? null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">
          All accommodations <span className="text-gray-400 font-normal text-base">({accoms.length})</span>
        </h2>
        <Button onClick={() => setShowAdd(true)}>+ Add accommodation</Button>
      </div>

      {unassignedMembers.length > 0 && (
        <div className="p-4 rounded-lg bg-amber-50 border border-amber-200">
          <p className="text-sm font-medium text-amber-800">
            {unassignedMembers.length} member{unassignedMembers.length > 1 ? "s" : ""} not yet assigned to any room:
          </p>
          <div className="flex flex-wrap gap-1 mt-2">
            {unassignedMembers.map((m) => (
              <Badge key={m.id} variant="outline" className="text-amber-700 border-amber-300">
                {memberName(m)}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {accoms.length === 0 && (
        <p className="text-gray-400 text-sm text-center py-8">No accommodations yet. Add one above.</p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {accoms.map((a) => {
          const occupancy = a.assignments.length;
          const isFull = occupancy >= a.capacity;

          return (
            <Card
              key={a.id}
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => setEditingId(a.id)}
            >
              <CardContent className="pt-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-gray-900">{a.name}</p>
                    {a.type && <p className="text-xs text-gray-400 capitalize">{a.type}</p>}
                  </div>
                  <Badge variant={isFull ? "secondary" : "outline"}>
                    {occupancy}/{a.capacity}
                  </Badge>
                </div>

                {a.address && <p className="text-xs text-gray-500">📍 {a.address}</p>}
                {(a.check_in || a.check_out) && (
                  <p className="text-xs text-gray-400">
                    🗓 {fmtDate(a.check_in)}{a.check_in && a.check_out && " – "}{fmtDate(a.check_out)}
                  </p>
                )}

                {/* Avatar stack of assigned members */}
                {a.assignments.length > 0 ? (
                  <div className="flex items-center gap-2 pt-1">
                    <div className="flex -space-x-2">
                      {a.assignments.slice(0, 6).map((x) => x.member && (
                        <Avatar key={x.id} className="h-7 w-7 border-2 border-white">
                          <AvatarFallback className="text-xs bg-green-100 text-green-700">
                            {memberInitials(x.member)}
                          </AvatarFallback>
                        </Avatar>
                      ))}
                    </div>
                    <span className="text-xs text-gray-500">
                      {a.assignments.map((x) => x.member ? memberName(x.member) : "").filter(Boolean).join(", ")}
                    </span>
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 italic">No one assigned yet — click to assign</p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Edit / assign modal */}
      {editingAccom && (
        <AccomModal
          accom={editingAccom}
          members={members}
          onClose={() => setEditingId(null)}
          onSaved={() => { setEditingId(null); handleSaved(); }}
          onDelete={(id) => { deleteAccom(id); setEditingId(null); }}
        />
      )}

      {/* Add accommodation dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add accommodation</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Name *</Label>
              <Input placeholder="Room A / Beach House / Tent 3" value={newName} onChange={(e) => setNewName(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Type</Label>
                <Input placeholder="hotel / airbnb / tent" value={newType} onChange={(e) => setNewType(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Capacity</Label>
                <Input type="number" min="1" value={newCapacity} onChange={(e) => setNewCapacity(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Address</Label>
              <Input placeholder="123 Beach Rd" value={newAddress} onChange={(e) => setNewAddress(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Check-in</Label>
                <Input type="date" value={newCheckIn} onChange={(e) => setNewCheckIn(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Check-out</Label>
                <Input type="date" value={newCheckOut} onChange={(e) => setNewCheckOut(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Input placeholder="WiFi password, parking info…" value={newNotes} onChange={(e) => setNewNotes(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button onClick={handleAdd} disabled={!newName || addLoading}>
              {addLoading ? "Adding…" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
