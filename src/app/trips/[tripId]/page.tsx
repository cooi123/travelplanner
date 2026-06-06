import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Nav } from "@/components/nav";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/link-button";
import { Separator } from "@/components/ui/separator";
import { MembersSection } from "./_components/members-section";

interface Props {
  params: Promise<{ tripId: string }>;
}

export default async function TripPage({ params }: Props) {
  const { tripId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles").select("*").eq("id", user.id).single();

  const { data: trip } = await supabase
    .from("trips").select("*").eq("id", tripId).single();
  if (!trip) notFound();

  const { data: membership } = await supabase
    .from("trip_members")
    .select("*")
    .eq("trip_id", tripId)
    .eq("user_id", user.id)
    .single();
  if (!membership) notFound();

  const isOrganizer = membership.role === "organizer";
  const roleLabel =
    membership.role === "organizer" ? "Organizer" :
    membership.role === "activity_manager" ? "Activity manager" :
    "Participant";

  return (
    <>
      <Nav userEmail={user.email ?? null} userName={profile?.full_name ?? null} />
      <main className="max-w-5xl mx-auto px-4 py-8">
        {/* Trip header */}
        <div className="mb-6">
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
            <Link href="/dashboard" className="hover:underline">My trips</Link>
            <span>/</span>
          </div>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">{trip.name}</h1>
              {trip.destination && (
                <p className="text-gray-500 mt-1">{trip.destination}</p>
              )}
              {(trip.start_date || trip.end_date) && (
                <p className="text-sm text-gray-400 mt-1">
                  {trip.start_date && new Date(trip.start_date).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                  {trip.start_date && trip.end_date && " – "}
                  {trip.end_date && new Date(trip.end_date).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                </p>
              )}
            </div>
            <Badge variant={isOrganizer ? "default" : "secondary"} className="shrink-0">
              {roleLabel}
            </Badge>
          </div>
        </div>

        <Separator className="mb-6" />

        {/* Section nav */}
        <nav className="flex gap-2 mb-8 flex-wrap">
          {[
            { label: "Members", href: `/trips/${tripId}` },
            { label: "Accommodation", href: `/trips/${tripId}/accommodations` },
            { label: "Activities", href: `/trips/${tripId}/activities` },
            { label: "Flights", href: `/trips/${tripId}/flights` },
            { label: "Timeline", href: `/trips/${tripId}/timeline` },
          ].map(({ label, href }) => (
            <LinkButton key={href} href={href} variant="outline" size="sm">{label}</LinkButton>
          ))}
        </nav>

        <MembersSection tripId={tripId} currentUserId={user.id} isOrganizer={isOrganizer} />
      </main>
    </>
  );
}
