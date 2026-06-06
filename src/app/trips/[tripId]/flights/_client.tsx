"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";

// Convert a UTC ISO string to a datetime-local input value (YYYY-MM-DDTHH:MM)
// in the given IANA timezone (e.g. "America/Los_Angeles"). Falls back to
// browser local time when no timezone is supplied.
function toTzInputValue(isoString: string, timezone?: string | null): string {
  const d = new Date(isoString);
  if (timezone) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hour12: false,
    }).formatToParts(d);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
    const hour = get("hour") === "24" ? "00" : get("hour");
    return `${get("year")}-${get("month")}-${get("day")}T${hour}:${get("minute")}`;
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Convert a datetime-local value ("YYYY-MM-DDTHH:MM", which has no timezone)
// to a UTC ISO string, interpreting it as being in the given IANA timezone.
// Falls back to browser local time when no timezone is supplied.
function tzInputToISO(localValue: string, timezone?: string | null): string {
  if (!localValue) return localValue;
  if (!timezone) return new Date(localValue).toISOString();
  // Parse the value as if it were UTC, then correct for the target timezone offset.
  const asUTC = new Date(localValue + ":00Z");
  const utcStr = asUTC.toLocaleString("en-US", { timeZone: "UTC" });
  const tzStr = asUTC.toLocaleString("en-US", { timeZone: timezone });
  const offsetMs = new Date(utcStr).getTime() - new Date(tzStr).getTime();
  return new Date(asUTC.getTime() + offsetMs).toISOString();
}
import type { Flight, FlightAssignment, TripMember, Profile } from "@/types";

