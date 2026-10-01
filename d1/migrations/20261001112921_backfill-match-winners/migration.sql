-- One-time backfill of archived Match winners and their compact final scores.
-- Cutover: finish and archive every Match, including pending finalization.
-- Stop old writers and prevent new Match creation through migration and deployment.
-- Apply with Wrangler, deploy the explicit-winner code, then reopen creation/scoring.
-- Retained old MatchRooms are not migrated or read again. Do not resume old writers
-- without a separate data-compatibility plan.
-- Wrangler applies this migration atomically; any failed guard rolls back the backfill.
CREATE TABLE `__match_winner_backfill_guard` (
  `valid` integer NOT NULL CHECK (`valid` = 1)
);
--> statement-breakpoint
INSERT INTO `__match_winner_backfill_guard`
SELECT
  NOT EXISTS (
    SELECT 1
    FROM `sparring_matches` AS m
    LEFT JOIN `sparring_match_archives` AS a ON a.match_id = m.match_id
    WHERE m.status != 'finished' OR a.match_id IS NULL
  )
  AND NOT EXISTS (
    SELECT 1
    FROM `sparring_match_archives` AS a
    LEFT JOIN `sparring_matches` AS m ON m.match_id = a.match_id
    WHERE m.match_id IS NULL
  );
--> statement-breakpoint
-- Legacy Matches were frame races. Require exactly one match-ended outcome,
-- agreeing with the final Frame, rather than comparing points or frame counts.
-- Already explicit winners are authoritative and are not inferred again.
WITH outcomes AS (
  SELECT a.*, m.game_key, m.ended_at, m.final_source_latest_seq, m.final_score_json,
    (
      SELECT count(*) FROM json_each(a.rows_json)
      WHERE json_extract(value, '$.entryType') = 'match-ended'
        AND json_extract(value, '$.source') = 'system'
    ) AS ending_count,
    (
      SELECT json_extract(value, '$.seat') FROM json_each(a.rows_json)
      WHERE json_extract(value, '$.entryType') = 'match-ended'
        AND json_extract(value, '$.source') = 'system'
    ) AS recorded_winner
  FROM sparring_match_archives AS a
  JOIN sparring_matches AS m ON m.match_id = a.match_id
)
INSERT INTO `__match_winner_backfill_guard`
SELECT
  json_extract(state_json, '$.status') IS 'finished'
  AND json_extract(state_json, '$.matchId') IS match_id
  AND json_extract(state_json, '$.gameKey') IS game_key
  AND source_latest_seq IS final_source_latest_seq
  AND created_at IS ended_at
  AND CASE WHEN json_type(state_json, '$.winnerSeat') IS NULL THEN
    ending_count = 1
    AND recorded_winner IN ('A', 'B')
    AND json_extract(state_json, '$.frames[#-1].winnerSeat') IS recorded_winner
    AND json_extract(state_json, '$.frames[#-1].frameIndex') IS json_extract(state_json, '$.currentFrameIndex')
  ELSE json_extract(state_json, '$.winnerSeat') IN ('A', 'B') END
  AND (
    json_type(final_score_json, '$.winnerSeat') IS NULL
    OR json_extract(final_score_json, '$.winnerSeat') IS
      coalesce(json_extract(state_json, '$.winnerSeat'), recorded_winner)
  )
FROM outcomes;
--> statement-breakpoint
UPDATE `sparring_match_archives`
SET state_json = json_insert(state_json, '$.winnerSeat', (
  SELECT json_extract(value, '$.seat') FROM json_each(rows_json)
  WHERE json_extract(value, '$.entryType') = 'match-ended'
    AND json_extract(value, '$.source') = 'system'
))
WHERE json_type(state_json, '$.winnerSeat') IS NULL;
--> statement-breakpoint
-- Rebuild the disposable score from Final Match State, in projectMatchScore's
-- field order. markMatchFinished's retry guard compares the serialized JSON.
UPDATE `sparring_matches` AS m
SET final_score_json = (
  SELECT json_object(
    'matchTargetFrames', json_extract(a.state_json, '$.targets.matchTargetFrames'),
    'frameTargetPointsBySeat', json_object(
      'A', json_extract(a.state_json, '$.targets.frameTargetPointsBySeat.A'),
      'B', json_extract(a.state_json, '$.targets.frameTargetPointsBySeat.B')
    ),
    'framesWonBySeat', json_object(
      'A', json_extract(a.state_json, '$.framesWonBySeat.A'),
      'B', json_extract(a.state_json, '$.framesWonBySeat.B')
    ),
    'winnerSeat', json_extract(a.state_json, '$.winnerSeat'),
    'singleFramePointsBySeat', json(CASE
      WHEN json_extract(a.state_json, '$.targets.matchTargetFrames') = 1 THEN (
        SELECT json_object(
          'A', json_extract(value, '$.pointsBySeat.A'),
          'B', json_extract(value, '$.pointsBySeat.B')
        ) FROM json_each(a.state_json, '$.frames')
        WHERE json_extract(value, '$.frameIndex') = json_extract(a.state_json, '$.currentFrameIndex')
      )
      ELSE NULL
    END),
    'activeFrame', NULL
  )
  FROM sparring_match_archives AS a WHERE a.match_id = m.match_id
);
--> statement-breakpoint
DROP TABLE `__match_winner_backfill_guard`;
