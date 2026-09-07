import { keys } from '@ks/i18n'
import { useTranslation } from 'react-i18next'
// import { Link } from 'react-router'

import { BrandWordmark } from '../components/BrandWordmark'

export default function Index() {
  const { t } = useTranslation()

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-10">
      <div className="flex w-full max-w-sm flex-col items-center gap-8 pb-16">
        <BrandWordmark className="h-auto w-full max-w-[320px]" title={t(keys.appTitle)} />

        {/*<nav className="flex w-full flex-col gap-3">
          <Link
            to="/sparring/"
            className="flex h-12 items-center justify-center rounded-sm bg-green px-4 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          >
            {t(keys.nav.sparring)}
          </Link>
          <Link
            to="/sparring/matches/"
            className="flex h-12 items-center justify-center rounded-sm border border-divider bg-raised px-4 text-sm font-semibold text-foreground transition-colors hover:bg-overlay"
          >
            {t(keys.nav.allMatches)}
          </Link>
        </nav>*/}

        <p className="text-center font-[Georgia] text-3xl italic">{t(keys.app.homeComingSoon)}</p>
      </div>
    </main>
  )
}
