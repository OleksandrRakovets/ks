import { keys } from '@ks/i18n'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { createMatch } from '../api/ks'

export function AdminCreateMatch() {
  const { t } = useTranslation()
  const [adminUser, setAdminUser] = useState('admin')
  const [adminPass, setAdminPass] = useState('admin')
  const [gameId, setGameId] = useState<'free-pyramid' | 'combined-pyramid-old'>('free-pyramid')
  const [nameA, setNameA] = useState('Player A')
  const [nameB, setNameB] = useState('Player B')
  const [frameTargetA, setFrameTargetA] = useState(8)
  const [frameTargetB, setFrameTargetB] = useState(8)
  const [framesToWinA, setFramesToWinA] = useState(3)
  const [framesToWinB, setFramesToWinB] = useState(3)
  const [result, setResult] = useState<{ publicUrl: string; controlUrl: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="min-h-dvh px-4 py-6">
      <div className="mx-auto w-full max-w-xl">
        <h1 className="text-2xl font-semibold tracking-tight">{t(keys.match.create.title)}</h1>

        <div className="mt-6 grid gap-4 rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="grid gap-2">
            <div className="text-sm text-white/80">Admin</div>
            <div className="grid grid-cols-2 gap-2">
              <input
                id="adminUser"
                value={adminUser}
                onChange={(e) => setAdminUser(e.target.value)}
                className="rounded-lg bg-black/20 px-3 py-2 ring-1 ring-white/10 outline-none focus:ring-2 focus:ring-[var(--ks-accent)]"
                placeholder="user"
              />
              <input
                id="adminPass"
                value={adminPass}
                onChange={(e) => setAdminPass(e.target.value)}
                className="rounded-lg bg-black/20 px-3 py-2 ring-1 ring-white/10 outline-none focus:ring-2 focus:ring-[var(--ks-accent)]"
                placeholder="pass"
              />
            </div>
          </div>

          <div className="grid gap-2">
            <label htmlFor="gameId" className="text-sm text-white/80">
              {t(keys.match.create.game)}
            </label>
            <select
              id="gameId"
              value={gameId}
              onChange={(e) => setGameId(e.target.value as any)}
              className="rounded-lg bg-black/20 px-3 py-2 ring-1 ring-white/10 outline-none focus:ring-2 focus:ring-[var(--ks-accent)]"
            >
              <option value="free-pyramid">Free pyramid</option>
              <option value="combined-pyramid-old">Combined pyramid (old)</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <label htmlFor="seatAName" className="text-sm text-white/80">
                {t(keys.match.create.seatA)}
              </label>
              <input
                id="seatAName"
                value={nameA}
                onChange={(e) => setNameA(e.target.value)}
                className="rounded-lg bg-black/20 px-3 py-2 ring-1 ring-white/10 outline-none focus:ring-2 focus:ring-[var(--ks-accent)]"
              />
            </div>
            <div className="grid gap-2">
              <label htmlFor="seatBName" className="text-sm text-white/80">
                {t(keys.match.create.seatB)}
              </label>
              <input
                id="seatBName"
                value={nameB}
                onChange={(e) => setNameB(e.target.value)}
                className="rounded-lg bg-black/20 px-3 py-2 ring-1 ring-white/10 outline-none focus:ring-2 focus:ring-[var(--ks-accent)]"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <div className="text-sm text-white/80">Frame target (A/B)</div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  value={frameTargetA}
                  onChange={(e) => setFrameTargetA(Number(e.target.value))}
                  className="rounded-lg bg-black/20 px-3 py-2 ring-1 ring-white/10 outline-none"
                />
                <input
                  type="number"
                  value={frameTargetB}
                  onChange={(e) => setFrameTargetB(Number(e.target.value))}
                  className="rounded-lg bg-black/20 px-3 py-2 ring-1 ring-white/10 outline-none"
                />
              </div>
            </div>
            <div className="grid gap-2">
              <div className="text-sm text-white/80">Frames to win (A/B)</div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  value={framesToWinA}
                  onChange={(e) => setFramesToWinA(Number(e.target.value))}
                  className="rounded-lg bg-black/20 px-3 py-2 ring-1 ring-white/10 outline-none"
                />
                <input
                  type="number"
                  value={framesToWinB}
                  onChange={(e) => setFramesToWinB(Number(e.target.value))}
                  className="rounded-lg bg-black/20 px-3 py-2 ring-1 ring-white/10 outline-none"
                />
              </div>
            </div>
          </div>

          <button
            type="button"
            className="mt-2 rounded-lg bg-[var(--ks-accent)] px-4 py-2 font-semibold text-black"
            onClick={async () => {
              setError(null)
              setResult(null)
              try {
                const res = await createMatch({
                  adminUser,
                  adminPass,
                  gameId,
                  targets: {
                    frameTargetPointsBySeat: { A: frameTargetA, B: frameTargetB },
                    matchTargetFramesBySeat: { A: framesToWinA, B: framesToWinB },
                  },
                  participants: [
                    { seat: 'A', displayName: nameA },
                    { seat: 'B', displayName: nameB },
                  ],
                })
                setResult({ publicUrl: res.publicUrl, controlUrl: res.controlUrl })
              } catch (e) {
                setError(e instanceof Error ? e.message : String(e))
              }
            }}
          >
            {t(keys.match.create.create)}
          </button>

          {error ? <div className="text-sm text-red-200">{error}</div> : null}
          {result ? (
            <div className="grid gap-2 text-sm">
              <div>
                Public:{' '}
                <a className="underline" href={result.publicUrl}>
                  {result.publicUrl}
                </a>
              </div>
              <div>
                Control:{' '}
                <a className="underline" href={result.controlUrl}>
                  {result.controlUrl}
                </a>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
