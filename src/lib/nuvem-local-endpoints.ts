export function resolveNuvemLocalEndpoints(
  environment: 'production' | 'homologation',
  env: Readonly<Record<string, string | undefined>> = process.env
) {
  const production = environment === 'production';
  const base = production ? env.NUVEMFISCAL_PROD_URL : env.NUVEMFISCAL_HOM_URL;
  const explicitAuth = production ? env.NUVEMFISCAL_PROD_AUTH_URL : env.NUVEMFISCAL_HOM_AUTH_URL;
  if (!base?.trim()) throw new Error(`Configure a URL da Nuvem Local (${environment}).`);
  const api = new URL(base.trim());
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(api.hostname);
  const isPublicProvider = (hostname: string) => hostname === 'nuvemfiscal.com.br' || hostname.endsWith('.nuvemfiscal.com.br');
  if (api.username || api.password || api.search || api.hash ||
      (api.protocol !== 'https:' && !(local && api.protocol === 'http:')) || isPublicProvider(api.hostname)) {
    throw new Error('Destino da Nuvem Local invalido.');
  }
  const apiUrl = api.toString().replace(/\/$/, '');
  const auth = new URL(explicitAuth?.trim() || `${apiUrl}/oauth/token`);
  // Credentials may only be sent to this explicitly configured local authority.
  if (auth.origin !== api.origin || auth.username || auth.password || auth.search || auth.hash ||
      auth.pathname !== `${api.pathname.replace(/\/$/, '')}/oauth/token`) {
    throw new Error('OAuth deve usar o endpoint da Nuvem Local configurada.');
  }
  return { apiUrl, authUrl: auth.toString() };
}
