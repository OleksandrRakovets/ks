import { useEffect, useMemo, useState } from 'react'

import { safeNormalizeDisplayName } from './validation'

const RECENT_PLAYERS_KEY = 'ks.sparring.recentPlayers.v1'
const MAX_RECENT_PLAYERS = 5

type RecentPlayer = {
  name: string
  lastUsedAt: number
}

type RecentPlayersStore = {
  version: 1
  players: RecentPlayer[]
}

function normalizeRecentKey(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLocaleLowerCase()
}

function readRecentPlayers(): RecentPlayer[] {
  try {
    const raw = localStorage.getItem(RECENT_PLAYERS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as Partial<RecentPlayersStore>
    if (parsed.version !== 1 || !Array.isArray(parsed.players)) return []
    return parsed.players
      .filter((player): player is RecentPlayer => typeof player?.name === 'string' && typeof player?.lastUsedAt === 'number')
      .slice(0, MAX_RECENT_PLAYERS)
  } catch {
    return []
  }
}

function writeRecentPlayers(players: RecentPlayer[]) {
  try {
    localStorage.setItem(RECENT_PLAYERS_KEY, JSON.stringify({ version: 1, players } satisfies RecentPlayersStore))
  } catch {
    // Recent suggestions are best-effort browser-local UX only.
  }
}

export function rememberRecentPlayers(names: string[]) {
  const now = Date.now()
  const existing = readRecentPlayers()
  const byName = new Map(existing.map((player) => [normalizeRecentKey(player.name), player]))

  for (const rawName of names) {
    const name = safeNormalizeDisplayName(rawName)
    if (!name) continue
    byName.set(normalizeRecentKey(name), { name, lastUsedAt: now })
  }

  writeRecentPlayers([...byName.values()].sort((a, b) => b.lastUsedAt - a.lastUsedAt).slice(0, MAX_RECENT_PLAYERS))
}

export function useRecentPlayers() {
  const [players, setPlayers] = useState<RecentPlayer[]>([])

  useEffect(() => {
    setPlayers(readRecentPlayers())
  }, [])

  return useMemo(() => players, [players])
}

export function recentPlayerSuggestions(players: RecentPlayer[], excludedName: string): string[] {
  const excludedKey = normalizeRecentKey(excludedName)
  return players
    .filter((player) => normalizeRecentKey(player.name) !== excludedKey)
    .slice(0, MAX_RECENT_PLAYERS)
    .map((player) => player.name)
}
