# KS Domain

KS records and presents cue-sports matches. Its current match mode is optimized for two players scoring without a dedicated referee or secretary.

## Competition

**Match**:
A contest whose winner is the first player to win the target number of frames.

**Active Match**:
A Match that may accept Commands. Its authoritative history and current state remain in MatchRoom storage.
_Avoid_: Live Match

**Finalizing Match**:
A Match whose match-ending Accepted Command and Final Match State are durable. It has ended and no longer accepts new Commands. Its MatchRoom retains the finalizing status even after its Protocol is archived and D1 marks the Match finished.

**Finished Match**:
A Match that has ended, whose final Protocol and Final Match State are archived by application in D1, and whose D1 row is marked finished. Finished reads use D1, not the retained MatchRoom.

**Sparring Match**:
A two-player match scored by the players themselves, without a dedicated referee or secretary. It deliberately supports less officiating detail and fewer statistics than a tournament match may require.

**Frame**:
One scoring contest within a match. Winning a frame advances a player toward the match's target number of frames.

**Commence a Frame**:
Begin play in a prepared frame.
_Avoid_: Start a frame

**Award a Frame**:
Formally assign a completed frame to its winner in the match protocol.
_Avoid_: Close a frame

**Rack**:
A subdivision of a frame used by games whose play resets or continues across successive arrangements of balls.

**Owed Balls**:
In old Combined Pyramid, the number of balls a player must legally pot to repay penalties before accumulating a positive score.
_Avoid_: Negative pots

## Presentation

**Projection**:
A disposable representation derived from authoritative match state or records and shaped for a particular reader or presentation surface. A projection never becomes authoritative match history.
_Avoid_: View

**Game Presentation**:
The game-specific descriptive portion of a projection, such as score, phase, ball state, messages, or situation copy. It describes what the user interface presents but excludes Controls, which remain sibling capabilities in the containing projection.
_Avoid_: Game view, Control projection when naming only the descriptive portion

**Control**:
A description of an interaction that the current match projection permits the user interface to present. A control may contain fixed input and may require additional user input before the renderer produces a Command. Controls are disposable presentation guidance; they are not submitted, accepted, or retained as match history.
_Avoid_: Available command, command preset

## Records

**Command**:
A request by a participant to change the recorded match. A command may be rejected and does not itself assert that a change occurred.

**Accepted Command**:
A command that changed the recorded match. Accepted commands are ordered and retained while the match is active so its state can be restored.

**Protocol Entry**:
One game-specific item in the Protocol produced when a command is accepted. An accepted command produces one or more Protocol entries atomically.

**Protocol**:
The official chronological record of match play, including player actions, corrections, and noteworthy system-determined outcomes.
_Avoid_: Event log, audit log, wire protocol

**Correction**:
An explicit accepted command that compensates for an earlier accepted command without removing it from the record.
_Avoid_: Deletion, rollback

**Final Match State**:
The state of a match after it has ended, including its target, frame scores, and frame outcomes.
_Avoid_: Snapshot, match result, match summary
