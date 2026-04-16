import { Card, CardContent, CardHeader, CardTitle } from '@ks/ui'
import mermaid from 'mermaid'
import type { ReactNode } from 'react'
import { useEffect, useId, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router'

import { generatedGameStateMachines } from './generated/game-state-machines'

type PreviewGameStateMachine = (typeof generatedGameStateMachines.games)[number]

function escapeMermaidLabel(value: string): string {
  return value.replaceAll('"', '\\"')
}

function buildMermaidDiagram(game: PreviewGameStateMachine): string {
  const lines = ['flowchart TD']
  const nodeIds = new Map<string, string>()
  const transitionKeyCounts = new Map<string, number>()
  const transitionKeySeen = new Map<string, number>()
  const hiddenLinkIndexes: number[] = []
  const hiddenNodeIds: string[] = []
  let linkIndex = 0

  function ensureNode(phase: string): string {
    const existing = nodeIds.get(phase)
    if (existing) return existing

    const id = `P${nodeIds.size}`
    nodeIds.set(phase, id)
    lines.push(`  ${id}["${escapeMermaidLabel(phase)}"]`)
    return id
  }

  function ensureHiddenNode(): string {
    const id = `H${hiddenNodeIds.length}`
    hiddenNodeIds.push(id)
    lines.push(`  ${id}[" "]`)
    return id
  }

  function ensureSpacerNode(name: string): string {
    const id = `S_${name}`
    if (!hiddenNodeIds.includes(id)) {
      hiddenNodeIds.push(id)
      lines.push(`  ${id}["                              "]`)
    }
    return id
  }

  for (const phase of game.phases) {
    ensureNode(phase)
  }

  const resolutionPhases: string[] = ['winner-determined', 'frame-over'].filter((phase) =>
    (game.phases as readonly string[]).includes(phase),
  )
  const respottedBlackPhases: string[] = ['respotted-black-opening', 'respotted-black-play'].filter((phase) =>
    (game.phases as readonly string[]).includes(phase),
  )
  const mainPhases = (game.phases as readonly string[]).filter(
    (phase) => !resolutionPhases.includes(phase) && !respottedBlackPhases.includes(phase),
  )

  if (mainPhases.length > 0) {
    lines.push('  subgraph MAIN[" "]')
    lines.push('    direction LR')
    const leftSpacer = ensureSpacerNode('MAIN_LEFT')
    const rightSpacer = ensureSpacerNode('MAIN_RIGHT')
    lines.push(`    ${leftSpacer}`)
    for (const phase of mainPhases) {
      lines.push(`    ${ensureNode(phase)}`)
    }
    lines.push(`    ${rightSpacer}`)
    lines.push('  end')
  }

  if (respottedBlackPhases.length > 0 || resolutionPhases.length > 0) {
    lines.push('  subgraph LOWER[" "]')
    lines.push('    direction LR')

    if (respottedBlackPhases.length > 0) {
      lines.push('    subgraph RESPOTTED_BLACK[" "]')
      lines.push('      direction TB')
      for (const phase of respottedBlackPhases) {
        lines.push(`      ${ensureNode(phase)}`)
      }
      lines.push('    end')
    }

    if (resolutionPhases.length > 0) {
      lines.push('    subgraph RESOLUTION[" "]')
      lines.push('      direction TB')
      for (const phase of resolutionPhases) {
        lines.push(`      ${ensureNode(phase)}`)
      }
      lines.push('    end')
    }

    lines.push('  end')
    lines.push('  style LOWER fill:none,stroke:none')
  }

  function addHiddenEdge(fromPhase: string, toPhase: string) {
    addHiddenEdgeById(ensureNode(fromPhase), ensureNode(toPhase))
  }

  function addHiddenEdgeById(fromId: string, toId: string) {
    lines.push(`  ${fromId} --> ${toId}`)
    hiddenLinkIndexes.push(linkIndex)
    linkIndex += 1
  }

  for (let index = 0; index < mainPhases.length - 1; index += 1) {
    addHiddenEdge(mainPhases[index], mainPhases[index + 1])
  }

  if (mainPhases.length > 0) {
    addHiddenEdgeById(ensureSpacerNode('MAIN_LEFT'), ensureNode(mainPhases[0]))
    addHiddenEdgeById(ensureNode(mainPhases[mainPhases.length - 1]), ensureSpacerNode('MAIN_RIGHT'))
  }

  for (let index = 0; index < respottedBlackPhases.length - 1; index += 1) {
    addHiddenEdge(respottedBlackPhases[index], respottedBlackPhases[index + 1])
  }

  for (let index = 0; index < resolutionPhases.length - 1; index += 1) {
    addHiddenEdge(resolutionPhases[index], resolutionPhases[index + 1])
  }

  const lowerPhases = [...respottedBlackPhases, ...resolutionPhases]
  if (mainPhases.length > 0 && lowerPhases.length > 0) {
    const mainHubPhase = mainPhases.includes('open-play') ? 'open-play' : mainPhases[mainPhases.length - 1]
    const lowerHubId = ensureHiddenNode()

    addHiddenEdgeById(ensureNode(mainHubPhase), lowerHubId)

    if (respottedBlackPhases.length > 0) {
      const respottedHubId = ensureHiddenNode()
      addHiddenEdgeById(lowerHubId, respottedHubId)
      addHiddenEdgeById(respottedHubId, ensureNode(respottedBlackPhases[0]))
    }

    if (resolutionPhases.length > 0) {
      const resolutionHubId = ensureHiddenNode()
      addHiddenEdgeById(lowerHubId, resolutionHubId)
      addHiddenEdgeById(resolutionHubId, ensureNode(resolutionPhases[0]))
    }
  }

  for (const transition of game.transitions) {
    const key = `${transition.fromPhase}::${transition.commandType}`
    transitionKeyCounts.set(key, (transitionKeyCounts.get(key) ?? 0) + 1)
  }

  for (const transition of game.transitions) {
    const fromId = ensureNode(transition.fromPhase)
    const toId = ensureNode(transition.toPhase)
    const key = `${transition.fromPhase}::${transition.commandType}`
    const seen = (transitionKeySeen.get(key) ?? 0) + 1
    transitionKeySeen.set(key, seen)
    const label = (transitionKeyCounts.get(key) ?? 0) > 1 ? `${transition.commandType} ${seen}` : transition.commandType
    lines.push(`  ${fromId} -->|${escapeMermaidLabel(label)}| ${toId}`)
    linkIndex += 1
  }

  for (const hiddenLinkIndex of hiddenLinkIndexes) {
    lines.push(`  linkStyle ${hiddenLinkIndex} stroke:transparent,fill:none,color:transparent`)
  }

  for (const hiddenNodeId of hiddenNodeIds) {
    lines.push(`  style ${hiddenNodeId} fill:transparent,stroke:transparent,color:transparent`)
  }

  return lines.join('\n')
}

function buildDuplicateLabelLegend(game: PreviewGameStateMachine): Array<{ key: string; label: string; sample: string }> {
  const counts = new Map<string, number>()
  const seen = new Map<string, number>()

  for (const transition of game.transitions) {
    const key = `${transition.fromPhase}::${transition.commandType}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  const legend: Array<{ key: string; label: string; sample: string }> = []

  for (const transition of game.transitions) {
    const key = `${transition.fromPhase}::${transition.commandType}`
    if ((counts.get(key) ?? 0) <= 1) continue

    const index = (seen.get(key) ?? 0) + 1
    seen.set(key, index)
    legend.push({
      key,
      label: `${transition.commandType} ${index}`,
      sample: `${transition.fromPhase} -> ${transition.toPhase}: ${transition.sample}`,
    })
  }

  return legend
}

function Row(props: { label: string; value: ReactNode }) {
  return (
    <div className="grid gap-1 border-b border-border/60 py-2 text-sm last:border-b-0 md:grid-cols-[12rem,1fr]">
      <div className="text-muted-foreground">{props.label}</div>
      <div>{props.value}</div>
    </div>
  )
}

export default function PreviewGameStateDetailRoute() {
  const params = useParams()
  const game = generatedGameStateMachines.games.find((entry) => entry.gameKey === params.gameKey)
  const renderId = useId().replaceAll(':', '-')
  const diagram = useMemo(() => (game ? buildMermaidDiagram(game) : ''), [game])
  const duplicateLegend = useMemo(() => (game ? buildDuplicateLabelLegend(game) : []), [game])
  const [diagramSvg, setDiagramSvg] = useState<string | null>(null)
  const [diagramError, setDiagramError] = useState<string | null>(null)

  useEffect(() => {
    if (!game) return

    let cancelled = false

    mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'neutral' })

    void mermaid
      .render(`game-state-${renderId}`, diagram)
      .then(({ svg }) => {
        if (!cancelled) {
          setDiagramSvg(svg)
          setDiagramError(null)
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setDiagramSvg(null)
          setDiagramError(error instanceof Error ? error.message : 'Failed to render Mermaid diagram')
        }
      })

    return () => {
      cancelled = true
    }
  }, [diagram, game, renderId])

  if (!game) {
    throw new Response('Unknown gameKey', { status: 404 })
  }

  return (
    <main className="min-h-dvh flex-1 bg-background px-4 py-6 text-foreground">
      <div className="mx-auto w-full max-w-6xl space-y-4">
        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
          <Link className="underline-offset-4 hover:underline" to="/top-secret/preview">
            Preview index
          </Link>
          <Link className="underline-offset-4 hover:underline" to="/top-secret/preview/game-state">
            Game state list
          </Link>
        </div>

        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{game.title.en}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{game.gameKey}</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>State Graph</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {diagramError ? <div className="text-sm text-destructive">{diagramError}</div> : null}
            {diagramSvg ? <div className="min-w-[48rem]" dangerouslySetInnerHTML={{ __html: diagramSvg }} /> : null}
            {!diagramSvg && !diagramError ? <div className="text-sm text-muted-foreground">Rendering diagram...</div> : null}
            {duplicateLegend.length > 0 ? (
              <div className="mt-4 grid gap-1 text-xs text-muted-foreground">
                {duplicateLegend.map((entry) => (
                  <div key={`${entry.key}-${entry.label}`}>
                    <span className="font-medium text-foreground">{entry.label}</span>: {entry.sample}
                  </div>
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Sources</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-1 text-sm text-muted-foreground">
            {game.sourceFiles.map((file) => (
              <div key={file}>{file}</div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Phase Commands</CardTitle>
          </CardHeader>
          <CardContent>
            {game.phaseDetails.map((detail) => (
              <div key={detail.phase} className="border-b border-border/60 py-3 last:border-b-0">
                <div className="font-medium">{detail.phase}</div>
                <Row
                  label="Control commands"
                  value={detail.controlCommands.length > 0 ? detail.controlCommands.join(', ') : 'none'}
                />
                {'reducerAllowedCommands' in detail && detail.reducerAllowedCommands ? (
                  <Row
                    label="Reducer-allowed commands"
                    value={detail.reducerAllowedCommands.length > 0 ? detail.reducerAllowedCommands.join(', ') : 'none'}
                  />
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Sampled Transitions</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full min-w-[48rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="py-2 pr-4 font-medium">From</th>
                  <th className="py-2 pr-4 font-medium">Command</th>
                  <th className="py-2 pr-4 font-medium">To</th>
                  <th className="py-2 font-medium">Sample</th>
                </tr>
              </thead>
              <tbody>
                {game.transitions.map((transition, index) => (
                  <tr
                    key={`${transition.fromPhase}-${transition.commandType}-${transition.toPhase}-${index}`}
                    className="border-b border-border/60 align-top last:border-b-0"
                  >
                    <td className="py-2 pr-4">{transition.fromPhase}</td>
                    <td className="py-2 pr-4">{transition.commandType}</td>
                    <td className="py-2 pr-4">{transition.toPhase}</td>
                    <td className="py-2 text-muted-foreground">{transition.sample}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
