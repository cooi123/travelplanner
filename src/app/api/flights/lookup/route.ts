import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const flightIata = request.nextUrl.searchParams.get("flight_iata");
  const flightDate = request.nextUrl.searchParams.get("flight_date");

  if (!flightIata) {
    return Response.json({ error: "flight_iata is required" }, { status: 400 });
  }

  const apiKey = process.env.AVIATIONSTACK_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "AviationStack API key not configured" }, { status: 500 });
  }

  const params = new URLSearchParams({ access_key: apiKey, flight_iata: flightIata });
  if (flightDate) params.set("flight_date", flightDate);

  // Free plan only allows HTTP
  let res: Response;
  try {
    res = await fetch(`http://api.aviationstack.com/v1/flights?${params}`);
  } catch (err) {
    return Response.json({ error: `Network error: ${err instanceof Error ? err.message : String(err)}` }, { status: 502 });
  }

  const json = await res.json().catch(() => null);

  if (!res.ok || json?.error) {
    const msg = json?.error?.info ?? json?.error?.type ?? `HTTP ${res.status}`;
    return Response.json({ error: msg }, { status: 502 });
  }

  const flights = (json.data ?? []).map((f: AviationstackFlight) => ({
    flight_iata: f.flight?.iata ?? flightIata,
    airline_name: f.airline?.name ?? null,
    departure_airport: f.departure?.airport ?? null,
    departure_iata: f.departure?.iata ?? null,
    departure_time: f.departure?.scheduled ?? null,
    departure_timezone: f.departure?.timezone ?? null,
    arrival_airport: f.arrival?.airport ?? null,
    arrival_iata: f.arrival?.iata ?? null,
    arrival_time: f.arrival?.scheduled ?? null,
    arrival_timezone: f.arrival?.timezone ?? null,
    flight_status: f.flight_status ?? null,
  }));

  return Response.json({ flights });
}

interface AviationstackFlight {
  flight_date?: string;
  flight_status?: string;
  departure?: {
    airport?: string;
    iata?: string;
    timezone?: string;
    scheduled?: string;
  };
  arrival?: {
    airport?: string;
    iata?: string;
    timezone?: string;
    scheduled?: string;
  };
  airline?: { name?: string; iata?: string };
  flight?: { iata?: string; number?: string };
}
