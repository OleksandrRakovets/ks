import { keys } from '@ks/i18n'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { BrandWordmark } from '@/components/brand-wordmark'
import { BurgerMenu } from '@/components/burger-menu'
import { Button } from '@/components/ui'
import { localizedPath } from '@/i18n'
import { useRootLocale } from '@/root'

export default function Index() {
  const { t } = useTranslation()
  const locale = useRootLocale()

  return (
    <>
      <header className="flex h-[60px] shrink-0 items-center justify-end px-4">
        <BurgerMenu />
      </header>
      <main className="grid flex-1 grid-rows-[1fr_auto_1fr] justify-items-center px-6 py-6 md:grid-rows-[2fr_auto_3fr]">
        <div className="row-start-2 flex w-full max-w-sm flex-col items-center gap-8">
          <BrandWordmark className="h-auto w-full max-w-[320px]" title={t(keys.appTitle)} />

          <Button
            size="touch"
            nativeButton={false}
            render={<Link to={localizedPath('/sparring/', locale)} />}
            className="w-full"
          >
            {t(keys.nav.sparring)}
          </Button>
        </div>
      </main>
    </>
  )
}
