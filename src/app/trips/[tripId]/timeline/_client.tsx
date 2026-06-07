"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { toast } from "sonner";
import {
  ActivityModal,
  type ActivityFull,
  type MemberWithProfile,
  memberName,
  memberInitials,
} from "../activities/_client";
import {
  TransportModal,
  transportMeta,
  type TransportWithAssignments,
} from "../transport/_client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AnyMember = {
  profile: { full_name: string | null; email: string | null } | null;
  guest_name?: string | null;
};

type AccomRow = {
  id: string;
  name: string;
  type: string | null;
  address: string | null;
  check_in: string | null;
  check_out: string | null;
  notes: string | null;
  capacity: number;
  assignments: Array<{ id: string; member_id: string; member?: AnyMember | null }>;
};

type AccomEvent = { type: "checkin" | "checkout"; accom: AccomRow };

type FlightRow = {
  id: string;
  flight_iata: string;
  airline_name: string | null;
  departure_airport: string | null;
  departure_iata: string | null;
  departure_time: string | null;
  departure_timezone: string | null;
  arrival_airport: string | null;
  arrival_iata: string | null;
  arrival_time: string | null;
  arrival_timezone: string | null;
  flight_status: string | null;
  assignments: Array<{ id: string; member_id: string; member?: AnyMember | null }>;
};

type DateGroup = {
  sortKey: string;
  activities: ActivityFull[];
  accomEvents: AccomEvent[];
  flights: FlightRow[];
  transports: TransportWithAssignments[];
};

export interface TimelineClientProps {
  tripId: string;
  sortedGroups: [string, DateGroup][];
  undated: ActivityFull[];
  undatedFlights: FlightRow[];
  undatedTransports: TransportWithAssignments[];
  members: MemberWithProfile[];
  currentMemberId: string;
  isOrganizer: boolean;
  canManageActivities: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function anyMemberName(m: AnyMember): string {
  return m.profile?.full_name ?? m.profile?.email ?? m.guest_name ?? "Unknown";
}

function anyMemberInitials(m: AnyMember): string {
  const name = anyMemberName(m);
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

// Always display in the stored IANA timezone (UTC fallback), never browser locale.
// Appends the short timezone abbreviation so the reader knows which zone it is.
function fmtTzTime(ts: string | null, tz: string | null | undefined): string | null {
  if (!ts) return null;
  const d = new Date(ts);
  const iana = tz || "UTC";
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: iana });
  const abbr = new Intl.DateTimeFormat("en-US", { timeZone: iana, timeZoneName: "short" })
    .formatToParts(d).find((p) => p.type === "timeZoneName")?.value ?? "";
  return abbr ? `${time} ${abbr}` : time;
}

function timesOverlap(a: ActivityFull, b: ActivityFull): boolean {
  if (!a.starts_at || !b.starts_at) return false;
  const aStart = new Date(a.starts_at).getTime();
  const aEnd = a.ends_at ? new Date(a.ends_at).getTime() : aStart + 3_600_000;
  const bStart = new Date(b.starts_at).getTime();
  const bEnd = b.ends_at ? new Date(b.ends_at).getTime() : bStart + 3_600_000;
  return aStart < bEnd && bStart < aEnd;
}

function buildSlots(activities: ActivityFull[]): ActivityFull[][] {
  const slots: ActivityFull[][] = [];
  for (const a of activities) {
    const last = slots[slots.length - 1];
    if (last && last.some((b) => timesOverlap(a, b))) {
      last.push(a);
    } else {
      slots.push([a]);
    }
  }
  return slots;
}

// ---------------------------------------------------------------------------
// Activity card
// ---------------------------------------------------------------------------

