import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env.local", quiet: true });

const args = parseArgs(process.argv.slice(2));

if (args.help || !args.storeId || !args.year || !args.serie || !args.start || !args.end) {
  printHelp();
  process.exit(args.help ? 0 : 1);
}

const environment = args.env || "production";
if (!["production", "homologation"].includes(environment)) {
  fail("--env deve ser production ou homologation.");
}

const storeId = Number(args.storeId);
const year = Number(args.year);
const serie = Number(args.serie);
const start = Number(args.start);
const end = Number(args.end);

if (![storeId, year, serie, start, end].every(Number.isFinite)) {
  fail("storeId, year, serie, start e end devem ser numeros.");
}

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !supabaseKey) {
  fail("SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY nao encontrados no .env.local.");
}

const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

const store = await getStore(storeId);
const cnpj = onlyDigits(store.cnpj);
if (!cnpj) fail(`Loja ${storeId} sem CNPJ configurado.`);

const localRows = await findLocalInutilizations();
printSection("Historico local");
if (localRows.length) {
  for (const row of localRows) printInutilization(row);
} else {
  console.log("Nenhum registro local encontrado para essa faixa.");
}

const token = await getNuvemFiscalToken(environment);
const baseUrl = getBaseUrl(environment);

printSection("Tentativas de consulta GET na Nuvem Fiscal");
const getResults = await tryReadOnlyLookups({ token, baseUrl, cnpj, environment, year, serie, start, end });
const successfulGet = getResults.find((item) => item.ok);
for (const item of getResults) {
  console.log(`${item.ok ? "OK" : "SEM DADO"} ${item.method} ${item.url}`);
  if (item.ok) {
    console.log(JSON.stringify(item.body, null, 2));
  } else if (args.verbose) {
    console.log(`Status ${item.status}: ${truncate(item.text, 500)}`);
  }
}

if (successfulGet) {
  process.exit(0);
}

if (!args.recoverByDuplicatePost) {
  printSection("Proximo passo");
  console.log("A API nao retornou uma consulta GET util para essa faixa.");
  console.log("Se a faixa ja foi inutilizada, a forma pratica de recuperar o protocolo costuma ser reenviar a mesma faixa e capturar o retorno 563 com nProt.");
  console.log("Para fazer isso de forma explicita, rode novamente com --recover-by-duplicate-post --reason \"sua justificativa com 15+ caracteres\".");
  process.exit(0);
}

const reason = args.reason || "Recuperacao de protocolo de inutilizacao ja registrada na SEFAZ para envio ao contador.";
if (reason.trim().length < 15) {
  fail("--reason deve ter pelo menos 15 caracteres.");
}

printSection("Recuperacao por duplicidade");
console.log("Enviando a mesma faixa para capturar confirmacao/protocolo caso a SEFAZ retorne duplicidade 563.");

const recoverResult = await recoverByDuplicatePost({
  token,
  baseUrl,
  cnpj,
  environment,
  year,
  serie,
  start,
  end,
  reason,
});

console.log(`HTTP ${recoverResult.status}`);
console.log(JSON.stringify(recoverResult.body, null, 2));

const protocol = extractProtocol(recoverResult.body);
const isDuplicate = isDuplicateInutilizationWithProtocol(recoverResult.body);
const isSuccess = recoverResult.ok || isDuplicate;

if (!isSuccess) {
  fail("A Nuvem Fiscal nao confirmou a inutilizacao nem retornou duplicidade com protocolo.");
}

const saved = await saveLocalInutilization({
  store,
  cnpj,
  environment,
  year,
  serie,
  start,
  end,
  reason,
  protocol,
  status: isDuplicate ? "ja_inutilizado" : (recoverResult.body?.status || recoverResult.body?.autorizacao?.status || "solicitado"),
  responseJson: isDuplicate
    ? { ...recoverResult.body, recovered_from_duplicate_response: true }
    : recoverResult.body,
});

