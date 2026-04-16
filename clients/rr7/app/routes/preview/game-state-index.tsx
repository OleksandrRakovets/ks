import { Card, CardContent, CardHeader, CardTitle } from '@ks/ui'
import { Link } from 'react-router'

import { generatedGameStateMachines } from './generated/game-state-machines'

export default function PreviewGameStateIndexRoute() {
  return (
    <main className="min-h-dvh flex-1 bg-background px-4 py-6 text-foreground">
      <div className="mx-auto w-full max-w-5xl space-y-4">
        <div className="text-sm text-muted-foreground">
          <Link className="underline-offset-4 hover:underline" to="/top-secret/preview">
            Preview index
          </Link>
        </div>

        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Game state previews</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Generated from gameplay code. Facts first: phases, control commands, and sampled transitions.
          </p>
        </div>

        <div className="text-xs text-muted-foreground">Generated at {generatedGameStateMachines.generatedAt}</div>

        <div className="grid gap-3 md:grid-cols-2">
          {generatedGameStateMachines.games.map((game) => (
            <Card key={game.gameKey}>
              <CardHeader>
                <CardTitle className="text-lg">
                  <Link className="underline-offset-4 hover:underline" to={`/top-secret/preview/game-state/${game.gameKey}`}>
                    {game.title.en}
                  </Link>
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-1 text-sm text-muted-foreground">
                <div>Game key: {game.gameKey}</div>
                <div>Phases: {game.phases.length}</div>
                <div>Sampled transitions: {game.transitions.length}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </main>
  )
}