const TIMEZONES = [
  { label: "— select timezone —", value: "" },
  // Americas
  { label: "Pacific/Honolulu (UTC−10)", value: "Pacific/Honolulu" },
  { label: "America/Anchorage (UTC−9)", value: "America/Anchorage" },
  { label: "America/Los_Angeles (UTC−8/−7)", value: "America/Los_Angeles" },
  { label: "America/Phoenix (UTC−7, no DST)", value: "America/Phoenix" },
  { label: "America/Denver (UTC−7/−6)", value: "America/Denver" },
  { label: "America/Chicago (UTC−6/−5)", value: "America/Chicago" },
  { label: "America/New_York (UTC−5/−4)", value: "America/New_York" },
  { label: "America/Toronto (UTC−5/−4)", value: "America/Toronto" },
  { label: "America/Vancouver (UTC−8/−7)", value: "America/Vancouver" },
  { label: "America/Mexico_City (UTC−6/−5)", value: "America/Mexico_City" },
  { label: "America/Bogota (UTC−5)", value: "America/Bogota" },
  { label: "America/Lima (UTC−5)", value: "America/Lima" },
  { label: "America/Sao_Paulo (UTC−3/−2)", value: "America/Sao_Paulo" },
  { label: "America/Argentina/Buenos_Aires (UTC−3)", value: "America/Argentina/Buenos_Aires" },
  // Europe
  { label: "Atlantic/Reykjavik (UTC+0)", value: "Atlantic/Reykjavik" },
  { label: "Europe/London (UTC+0/+1)", value: "Europe/London" },
  { label: "Europe/Lisbon (UTC+0/+1)", value: "Europe/Lisbon" },
  { label: "Europe/Paris (UTC+1/+2)", value: "Europe/Paris" },
  { label: "Europe/Berlin (UTC+1/+2)", value: "Europe/Berlin" },
  { label: "Europe/Madrid (UTC+1/+2)", value: "Europe/Madrid" },
  { label: "Europe/Rome (UTC+1/+2)", value: "Europe/Rome" },
  { label: "Europe/Amsterdam (UTC+1/+2)", value: "Europe/Amsterdam" },
  { label: "Europe/Zurich (UTC+1/+2)", value: "Europe/Zurich" },
  { label: "Europe/Athens (UTC+2/+3)", value: "Europe/Athens" },
  { label: "Europe/Helsinki (UTC+2/+3)", value: "Europe/Helsinki" },
  { label: "Europe/Istanbul (UTC+3)", value: "Europe/Istanbul" },
  { label: "Europe/Moscow (UTC+3)", value: "Europe/Moscow" },
  // Africa & Middle East
  { label: "Africa/Cairo (UTC+2/+3)", value: "Africa/Cairo" },
  { label: "Africa/Johannesburg (UTC+2)", value: "Africa/Johannesburg" },
  { label: "Africa/Lagos (UTC+1)", value: "Africa/Lagos" },
  { label: "Africa/Nairobi (UTC+3)", value: "Africa/Nairobi" },
  { label: "Asia/Dubai (UTC+4)", value: "Asia/Dubai" },
  { label: "Asia/Riyadh (UTC+3)", value: "Asia/Riyadh" },
  { label: "Asia/Qatar (UTC+3)", value: "Asia/Qatar" },
  // Asia
  { label: "Asia/Karachi (UTC+5)", value: "Asia/Karachi" },
  { label: "Asia/Kolkata (UTC+5:30)", value: "Asia/Kolkata" },
  { label: "Asia/Dhaka (UTC+6)", value: "Asia/Dhaka" },
  { label: "Asia/Yangon (UTC+6:30)", value: "Asia/Yangon" },
  { label: "Asia/Bangkok (UTC+7)", value: "Asia/Bangkok" },
  { label: "Asia/Jakarta (UTC+7)", value: "Asia/Jakarta" },
  { label: "Asia/Singapore (UTC+8)", value: "Asia/Singapore" },
  { label: "Asia/Kuala_Lumpur (UTC+8)", value: "Asia/Kuala_Lumpur" },
  { label: "Asia/Hong_Kong (UTC+8)", value: "Asia/Hong_Kong" },
  { label: "Asia/Shanghai (UTC+8)", value: "Asia/Shanghai" },
  { label: "Asia/Taipei (UTC+8)", value: "Asia/Taipei" },
  { label: "Asia/Manila (UTC+8)", value: "Asia/Manila" },
  { label: "Asia/Tokyo (UTC+9)", value: "Asia/Tokyo" },
  { label: "Asia/Seoul (UTC+9)", value: "Asia/Seoul" },
  // Australia & Pacific
  { label: "Australia/Perth (UTC+8)", value: "Australia/Perth" },
  { label: "Australia/Darwin (UTC+9:30)", value: "Australia/Darwin" },
  { label: "Australia/Adelaide (UTC+9:30/+10:30)", value: "Australia/Adelaide" },
  { label: "Australia/Brisbane (UTC+10)", value: "Australia/Brisbane" },
  { label: "Australia/Sydney (UTC+10/+11)", value: "Australia/Sydney" },
  { label: "Australia/Melbourne (UTC+10/+11)", value: "Australia/Melbourne" },
  { label: "Pacific/Auckland (UTC+12/+13)", value: "Pacific/Auckland" },
  { label: "Pacific/Fiji (UTC+12)", value: "Pacific/Fiji" },
  { label: "UTC", value: "UTC" },
];

function TimezoneSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring text-foreground"
    >
      {TIMEZONES.map((tz) => (
        <option key={tz.value} value={tz.value}>{tz.label}</option>
      ))}
    </select>
  );
}

type MemberWithProfile = TripMember & { profile: Profile | null };
type AssignmentWithMember = FlightAssignment & { member?: MemberWithProfile };
type FlightWithAssignments = Flight & { assignments: AssignmentWithMember[] };

interface LookedUpFlight {
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
}

interface Props {
  tripId: string;
  flights: FlightWithAssignments[];
  members: MemberWithProfile[];
  currentMemberId: string;
  isOrganizer: boolean;
}

function memberName(m: MemberWithProfile) {
  return m.profile?.full_name ?? m.profile?.email ?? m.guest_name ?? "Unknown";
}

function memberInitials(m: MemberWithProfile) {
  return memberName(m).split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2);
}

function fmtTime(ts: string | null, tz?: string | null) {
  if (!ts) return null;
  return new Date(ts).toLocaleString("en-US", {
    month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit",
    timeZone: tz ?? undefined,
  });
}

