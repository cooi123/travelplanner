import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

interface Props {
  params: Promise<{ token: string }>;
}

export default async function JoinPage({ params }: Props) {
  const { token } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Not logged in — send to signup, then come back here.
  if (!user) {
    redirect(`/signup?next=/join/${token}`);
  }

  // Look up the invite.
  const { data: invite } = await supabase
    .from("trip_invites")
    .select("*")
    .eq("token", token)
    .single();

  if (!invite) redirect("/dashboard");

  const tripId = invite.trip_id;

  // Already a real member — just go to the trip.
  const { data: existing } = await supabase
    .from("trip_members")
    .select("id")
    .eq("trip_id", tripId)
    .eq("user_id", user.id)
    .single();

  if (existing) redirect(`/trips/${tripId}`);

  // Check if there's a guest placeholder with a matching email.
  // If so, claim it by filling in the user_id.
  const { data: guestSlot } = await supabase
    .from("trip_members")
    .select("id")
    .eq("trip_id", tripId)
    .eq("guest_email", user.email)
    .is("user_id", null)
    .maybeSingle();

  if (guestSlot) {
    // Claim the guest slot — room and activity assignments carry over automatically.
    await supabase
      .from("trip_members")
      .update({ user_id: user.id })
      .eq("id", guestSlot.id);
  } else {
    // No guest slot — add as a fresh participant.
    await supabase.from("trip_members").insert({
      trip_id: tripId,
      user_id: user.id,
      role: "participant",
    });
  }

  redirect(`/trips/${tripId}`);
}