printSection("Confirmacao recuperada");
console.log(`Protocolo: ${protocol || "-"}`);
console.log(`Status salvo: ${saved.status}`);
console.log(`Registro local: ${saved.id}`);

function parseArgs(argv) {
  const parsed = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      parsed[key] = true;
    } else {
      parsed[key] = next;
      i += 1;
    }
  }
  return parsed;
}

function printHelp() {
  console.log(`
Uso:
  node scripts/recover_nfce_inutilization.mjs --store-id 1 --year 2026 --serie 2 --start 74 --end 75

Consulta local + tentativas GET na Nuvem Fiscal:
  node scripts/recover_nfce_inutilization.mjs --store-id 1 --year 2026 --serie 2 --start 74 --end 75 --env production

Recuperar protocolo por retorno de duplicidade da SEFAZ:
  node scripts/recover_nfce_inutilization.mjs --store-id 1 --year 2026 --serie 2 --start 74 --end 75 --recover-by-duplicate-post --reason "Falha operacional no controle de numeracao, sem autorizacao de uso para os numeros informados."

Opcoes:
  --env production|homologation       Padrao: production
  --verbose                           Mostra corpo de respostas GET sem dado
  --recover-by-duplicate-post         Faz POST da mesma faixa para capturar nProt em retorno 563
`);
}

function printSection(title) {
  console.log(`\n=== ${title} ===`);
}

function fail(message) {
  console.error(`\nERRO: ${message}`);
  process.exit(1);
}

function onlyDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function getBaseUrl(env) {
  const value = env === "production"
    ? (process.env.NUVEMFISCAL_PROD_URL || "https://api.nuvemfiscal.com.br")
    : (process.env.NUVEMFISCAL_HOM_URL || "https://api.sandbox.nuvemfiscal.com.br");
  return value.replace(/\/$/, "");
}

function getAuthUrl(env) {
  const explicit = env === "production"
    ? process.env.NUVEMFISCAL_PROD_AUTH_URL
    : process.env.NUVEMFISCAL_HOM_AUTH_URL;
  if (explicit) return explicit.replace(/\/$/, "");

  const baseUrl = getBaseUrl(env);
  if (/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?(?:\/|$)/i.test(baseUrl)) {
    return `${baseUrl}/oauth/token`;
  }

  return "https://auth.nuvemfiscal.com.br/oauth/token";
}

async function getNuvemFiscalToken(env) {
  const clientId = env === "production"
    ? process.env.NUVEMFISCAL_PROD_CLIENT_ID
    : process.env.NUVEMFISCAL_HOM_CLIENT_ID;
  const clientSecret = env === "production"
    ? process.env.NUVEMFISCAL_PROD_CLIENT_SECRET
    : process.env.NUVEMFISCAL_HOM_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    fail(`Credenciais Nuvem Fiscal ausentes para ${env}.`);
  }

  const authUrl = getAuthUrl(env);
  const response = await fetch(authUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
      scope: "empresa nfce nfe nfse",
    }),
  });

  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text };
  }

  if (!response.ok || !body.access_token) {
    console.error(JSON.stringify(body, null, 2));
    fail(`Falha ao autenticar na Nuvem Fiscal (${response.status}).`);
  }

  return body.access_token;
}

async function getStore(id) {
  const { data, error } = await supabase
    .from("stores")
    .select("id, name, razao_social, cnpj, tenant_id")
    .eq("id", id)
    .single();

  if (error || !data) {
    fail(`Loja ${id} nao encontrada: ${error?.message || "sem dados"}`);
  }

  return data;
}

async function findLocalInutilizations() {
  const { data, error } = await supabase
    .from("fiscal_inutilizations")
    .select("id, store_id, tenant_id, environment, model, year, serie, numero_inicial, numero_final, justificativa, protocol, external_id, status, response_json, created_at")
    .eq("store_id", storeId)
    .eq("environment", environment)
    .eq("model", "NFCe")
    .eq("year", year)
    .eq("serie", serie)
    .lte("numero_inicial", end)
    .gte("numero_final", start)
    .order("created_at", { ascending: false });

  if (error) fail(`Erro ao consultar historico local: ${error.message}`);
  return data || [];
}