function statusColor(status: string | null) {
  switch (status) {
    case "active": return "bg-green-100 text-green-700 border-green-200";
    case "landed": return "bg-blue-100 text-blue-700 border-blue-200";
    case "cancelled": return "bg-red-100 text-red-700 border-red-200";
    case "diverted": return "bg-orange-100 text-orange-700 border-orange-200";
    default: return "bg-gray-100 text-gray-600 border-gray-200";
  }
}

// ---- Edit + Assign modal ---------------------------------------------------

interface FlightModalProps {
  flight: FlightWithAssignments;
  members: MemberWithProfile[];
  onClose: () => void;
  onSaved: () => void;
  onDelete: (id: string) => void;
}

function FlightModal({ flight, members, onClose, onSaved, onDelete }: FlightModalProps) {
  const [flightIata, setFlightIata] = useState(flight.flight_iata);
  const [airlineName, setAirlineName] = useState(flight.airline_name ?? "");
  const [depAirport, setDepAirport] = useState(flight.departure_airport ?? "");
  const [depIata, setDepIata] = useState(flight.departure_iata ?? "");
  const [depTimezone, setDepTimezone] = useState(flight.departure_timezone ?? "");
  const [depTime, setDepTime] = useState(
    flight.departure_time ? toTzInputValue(flight.departure_time, flight.departure_timezone) : ""
  );
  const [arrAirport, setArrAirport] = useState(flight.arrival_airport ?? "");
  const [arrIata, setArrIata] = useState(flight.arrival_iata ?? "");
  const [arrTimezone, setArrTimezone] = useState(flight.arrival_timezone ?? "");
  const [arrTime, setArrTime] = useState(
    flight.arrival_time ? toTzInputValue(flight.arrival_time, flight.arrival_timezone) : ""
  );
  const [notes, setNotes] = useState(flight.notes ?? "");
  const [saving, setSaving] = useState(false);

  const [assignedIds, setAssignedIds] = useState<Set<string>>(
    new Set(flight.assignments.map((a) => a.member_id))
  );
  const [assigning, setAssigning] = useState(false);

  async function handleSaveDetails() {
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase.from("flights").update({
      flight_iata: flightIata,
      airline_name: airlineName || null,
      departure_airport: depAirport || null,
      departure_iata: depIata || null,
      departure_timezone: depTimezone || null,
      departure_time: depTime ? tzInputToISO(depTime, depTimezone) : null,
      arrival_airport: arrAirport || null,
      arrival_iata: arrIata || null,
      arrival_timezone: arrTimezone || null,
      arrival_time: arrTime ? tzInputToISO(arrTime, arrTimezone) : null,
      notes: notes || null,
    }).eq("id", flight.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Saved");
    onSaved();
  }

  async function handleSaveAssignments() {
    setAssigning(true);
    const supabase = createClient();
    const originalIds = new Set(flight.assignments.map((a) => a.member_id));
    const toAdd = [...assignedIds].filter((id) => !originalIds.has(id));
    const toRemove = flight.assignments.filter((a) => !assignedIds.has(a.member_id));

    if (toAdd.length > 0) {
      const { error } = await supabase.from("flight_assignments").insert(
        toAdd.map((member_id) => ({ flight_id: flight.id, member_id }))
      );
      if (error) { toast.error(error.message); setAssigning(false); return; }
    }
    for (const a of toRemove) {
      const { error } = await supabase.from("flight_assignments").delete().eq("id", a.id);
      if (error) { toast.error(error.message); setAssigning(false); return; }
    }
    setAssigning(false);
    toast.success("Assignments updated");
    onSaved();
  }

  function toggleMember(id: string) {
    setAssignedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{flight.flight_iata}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Details</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Flight code</Label>
              <Input value={flightIata} onChange={(e) => setFlightIata(e.target.value.toUpperCase())} />
            </div>
            <div className="space-y-2">
              <Label>Airline</Label>
              <Input value={airlineName} onChange={(e) => setAirlineName(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Departure airport</Label>
              <Input placeholder="San Francisco Intl" value={depAirport} onChange={(e) => setDepAirport(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Dep. IATA code</Label>
              <Input placeholder="SFO" value={depIata} onChange={(e) => setDepIata(e.target.value.toUpperCase())} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Departure time <span className="text-gray-400 font-normal">(airport local)</span></Label>
              <Input type="datetime-local" value={depTime} onChange={(e) => setDepTime(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Dep. timezone</Label>
              <TimezoneSelect value={depTimezone} onChange={setDepTimezone} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Arrival airport</Label>
              <Input placeholder="Dallas/Fort Worth Intl" value={arrAirport} onChange={(e) => setArrAirport(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Arr. IATA code</Label>
              <Input placeholder="DFW" value={arrIata} onChange={(e) => setArrIata(e.target.value.toUpperCase())} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Arrival time <span className="text-gray-400 font-normal">(airport local)</span></Label>
              <Input type="datetime-local" value={arrTime} onChange={(e) => setArrTime(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Arr. timezone</Label>
              <TimezoneSelect value={arrTimezone} onChange={setArrTimezone} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Notes</Label>
            <Input placeholder="Terminal, baggage claim, etc." value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <div className="flex justify-end">
            <Button size="sm" onClick={handleSaveDetails} disabled={!flightIata || saving}>
              {saving ? "Saving…" : "Save details"}
            </Button>
          </div>
        </div>

        <Separator />

        <div className="space-y-3">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Passengers</p>
          <div className="space-y-1 max-h-56 overflow-y-auto pr-1">
            {members.map((m) => {
              const checked = assignedIds.has(m.id);
              return (
                <label
                  key={m.id}
                  className="flex items-center gap-3 rounded-lg px-3 py-2 cursor-pointer hover:bg-gray-50 transition-colors"
                >
                  <Checkbox checked={checked} onCheckedChange={() => toggleMember(m.id)} />
                  <Avatar className="h-7 w-7 shrink-0">
                    <AvatarFallback className={`text-xs ${checked ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-500"}`}>
                      {memberInitials(m)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-sm font-medium flex-1 truncate">{memberName(m)}</span>
                  {checked && (
                    <Badge variant="outline" className="text-blue-700 border-blue-200 text-xs shrink-0">
                      on this flight
                    </Badge>
                  )}
                </label>
              );
            })}
          </div>
        </div>

        <DialogFooter className="gap-2 flex-row items-center justify-between">
          <Button
            variant="ghost"
            className="text-red-500 hover:text-red-700 text-sm mr-auto"
            onClick={() => onDelete(flight.id)}
          >
            Delete flight
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Close</Button>
            <Button onClick={handleSaveAssignments} disabled={assigning}>
              {assigning ? "Saving…" : "Save passengers"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---- Main client -----------------------------------------------------------

export function FlightsClient({ tripId, flights: initial, members, currentMemberId, isOrganizer }: Props) {
  const router = useRouter();
  const [flights, setFlights] = useState(initial);
  useEffect(() => { setFlights(initial); }, [initial]);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  // Lookup state
  const [lookupCode, setLookupCode] = useState("");
  const [lookupDate, setLookupDate] = useState("");
  const [looking, setLooking] = useState(false);
  const [lookupResults, setLookupResults] = useState<LookedUpFlight[] | null>(null);
  const [selectedResult, setSelectedResult] = useState<LookedUpFlight | null>(null);

  // Manual / override fields
  const [newFlightIata, setNewFlightIata] = useState("");
  const [newAirlineName, setNewAirlineName] = useState("");
  const [newDepAirport, setNewDepAirport] = useState("");
  const [newDepIata, setNewDepIata] = useState("");
  const [newDepTimezone, setNewDepTimezone] = useState("");
  const [newDepTime, setNewDepTime] = useState("");
  const [newArrAirport, setNewArrAirport] = useState("");
  const [newArrIata, setNewArrIata] = useState("");
  const [newArrTimezone, setNewArrTimezone] = useState("");
  const [newArrTime, setNewArrTime] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [addLoading, setAddLoading] = useState(false);

  function applyLookupResult(f: LookedUpFlight) {
    setSelectedResult(f);
    setNewFlightIata(f.flight_iata);
    setNewAirlineName(f.airline_name ?? "");
    setNewDepAirport(f.departure_airport ?? "");
    setNewDepIata(f.departure_iata ?? "");
    setNewDepTimezone(f.departure_timezone ?? "");
    setNewDepTime(f.departure_time ? toTzInputValue(f.departure_time, f.departure_timezone) : "");
    setNewArrAirport(f.arrival_airport ?? "");
    setNewArrIata(f.arrival_iata ?? "");
    setNewArrTimezone(f.arrival_timezone ?? "");
    setNewArrTime(f.arrival_time ? toTzInputValue(f.arrival_time, f.arrival_timezone) : "");
  }

  async function handleLookup() {
    const code = lookupCode.trim().toUpperCase();
    if (!code) return;
    setLooking(true);
    setLookupResults(null);
    setSelectedResult(null);
    try {
      const params = new URLSearchParams({ flight_iata: code });
      if (lookupDate) params.set("flight_date", lookupDate);
      const res = await fetch(`/api/flights/lookup?${params}`);
      const json = await res.json();
      if (!res.ok || json.error) {
        toast.error(json.error ?? "Lookup failed");
        setLooking(false);
        return;
      }
      if (json.flights.length === 0) {
        toast.info("No flights found for that code/date. You can still fill in details manually.");
        setNewFlightIata(code);
      } else if (json.flights.length === 1) {
        applyLookupResult(json.flights[0]);
        toast.success("Flight found — details filled in below");
      } else {
        setLookupResults(json.flights);
      }
    } catch {
      toast.error("Network error during lookup");
    }
    setLooking(false);
  }

  function resetAddForm() {
    setLookupCode(""); setLookupDate(""); setLookupResults(null); setSelectedResult(null);
    setNewFlightIata(""); setNewAirlineName(""); setNewDepAirport(""); setNewDepIata("");
    setNewDepTimezone(""); setNewDepTime(""); setNewArrAirport(""); setNewArrIata("");
    setNewArrTimezone(""); setNewArrTime(""); setNewNotes("");
  }

  async function handleAdd() {
    if (!newFlightIata) return;
    setAddLoading(true);
    const supabase = createClient();
    const { data, error } = await supabase.from("flights").insert({
      trip_id: tripId,
      flight_iata: newFlightIata,
      airline_name: newAirlineName || null,
      departure_airport: newDepAirport || null,
      departure_iata: newDepIata || null,
      departure_timezone: newDepTimezone || null,
      departure_time: newDepTime ? tzInputToISO(newDepTime, newDepTimezone) : null,
      arrival_airport: newArrAirport || null,
      arrival_iata: newArrIata || null,
      arrival_timezone: newArrTimezone || null,
      arrival_time: newArrTime ? tzInputToISO(newArrTime, newArrTimezone) : null,
      notes: newNotes || null,
    }).select().single();
    setAddLoading(false);
    if (error) { toast.error(error.message); return; }
    setFlights([...flights, { ...data, assignments: [] }]);
    setShowAdd(false);
    resetAddForm();
    toast.success("Flight added");
  }

  async function deleteFlight(id: string) {
    const supabase = createClient();
    const { error } = await supabase.from("flights").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    setFlights(flights.filter((f) => f.id !== id));
    toast.success("Deleted");
  }

  function handleSaved() { router.refresh(); }

  // Participant view
  if (!isOrganizer) {
    const myFlights = flights.filter((f) => f.assignments.some((a) => a.member_id === currentMemberId));
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Your flights</h2>
        {myFlights.length === 0 && (
          <p className="text-gray-500 text-sm">The organizer hasn&apos;t assigned you to a flight yet.</p>
        )}
        {myFlights.map((f) => (
          <Card key={f.id} className="border-blue-200 bg-blue-50/30">
            <CardContent className="pt-4 space-y-3">
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-lg">{f.flight_iata}</span>
                {f.flight_status && (
                  <Badge variant="outline" className={`text-xs capitalize ${statusColor(f.flight_status)}`}>
                    {f.flight_status}
                  </Badge>
                )}
              </div>
              {f.airline_name && <p className="text-sm text-gray-600">{f.airline_name}</p>}
              <div className="flex items-center gap-3">
                <div className="text-center">
                  <p className="font-bold text-base">{f.departure_iata ?? "—"}</p>
                  <p className="text-xs text-gray-500 truncate max-w-[100px]">{f.departure_airport}</p>
                  <p className="text-xs text-gray-400">{fmtTime(f.departure_time, f.departure_timezone)}</p>
                </div>
                <div className="flex-1 border-t-2 border-dashed border-gray-300 relative">
                  <span className="absolute -top-2 left-1/2 -translate-x-1/2 text-gray-400 text-sm">✈</span>
                </div>
                <div className="text-center">
                  <p className="font-bold text-base">{f.arrival_iata ?? "—"}</p>
                  <p className="text-xs text-gray-500 truncate max-w-[100px]">{f.arrival_airport}</p>
                  <p className="text-xs text-gray-400">{fmtTime(f.arrival_time, f.arrival_timezone)}</p>
                </div>
              </div>
              {f.notes && <p className="text-sm text-gray-500">{f.notes}</p>}
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  // Organizer view
  const editingFlight = flights.find((f) => f.id === editingId) ?? null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">
          All flights <span className="text-gray-400 font-normal text-base">({flights.length})</span>
        </h2>
        <Button onClick={() => setShowAdd(true)}>+ Add flight</Button>
      </div>

      {flights.length === 0 && (
        <p className="text-gray-400 text-sm text-center py-8">No flights yet. Add one above.</p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {flights.map((f) => (
          <Card
            key={f.id}
            className="cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => setEditingId(f.id)}
          >
            <CardContent className="pt-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono font-bold text-lg">{f.flight_iata}</span>
                <div className="flex items-center gap-2">
                  {f.flight_status && (
                    <Badge variant="outline" className={`text-xs capitalize ${statusColor(f.flight_status)}`}>
                      {f.flight_status}
                    </Badge>
                  )}
                  {f.assignments.length > 0 && (
                    <Badge variant="secondary" className="text-xs">
                      {f.assignments.length} pax
                    </Badge>
                  )}
                </div>
              </div>

              {f.airline_name && <p className="text-xs text-gray-500">{f.airline_name}</p>}

              <div className="flex items-center gap-2">
                <div className="text-center min-w-[52px]">
                  <p className="font-semibold text-sm">{f.departure_iata ?? "—"}</p>
                  <p className="text-xs text-gray-400">{fmtTime(f.departure_time, f.departure_timezone)}</p>
                </div>
                <div className="flex-1 border-t-2 border-dashed border-gray-200 relative mx-1">
                  <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-gray-300 text-sm">✈</span>
                </div>
                <div className="text-center min-w-[52px]">
                  <p className="font-semibold text-sm">{f.arrival_iata ?? "—"}</p>
                  <p className="text-xs text-gray-400">{fmtTime(f.arrival_time, f.arrival_timezone)}</p>
                </div>
              </div>

              {f.assignments.length > 0 && (
                <div className="flex items-center gap-1.5 pt-1">
                  <div className="flex -space-x-2">
                    {f.assignments.slice(0, 6).map((a) => a.member && (
                      <Avatar key={a.id} className="h-6 w-6 border-2 border-white">
                        <AvatarFallback className="text-xs bg-blue-100 text-blue-700">
                          {memberInitials(a.member)}
                        </AvatarFallback>
                      </Avatar>
                    ))}
                  </div>
                  <span className="text-xs text-gray-500 truncate">
                    {f.assignments.map((a) => a.member ? memberName(a.member) : "").filter(Boolean).join(", ")}
                  </span>
                </div>
              )}
              {f.assignments.length === 0 && (
                <p className="text-xs text-gray-400 italic">No passengers assigned — click to assign</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Edit modal */}
      {editingFlight && (
        <FlightModal
          flight={editingFlight}
          members={members}
          onClose={() => setEditingId(null)}
          onSaved={() => { setEditingId(null); handleSaved(); }}
          onDelete={(id) => { deleteFlight(id); setEditingId(null); }}
        />
      )}

      {/* Add flight dialog */}
      <Dialog open={showAdd} onOpenChange={(open) => { if (!open) { setShowAdd(false); resetAddForm(); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add flight</DialogTitle>
          </DialogHeader>

          {/* Lookup section */}
          <div className="space-y-3 p-4 rounded-lg bg-gray-50 border">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Look up by flight code</p>
            <div className="flex gap-2">
              <Input
                placeholder="e.g. AA123"
                value={lookupCode}
                onChange={(e) => setLookupCode(e.target.value.toUpperCase())}
                className="font-mono"
                onKeyDown={(e) => { if (e.key === "Enter") handleLookup(); }}
              />
              <Input
                type="date"
                value={lookupDate}
                onChange={(e) => setLookupDate(e.target.value)}
                className="w-40"
                title="Optional: filter by date"
              />
              <Button variant="outline" onClick={handleLookup} disabled={!lookupCode || looking}>
                {looking ? "…" : "Look up"}
              </Button>
            </div>
            <p className="text-xs text-gray-400">
              Fetches real-time data from AviationStack. Date is optional but helps narrow results.
            </p>

            {/* Multiple results picker */}
            {lookupResults && lookupResults.length > 1 && (
              <div className="space-y-1 mt-2">
                <p className="text-xs text-gray-500">{lookupResults.length} results found — pick one:</p>
                {lookupResults.map((r, i) => (
                  <button
                    key={i}
                    onClick={() => { applyLookupResult(r); setLookupResults(null); toast.success("Details filled in"); }}
                    className={`w-full text-left px-3 py-2 rounded-md border text-sm hover:bg-white transition-colors ${selectedResult === r ? "border-blue-400 bg-white" : "border-gray-200"}`}
                  >
                    <span className="font-mono font-bold mr-2">{r.flight_iata}</span>
                    <span className="text-gray-600">{r.departure_iata} → {r.arrival_iata}</span>
                    <span className="text-gray-400 ml-2">{fmtTime(r.departure_time, r.departure_timezone)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <Separator />

          {/* Manual / override fields */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Flight details</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Flight code *</Label>
                <Input
                  placeholder="AA123"
                  className="font-mono"
                  value={newFlightIata}
                  onChange={(e) => setNewFlightIata(e.target.value.toUpperCase())}
                />
              </div>
              <div className="space-y-2">
                <Label>Airline</Label>
                <Input placeholder="American Airlines" value={newAirlineName} onChange={(e) => setNewAirlineName(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Departure airport</Label>
                <Input placeholder="San Francisco Intl" value={newDepAirport} onChange={(e) => setNewDepAirport(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Dep. IATA code</Label>
                <Input placeholder="SFO" value={newDepIata} onChange={(e) => setNewDepIata(e.target.value.toUpperCase())} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Departure time <span className="text-gray-400 font-normal">(airport local)</span></Label>
                <Input type="datetime-local" value={newDepTime} onChange={(e) => setNewDepTime(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Dep. timezone</Label>
                <TimezoneSelect value={newDepTimezone} onChange={setNewDepTimezone} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Arrival airport</Label>
                <Input placeholder="Dallas/Fort Worth Intl" value={newArrAirport} onChange={(e) => setNewArrAirport(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Arr. IATA code</Label>
                <Input placeholder="DFW" value={newArrIata} onChange={(e) => setNewArrIata(e.target.value.toUpperCase())} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Arrival time <span className="text-gray-400 font-normal">(airport local)</span></Label>
                <Input type="datetime-local" value={newArrTime} onChange={(e) => setNewArrTime(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Arr. timezone</Label>
                <TimezoneSelect value={newArrTimezone} onChange={setNewArrTimezone} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Input placeholder="Terminal, baggage claim, etc." value={newNotes} onChange={(e) => setNewNotes(e.target.value)} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowAdd(false); resetAddForm(); }}>Cancel</Button>
            <Button onClick={handleAdd} disabled={!newFlightIata || addLoading}>
              {addLoading ? "Adding…" : "Add flight"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
