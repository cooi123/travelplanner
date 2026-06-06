import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Nav } from "@/components/nav";
import { LinkButton } from "@/components/ui/link-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Trip, TripMember } from "@/types";

const roleAccent: Record<string, string> = {
  organizer: "bg-blue-500",
  activity_manager: "bg-violet-500",
  participant: "bg-emerald-500",
};

const roleLabel: Record<string, string> = {
  organizer: "organizer",
  activity_manager: "manager",
  participant: "participant",
};

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  const { data: memberships } = await supabase
    .from("trip_members")
    .select("*, trip:trips(*)")
    .eq("user_id", user.id)
    .order("joined_at", { ascending: false });

  const trips = (memberships ?? []).map((m: TripMember & { trip: Trip }) => ({
    ...m.trip,
    role: m.role,
  }));

  return (
    <>
      <Nav userEmail={user.email ?? null} userName={profile?.full_name ?? null} />
      <main className="max-w-5xl mx-auto px-4 py-6 pb-24 sm:py-8 sm:pb-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
          <h1 className="text-2xl font-bold text-gray-900">My trips</h1>
          <LinkButton href="/trips/new" className="sm:w-auto w-full justify-center">
            + New trip
          </LinkButton>
        </div>

        {trips.length === 0 ? (
          <div className="text-center py-20 px-4">
            <div className="text-5xl mb-4">✈️</div>
            <p className="text-lg font-medium text-gray-700">No trips yet</p>
            <p className="mt-1 text-sm text-gray-400 max-w-xs mx-auto">
              Create a new trip or ask an organizer for an invite link
            </p>
            <LinkButton href="/trips/new" className="mt-6">Create your first trip</LinkButton>
          </div>
        ) : (
          <div className="grid gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {trips.map((trip: Trip & { role: string }) => (
              <Link
                key={trip.id}
                href={`/trips/${trip.id}`}
                className="block active:scale-[0.98] transition-transform duration-100"
              >
                <Card className="h-full hover:shadow-md transition-shadow cursor-pointer overflow-hidden">
                  <div className={`h-1 ${roleAccent[trip.role] ?? "bg-gray-400"}`} />
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-base leading-snug">{trip.name}</CardTitle>
                      <Badge
                        variant={trip.role === "organizer" ? "default" : "secondary"}
                        className="shrink-0 text-xs"
                      >
                        {roleLabel[trip.role] ?? trip.role}
                      </Badge>
                    </div>
                    {trip.destination && (
                      <CardDescription className="flex items-center gap-1">
                        <span>📍</span> {trip.destination}
                      </CardDescription>
                    )}
                  </CardHeader>
                  {(trip.start_date || trip.end_date) && (
                    <CardContent className="pt-0 pb-4">
                      <p className="text-sm text-gray-500 flex items-center gap-1.5">
                        <span>📅</span>
                        <span>
                          {trip.start_date && new Date(trip.start_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                          {trip.start_date && trip.end_date && " – "}
                          {trip.end_date && new Date(trip.end_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        </span>
                      </p>
                    </CardContent>
                  )}
                </Card>
              </Link>
            ))}
          </div>
        )}
      </main>

      {/* Mobile floating action button */}
      <div className="fixed bottom-6 right-6 sm:hidden">
        <LinkButton
          href="/trips/new"
          className="h-14 w-14 rounded-full shadow-lg text-xl p-0 flex items-center justify-center"
        >
          +
        </LinkButton>
      </div>
    </>
  );
}
