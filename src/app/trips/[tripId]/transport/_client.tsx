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
import type { Transport, TransportAssignment, TripMember, Profile } from "@/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MemberWithProfile = TripMember & { profile: Profile | null };
type AssignmentWithMember = TransportAssignment & { member?: MemberWithProfile };
export type TransportWithAssignments = Transport & { assignments: AssignmentWithMember[] };

interface Props {
  tripId: string;
  transports: TransportWithAssignments[];
  members: MemberWithProfile[];
  currentMemberId: string;
  isOrganizer: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const TRANSPORT_TYPES = [
  { value: "bus",        label: "Bus",         icon: "🚌" },
  { value: "train",      label: "Train",        icon: "🚂" },
  { value: "ferry",      label: "Ferry",        icon: "⛴️" },
  { value: "shuttle",    label: "Shuttle",      icon: "🚐" },
  { value: "car_rental", label: "Car rental",   icon: "🚗" },
  { value: "rideshare",  label: "Rideshare",    icon: "🚕" },
  { value: "taxi",       label: "Taxi",         icon: "🚖" },
  { value: "other",      label: "Other",        icon: "🚏" },
] as const;

export function transportMeta(type: string) {
  return TRANSPORT_TYPES.find((t) => t.value === type) ?? { value: "other", label: "Other", icon: "🚏" };
}

// ---------------------------------------------------------------------------
// Timezone helpers (same as flights/_client.tsx)
// ---------------------------------------------------------------------------

const TIMEZONES = [
  { label: "— select timezone —", value: "" },
  { label: "Pacific/Honolulu (UTC−10)", value: "Pacific/Honolulu" },
  { label: "America/Anchorage (UTC−9)", value: "America/Anchorage" },
  { label: "America/Los_Angeles (UTC−8/−7)", value: "America/Los_Angeles" },
  { label: "America/Phoenix (UTC−7, no DST)", value: "America/Phoenix" },
  { label: "America/Denver (UTC−7/−6)", value: "America/Denver" },
  { label: "America/Chicago (UTC−6/−5)", value: "America/Chicago" },
  { label: "America/New_York (UTC−5/−4)", value: "America/New_York" },
  { label: "America/Sao_Paulo (UTC−3/−2)", value: "America/Sao_Paulo" },
  { label: "America/Argentina/Buenos_Aires (UTC−3)", value: "America/Argentina/Buenos_Aires" },
  { label: "Atlantic/Reykjavik (UTC+0)", value: "Atlantic/Reykjavik" },
  { label: "Europe/London (UTC+0/+1)", value: "Europe/London" },
  { label: "Europe/Paris (UTC+1/+2)", value: "Europe/Paris" },
  { label: "Europe/Berlin (UTC+1/+2)", value: "Europe/Berlin" },
  { label: "Europe/Athens (UTC+2/+3)", value: "Europe/Athens" },
  { label: "Europe/Istanbul (UTC+3)", value: "Europe/Istanbul" },
  { label: "Europe/Moscow (UTC+3)", value: "Europe/Moscow" },
  { label: "Africa/Cairo (UTC+2/+3)", value: "Africa/Cairo" },
  { label: "Africa/Nairobi (UTC+3)", value: "Africa/Nairobi" },
  { label: "Asia/Dubai (UTC+4)", value: "Asia/Dubai" },
  { label: "Asia/Karachi (UTC+5)", value: "Asia/Karachi" },
  { label: "Asia/Kolkata (UTC+5:30)", value: "Asia/Kolkata" },
  { label: "Asia/Bangkok (UTC+7)", value: "Asia/Bangkok" },
  { label: "Asia/Singapore (UTC+8)", value: "Asia/Singapore" },
  { label: "Asia/Tokyo (UTC+9)", value: "Asia/Tokyo" },
  { label: "Asia/Seoul (UTC+9)", value: "Asia/Seoul" },
  { label: "Australia/Sydney (UTC+10/+11)", value: "Australia/Sydney" },
  { label: "Pacific/Auckland (UTC+12/+13)", value: "Pacific/Auckland" },
  { label: "UTC", value: "UTC" },
];

function toTzInputValue(isoString: string, timezone?: string | null): string {
  const d = new Date(isoString);
  if (timezone) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hour12: false,
    }).formatToParts(d);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
    const hour = get("hour") === "24" ? "00" : get("hour");
    return `${get("year")}-${get("month")}-${get("day")}T${hour}:${get("minute")}`;
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function tzInputToISO(localValue: string, timezone?: string | null): string {
  if (!localValue) return localValue;
  if (!timezone) return new Date(localValue).toISOString();
  const asUTC = new Date(localValue + ":00Z");
  const utcStr = asUTC.toLocaleString("en-US", { timeZone: "UTC" });
  const tzStr = asUTC.toLocaleString("en-US", { timeZone: timezone });
  const offsetMs = new Date(utcStr).getTime() - new Date(tzStr).getTime();
  return new Date(asUTC.getTime() + offsetMs).toISOString();
}

