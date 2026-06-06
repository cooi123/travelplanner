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
import type { Activity, ActivityParticipant, TripMember, Profile } from "@/types";

export type MemberWithProfile = TripMember & {
  profile: Profile | null;
  guest_name: string | null;
  guest_email: string | null;
};
export type ParticipantFull = Omit<ActivityParticipant, "member"> & { member: MemberWithProfile };
export type ActivityFull = Omit<Activity, "participants"> & { participants: ParticipantFull[] };

interface Props {
  tripId: string;
  activities: ActivityFull[];
  members: MemberWithProfile[];
  currentMemberId: string;
  isOrganizer: boolean;
}

export function memberName(m: MemberWithProfile) {
  return m.profile?.full_name ?? m.profile?.email ?? m.guest_name ?? "Unknown";
}

export function memberInitials(m: MemberWithProfile) {
  const name = memberName(m);
  return name.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2);
}

// ---- Timezone helpers -------------------------------------------------------

const TIMEZONES = [
  { value: "Pacific/Honolulu",       label: "Hawaii (UTC−10)" },
  { value: "America/Anchorage",      label: "Alaska (UTC−9)" },
  { value: "America/Los_Angeles",    label: "Pacific — Los Angeles (UTC−8/−7)" },
  { value: "America/Denver",         label: "Mountain — Denver (UTC−7/−6)" },
  { value: "America/Chicago",        label: "Central — Chicago (UTC−6/−5)" },
  { value: "America/New_York",       label: "Eastern — New York (UTC−5/−4)" },
  { value: "America/Sao_Paulo",      label: "Brazil — São Paulo (UTC−3)" },
  { value: "America/Buenos_Aires",   label: "Argentina — Buenos Aires (UTC−3)" },
  { value: "UTC",                    label: "UTC (UTC±0)" },
  { value: "Europe/London",          label: "UK — London (UTC±0/+1)" },
  { value: "Europe/Paris",           label: "Central Europe — Paris / Berlin / Rome (UTC+1/+2)" },
  { value: "Europe/Athens",          label: "Eastern Europe — Athens (UTC+2/+3)" },
  { value: "Europe/Moscow",          label: "Russia — Moscow (UTC+3)" },
  { value: "Asia/Dubai",             label: "UAE — Dubai (UTC+4)" },
  { value: "Asia/Karachi",           label: "Pakistan — Karachi (UTC+5)" },
  { value: "Asia/Kolkata",           label: "India — Kolkata (UTC+5:30)" },
  { value: "Asia/Dhaka",             label: "Bangladesh — Dhaka (UTC+6)" },
  { value: "Asia/Bangkok",           label: "Thailand — Bangkok (UTC+7)" },
  { value: "Asia/Singapore",         label: "Singapore / Hong Kong (UTC+8)" },
  { value: "Asia/Seoul",             label: "South Korea — Seoul (UTC+9)" },
  { value: "Asia/Tokyo",             label: "Japan — Tokyo (UTC+9)" },
  { value: "Australia/Sydney",       label: "Australia — Sydney (UTC+10/+11)" },
  { value: "Pacific/Auckland",       label: "New Zealand — Auckland (UTC+12/+13)" },
];

// Convert a UTC ISO string to "YYYY-MM-DDTHH:mm" in the given timezone (for datetime-local input).
function utcToLocal(utcStr: string | null, tz: string): string {
  if (!utcStr) return "";
  const d = new Date(utcStr);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  const h = get("hour") === "24" ? "00" : get("hour");
  return `${get("year")}-${get("month")}-${get("day")}T${h}:${get("minute")}`;
}

// Convert a "YYYY-MM-DDTHH:mm" local time string + IANA timezone to a UTC ISO string.
function localToUTC(localStr: string, tz: string): string | null {
  if (!localStr) return null;
  // Treat localStr as UTC to get a base Date, then compute the TZ offset at that moment.
  const d = new Date(localStr + ":00Z");
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  const h = get("hour") === "24" ? "00" : get("hour");
  const tzDate = new Date(
    `${get("year")}-${get("month")}-${get("day")}T${h}:${get("minute")}:${get("second")}Z`
  );
  // diff = tz clock shown - UTC; subtract to find actual UTC for the given local time.
  return new Date(d.getTime() - (tzDate.getTime() - d.getTime())).toISOString();
}

