interface ImportMetaEnv {
  /** Vite `define` (vite.config.ts): true only in code compiled by the dev server, false in every build. */
  readonly KS_DEV_SERVER?: boolean
}

declare module 'virtual:react-router/server-build' {
  import type { ServerBuild } from 'react-router'

  const serverBuild: ServerBuild
  export = serverBuild
}
