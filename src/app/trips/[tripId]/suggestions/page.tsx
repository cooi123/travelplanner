import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Nav } from "@/components/nav";
import { LinkButton } from "@/components/ui/link-button";
import { Separator } from "@/components/ui/separator";
import { SuggestionsClient } from "./_client";

interface Props {
  params: Promise<{ tripId: string }>;
}

const NAV = (tripId: string) => [
  { label: "Members",       href: `/trips/${tripId}` },
  { label: "Accommodation", href: `/trips/${tripId}/accommodations` },
  { label: "Activities",    href: `/trips/${tripId}/activities` },
  { label: "Flights",       href: `/trips/${tripId}/flights` },
  { label: "Transport",     href: `/trips/${tripId}/transport` },
  { label: "Suggestions",   href: `/trips/${tripId}/suggestions` },
  { label: "Timeline",      href: `/trips/${tripId}/timeline` },
];

export default async function SuggestionsPage({ params }: Props) {
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

  const { data: suggestions } = await supabase
    .from("suggestions")
    .select(`
      *,
      member:trip_members(*, profile:profiles(*)),
      votes:suggestion_votes(*)
    `)
    .eq("trip_id", tripId)
    .order("created_at", { ascending: false });

  return (
    <>
      <Nav userEmail={user.email ?? null} userName={profile?.full_name ?? null} />
      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
          <Link href="/dashboard" className="hover:underline">My trips</Link>
          <span>/</span>
          <Link href={`/trips/${tripId}`} className="hover:underline">{trip.name}</Link>
          <span>/</span>
          <span>Suggestions</span>
        </div>
        <div className="mb-6 mt-2">
          <h1 className="text-2xl font-bold">Suggestions</h1>
          <p className="text-sm text-gray-400 mt-1">Vote on what activities you want to do.</p>
        </div>

        <nav className="flex gap-2 mb-8 flex-wrap">
          {NAV(tripId).map(({ label, href }) => (
            <LinkButton
              key={href}
              href={href}
              variant={href.endsWith("/suggestions") ? "default" : "outline"}
              size="sm"
            >
              {label}
            </LinkButton>
          ))}
        </nav>

        <Separator className="mb-6" />

        <SuggestionsClient
          tripId={tripId}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          suggestions={(suggestions ?? []) as any}
          currentMemberId={membership.id}
          isOrganizer={isOrganizer}
        />
      </main>
    </>
  );
}