function fmtDateTime(dt: string | null, tz?: string | null) {
  if (!dt) return null;
  const opts: Intl.DateTimeFormatOptions = {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  };
  if (tz) opts.timeZone = tz;
  const result = new Date(dt).toLocaleString("en-US", opts);
  if (tz) {
    const tzAbbr = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "short" })
      .formatToParts(new Date(dt)).find((p) => p.type === "timeZoneName")?.value ?? "";
    return `${result} ${tzAbbr}`;
  }
  return result;
}

function fmtTime(dt: string | null, tz?: string | null) {
  if (!dt) return null;
  const opts: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };
  if (tz) opts.timeZone = tz;
  return new Date(dt).toLocaleTimeString("en-US", opts);
}

// ---- Timezone select --------------------------------------------------------

function TimezoneSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm focus:outline-none focus:border-ring focus:ring-2 focus:ring-ring/50"
    >
      <option value="">— select timezone —</option>
      {TIMEZONES.map((tz) => (
        <option key={tz.value} value={tz.value}>{tz.label}</option>
      ))}
    </select>
  );
}

// ---- Edit + Assign modal ---------------------------------------------------

export interface ActivityModalProps {
  activity: ActivityFull;
  members: MemberWithProfile[];
  currentMemberId: string;
  isOrganizer: boolean;
  onClose: () => void;
  onSaved: () => void;
  onDelete: (id: string) => void;
}

