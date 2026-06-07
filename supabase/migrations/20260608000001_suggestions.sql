-- Activity suggestions with upvote support.

CREATE TABLE suggestions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id        UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  member_id      UUID NOT NULL REFERENCES trip_members(id) ON DELETE CASCADE,
  title          TEXT NOT NULL,
  description    TEXT,
  preferred_date     DATE,
  preferred_time     TIME,
  duration_minutes   INTEGER,
  created_at         TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE suggestion_votes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  suggestion_id UUID NOT NULL REFERENCES suggestions(id) ON DELETE CASCADE,
  member_id     UUID NOT NULL REFERENCES trip_members(id) ON DELETE CASCADE,
  UNIQUE(suggestion_id, member_id)
);

ALTER TABLE suggestions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE suggestion_votes ENABLE ROW LEVEL SECURITY;

-- Suggestions: all trip members can read; members can add their own; members/organizers can delete.
CREATE POLICY "trip members can view suggestions"
  ON suggestions FOR SELECT
  USING (is_trip_member(trip_id));

CREATE POLICY "trip members can add suggestions"
  ON suggestions FOR INSERT
  WITH CHECK (
    is_trip_member(trip_id)
    AND member_id = (
      SELECT id FROM trip_members
      WHERE trip_id = suggestions.trip_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "members can delete own suggestions, organizers any"
  ON suggestions FOR DELETE
  USING (
    member_id = (SELECT id FROM trip_members WHERE trip_id = suggestions.trip_id AND user_id = auth.uid())
    OR is_trip_organizer(trip_id)
  );

-- Votes: all trip members can read; members can vote/unvote once.
CREATE POLICY "trip members can view votes"
  ON suggestion_votes FOR SELECT
  USING (
    is_trip_member((SELECT trip_id FROM suggestions WHERE id = suggestion_votes.suggestion_id))
  );

CREATE POLICY "trip members can add votes"
  ON suggestion_votes FOR INSERT
  WITH CHECK (
    member_id = (
      SELECT tm.id FROM trip_members tm
      JOIN suggestions s ON s.id = suggestion_votes.suggestion_id
      WHERE tm.trip_id = s.trip_id AND tm.user_id = auth.uid()
    )
  );

CREATE POLICY "members can remove own votes"
  ON suggestion_votes FOR DELETE
  USING (
    member_id = (
      SELECT tm.id FROM trip_members tm
      JOIN suggestions s ON s.id = suggestion_votes.suggestion_id
      WHERE tm.trip_id = s.trip_id AND tm.user_id = auth.uid()
    )
  );
