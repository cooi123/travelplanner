import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Nav } from "@/components/nav";
import { LinkButton } from "@/components/ui/link-button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

interface Props {
  params: Promise<{ tripId: string }>;
}

type AnyMember = {
  profile: { full_name: string | null; email: string | null } | null;
  guest_name?: string | null;
};

function memberName(m: AnyMember) {
  return m.profile?.full_name ?? m.profile?.email ?? m.guest_name ?? "Unknown";
}

function memberInitials(m: AnyMember) {
  const name = memberName(m);
  return name.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2);
}

type ActivityRow = {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  starts_at: string | null;
  ends_at: string | null;
  participants: Array<{ id: string; member_id: string; status: string; member?: AnyMember | null }>;
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

// Returns true if two activities have overlapping time ranges.
// Activities without times never trigger a parallel branch.
function timesOverlap(a: ActivityRow, b: ActivityRow): boolean {
  if (!a.starts_at || !b.starts_at) return false;
  const aStart = new Date(a.starts_at).getTime();
  // Use ends_at if present; otherwise assume 1 hour.
  const aEnd = a.ends_at ? new Date(a.ends_at).getTime() : aStart + 3_600_000;
  const bStart = new Date(b.starts_at).getTime();
  const bEnd = b.ends_at ? new Date(b.ends_at).getTime() : bStart + 3_600_000;
  return aStart < bEnd && bStart < aEnd;
}

// Groups sorted activities into sequential "slots".
// Activities in the same slot are concurrent (parallel branches).
function buildSlots(activities: ActivityRow[]): ActivityRow[][] {
  const slots: ActivityRow[][] = [];
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

export default async function TimelinePage({ params }: Props) {
  const { tripId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  const { data: trip } = await supabase.from("trips").select("*").eq("id", tripId).single();
  if (!trip) notFound();

  const { data: membership } = await supabase
    .from("trip_members").select("*").eq("trip_id", tripId).eq("user_id", user.id).single();
  if (!membership) notFound();

  const isOrganizer = membership.role === "organizer";

  const { data: allActivities } = await supabase
    .from("activities")
    .select(`
      *,
      participants:activity_participants(
        *,
        member:trip_members(*, profile:profiles(*))
      )
    `)
    .eq("trip_id", tripId)
    .order("starts_at", { nullsFirst: false });

  const activities: ActivityRow[] = isOrganizer
    ? (allActivities ?? [])
    : (allActivities ?? []).filter((a) =>
        a.participants.some(
          (p: { member_id: string; status: string }) =>
            p.member_id === membership.id && p.status === "confirmed"
        )
      );

  const { data: allAccoms } = await supabase
    .from("accommodations")
    .select(`
      *,
      assignments:accommodation_assignments(
        *,
        member:trip_members(*, profile:profiles(*))
      )
    `)
    .eq("trip_id", tripId);

  const accommodations: AccomRow[] = isOrganizer
    ? (allAccoms ?? [])
    : (allAccoms ?? []).filter((a) =>
        a.assignments.some((x: { member_id: string }) => x.member_id === membership.id)
      );

  const { data: allFlights } = await supabase
    .from("flights")
    .select(`
      *,
      assignments:flight_assignments(
        *,
        member:trip_members(*, profile:profiles(*))
      )
    `)
    .eq("trip_id", tripId)
    .order("departure_time", { ascending: true, nullsFirst: false });

  const flights: FlightRow[] = isOrganizer
    ? (allFlights ?? [])
    : (allFlights ?? []).filter((f) =>
        f.assignments.some((a: { member_id: string }) => a.member_id === membership.id)
      );

  // Build unified date groups
  type DateGroup = { sortKey: string; activities: ActivityRow[]; accomEvents: AccomEvent[]; flights: FlightRow[] };
  const dateGroups = new Map<string, DateGroup>();

  function getOrCreate(key: string, sortKey: string): DateGroup {
    if (!dateGroups.has(key)) dateGroups.set(key, { sortKey, activities: [], accomEvents: [], flights: [] });
    return dateGroups.get(key)!;
  }

  function fmtKey(date: Date) {
    return date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  }

  const undated: ActivityRow[] = [];
  const undatedFlights: FlightRow[] = [];

  for (const a of activities) {
    if (!a.starts_at) { undated.push(a); continue; }
    const d = new Date(a.starts_at);
    getOrCreate(fmtKey(d), a.starts_at).activities.push(a);
  }

  for (const a of accommodations) {
    if (a.check_in) {
      const d = new Date(a.check_in + "T12:00:00");
      getOrCreate(fmtKey(d), a.check_in + "T12:00:00").accomEvents.push({ type: "checkin", accom: a });
    }
    if (a.check_out) {
      const d = new Date(a.check_out + "T12:00:00");
      getOrCreate(fmtKey(d), a.check_out + "T12:00:00").accomEvents.push({ type: "checkout", accom: a });
    }
  }

  for (const f of flights) {
    if (!f.departure_time) { undatedFlights.push(f); continue; }
    const d = new Date(f.departure_time);
    getOrCreate(fmtKey(d), f.departure_time).flights.push(f);
  }

  const sortedGroups = [...dateGroups.entries()].sort(([, a], [, b]) =>
    a.sortKey.localeCompare(b.sortKey)
  );

  const hasAnything = sortedGroups.length > 0 || undated.length > 0 || undatedFlights.length > 0;

  return (
    <>
      <Nav userEmail={user.email ?? null} userName={profile?.full_name ?? null} />
      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
          <Link href="/dashboard" className="hover:underline">My trips</Link>
          <span>/</span>
          <Link href={`/trips/${tripId}`} className="hover:underline">{trip.name}</Link>
          <span>/</span>
          <span>Timeline</span>
        </div>
        <div className="mb-6 mt-2">
          <h1 className="text-2xl font-bold">Timeline</h1>
          {!isOrganizer && (
            <p className="text-sm text-gray-400 mt-1">Showing your confirmed activities and assigned accommodation.</p>
          )}
        </div>

        <nav className="flex gap-2 mb-8 flex-wrap">
          {[
            { label: "Members", href: `/trips/${tripId}` },
            { label: "Accommodation", href: `/trips/${tripId}/accommodations` },
            { label: "Activities", href: `/trips/${tripId}/activities` },
            { label: "Flights", href: `/trips/${tripId}/flights` },
            { label: "Timeline", href: `/trips/${tripId}/timeline` },
          ].map(({ label, href }) => (
            <LinkButton key={href} href={href} variant={href.endsWith("timeline") ? "default" : "outline"} size="sm">{label}</LinkButton>
          ))}
        </nav>

        <Separator className="mb-8" />

        {!hasAnything ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-lg">Nothing on your timeline yet.</p>
            <p className="text-sm mt-1">
              {isOrganizer
                ? "Add activities, accommodations, or flights to get started."
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

                    {/* Accommodation events (whole-day — rendered first) */}
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
                                      {memberInitials(x.member)}
                                    </AvatarFallback>
                                  </Avatar>
                                ))}
                              </div>
                              <div className="flex flex-wrap gap-1">
                                {e.accom.assignments.map((x) => x.member && (
                                  <span key={x.id} className="text-xs text-gray-500">{memberName(x.member)},</span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}

                    {/* Flights departing on this day */}
                    {group.flights.map((f) => (
                      <div key={f.id} className="relative">
                        <div className="absolute -left-[29px] top-1 h-3.5 w-3.5 rounded-full bg-sky-500 border-2 border-white ring-2 ring-sky-500" />
                        <FlightCard f={f} />
                      </div>
                    ))}

                    {/* Activity slots — single or parallel */}
                    {slots.map((slot, slotIdx) =>
                      slot.length === 1 ? (
                        // Single activity — full-width card
                        <SingleActivity key={slot[0].id} a={slot[0]} />
                      ) : (
                        // Parallel activities — branching side-by-side
                        <ParallelSlot key={`slot-${slotIdx}`} slot={slot} />
                      )
                    )}
                  </div>
                </div>
              );
            })}

            {(undated.length > 0 || undatedFlights.length > 0) && (
              <div>
                <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-widest mb-4">Date TBD</h2>
                <div className="space-y-3">
                  {undatedFlights.map((f) => <FlightCard key={f.id} f={f} />)}
                  {undated.map((a) => (
                    <div key={a.id} className="bg-white border rounded-lg px-4 py-3">
                      <p className="font-medium text-gray-700">{a.title}</p>
                      {a.location && <p className="text-xs text-gray-400 mt-0.5">📍 {a.location}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ActivityCard({ a, compact = false }: { a: ActivityRow; compact?: boolean }) {
  const confirmed = a.participants.filter((p) => p.status === "confirmed");
  return (
    <div className="bg-white border rounded-lg px-4 py-3 shadow-sm hover:shadow-md transition-shadow h-full">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-gray-900 truncate">{a.title}</p>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
            {a.starts_at && (
              <p className="text-xs text-gray-400">
                {new Date(a.starts_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                {a.ends_at && " – " + new Date(a.ends_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
              </p>
            )}
            {a.location && <p className="text-xs text-gray-400">📍 {a.location}</p>}
          </div>
          {!compact && a.description && <p className="text-sm text-gray-500 mt-1">{a.description}</p>}
        </div>
        <Badge variant="outline" className="shrink-0 text-xs">{confirmed.length} going</Badge>
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
    </div>
  );
}

function FlightCard({ f }: { f: FlightRow }) {
  function fmtTime(ts: string | null, tz?: string | null) {
    if (!ts) return null;
    return new Date(ts).toLocaleTimeString("en-US", {
      hour: "numeric", minute: "2-digit",
      timeZone: tz ?? undefined,
    });
  }

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
                <p className="text-xs text-gray-400">{fmtTime(f.departure_time, f.departure_timezone)}</p>
              )}
            </div>
            <div className="flex-1 border-t-2 border-dashed border-gray-200 mx-1" />
            <div className="text-center">
              <p className="font-semibold text-sm">{f.arrival_iata ?? "—"}</p>
              {f.arrival_time && (
                <p className="text-xs text-gray-400">{fmtTime(f.arrival_time, f.arrival_timezone)}</p>
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
                  {memberInitials(a.member)}
                </AvatarFallback>
              </Avatar>
            ))}
          </div>
          <div className="flex flex-wrap gap-1">
            {f.assignments.map((a) => a.member && (
              <span key={a.id} className="text-xs text-gray-500">{memberName(a.member)},</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SingleActivity({ a }: { a: ActivityRow }) {
  return (
    <div className="relative">
      <div className="absolute -left-[29px] top-1 h-3.5 w-3.5 rounded-full bg-blue-500 border-2 border-white ring-2 ring-blue-500" />
      <ActivityCard a={a} />
    </div>
  );
}

function ParallelSlot({ slot }: { slot: ActivityRow[] }) {
  const cols = Math.min(slot.length, 3);
  return (
    <div className="relative">
      {/* Timeline dot */}
      <div className="absolute -left-[29px] top-1 h-3.5 w-3.5 rounded-full bg-blue-500 border-2 border-white ring-2 ring-blue-500" />

      {/* Branch header */}
      <div className="flex items-center gap-2 mb-3">
        <div className="h-px flex-1 bg-gray-200" />
        <span className="text-[11px] font-medium text-gray-400 tracking-wide uppercase px-1 whitespace-nowrap">
          {slot.length} parallel activities
        </span>
        <div className="h-px flex-1 bg-gray-200" />
      </div>

      {/* Branch cards — each activity in its own column */}
      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      >
        {slot.map((a) => (
          <div key={a.id} className="flex flex-col">
            {/* Connector line from branch header to card */}
            <div className="flex justify-center mb-1">
              <div className="w-px h-3 bg-gray-200" />
            </div>
            <ActivityCard a={a} compact />
          </div>
        ))}
      </div>

      {/* Merge line below */}
      <div className="flex justify-center mt-1">
        <div className="w-px h-3 bg-gray-200" />
      </div>
    </div>
  );
}