export function ActivityModal({ activity, members, currentMemberId, isOrganizer, onClose, onSaved, onDelete }: ActivityModalProps) {
  const [title, setTitle] = useState(activity.title);
  const [description, setDescription] = useState(activity.description ?? "");
  const [location, setLocation] = useState(activity.location ?? "");
  const [timezone, setTimezone] = useState(
    activity.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone
  );
  const [startsAt, setStartsAt] = useState(() =>
    activity.starts_at
      ? utcToLocal(activity.starts_at, activity.timezone ?? "UTC")
      : ""
  );
  const [endsAt, setEndsAt] = useState(() =>
    activity.ends_at
      ? utcToLocal(activity.ends_at, activity.timezone ?? "UTC")
      : ""
  );
  const [capacity, setCapacity] = useState(activity.capacity ? String(activity.capacity) : "");
  const [saving, setSaving] = useState(false);

  const confirmedIds = new Set(
    activity.participants.filter((p) => p.status === "confirmed").map((p) => p.member_id)
  );
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set(confirmedIds));
  const [assigning, setAssigning] = useState(false);

  async function handleSaveDetails() {
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase.from("activities").update({
      title,
      description: description || null,
      location: location || null,
      timezone: timezone || null,
      starts_at: timezone ? localToUTC(startsAt, timezone) : (startsAt || null),
      ends_at: timezone ? localToUTC(endsAt, timezone) : (endsAt || null),
      capacity: capacity ? parseInt(capacity) : null,
    }).eq("id", activity.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Saved");
    onSaved();
  }

  async function handleSaveParticipants() {
    setAssigning(true);
    const supabase = createClient();

    const toAdd = [...checkedIds].filter((id) => !confirmedIds.has(id));
    const toRemove = activity.participants.filter(
      (p) => p.status === "confirmed" && !checkedIds.has(p.member_id)
    );

    if (toAdd.length > 0) {
      const { error } = await supabase.from("activity_participants").insert(
        toAdd.map((member_id) => ({ activity_id: activity.id, member_id, status: "confirmed" }))
      );
      if (error) { toast.error(error.message); setAssigning(false); return; }
    }
    for (const p of toRemove) {
      const { error } = await supabase.from("activity_participants").delete().eq("id", p.id);
      if (error) { toast.error(error.message); setAssigning(false); return; }
    }

    setAssigning(false);
    toast.success("Participants updated");
    onSaved();
  }

  async function toggleMyInterest() {
    const supabase = createClient();
    const existing = activity.participants.find((p) => p.member_id === currentMemberId);
    if (existing) {
      const { error } = await supabase.from("activity_participants").delete().eq("id", existing.id);
      if (error) { toast.error(error.message); return; }
      toast.success("Removed");
    } else {
      const { error } = await supabase.from("activity_participants").insert({
        activity_id: activity.id, member_id: currentMemberId, status: "interested",
      });
      if (error) { toast.error(error.message); return; }
      toast.success("Interest noted!");
    }
    onSaved();
  }

  function toggle(id: string) {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const myParticipant = activity.participants.find((p) => p.member_id === currentMemberId);
  const interested = activity.participants.filter((p) => p.status === "interested");

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{activity.title}</DialogTitle>
        </DialogHeader>

        {/* ---- Participant self-action (non-organizer) ---- */}
        {!isOrganizer && (
          <div className="flex items-center justify-between rounded-lg border px-4 py-3 bg-gray-50">
            <div>
              <p className="text-sm font-medium">
                {myParticipant
                  ? myParticipant.status === "confirmed" ? "You're going ✓"
                  : myParticipant.status === "interested" ? "You're interested ★"
                  : "You declined"
                  : "Are you joining?"}
              </p>
              {myParticipant?.status === "interested" && (
                <p className="text-xs text-gray-400">Waiting for organizer to confirm</p>
              )}
            </div>
            <Button
              size="sm"
              variant={myParticipant ? "secondary" : "outline"}
              onClick={toggleMyInterest}
            >
              {myParticipant ? "Remove" : "I'm interested"}
            </Button>
          </div>
        )}

        {/* ---- Details section (organizer only) ---- */}
        {isOrganizer && (
          <>
            <div className="space-y-3">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Details</p>
              <div className="space-y-2">
                <Label>Title</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Input placeholder="Optional details" value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Location</Label>
                <Input placeholder="Meeting point or venue" value={location} onChange={(e) => setLocation(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Activity timezone</Label>
                <TimezoneSelect value={timezone} onChange={setTimezone} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Starts at <span className="text-xs text-gray-400 font-normal">(local time)</span></Label>
                  <Input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Ends at <span className="text-xs text-gray-400 font-normal">(local time)</span></Label>
                  <Input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Max capacity</Label>
                <Input type="number" min="1" placeholder="Unlimited" value={capacity} onChange={(e) => setCapacity(e.target.value)} />
              </div>
              <div className="flex justify-end">
                <Button size="sm" onClick={handleSaveDetails} disabled={!title || saving}>
                  {saving ? "Saving…" : "Save details"}
                </Button>
              </div>
            </div>

            <Separator />

            {/* ---- Participant assignment ---- */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Participants</p>
                <span className="text-xs text-gray-400">{checkedIds.size} confirmed</span>
              </div>

              {interested.length > 0 && (
                <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 space-y-2">
                  <p className="text-xs font-medium text-amber-700">
                    Interested ({interested.length}) — check to confirm
                  </p>
                  {interested.map((p) => p.member && (
                    <div key={p.id} className="flex items-center gap-2">
                      <Avatar className="h-6 w-6">
                        <AvatarFallback className="text-xs bg-yellow-100 text-yellow-700">
                          {memberInitials(p.member)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm flex-1">{memberName(p.member)}</span>
                      <Badge variant="outline" className="text-amber-700 border-amber-200 text-xs">
                        interested
                      </Badge>
                    </div>
                  ))}
                </div>
              )}

              <div className="space-y-1 max-h-56 overflow-y-auto pr-1">
                {members.map((m) => {
                  const checked = checkedIds.has(m.id);
                  const isInterested = activity.participants.some(
                    (p) => p.member_id === m.id && p.status === "interested"
                  );

                  return (
                    <label
                      key={m.id}
                      className="flex items-center gap-3 rounded-lg px-3 py-2 cursor-pointer hover:bg-gray-50 transition-colors"
                    >
                      <Checkbox checked={checked} onCheckedChange={() => toggle(m.id)} />
                      <Avatar className="h-7 w-7 shrink-0">
                        <AvatarFallback className={`text-xs ${checked ? "bg-green-100 text-green-700" : isInterested ? "bg-yellow-100 text-yellow-700" : "bg-gray-100 text-gray-500"}`}>
                          {memberInitials(m)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm font-medium flex-1 truncate">{memberName(m)}</span>
                      {checked && (
                        <Badge variant="outline" className="text-green-700 border-green-200 text-xs shrink-0">confirmed</Badge>
                      )}
                      {!checked && isInterested && (
                        <Badge variant="outline" className="text-amber-700 border-amber-200 text-xs shrink-0">interested</Badge>
                      )}
                    </label>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {/* ---- Read-only participant list (non-organizer) ---- */}
        {!isOrganizer && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
              Who&apos;s going ({activity.participants.filter((p) => p.status === "confirmed").length})
            </p>
            <div className="flex flex-wrap gap-2">
              {activity.participants
                .filter((p) => p.status === "confirmed")
                .map((p) => p.member && (
                  <div key={p.id} className="flex items-center gap-1.5">
                    <Avatar className="h-7 w-7">
                      <AvatarFallback className="text-xs bg-green-100 text-green-700">
                        {memberInitials(p.member)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-sm">{memberName(p.member)}</span>
                  </div>
                ))}
              {activity.participants.filter((p) => p.status === "confirmed").length === 0 && (
                <p className="text-sm text-gray-400">No one confirmed yet</p>
              )}
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 flex-row items-center justify-between">
          {isOrganizer ? (
            <>
              <Button
                variant="ghost"
                className="text-red-500 hover:text-red-700 text-sm mr-auto"
                onClick={() => onDelete(activity.id)}
              >
                Delete activity
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={onClose}>Close</Button>
                <Button onClick={handleSaveParticipants} disabled={assigning}>
                  {assigning ? "Saving…" : "Save participants"}
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

// ---- Main client -----------------------------------------------------------

export function ActivitiesClient({ tripId, activities: initial, members, currentMemberId, isOrganizer }: Props) {
  const router = useRouter();
  const [activities, setActivities] = useState(initial);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [addLoading, setAddLoading] = useState(false);

  useEffect(() => { setActivities(initial); }, [initial]);

  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newLocation, setNewLocation] = useState("");
  const [newTimezone, setNewTimezone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [newStartsAt, setNewStartsAt] = useState("");
  const [newEndsAt, setNewEndsAt] = useState("");
  const [newCapacity, setNewCapacity] = useState("");

  async function handleAdd() {
    setAddLoading(true);
    const supabase = createClient();
    const { error } = await supabase.from("activities").insert({
      trip_id: tripId,
      title: newTitle,
      description: newDesc || null,
      location: newLocation || null,
      timezone: newTimezone || null,
      starts_at: newTimezone ? localToUTC(newStartsAt, newTimezone) : (newStartsAt || null),
      ends_at: newTimezone ? localToUTC(newEndsAt, newTimezone) : (newEndsAt || null),
      capacity: newCapacity ? parseInt(newCapacity) : null,
    });
    if (error) { toast.error(error.message); setAddLoading(false); return; }
    setShowAdd(false);
    setNewTitle(""); setNewDesc(""); setNewLocation(""); setNewStartsAt(""); setNewEndsAt(""); setNewCapacity("");
    setNewTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone);
    setAddLoading(false);
    toast.success("Activity added");
    router.refresh();
  }

  async function deleteActivity(id: string) {
    const supabase = createClient();
    const { error } = await supabase.from("activities").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    setActivities((prev) => prev.filter((a) => a.id !== id));
    toast.success("Deleted");
  }

  async function toggleInterest(activityId: string, myParticipant: ParticipantFull | undefined) {
    const supabase = createClient();
    if (myParticipant) {
      await supabase.from("activity_participants").delete().eq("id", myParticipant.id);
      toast.success("Removed");
    } else {
      await supabase.from("activity_participants").insert({
        activity_id: activityId, member_id: currentMemberId, status: "interested",
      });
      toast.success("Interest noted!");
    }
    router.refresh();
  }

  const editingActivity = activities.find((a) => a.id === editingId) ?? null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">
          Activities <span className="text-gray-400 font-normal text-base">({activities.length})</span>
        </h2>
        {isOrganizer && (
          <Button onClick={() => setShowAdd(true)}>+ Add activity</Button>
        )}
      </div>

      {activities.length === 0 && (
        <p className="text-gray-400 text-sm text-center py-8">
          {isOrganizer ? "No activities yet. Add the first one above." : "No activities planned yet."}
        </p>
      )}

      <div className="space-y-3">
        {activities.map((a) => {
          const myParticipant = a.participants.find((p) => p.member_id === currentMemberId);
          const confirmed = a.participants.filter((p) => p.status === "confirmed");
          const interested = a.participants.filter((p) => p.status === "interested");

          return (
            <Card
              key={a.id}
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => setEditingId(a.id)}
            >
              <CardContent className="pt-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <p className="font-semibold text-gray-900">{a.title}</p>
                    <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1">
                      {a.location && <p className="text-xs text-gray-400">📍 {a.location}</p>}
                      {a.starts_at && (
                        <p className="text-xs text-gray-400">
                          🕒 {fmtDateTime(a.starts_at, a.timezone)}
                          {a.ends_at && " – " + fmtTime(a.ends_at, a.timezone)}
                        </p>
                      )}
                      {a.capacity && <p className="text-xs text-gray-400">👥 Max {a.capacity}</p>}
                    </div>
                    {a.description && <p className="text-sm text-gray-500 mt-1">{a.description}</p>}
                  </div>

                  {!isOrganizer && (
                    <Button
                      size="sm"
                      variant={myParticipant ? "secondary" : "outline"}
                      onClick={(e) => { e.stopPropagation(); toggleInterest(a.id, myParticipant); }}
                    >
                      {myParticipant
                        ? myParticipant.status === "confirmed" ? "✓ Confirmed"
                        : myParticipant.status === "interested" ? "★ Interested"
                        : "Declined"
                        : "I'm interested"}
                    </Button>
                  )}
                </div>

                {confirmed.length > 0 ? (
                  <div className="flex items-center gap-2">
                    <div className="flex -space-x-2">
                      {confirmed.slice(0, 6).map((p) => p.member && (
                        <Avatar key={p.id} className="h-7 w-7 border-2 border-white">
                          <AvatarFallback className="text-xs bg-green-100 text-green-700">
                            {memberInitials(p.member)}
                          </AvatarFallback>
                        </Avatar>
                      ))}
                    </div>
                    <span className="text-xs text-gray-500">
                      {confirmed.map((p) => p.member ? memberName(p.member) : "").filter(Boolean).join(", ")}
                    </span>
                    {interested.length > 0 && isOrganizer && (
                      <Badge variant="outline" className="text-amber-700 border-amber-200 text-xs ml-auto">
                        {interested.length} interested
                      </Badge>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 italic">
                    {isOrganizer ? "No one assigned — click to add participants" : "No one confirmed yet"}
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {editingActivity && (
        <ActivityModal
          activity={editingActivity}
          members={members}
          currentMemberId={currentMemberId}
          isOrganizer={isOrganizer}
          onClose={() => setEditingId(null)}
          onSaved={() => { setEditingId(null); router.refresh(); }}
          onDelete={(id) => { deleteActivity(id); setEditingId(null); }}
        />
      )}

      {/* Add activity dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add activity</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Title *</Label>
              <Input placeholder="Sunset hike / Dinner at Nobu" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input placeholder="Optional details" value={newDesc} onChange={(e) => setNewDesc(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Location</Label>
              <Input placeholder="Meeting point or venue" value={newLocation} onChange={(e) => setNewLocation(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Activity timezone</Label>
              <TimezoneSelect value={newTimezone} onChange={setNewTimezone} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Starts at <span className="text-xs text-gray-400 font-normal">(local)</span></Label>
                <Input type="datetime-local" value={newStartsAt} onChange={(e) => setNewStartsAt(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Ends at <span className="text-xs text-gray-400 font-normal">(local)</span></Label>
                <Input type="datetime-local" value={newEndsAt} onChange={(e) => setNewEndsAt(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Max capacity</Label>
              <Input type="number" min="1" placeholder="Leave blank for unlimited" value={newCapacity} onChange={(e) => setNewCapacity(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button onClick={handleAdd} disabled={!newTitle || addLoading}>
              {addLoading ? "Adding…" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