function ActivityCard({
  a,
  compact = false,
  canManage,
  onClick,
}: {
  a: ActivityFull;
  compact?: boolean;
  canManage: boolean;
  onClick: () => void;
}) {
  const confirmed = a.participants.filter((p) => p.status === "confirmed");
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left bg-white border rounded-lg px-4 py-3 shadow-sm hover:shadow-md hover:border-blue-300 active:scale-[0.98] transition-all duration-150 cursor-pointer h-full"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-gray-900 truncate">{a.title}</p>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
            {a.starts_at && (
              <p className="text-xs text-gray-400">
                {fmtTzTime(a.starts_at, a.timezone)}
                {a.ends_at && " – " + fmtTzTime(a.ends_at, a.timezone)}
              </p>
            )}
            {a.location && <p className="text-xs text-gray-400">📍 {a.location}</p>}
          </div>
          {!compact && a.description && (
            <p className="text-sm text-gray-500 mt-1">{a.description}</p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <Badge variant="outline" className="text-xs">{confirmed.length} going</Badge>
          {canManage && <span className="text-[10px] text-blue-400 font-medium">tap to edit</span>}
        </div>
      </div>

      {confirmed.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2 items-center">
          <div className="flex -space-x-2">
            {confirmed.slice(0, 8).map((p) => p.member && (
              <Avatar key={p.id} className="h-7 w-7 border-2 border-white">
                <AvatarFallback className="text-xs bg-blue-100 text-blue-700">
                  {memberInitials(p.member)}
                </AvatarFallback>
              </Avatar>
            ))}
          </div>
          <div className="flex flex-wrap gap-1">
            {confirmed.map((p) => p.member && (
              <span key={p.id} className="text-xs text-gray-500">{memberName(p.member)},</span>
            ))}
          </div>
        </div>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Flight card
// ---------------------------------------------------------------------------

function FlightCard({ f }: { f: FlightRow }) {
  return (
    <div className="bg-white border rounded-lg px-4 py-3 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono font-bold text-gray-900">✈ {f.flight_iata}</span>
            {f.flight_status && (
              <Badge variant="outline" className="text-xs capitalize text-sky-700 border-sky-200">
                {f.flight_status}
              </Badge>
            )}
          </div>
          {f.airline_name && <p className="text-xs text-gray-400 mt-0.5">{f.airline_name}</p>}
          <div className="flex items-center gap-2 mt-2">
            <div className="text-center">
              <p className="font-semibold text-sm">{f.departure_iata ?? "—"}</p>
              {f.departure_time && (
                <p className="text-xs text-gray-400">{fmtTzTime(f.departure_time, f.departure_timezone)}</p>
              )}
            </div>
            <div className="flex-1 border-t-2 border-dashed border-gray-200 mx-1" />
            <div className="text-center">
              <p className="font-semibold text-sm">{f.arrival_iata ?? "—"}</p>
              {f.arrival_time && (
                <p className="text-xs text-gray-400">{fmtTzTime(f.arrival_time, f.arrival_timezone)}</p>
              )}
            </div>
          </div>
        </div>
        <Badge variant="outline" className="shrink-0 text-xs text-sky-700 border-sky-200">
          {f.assignments.length} pax
        </Badge>
      </div>
      {f.assignments.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2 items-center">
          <div className="flex -space-x-2">
            {f.assignments.slice(0, 8).map((a) => a.member && (
              <Avatar key={a.id} className="h-7 w-7 border-2 border-white">
                <AvatarFallback className="text-xs bg-sky-100 text-sky-700">
                  {anyMemberInitials(a.member)}
                </AvatarFallback>
              </Avatar>
            ))}
          </div>
          <div className="flex flex-wrap gap-1">
            {f.assignments.map((a) => a.member && (
              <span key={a.id} className="text-xs text-gray-500">{anyMemberName(a.member)},</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Transport card
// ---------------------------------------------------------------------------

function TransportCard({
  t,
  canManage,
  onClick,
}: {
  t: TransportWithAssignments;
  canManage: boolean;
  onClick: () => void;
}) {
  const meta = transportMeta(t.type);

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left bg-white border rounded-lg px-4 py-3 shadow-sm hover:shadow-md hover:border-orange-300 active:scale-[0.98] transition-all duration-150 cursor-pointer"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span>{meta.icon}</span>
            <span className="font-semibold text-gray-900">
              {t.operator || meta.label}
            </span>
            {t.operator && (
              <Badge variant="secondary" className="text-xs capitalize">{meta.label}</Badge>
            )}
          </div>

          {(t.from_location || t.to_location) && (
            <div className="flex items-center gap-1.5 mt-1">
              {t.from_location && <span className="text-sm text-gray-600">{t.from_location}</span>}
              {t.from_location && t.to_location && <span className="text-gray-300 text-xs">→</span>}
              {t.to_location && <span className="text-sm text-gray-600">{t.to_location}</span>}
            </div>
          )}

          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
            {t.departs_at && (
              <p className="text-xs text-gray-400">
                Dep: {fmtTzTime(t.departs_at, t.departs_timezone)}
              </p>
            )}
            {t.arrives_at && (
              <p className="text-xs text-gray-400">
                Arr: {fmtTzTime(t.arrives_at, t.arrives_timezone)}
              </p>
            )}
            {t.booking_ref && (
              <p className="text-xs text-gray-400 font-mono">Ref: {t.booking_ref}</p>
            )}
          </div>
        </div>

        <div className="flex flex-col items-end gap-1 shrink-0">
          <Badge variant="outline" className="text-xs text-orange-700 border-orange-200">
            {t.assignments.length} on board
          </Badge>
          {canManage && <span className="text-[10px] text-orange-400 font-medium">tap to edit</span>}
        </div>
      </div>

      {t.assignments.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2 items-center">
          <div className="flex -space-x-2">
            {t.assignments.slice(0, 8).map((a) => a.member && (
              <Avatar key={a.id} className="h-7 w-7 border-2 border-white">
                <AvatarFallback className="text-xs bg-orange-100 text-orange-700">
                  {anyMemberInitials(a.member as AnyMember)}
                </AvatarFallback>
              </Avatar>
            ))}
          </div>
          <div className="flex flex-wrap gap-1">
            {t.assignments.map((a) => a.member && (
              <span key={a.id} className="text-xs text-gray-500">
                {anyMemberName(a.member as AnyMember)},
              </span>
            ))}
          </div>
        </div>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Activity slot wrappers
// ---------------------------------------------------------------------------

function SingleActivity({
  a,
  canManage,
  onClick,
}: {
  a: ActivityFull;
  canManage: boolean;
  onClick: () => void;
}) {
  return (
    <div className="relative">
      <div className="absolute -left-[29px] top-1 h-3.5 w-3.5 rounded-full bg-blue-500 border-2 border-white ring-2 ring-blue-500" />
      <ActivityCard a={a} canManage={canManage} onClick={onClick} />
    </div>
  );
}

function ParallelSlot({
  slot,
  canManage,
  onActivityClick,
}: {
  slot: ActivityFull[];
  canManage: boolean;
  onActivityClick: (id: string) => void;
}) {
  const cols = Math.min(slot.length, 3);
  return (
    <div className="relative">
      <div className="absolute -left-[29px] top-1 h-3.5 w-3.5 rounded-full bg-blue-500 border-2 border-white ring-2 ring-blue-500" />
      <div className="flex items-center gap-2 mb-3">
        <div className="h-px flex-1 bg-gray-200" />
        <span className="text-[11px] font-medium text-gray-400 tracking-wide uppercase px-1 whitespace-nowrap">
          {slot.length} parallel activities
        </span>
        <div className="h-px flex-1 bg-gray-200" />
      </div>
      <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {slot.map((a) => (
          <div key={a.id} className="flex flex-col">
            <div className="flex justify-center mb-1">
              <div className="w-px h-3 bg-gray-200" />
            </div>
            <ActivityCard a={a} compact canManage={canManage} onClick={() => onActivityClick(a.id)} />
          </div>
        ))}
      </div>
      <div className="flex justify-center mt-1">
        <div className="w-px h-3 bg-gray-200" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main client
// ---------------------------------------------------------------------------

export function TimelineClient({
  sortedGroups,
  undated,
  undatedFlights,
  undatedTransports,
  members,
  currentMemberId,
  canManageActivities,
}: TimelineClientProps) {
  const router = useRouter();

  const [editingActivityId, setEditingActivityId] = useState<string | null>(null);
  const [editingTransportId, setEditingTransportId] = useState<string | null>(null);

  const allActivities = [...sortedGroups.flatMap(([, g]) => g.activities), ...undated];
  const allTransports = [...sortedGroups.flatMap(([, g]) => g.transports), ...undatedTransports];

  const editingActivity = allActivities.find((a) => a.id === editingActivityId) ?? null;
  const editingTransport = allTransports.find((t) => t.id === editingTransportId) ?? null;

  async function deleteActivity(id: string) {
    const supabase = createClient();
    const { error } = await supabase.from("activities").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Deleted");
    router.refresh();
  }

  async function deleteTransport(id: string) {
    const supabase = createClient();
    const { error } = await supabase.from("transports").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Deleted");
    router.refresh();
  }

  const hasAnything =
    sortedGroups.length > 0 ||
    undated.length > 0 ||
    undatedFlights.length > 0 ||
    undatedTransports.length > 0;

  return (
    <>
      {!hasAnything ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-lg">Nothing on your timeline yet.</p>
          <p className="text-sm mt-1">
            {canManageActivities
              ? "Add activities, accommodations, flights, or transport to get started."
              : "Express interest in activities and the organizer will confirm you."}
          </p>
        </div>
      ) : (
        <div className="space-y-10">
          {sortedGroups.map(([date, group]) => {
            const slots = buildSlots(group.activities);
            return (
              <div key={date}>
                <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-widest mb-4">{date}</h2>
                <div className="relative pl-6 border-l-2 border-gray-200 space-y-6">

                  {/* Accommodation check-in / check-out */}
                  {group.accomEvents.map((e) => (
                    <div key={`${e.accom.id}-${e.type}`} className="relative">
                      <div className={`absolute -left-[29px] top-1 h-3.5 w-3.5 rounded-full border-2 border-white ring-2 ${
                        e.type === "checkin" ? "bg-green-500 ring-green-500" : "bg-amber-500 ring-amber-500"
                      }`} />
                      <div className="bg-white border rounded-lg px-4 py-3 shadow-sm hover:shadow-md transition-shadow">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-semibold text-gray-900">
                              {e.type === "checkin" ? "🏨 Check-in" : "🏨 Check-out"}: {e.accom.name}
                            </p>
                            <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                              {e.accom.type && <p className="text-xs text-gray-400 capitalize">{e.accom.type}</p>}
                              {e.accom.address && <p className="text-xs text-gray-400">📍 {e.accom.address}</p>}
                            </div>
                            {e.accom.notes && <p className="text-sm text-gray-500 mt-1">{e.accom.notes}</p>}
                          </div>
                          <Badge
                            variant="outline"
                            className={`shrink-0 text-xs ${e.type === "checkin" ? "text-green-700 border-green-200" : "text-amber-700 border-amber-200"}`}
                          >
                            {e.type === "checkin" ? "Check-in" : "Check-out"}
                          </Badge>
                        </div>
                        {e.accom.assignments.length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-2 items-center">
                            <div className="flex -space-x-2">
                              {e.accom.assignments.slice(0, 8).map((x) => x.member && (
                                <Avatar key={x.id} className="h-7 w-7 border-2 border-white">
                                  <AvatarFallback className="text-xs bg-green-100 text-green-700">
                                    {anyMemberInitials(x.member)}
                                  </AvatarFallback>
                                </Avatar>
                              ))}
                            </div>
                            <div className="flex flex-wrap gap-1">
                              {e.accom.assignments.map((x) => x.member && (
                                <span key={x.id} className="text-xs text-gray-500">{anyMemberName(x.member)},</span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}

                  {/* Flights */}
                  {group.flights.map((f) => (
                    <div key={f.id} className="relative">
                      <div className="absolute -left-[29px] top-1 h-3.5 w-3.5 rounded-full bg-sky-500 border-2 border-white ring-2 ring-sky-500" />
                      <FlightCard f={f} />
                    </div>
                  ))}

                  {/* Transport */}
                  {group.transports.map((t) => (
                    <div key={t.id} className="relative">
                      <div className="absolute -left-[29px] top-1 h-3.5 w-3.5 rounded-full bg-orange-500 border-2 border-white ring-2 ring-orange-500" />
                      <TransportCard
                        t={t}
                        canManage={canManageActivities}
                        onClick={() => setEditingTransportId(t.id)}
                      />
                    </div>
                  ))}

                  {/* Activity slots */}
                  {slots.map((slot, slotIdx) =>
                    slot.length === 1 ? (
                      <SingleActivity
                        key={slot[0].id}
                        a={slot[0]}
                        canManage={canManageActivities}
                        onClick={() => setEditingActivityId(slot[0].id)}
                      />
                    ) : (
                      <ParallelSlot
                        key={`slot-${slotIdx}`}
                        slot={slot}
                        canManage={canManageActivities}
                        onActivityClick={setEditingActivityId}
                      />
                    )
                  )}
                </div>
              </div>
            );
          })}

          {/* Undated items */}
          {(undated.length > 0 || undatedFlights.length > 0 || undatedTransports.length > 0) && (
            <div>
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-widest mb-4">Date TBD</h2>
              <div className="space-y-3">
                {undatedFlights.map((f) => <FlightCard key={f.id} f={f} />)}
                {undatedTransports.map((t) => (
                  <TransportCard
                    key={t.id}
                    t={t}
                    canManage={canManageActivities}
                    onClick={() => setEditingTransportId(t.id)}
                  />
                ))}
                {undated.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => setEditingActivityId(a.id)}
                    className="w-full text-left bg-white border rounded-lg px-4 py-3 hover:shadow-md hover:border-blue-300 active:scale-[0.98] transition-all duration-150"
                  >
                    <p className="font-medium text-gray-700">{a.title}</p>
                    {a.location && <p className="text-xs text-gray-400 mt-0.5">📍 {a.location}</p>}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Activity edit modal */}
      {editingActivity && (
        <ActivityModal
          activity={editingActivity}
          members={members}
          currentMemberId={currentMemberId}
          isOrganizer={canManageActivities}
          onClose={() => setEditingActivityId(null)}
          onSaved={() => { setEditingActivityId(null); router.refresh(); }}
          onDelete={(id) => { deleteActivity(id); setEditingActivityId(null); }}
        />
      )}

      {/* Transport edit modal */}
      {editingTransport && (
        <TransportModal
          transport={editingTransport}
          members={members as Parameters<typeof TransportModal>[0]["members"]}
          isOrganizer={canManageActivities}
          onClose={() => setEditingTransportId(null)}
          onSaved={() => { setEditingTransportId(null); router.refresh(); }}
          onDelete={(id) => { deleteTransport(id); setEditingTransportId(null); }}
        />
      )}
    </>
  );
}
