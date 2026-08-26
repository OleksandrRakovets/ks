# KS Domain

KS records and presents cue-sports matches. Its current match mode is optimized for two players scoring without a dedicated referee or secretary.

## Competition

**Match**:
A contest whose winner is the first player to win the target number of frames.

**Sparring Match**:
A two-player match scored by the players themselves, without a dedicated referee or secretary. It deliberately supports less officiating detail and fewer statistics than a tournament match may require.

**Frame**:
One scoring contest within a match. Winning a frame advances a player toward the match's target number of frames.

**Rack**:
A subdivision of a frame used by games whose play resets or continues across successive arrangements of balls.

## Records

**Command**:
A request by a participant to change the recorded match. A command may be rejected and does not itself assert that a change occurred.

**Fact**:
An immutable truth accepted while recording an active match. Facts are distinct from the commands that caused them.
_Avoid_: Event, command

**Fact History**:
The ordered facts accepted while recording an active match. It is authoritative until the match ends and its permanent records have been derived.
_Avoid_: Journal, event stream

**Protocol**:
The official chronological record of match play, including player actions, corrections, and noteworthy system-determined outcomes.
_Avoid_: Event log, audit log, wire protocol

**Correction**:
An explicit recorded change that compensates for an earlier accepted command without removing its facts from Fact History.
_Avoid_: Deletion, rollback

**Final Match State**:
The state of a match after it has ended, including its target, frame scores, and frame outcomes.
_Avoid_: Snapshot, match result, match summary
