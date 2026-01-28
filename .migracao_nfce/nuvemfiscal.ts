// src/lib/nuvemfiscal.ts

export async function getNuvemFiscalToken(environment: 'production' | 'homologation' = 'production') {
  // 1. Pega as credenciais do arquivo .env baseado no ambiente
  let clientId, clientSecret;

  if (environment === 'production') {
    clientId = process.env.NUVEMFISCAL_PROD_CLIENT_ID;
    clientSecret = process.env.NUVEMFISCAL_PROD_CLIENT_SECRET;
  } else {
    clientId = process.env.NUVEMFISCAL_HOM_CLIENT_ID;
    clientSecret = process.env.NUVEMFISCAL_HOM_CLIENT_SECRET;
  }

  // URL de autenticação é fixa e separada da API
  const authUrl = "https://auth.nuvemfiscal.com.br/oauth/token";

  console.log(`[NuvemFiscal] Tentando autenticar em ${environment.toUpperCase()}...`);
  // console.log('[NuvemFiscal] Client ID:', clientId);
  console.log('[NuvemFiscal] Auth URL:', authUrl);

  if (!clientId || !clientSecret) {
    throw new Error(`Credenciais da Nuvem Fiscal (${environment}) não encontradas no .env.local`);
  }

  // 2. Monta os dados para pedir o token (Formato x-www-form-urlencoded)
  const params = new URLSearchParams();
  params.append('grant_type', 'client_credentials');
  params.append('client_id', clientId);
  params.append('client_secret', clientSecret);
  params.append('scope', 'empresa nfce nfe nfse'); // Permissão para empresas e emissão (NFC-e, NF-e, NFS-e)

  try {
    // 3. Faz a chamada para a API de Autenticação
    const response = await fetch(authUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params,
    });

    console.log('[NuvemFiscal] Status da resposta:', response.status, response.statusText);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[NuvemFiscal] Erro ao autenticar (Status: ${response.status}):`, errorText);

      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch (e) {
        errorData = { message: errorText };
      }

      throw new Error(`Falha na autenticação (${response.status}): ${errorData.error_description || errorData.message || response.statusText}`);
    }

    const data = await response.json();
    console.log('[NuvemFiscal] Token obtido com sucesso!');
    return data.access_token;

  } catch (error) {
    console.error("[NuvemFiscal] Erro na conexão com Nuvem Fiscal:", error);
    throw error;
  }
}