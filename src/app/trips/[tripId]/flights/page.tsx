import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Nav } from "@/components/nav";
import Link from "next/link";
import { LinkButton } from "@/components/ui/link-button";
import { Separator } from "@/components/ui/separator";
import { FlightsClient } from "./_client";

interface Props {
  params: Promise<{ tripId: string }>;
}

export default async function FlightsPage({ params }: Props) {
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

  const { data: flights } = await supabase
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

  const { data: members } = await supabase
    .from("trip_members")
    .select("*, profile:profiles(*)")
    .eq("trip_id", tripId);

  return (
    <>
      <Nav userEmail={user.email ?? null} userName={profile?.full_name ?? null} />
      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
          <Link href="/dashboard" className="hover:underline">My trips</Link>
          <span>/</span>
          <Link href={`/trips/${tripId}`} className="hover:underline">{trip.name}</Link>
          <span>/</span>
          <span>Flights</span>
        </div>
        <div className="flex items-center justify-between mb-6 mt-2">
          <h1 className="text-2xl font-bold">Flights</h1>
        </div>

        <nav className="flex gap-2 mb-8 flex-wrap">
          {[
            { label: "Members",       href: `/trips/${tripId}` },
            { label: "Accommodation", href: `/trips/${tripId}/accommodations` },
            { label: "Activities",    href: `/trips/${tripId}/activities` },
            { label: "Flights",       href: `/trips/${tripId}/flights` },
            { label: "Transport",     href: `/trips/${tripId}/transport` },
            { label: "Timeline",      href: `/trips/${tripId}/timeline` },
          ].map(({ label, href }) => (
            <LinkButton key={href} href={href} variant={href.endsWith("/flights") ? "default" : "outline"} size="sm">
              {label}
            </LinkButton>
          ))}
        </nav>

        <Separator className="mb-6" />

        <FlightsClient
          tripId={tripId}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          flights={(flights ?? []) as any}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          members={(members ?? []) as any}
          currentMemberId={membership.id}
          isOrganizer={canManageActivities}
        />
      </main>
    </>
  );
}
