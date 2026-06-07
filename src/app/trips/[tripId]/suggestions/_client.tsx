"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import type { TripMember, Profile } from "@/types";

type MemberWithProfile = TripMember & { profile: Profile | null };
type VoteRow = { id: string; suggestion_id: string; member_id: string };
type SuggestionFull = {
  id: string;
  trip_id: string;
  member_id: string;
  title: string;
  description: string | null;
  preferred_date: string | null;
  preferred_time: string | null;
  duration_minutes: number | null;
  created_at: string;
  member: MemberWithProfile | null;
  votes: VoteRow[];
};

interface Props {
  tripId: string;
  suggestions: SuggestionFull[];
  currentMemberId: string;
  isOrganizer: boolean;
}

function memberName(m: MemberWithProfile | null) {
  if (!m) return "Unknown";
  return m.profile?.full_name ?? m.profile?.email ?? m.guest_name ?? "Unknown";
}

function memberInitials(m: MemberWithProfile | null) {
  const name = memberName(m);
  return name.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2);
}

function fmtDate(d: string) {
  // d is "YYYY-MM-DD" — parse as local date to avoid UTC-shift
  const [y, mo, day] = d.split("-").map(Number);
  return new Date(y, mo - 1, day).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function fmtTime(t: string) {
  // t is "HH:MM:SS" from postgres TIME
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, "0")} ${ampm}`;
}

function fmtDuration(mins: number) {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export function SuggestionsClient({ tripId, suggestions: initial, currentMemberId, isOrganizer }: Props) {
  const router = useRouter();
  const [suggestions, setSuggestions] = useState(initial);
  const [addOpen, setAddOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [preferredDate, setPreferredDate] = useState("");
  const [preferredTime, setPreferredTime] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => { setSuggestions(initial); }, [initial]);

  const sorted = [...suggestions].sort((a, b) => {
    const diff = b.votes.length - a.votes.length;
    return diff !== 0 ? diff : new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  async function handleVote(s: SuggestionFull) {
    const supabase = createClient();
    const existing = s.votes.find((v) => v.member_id === currentMemberId);

    setSuggestions((prev) =>
      prev.map((item) => {
        if (item.id !== s.id) return item;
        return {
          ...item,
          votes: existing
            ? item.votes.filter((v) => v.id !== existing.id)
            : [...item.votes, { id: `opt-${Date.now()}`, suggestion_id: s.id, member_id: currentMemberId }],
        };
      })
    );

    const { error } = existing
      ? await supabase.from("suggestion_votes").delete().eq("id", existing.id)
      : await supabase.from("suggestion_votes").insert({ suggestion_id: s.id, member_id: currentMemberId });

    if (error) { toast.error("Failed to update vote"); router.refresh(); }
  }

  function resetForm() {
    setTitle("");
    setDescription("");
    setPreferredDate("");
    setPreferredTime("");
    setDurationMinutes("");
  }

  async function handleAdd() {
    if (!title.trim()) return;
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase.from("suggestions").insert({
      trip_id: tripId,
      member_id: currentMemberId,
      title: title.trim(),
      description: description.trim() || null,
      preferred_date: preferredDate || null,
      preferred_time: preferredTime || null,
      duration_minutes: durationMinutes ? parseInt(durationMinutes, 10) : null,
    });
    setSaving(false);
    if (error) { toast.error("Failed to add suggestion"); return; }
    setAddOpen(false);
    resetForm();
    router.refresh();
  }

  async function handleDelete(id: string) {
    const supabase = createClient();
    const { error } = await supabase.from("suggestions").delete().eq("id", id);
    if (error) { toast.error("Failed to delete suggestion"); return; }
    router.refresh();
  }

  return (
    <div>
      <div className="flex justify-end mb-6">
        <Button onClick={() => setAddOpen(true)}>+ Suggest an activity</Button>
      </div>

      {sorted.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          No suggestions yet — be the first to add one!
        </div>
      )}

      <div className="space-y-3">
        {sorted.map((s) => {
          const hasVoted = s.votes.some((v) => v.member_id === currentMemberId);
          const canDelete = s.member_id === currentMemberId || isOrganizer;
          const meta = [
            s.preferred_date && fmtDate(s.preferred_date),
            s.preferred_time && fmtTime(s.preferred_time),
            s.duration_minutes && fmtDuration(s.duration_minutes),
          ].filter(Boolean).join(" · ");

          return (
            <Card key={s.id}>
              <CardContent className="p-4 flex items-start gap-4">
                {/* Upvote */}
                <div className="flex flex-col items-center gap-0.5 min-w-[36px]">
                  <button
                    onClick={() => handleVote(s)}
                    className={`text-xl leading-none transition-colors ${
                      hasVoted ? "text-blue-600 hover:text-blue-700" : "text-gray-300 hover:text-blue-400"
                    }`}
                    aria-label={hasVoted ? "Remove vote" : "Vote"}
                  >
                    ▲
                  </button>
                  <span className="text-sm font-semibold tabular-nums text-gray-700">{s.votes.length}</span>
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900">{s.title}</p>
                  {s.description && (
                    <p className="text-sm text-gray-500 mt-0.5">{s.description}</p>
                  )}
                  {meta && (
                    <p className="text-xs text-gray-400 mt-1">{meta}</p>
                  )}
                  <div className="flex items-center gap-1.5 mt-2">
                    <Avatar className="h-5 w-5">
                      <AvatarFallback className="text-[9px] bg-blue-100 text-blue-700">
                        {memberInitials(s.member)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-xs text-gray-400">{memberName(s.member)}</span>
                  </div>
                </div>

                {canDelete && (
                  <button
                    onClick={() => handleDelete(s.id)}
                    className="text-gray-300 hover:text-red-400 transition-colors text-xs mt-0.5 shrink-0"
                    aria-label="Delete suggestion"
                  >
                    ✕
                  </button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog open={addOpen} onOpenChange={(open) => { setAddOpen(open); if (!open) resetForm(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Suggest an activity</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="sug-title">Activity</Label>
              <Input
                id="sug-title"
                placeholder="e.g. Hiking at Glacier Point"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sug-desc">Details <span className="text-gray-400">(optional)</span></Label>
              <Input
                id="sug-desc"
                placeholder="Any extra info..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="sug-date">Preferred date <span className="text-gray-400">(optional)</span></Label>
                <Input
                  id="sug-date"
                  type="date"
                  value={preferredDate}
                  onChange={(e) => setPreferredDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sug-time">Preferred time <span className="text-gray-400">(optional)</span></Label>
                <Input
                  id="sug-time"
                  type="time"
                  value={preferredTime}
                  onChange={(e) => setPreferredTime(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sug-dur">Duration in minutes <span className="text-gray-400">(optional)</span></Label>
              <Input
                id="sug-dur"
                type="number"
                min="1"
                placeholder="e.g. 120"
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAddOpen(false); resetForm(); }}>Cancel</Button>
            <Button onClick={handleAdd} disabled={!title.trim() || saving}>
              {saving ? "Adding..." : "Add suggestion"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
