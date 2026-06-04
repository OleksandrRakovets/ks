import { keys } from '@ks/i18n'
import { useTranslation } from 'react-i18next'

// export function loader(_args: Route.LoaderArgs) {
//   return redirect('/admin/create')
// }

export default function Index() {
  const { t } = useTranslation()

  return (
    <main className="flex flex-1 items-center justify-center">
      <h1 className="inline-block pb-32 font-[Georgia] text-5xl">{t(keys.app.homeComingSoon)}</h1>
    </main>
  )
}