function printInutilization(row) {
  console.log(`ID ${row.id} | serie ${row.serie} | faixa ${row.numero_inicial}-${row.numero_final} | status ${row.status || "-"} | protocolo ${row.protocol || "-"} | ${row.created_at}`);
}

async function tryReadOnlyLookups({ token, baseUrl, cnpj, environment, year, serie, start, end }) {
  const ambiente = environment === "production" ? "producao" : "homologacao";
  const query = new URLSearchParams({
    cnpj,
    ambiente,
    ano: String(year % 100),
    serie: String(serie),
    numero_inicial: String(start),
    numero_final: String(end),
  });

  const urls = [
    `${baseUrl}/nfce/inutilizacoes?${query}`,
    `${baseUrl}/nfce/inutilizacoes/${cnpj}/${year % 100}/${serie}/${start}/${end}?ambiente=${ambiente}`,
  ];

  const results = [];
  for (const url of urls) {
    const response = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });
    const text = await response.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = null;
    }
    results.push({
      method: "GET",
      url,
      ok: response.ok,
      status: response.status,
      text,
      body,
    });
  }
  return results;
}

async function recoverByDuplicatePost({ token, baseUrl, cnpj, environment, year, serie, start, end, reason }) {
  const payload = {
    ambiente: environment === "production" ? "producao" : "homologacao",
    cnpj,
    ano: year % 100,
    serie,
    numero_inicial: start,
    numero_final: end,
    justificativa: reason.trim(),
  };

  const response = await fetch(`${baseUrl}/nfce/inutilizacoes`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }

  return { ok: response.ok, status: response.status, body };
}

function extractProtocol(result) {
  const direct = result?.numero_protocolo || result?.autorizacao?.numero_protocolo;
  if (direct) return String(direct);

  const message = String(result?.motivo_status || result?.autorizacao?.motivo_status || result?.error?.message || "");
  return message.match(/nProt:?\s*(\d+)/i)?.[1] || null;
}

function isDuplicateInutilizationWithProtocol(result) {
  const statusCode = result?.codigo_status || result?.autorizacao?.codigo_status || result?.error?.codigo_status;
  const message = String(result?.motivo_status || result?.autorizacao?.motivo_status || result?.error?.message || "");
  return (!statusCode || Number(statusCode) === 563)
    && /Ja existe pedido de Inutilizacao|J[aá] existe pedido de Inutiliza[cç][aã]o/i.test(message)
    && Boolean(extractProtocol(result));
}

async function saveLocalInutilization({ store, cnpj, environment, year, serie, start, end, reason, protocol, status, responseJson }) {
  const externalId = responseJson?.id
    || responseJson?.autorizacao?.id
    || `nfce-inutilizacao:${environment}:${cnpj}:${year}:${serie}:${start}:${end}`;

  const payload = {
      store_id: store.id,
      tenant_id: store.tenant_id || null,
      environment,
      model: "NFCe",
      year,
      serie,
      numero_inicial: start,
      numero_final: end,
      justificativa: reason.trim(),
      protocol,
      external_id: externalId,
      status,
      response_json: responseJson,
  };

  const { data: existing, error: lookupError } = await supabase
    .from("fiscal_inutilizations")
    .select("id")
    .eq("external_id", externalId)
    .maybeSingle();

  if (lookupError) fail(`Erro ao verificar confirmacao local existente: ${lookupError.message}`);

  const query = existing
    ? supabase.from("fiscal_inutilizations").update(payload).eq("id", existing.id)
    : supabase.from("fiscal_inutilizations").insert(payload);

  const { data, error } = await query
    .select("id, status, protocol")
    .single();

  if (error) fail(`Erro ao salvar confirmacao local: ${error.message}`);
  return data;
}

function truncate(value, max) {
  const text = String(value || "");
  return text.length > max ? `${text.slice(0, max)}...` : text;
}
