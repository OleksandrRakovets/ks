import type { Config } from '@react-router/dev/config'

export default {
  appDirectory: 'src/web',
  ssr: true,
  future: {
    unstable_optimizeDeps: true,
  },
} satisfies Config