export function fmtTransportTime(ts: string | null, tz?: string | null) {
  if (!ts) return null;
  return new Date(ts).toLocaleString("en-US", {
    month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit",
    timeZone: tz ?? undefined,
  });
}

function TimezoneSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring text-foreground"
    >
      {TIMEZONES.map((tz) => (
        <option key={tz.value} value={tz.value}>{tz.label}</option>
      ))}
    </select>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function memberName(m: MemberWithProfile) {
  return m.profile?.full_name ?? m.profile?.email ?? m.guest_name ?? "Unknown";
}

function memberInitials(m: MemberWithProfile) {
  return memberName(m).split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------

export interface TransportModalProps {
  transport: TransportWithAssignments;
  members: MemberWithProfile[];
  isOrganizer: boolean;
  onClose: () => void;
  onSaved: () => void;
  onDelete: (id: string) => void;
}

export function TransportModal({ transport, members, isOrganizer, onClose, onSaved, onDelete }: TransportModalProps) {
  const [type, setType] = useState(transport.type);
  const [operator, setOperator] = useState(transport.operator ?? "");
  const [fromLocation, setFromLocation] = useState(transport.from_location ?? "");
  const [toLocation, setToLocation] = useState(transport.to_location ?? "");
  const [departsTimezone, setDepartsTimezone] = useState(transport.departs_timezone ?? "");
  const [departsAt, setDepartsAt] = useState(
    transport.departs_at ? toTzInputValue(transport.departs_at, transport.departs_timezone) : ""
  );
  const [arrivesTimezone, setArrivesTimezone] = useState(transport.arrives_timezone ?? "");
  const [arrivesAt, setArrivesAt] = useState(
    transport.arrives_at ? toTzInputValue(transport.arrives_at, transport.arrives_timezone) : ""
  );
  const [bookingRef, setBookingRef] = useState(transport.booking_ref ?? "");
  const [notes, setNotes] = useState(transport.notes ?? "");
  const [saving, setSaving] = useState(false);

  const [assignedIds, setAssignedIds] = useState<Set<string>>(
    new Set(transport.assignments.map((a) => a.member_id))
  );
  const [assigning, setAssigning] = useState(false);

  async function handleSaveDetails() {
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase.from("transports").update({
      type,
      operator: operator || null,
      from_location: fromLocation || null,
      to_location: toLocation || null,
      departs_timezone: departsTimezone || null,
      departs_at: departsAt ? tzInputToISO(departsAt, departsTimezone) : null,
      arrives_timezone: arrivesTimezone || null,
      arrives_at: arrivesAt ? tzInputToISO(arrivesAt, arrivesTimezone) : null,
      booking_ref: bookingRef || null,
      notes: notes || null,
    }).eq("id", transport.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Saved");
    onSaved();
  }

  async function handleSaveAssignments() {
    setAssigning(true);
    const supabase = createClient();
    const originalIds = new Set(transport.assignments.map((a) => a.member_id));
    const toAdd = [...assignedIds].filter((id) => !originalIds.has(id));
    const toRemove = transport.assignments.filter((a) => !assignedIds.has(a.member_id));

    if (toAdd.length > 0) {
      const { error } = await supabase.from("transport_assignments").insert(
        toAdd.map((member_id) => ({ transport_id: transport.id, member_id }))
      );
      if (error) { toast.error(error.message); setAssigning(false); return; }
    }
    for (const a of toRemove) {
      const { error } = await supabase.from("transport_assignments").delete().eq("id", a.id);
      if (error) { toast.error(error.message); setAssigning(false); return; }
    }
    setAssigning(false);
    toast.success("Passengers updated");
    onSaved();
  }

  function toggleMember(id: string) {
    setAssignedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const meta = transportMeta(type);

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{meta.icon} {operator || meta.label}</DialogTitle>
        </DialogHeader>

        {!isOrganizer ? (
          // Read-only view for participants
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Type</p>
                <p>{meta.icon} {meta.label}</p>
              </div>
              {operator && (
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Operator</p>
                  <p>{operator}</p>
                </div>
              )}
              {fromLocation && (
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">From</p>
                  <p>{fromLocation}</p>
                </div>
              )}
              {toLocation && (
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">To</p>
                  <p>{toLocation}</p>
                </div>
              )}
              {transport.departs_at && (
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Departs</p>
                  <p>{fmtTransportTime(transport.departs_at, transport.departs_timezone)}</p>
                </div>
              )}
              {transport.arrives_at && (
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Arrives</p>
                  <p>{fmtTransportTime(transport.arrives_at, transport.arrives_timezone)}</p>
                </div>
              )}
              {bookingRef && (
                <div className="col-span-2">
                  <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Booking ref</p>
                  <p className="font-mono">{bookingRef}</p>
                </div>
              )}
              {notes && (
                <div className="col-span-2">
                  <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Notes</p>
                  <p>{notes}</p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <>
            {/* Details form */}
            <div className="space-y-3">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Details</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Type</Label>
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value)}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                  >
                    {TRANSPORT_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>{t.icon} {t.label}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Operator / company</Label>
                  <Input placeholder="Greyhound, Amtrak…" value={operator} onChange={(e) => setOperator(e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>From</Label>
                  <Input placeholder="Pickup / departure" value={fromLocation} onChange={(e) => setFromLocation(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>To</Label>
                  <Input placeholder="Drop-off / arrival" value={toLocation} onChange={(e) => setToLocation(e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Departs <span className="text-gray-400 font-normal">(local time)</span></Label>
                  <Input type="datetime-local" value={departsAt} onChange={(e) => setDepartsAt(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Dep. timezone</Label>
                  <TimezoneSelect value={departsTimezone} onChange={setDepartsTimezone} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Arrives <span className="text-gray-400 font-normal">(optional)</span></Label>
                  <Input type="datetime-local" value={arrivesAt} onChange={(e) => setArrivesAt(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Arr. timezone</Label>
                  <TimezoneSelect value={arrivesTimezone} onChange={setArrivesTimezone} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Booking ref</Label>
                  <Input placeholder="Optional" value={bookingRef} onChange={(e) => setBookingRef(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Input placeholder="Platform, meeting point…" value={notes} onChange={(e) => setNotes(e.target.value)} />
                </div>
              </div>
              <div className="flex justify-end">
                <Button size="sm" onClick={handleSaveDetails} disabled={saving}>
                  {saving ? "Saving…" : "Save details"}
                </Button>
              </div>
            </div>

            <Separator />

            {/* Passenger assignment */}
            <div className="space-y-3">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Passengers</p>
              <div className="space-y-1 max-h-56 overflow-y-auto pr-1">
                {members.map((m) => {
                  const checked = assignedIds.has(m.id);
                  return (
                    <label
                      key={m.id}
                      className="flex items-center gap-3 rounded-lg px-3 py-2 cursor-pointer hover:bg-gray-50 transition-colors"
                    >
                      <Checkbox checked={checked} onCheckedChange={() => toggleMember(m.id)} />
                      <Avatar className="h-7 w-7 shrink-0">
                        <AvatarFallback className={`text-xs ${checked ? "bg-orange-100 text-orange-700" : "bg-gray-100 text-gray-500"}`}>
                          {memberInitials(m)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm font-medium flex-1 truncate">{memberName(m)}</span>
                      {checked && (
                        <Badge variant="outline" className="text-orange-700 border-orange-200 text-xs shrink-0">on board</Badge>
                      )}
                    </label>
                  );
                })}
              </div>
            </div>
          </>
        )}

        <DialogFooter className="gap-2 flex-row items-center justify-between">
          {isOrganizer ? (
            <>
              <Button
                variant="ghost"
                className="text-red-500 hover:text-red-700 text-sm mr-auto"
                onClick={() => onDelete(transport.id)}
              >
                Delete
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={onClose}>Close</Button>
                <Button onClick={handleSaveAssignments} disabled={assigning}>
                  {assigning ? "Saving…" : "Save passengers"}
                </Button>
              </div>
            </>
          ) : (
            <Button variant="outline" onClick={onClose} className="ml-auto">Close</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Transport card (list view)
// ---------------------------------------------------------------------------

function TransportCard({ t, onClick }: { t: TransportWithAssignments; onClick: () => void }) {
  const meta = transportMeta(t.type);
  return (
    <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={onClick}>
      <CardContent className="pt-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-lg">{meta.icon}</span>
              <span className="font-semibold text-gray-900">
                {t.operator || meta.label}
              </span>
              <Badge variant="secondary" className="text-xs capitalize">{meta.label}</Badge>
            </div>
            {(t.from_location || t.to_location) && (
              <div className="flex items-center gap-2 mt-1.5">
                {t.from_location && <span className="text-sm text-gray-600">{t.from_location}</span>}
                {t.from_location && t.to_location && <span className="text-gray-300">→</span>}
                {t.to_location && <span className="text-sm text-gray-600">{t.to_location}</span>}
              </div>
            )}
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
              {t.departs_at && (
                <p className="text-xs text-gray-400">
                  Dep: {fmtTransportTime(t.departs_at, t.departs_timezone)}
                </p>
              )}
              {t.arrives_at && (
                <p className="text-xs text-gray-400">
                  Arr: {fmtTransportTime(t.arrives_at, t.arrives_timezone)}
                </p>
              )}
              {t.booking_ref && (
                <p className="text-xs text-gray-400 font-mono">Ref: {t.booking_ref}</p>
              )}
            </div>
          </div>
          {t.assignments.length > 0 && (
            <Badge variant="outline" className="shrink-0 text-xs text-orange-700 border-orange-200">
              {t.assignments.length} on board
            </Badge>
          )}
        </div>

        {t.assignments.length > 0 && (
          <div className="flex items-center gap-1.5 pt-1">
            <div className="flex -space-x-2">
              {t.assignments.slice(0, 6).map((a) => a.member && (
                <Avatar key={a.id} className="h-6 w-6 border-2 border-white">
                  <AvatarFallback className="text-xs bg-orange-100 text-orange-700">
                    {memberInitials(a.member)}
                  </AvatarFallback>
                </Avatar>
              ))}
            </div>
            <span className="text-xs text-gray-500 truncate">
              {t.assignments.map((a) => a.member ? memberName(a.member) : "").filter(Boolean).join(", ")}
            </span>
          </div>
        )}
        {t.assignments.length === 0 && (
          <p className="text-xs text-gray-400 italic">No passengers assigned — click to assign</p>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main client
// ---------------------------------------------------------------------------

export function TransportClient({ tripId, transports: initial, members, currentMemberId, isOrganizer }: Props) {
  const router = useRouter();
  const [transports, setTransports] = useState(initial);
  useEffect(() => { setTransports(initial); }, [initial]);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [addLoading, setAddLoading] = useState(false);

  // Add form state
  const [newType, setNewType] = useState("bus");
  const [newOperator, setNewOperator] = useState("");
  const [newFrom, setNewFrom] = useState("");
  const [newTo, setNewTo] = useState("");
  const [newDepartsAt, setNewDepartsAt] = useState("");
  const [newDepartsTimezone, setNewDepartsTimezone] = useState("");
  const [newArrivesAt, setNewArrivesAt] = useState("");
  const [newArrivesTimezone, setNewArrivesTimezone] = useState("");
  const [newBookingRef, setNewBookingRef] = useState("");
  const [newNotes, setNewNotes] = useState("");

  function resetForm() {
    setNewType("bus"); setNewOperator(""); setNewFrom(""); setNewTo("");
    setNewDepartsAt(""); setNewDepartsTimezone(""); setNewArrivesAt(""); setNewArrivesTimezone("");
    setNewBookingRef(""); setNewNotes("");
  }

  async function handleAdd() {
    setAddLoading(true);
    const supabase = createClient();
    const { data, error } = await supabase.from("transports").insert({
      trip_id: tripId,
      type: newType,
      operator: newOperator || null,
      from_location: newFrom || null,
      to_location: newTo || null,
      departs_at: newDepartsAt ? tzInputToISO(newDepartsAt, newDepartsTimezone) : null,
      departs_timezone: newDepartsTimezone || null,
      arrives_at: newArrivesAt ? tzInputToISO(newArrivesAt, newArrivesTimezone) : null,
      arrives_timezone: newArrivesTimezone || null,
      booking_ref: newBookingRef || null,
      notes: newNotes || null,
    }).select().single();
    setAddLoading(false);
    if (error) { toast.error(error.message); return; }
    setTransports([...transports, { ...data, assignments: [] }]);
    setShowAdd(false);
    resetForm();
    toast.success("Transport added");
  }

  async function deleteTransport(id: string) {
    const supabase = createClient();
    const { error } = await supabase.from("transports").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    setTransports(transports.filter((t) => t.id !== id));
    toast.success("Deleted");
  }

  // Participant view — show only assigned transports
  if (!isOrganizer) {
    const mine = transports.filter((t) => t.assignments.some((a) => a.member_id === currentMemberId));
    const editingT = mine.find((t) => t.id === editingId) ?? null;
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Your transport</h2>
        {mine.length === 0 && (
          <p className="text-gray-500 text-sm">The organizer hasn&apos;t assigned you to a transport yet.</p>
        )}
        {mine.map((t) => <TransportCard key={t.id} t={t} onClick={() => setEditingId(t.id)} />)}
        {editingT && (
          <TransportModal
            transport={editingT}
            members={members}
            isOrganizer={false}
            onClose={() => setEditingId(null)}
            onSaved={() => { setEditingId(null); router.refresh(); }}
            onDelete={() => {}}
          />
        )}
      </div>
    );
  }

  // Organizer view
  const editingTransport = transports.find((t) => t.id === editingId) ?? null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">
          Transport <span className="text-gray-400 font-normal text-base">({transports.length})</span>
        </h2>
        <Button onClick={() => setShowAdd(true)}>+ Add transport</Button>
      </div>

      {transports.length === 0 && (
        <p className="text-gray-400 text-sm text-center py-8">
          No transport yet. Add buses, trains, ferries, rideshares and more.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {transports.map((t) => (
          <TransportCard key={t.id} t={t} onClick={() => setEditingId(t.id)} />
        ))}
      </div>

      {editingTransport && (
        <TransportModal
          transport={editingTransport}
          members={members}
          isOrganizer={isOrganizer}
          onClose={() => setEditingId(null)}
          onSaved={() => { setEditingId(null); router.refresh(); }}
          onDelete={(id) => { deleteTransport(id); setEditingId(null); }}
        />
      )}

      {/* Add transport dialog */}
      <Dialog open={showAdd} onOpenChange={(open) => { if (!open) { setShowAdd(false); resetForm(); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Add transport</DialogTitle></DialogHeader>

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Type *</Label>
                <select
                  value={newType}
                  onChange={(e) => setNewType(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                >
                  {TRANSPORT_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.icon} {t.label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Operator / company</Label>
                <Input placeholder="Greyhound, Amtrak…" value={newOperator} onChange={(e) => setNewOperator(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>From</Label>
                <Input placeholder="Pickup / departure" value={newFrom} onChange={(e) => setNewFrom(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>To</Label>
                <Input placeholder="Drop-off / arrival" value={newTo} onChange={(e) => setNewTo(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Departs <span className="text-gray-400 font-normal">(local time)</span></Label>
                <Input type="datetime-local" value={newDepartsAt} onChange={(e) => setNewDepartsAt(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Dep. timezone</Label>
                <TimezoneSelect value={newDepartsTimezone} onChange={setNewDepartsTimezone} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Arrives <span className="text-gray-400 font-normal">(optional)</span></Label>
                <Input type="datetime-local" value={newArrivesAt} onChange={(e) => setNewArrivesAt(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Arr. timezone</Label>
                <TimezoneSelect value={newArrivesTimezone} onChange={setNewArrivesTimezone} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Booking ref</Label>
                <Input placeholder="Optional" value={newBookingRef} onChange={(e) => setNewBookingRef(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Input placeholder="Platform, meeting point…" value={newNotes} onChange={(e) => setNewNotes(e.target.value)} />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowAdd(false); resetForm(); }}>Cancel</Button>
            <Button onClick={handleAdd} disabled={addLoading}>
              {addLoading ? "Adding…" : "Add transport"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
