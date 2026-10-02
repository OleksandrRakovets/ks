import { SystemClock, UnixEpochMilliseconds } from '@ks/core'
import { Result, Schema } from 'effect'
import { useSyncExternalStore } from 'react'

import { safeNormalizeDisplayName } from './player-name'

const RECENT_PLAYERS_KEY = 'ks.sparring.recentPlayers.v1'

const MAX_RECENT_PLAYERS = 5

const RecentPlayersStore = Schema.Struct({
  version: Schema.Literal(1),
  players: Schema.Array(Schema.Struct({ name: Schema.String, lastUsedAt: UnixEpochMilliseconds })),
})

type RecentPlayer = (typeof RecentPlayersStore.Type)['players'][number]

function normalizeRecentKey(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLocaleLowerCase()
}

function readRecentPlayers(): readonly RecentPlayer[] {
  try {
    const raw = localStorage.getItem(RECENT_PLAYERS_KEY)

    if (raw === null || raw.length === 0) return []
    const parsed = Schema.decodeUnknownResult(Schema.fromJsonString(RecentPlayersStore))(raw)

    return Result.isSuccess(parsed) ? parsed.success.players.slice(0, MAX_RECENT_PLAYERS) : []
  } catch {
    return []
  }
}

const EMPTY_RECENT_PLAYERS: readonly RecentPlayer[] = []

let clientRecentPlayers: readonly RecentPlayer[] | undefined

function writeRecentPlayers(players: readonly RecentPlayer[]) {
  clientRecentPlayers = players

  try {
    localStorage.setItem(
      RECENT_PLAYERS_KEY,
      JSON.stringify({ version: 1, players } satisfies typeof RecentPlayersStore.Type),
    )
  } catch {
    // Recent suggestions are best-effort browser-local UX only.
  }
}

function getClientRecentPlayers(): readonly RecentPlayer[] {
  clientRecentPlayers ??= readRecentPlayers()

  return clientRecentPlayers
}

function getServerRecentPlayers(): readonly RecentPlayer[] {
  return EMPTY_RECENT_PLAYERS
}

function subscribeRecentPlayers() {
  return () => {}
}

export function rememberRecentPlayers(names: string[]) {
  const now = new SystemClock().nowMs()
  const existing = getClientRecentPlayers()
  const byName = new Map(existing.map((player) => [normalizeRecentKey(player.name), player]))

  for (const rawName of names) {
    const name = safeNormalizeDisplayName(rawName)

    if (name === null) continue
    byName.set(normalizeRecentKey(name), { name, lastUsedAt: now })
  }

  writeRecentPlayers(
    [...byName.values()].sort((a, b) => b.lastUsedAt - a.lastUsedAt).slice(0, MAX_RECENT_PLAYERS),
  )
}

export function useRecentPlayers() {
  return useSyncExternalStore(subscribeRecentPlayers, getClientRecentPlayers, getServerRecentPlayers)
}

export function recentPlayerSuggestions(players: readonly RecentPlayer[], excludedName: string): string[] {
  const excludedKey = normalizeRecentKey(excludedName)

  return players
    .filter((player) => normalizeRecentKey(player.name) !== excludedKey)
    .slice(0, MAX_RECENT_PLAYERS)
    .map((player) => player.name)
}
