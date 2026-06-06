import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Nav } from "@/components/nav";
import { LinkButton } from "@/components/ui/link-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Trip, TripMember } from "@/types";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  // Fetch all trips the current user is a member of.
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
      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900">My trips</h1>
          <LinkButton href="/trips/new">+ New trip</LinkButton>
        </div>

        {trips.length === 0 ? (
          <div className="text-center py-20 text-gray-500">
            <p className="text-lg">No trips yet.</p>
            <p className="mt-1 text-sm">Create one or ask an organizer for an invite link.</p>
            <LinkButton href="/trips/new" className="mt-6">Create your first trip</LinkButton>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {trips.map((trip: Trip & { role: string }) => (
              <Link key={trip.id} href={`/trips/${trip.id}`}>
                <Card className="h-full hover:shadow-md transition-shadow cursor-pointer">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-base leading-snug">{trip.name}</CardTitle>
                      <Badge variant={trip.role === "organizer" ? "default" : "secondary"}>
                        {trip.role}
                      </Badge>
                    </div>
                    {trip.destination && (
                      <CardDescription>{trip.destination}</CardDescription>
                    )}
                  </CardHeader>
                  {(trip.start_date || trip.end_date) && (
                    <CardContent className="pt-0">
                      <p className="text-sm text-gray-500">
                        {trip.start_date && new Date(trip.start_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        {trip.start_date && trip.end_date && " – "}
                        {trip.end_date && new Date(trip.end_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </p>
                    </CardContent>
                  )}
                </Card>
              </Link>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
