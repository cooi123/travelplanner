import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Nav } from "@/components/nav";
import { LinkButton } from "@/components/ui/link-button";
import { Separator } from "@/components/ui/separator";
import { TimelineClient } from "./_client";
import type { ActivityFull, MemberWithProfile } from "../activities/_client";

interface Props {
  params: Promise<{ tripId: string }>;
}

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
};

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
  const canManageActivities = membership.role === "organizer" || membership.role === "activity_manager";

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

  const activities: ActivityFull[] = (canManageActivities
    ? (allActivities ?? [])
    : (allActivities ?? []).filter((a) =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (a.participants as any[]).some(
          (p: { member_id: string; status: string }) =>
            p.member_id === membership.id && p.status === "confirmed"
        )
      )
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ) as any[];

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

  const accommodations: AccomRow[] = (canManageActivities
    ? (allAccoms ?? [])
    : (allAccoms ?? []).filter((a) =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (a.assignments as any[]).some((x: { member_id: string }) => x.member_id === membership.id)
      )
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ) as any[];

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

  const flights: FlightRow[] = (canManageActivities
    ? (allFlights ?? [])
    : (allFlights ?? []).filter((f) =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (f.assignments as any[]).some((a: { member_id: string }) => a.member_id === membership.id)
      )
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ) as any[];

  const { data: membersData } = await supabase
    .from("trip_members")
    .select("*, profile:profiles(*)")
    .eq("trip_id", tripId);

  const members = (membersData ?? []) as unknown as MemberWithProfile[];

  // Build unified date groups
  const dateGroups = new Map<string, DateGroup>();

  function getOrCreate(key: string, sortKey: string): DateGroup {
    if (!dateGroups.has(key)) dateGroups.set(key, { sortKey, activities: [], accomEvents: [], flights: [] });
    return dateGroups.get(key)!;
  }

  function fmtKey(date: Date) {
    return date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  }

  const undated: ActivityFull[] = [];
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
          {!canManageActivities && (
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

        <TimelineClient
          tripId={tripId}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          sortedGroups={sortedGroups as any}
          undated={undated}
          undatedFlights={undatedFlights}
          members={members}
          currentMemberId={membership.id}
          isOrganizer={isOrganizer}
          canManageActivities={canManageActivities}
        />
      </main>
    </>
  );
}
