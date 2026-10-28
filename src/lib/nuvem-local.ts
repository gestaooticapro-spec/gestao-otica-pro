// Mantem as variaveis NUVEMFISCAL_* por compatibilidade com o ambiente legado.
import { resolveNuvemLocalEndpoints } from './nuvem-local-endpoints';

type CachedToken = {
    token: string;
    expiresAt: number;
};

const TOKEN_EXPIRY_SAFETY_MS = 60_000;
const tokenCache: Record<string, CachedToken | undefined> = {};
const tokenRequests: Record<string, Promise<string> | undefined> = {};

function resolveAuthUrl(environment: 'production' | 'homologation') {
    return resolveNuvemLocalEndpoints(environment).authUrl;
}

export async function getNuvemLocalToken(
    environment: 'production' | 'homologation' = 'production',
    scope = 'empresa nfce nfe nfse'
) {
    // Validate before consulting the cache as well: removed/changed configuration
    // must not keep using a token issued for a previous authority.
    const authUrl = resolveAuthUrl(environment);
    const cacheKey = `${environment}:${authUrl}:${scope}`;
    const now = Date.now();
    const cached = tokenCache[cacheKey];

    if (cached && cached.expiresAt > now + TOKEN_EXPIRY_SAFETY_MS) {
        return cached.token;
    }

    if (tokenRequests[cacheKey]) {
        return tokenRequests[cacheKey]!;
    }

    tokenRequests[cacheKey] = fetchNuvemLocalToken(environment, scope, cacheKey);

    try {
        return await tokenRequests[cacheKey]!;
    } finally {
        delete tokenRequests[cacheKey];
    }
}

async function fetchNuvemLocalToken(
    environment: 'production' | 'homologation',
    scope: string,
    cacheKey: string
) {
    let clientId, clientSecret;

    if (environment === 'production') {
        clientId = process.env.NUVEMFISCAL_PROD_CLIENT_ID;
        clientSecret = process.env.NUVEMFISCAL_PROD_CLIENT_SECRET;
    } else {
        clientId = process.env.NUVEMFISCAL_HOM_CLIENT_ID;
        clientSecret = process.env.NUVEMFISCAL_HOM_CLIENT_SECRET;
    }

    const authUrl = resolveAuthUrl(environment);

    console.log(`[NuvemLocal] Tentando autenticar em ${environment.toUpperCase()}...`);
    console.log('[NuvemLocal] Auth URL:', authUrl);

    if (!clientId || !clientSecret) {
        throw new Error(`Credenciais da Nuvem Local (${environment}) nao encontradas no .env.local`);
    }

    const params = new URLSearchParams();
    params.append('grant_type', 'client_credentials');
    params.append('client_id', clientId);
    params.append('client_secret', clientSecret);
    params.append('scope', scope);

    try {
        const response = await fetch(authUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: params,
            redirect: 'error',
            signal: AbortSignal.timeout(20_000),
        });

        console.log('[NuvemLocal] Status da resposta:', response.status, response.statusText);

        if (!response.ok) {
            throw new Error(`Falha na autenticacao da Nuvem Local (HTTP ${response.status}).`);
        }

        const data = await response.json();
        if (typeof data.access_token !== 'string' || !data.access_token.trim() ||
            !Number.isFinite(Number(data.expires_in)) || Number(data.expires_in) <= 0) {
            throw new Error('Resposta OAuth invalida da Nuvem Local.');
        }
        console.log('[NuvemLocal] Token obtido com sucesso!');

        const expiresInSeconds = Number(data.expires_in || 3600);
        tokenCache[cacheKey] = {
            token: data.access_token,
            expiresAt: Date.now() + expiresInSeconds * 1000,
        };

        return data.access_token;
    } catch (error) {
        console.error("[NuvemLocal] Erro na conexao com Nuvem Local:", error);
        throw error;
    }
}
