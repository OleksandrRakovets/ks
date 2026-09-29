export type Env = Omit<Cloudflare.Env, 'KS_DEPLOY_ENV'> & Partial<Pick<Cloudflare.Env, 'KS_DEPLOY_ENV'>>
