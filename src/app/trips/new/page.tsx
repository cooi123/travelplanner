"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { LinkButton } from "@/components/ui/link-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

export default function NewTripPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);

    const form = new FormData(e.currentTarget);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/login"); return; }

    const { data: trip, error } = await supabase
      .from("trips")
      .insert({
        name: form.get("name") as string,
        destination: (form.get("destination") as string) || null,
        start_date: (form.get("start_date") as string) || null,
        end_date: (form.get("end_date") as string) || null,
        created_by: user.id,
      })
      .select()
      .single();

    if (error || !trip) {
      toast.error(error?.message ?? "Could not create trip");
      setLoading(false);
      return;
    }

    // Add creator as organizer.
    await supabase.from("trip_members").insert({
      trip_id: trip.id,
      user_id: user.id,
      role: "organizer",
    });

    router.push(`/trips/${trip.id}`);
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>Create a new trip</CardTitle>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Trip name *</Label>
              <Input id="name" name="name" placeholder="Bali 2026" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="destination">Destination</Label>
              <Input id="destination" name="destination" placeholder="Bali, Indonesia" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="start_date">Start date</Label>
                <Input id="start_date" name="start_date" type="date" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="end_date">End date</Label>
                <Input id="end_date" name="end_date" type="date" />
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex gap-3">
            <Button type="submit" disabled={loading}>
              {loading ? "Creating…" : "Create trip"}
            </Button>
            <LinkButton href="/dashboard" variant="outline">Cancel</LinkButton>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
