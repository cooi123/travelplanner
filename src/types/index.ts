export type Role = "organizer" | "participant" | "activity_manager";
export type ActivityStatus = "interested" | "confirmed" | "declined";

export interface Profile {
  id: string;
  email: string | null;
  full_name: string | null;
  created_at: string;
}

export interface Trip {
  id: string;
  name: string;
  destination: string | null;
  start_date: string | null;
  end_date: string | null;
  created_by: string;
  created_at: string;
}

export interface TripMember {
  id: string;
  trip_id: string;
  user_id: string | null;
  role: Role;
  dietary_notes: string | null;
  notes: string | null;
  guest_name: string | null;
  guest_email: string | null;
  joined_at: string;
  profile: Profile | null;
}

export interface Accommodation {
  id: string;
  trip_id: string;
  name: string;
  type: string | null;
  address: string | null;
  check_in: string | null;
  check_out: string | null;
  capacity: number;
  notes: string | null;
  created_at: string;
  assignments?: AccommodationAssignment[];
}

export interface AccommodationAssignment {
  id: string;
  accommodation_id: string;
  member_id: string;
  member?: TripMember;
}

export interface Activity {
  id: string;
  trip_id: string;
  title: string;
  description: string | null;
  location: string | null;
  starts_at: string | null;
  ends_at: string | null;
  timezone: string | null;
  capacity: number | null;
  created_at: string;
  participants?: ActivityParticipant[];
}

export interface ActivityParticipant {
  id: string;
  activity_id: string;
  member_id: string;
  status: ActivityStatus;
  member?: TripMember;
}

export interface TripInvite {
  id: string;
  trip_id: string;
  token: string;
  email: string | null;
  expires_at: string | null;
  created_at: string;
}

export interface Flight {
  id: string;
  trip_id: string;
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
  notes: string | null;
  created_at: string;
  assignments?: FlightAssignment[];
}

export interface FlightAssignment {
  id: string;
  flight_id: string;
  member_id: string;
  member?: TripMember;
}
