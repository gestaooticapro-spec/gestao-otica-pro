"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getNuvemFiscalToken } from "@/lib/nuvemfiscal";
import { Database } from "@/lib/database.types";
import { isStoreModuleEnabledForStore } from "@/lib/store-modules.server";

// Sanitiza xNome para atender ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â  regex do SEFAZ: ^([!-ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â»ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¹]{1}[ -ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â»ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¹]{0,}[!-ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â»ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¹]{1}|[!-ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â»ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¹]{1})$
function sanitizeXNome(nome: string | null | undefined): string {
    if (!nome) return "CONSUMIDOR";
    return nome
        .normalize("NFC")
        .replace(/[^\x20-\xFFÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬-ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â»ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¹]/g, "") // remove fora do range vÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡lido
        .replace(/\s+/g, " ")                        // colapsa espaÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â§os mÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âºltiplos
        .trim()
        || "CONSUMIDOR";
}

type StoreRow = Database['public']['Tables']['stores']['Row'];

type PagamentoItem = {
    meio: string; // '01' Dinheiro, '03' CartÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£o CrÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â©dito, '04' DÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â©bito, '17' PIX, etc.
    valor: number;
};

type EmissionPayload = {
    organization_id: string;
    store_id?: number; // NecessÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡rio para buscar a sÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â©rie NFCe configurada na loja
    work_order_id?: number;
    cliente: {
        cpf_cnpj: string;
        nome: string;
        email?: string;
        endereco?: any;
    };
    itens: {
        codigo: string;
        descricao: string;
        ncm: string;
        cest?: string;
        cfop: string;
        unidade: string;
        quantidade: number;
        valor_unitario: number;
        valor_total: number;
        codigo_servico?: string;
        aliquota_iss?: number;
    }[];
    valor_total: number;
    pagamentos: PagamentoItem[]; // MÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âºltiplas formas de pagamento
    environment?: 'production' | 'homologation';
};

function normalizeDocument(value?: string | null) {
    const normalized = value?.replace(/\D/g, "") || "";
    return normalized || null;
}

function normalizeText(value?: string | null) {
    return String(value ?? "").trim();
}

function normalizeIbgeCode(value?: string | number | null) {
    return String(value ?? "").replace(/\D/g, "");
}

const IBGE_UF_CODES: Record<string, string> = {
    RO: "11", AC: "12", AM: "13", RR: "14", PA: "15", AP: "16", TO: "17",
    MA: "21", PI: "22", CE: "23", RN: "24", PB: "25", PE: "26", AL: "27", SE: "28", BA: "29",
    MG: "31", ES: "32", RJ: "33", SP: "35",
    PR: "41", SC: "42", RS: "43",
    MS: "50", MT: "51", GO: "52", DF: "53",
};

function isValidIbgeMunicipalityCode(value?: string | number | null, uf?: string | null) {
    const code = normalizeIbgeCode(value);
    if (code.length !== 7 || !Object.values(IBGE_UF_CODES).includes(code.slice(0, 2))) {
        return false;
    }

    const normalizedUf = normalizeText(uf).toUpperCase();
    return !normalizedUf || IBGE_UF_CODES[normalizedUf] === code.slice(0, 2);
}

async function hydrateStoreFiscalDataFromNuvemFiscal(
    company: any,
    env: "production" | "homologation",
    token: string
) {
    const cnpj = normalizeDocument(company.cnpj || company.cpf_cnpj);
    if (!cnpj) return company;

    const hasValidIbge = isValidIbgeMunicipalityCode(company.codigo_municipio_ibge, company.uf);
    const hasAddressBasics =
        normalizeText(company.logradouro) &&
        normalizeText(company.numero) &&
        normalizeText(company.bairro) &&
        normalizeText(company.cidade) &&
        normalizeText(company.uf) &&
        normalizeDocument(company.cep);

    if (hasValidIbge && hasAddressBasics) return company;

    try {
        const baseUrl = env === "production"
            ? (process.env.NUVEMFISCAL_PROD_URL || "https://api.nuvemfiscal.com.br")
            : (process.env.NUVEMFISCAL_HOM_URL || "https://api.sandbox.nuvemfiscal.com.br");

        const response = await fetch(`${baseUrl}/empresas/${cnpj}`, {
            headers: { Authorization: `Bearer ${token}` }
        });

        if (!response.ok) return company;

        const remoteCompany = await response.json();
        const address = remoteCompany?.endereco || {};
        const remoteIbge = normalizeIbgeCode(address?.codigo_municipio);
        const resolvedIbge = hasValidIbge
            ? normalizeIbgeCode(company.codigo_municipio_ibge)
            : isValidIbgeMunicipalityCode(remoteIbge, address?.uf)
                ? remoteIbge
                : normalizeIbgeCode(company.codigo_municipio_ibge);

        return {
            ...company,
            razao_social: normalizeText(company.razao_social) || normalizeText(remoteCompany?.nome_razao_social) || company.razao_social,
            nome_fantasia: normalizeText(company.nome_fantasia) || normalizeText(remoteCompany?.nome_fantasia) || company.nome_fantasia,
            logradouro: normalizeText(company.logradouro) || normalizeText(address?.logradouro) || company.logradouro,
            numero: normalizeText(company.numero) || normalizeText(address?.numero) || company.numero,
            bairro: normalizeText(company.bairro) || normalizeText(address?.bairro) || company.bairro,
            codigo_municipio_ibge: resolvedIbge,
            cidade: normalizeText(company.cidade) || normalizeText(address?.cidade) || company.cidade,
            uf: normalizeText(company.uf || address?.uf).toUpperCase() || company.uf,
            cep: normalizeDocument(company.cep) || normalizeDocument(address?.cep) || company.cep,
            inscricao_estadual: normalizeDocument(company.inscricao_estadual) || normalizeDocument(remoteCompany?.inscricao_estadual) || company.inscricao_estadual,
        };
    } catch (error) {
        console.warn("[emitirNFCe] Nao foi possivel complementar dados da loja pela Nuvem Fiscal:", error);
        return company;
    }
}

function buildRespTec(company: any, fallbackCnpj?: string | null) {
    return {
        CNPJ: normalizeDocument(process.env.NFE_RT_CNPJ || fallbackCnpj) || "",
        xContato: String(
            process.env.NFE_RT_CONTATO ||
            company.razao_social ||
            "Responsavel Tecnico"
        ).trim().substring(0, 60),
        email: String(
            process.env.NFE_RT_EMAIL ||
            company.email_contato ||
            "email@exemplo.com"
        ).trim(),
        fone: normalizeDocument(
            process.env.NFE_RT_FONE ||
            company.telefone ||
            "0000000000"
        ) || "0000000000",
    };
}

function buildOutputInvoiceSnapshot(
    payload: EmissionPayload,
    company: any,
    issuedAt: string
) {
    return {
        direction: "output",
        data_emissao: issuedAt,
        valor_total: payload.valor_total,
        emitente_nome: company.razao_social || company.nome_fantasia || null,
        emitente_cnpj: normalizeDocument(company.cnpj || company.cpf_cnpj),
        destinatario_nome: payload.cliente.nome || null,
        destinatario_cnpj: normalizeDocument(payload.cliente.cpf_cnpj),
    };
}

function extractProtocolFromInutilization(result: any) {
    const directProtocol = result?.numero_protocolo || result?.autorizacao?.numero_protocolo;
    if (directProtocol) return String(directProtocol);

    const motivo = String(result?.motivo_status || result?.autorizacao?.motivo_status || result?.error?.message || "");
    const match = motivo.match(/nProt:?\s*(\d+)/i);
    return match?.[1] || null;
}

function isDuplicateInutilizationWithProtocol(result: Parameters<typeof extractProtocolFromInutilization>[0]) {
    const statusCode = result?.codigo_status || result?.autorizacao?.codigo_status || result?.error?.codigo_status;
    const message = String(
        result?.motivo_status
        || result?.autorizacao?.motivo_status
        || result?.error?.message
        || ""
    );

    return (!statusCode || Number(statusCode) === 563) && /Ja existe pedido de Inutilizacao|J[aÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡] existe pedido de Inutiliza[cÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â§][aÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£]o/i.test(message) && Boolean(extractProtocolFromInutilization(result));
}

function buildInutilizationExternalId(params: {
    model: "NFCe" | "NFe";
    environment: string;
    cnpj: string;
    year: number;
    serie: number;
    numeroInicial: number;
    numeroFinal: number;
}) {
    return `${params.model.toLowerCase()}-inutilizacao:${params.environment}:${params.cnpj}:${params.year}:${params.serie}:${params.numeroInicial}:${params.numeroFinal}`;
}

type RtcMvpContext = {
    model: 55 | 65;
    finality: 1 | 2 | 3 | 4;
    cfop: string;
    sameState: boolean;
};

const RTC_IBS_UF_RATE = 0.10;
const RTC_IBS_MUN_RATE = 0;
const RTC_CBS_RATE = 0.90;

function fiscalMoney(value?: number | string | null) {
    const parsed = typeof value === "string" ? Number(value.replace(",", ".")) : Number(value || 0);
    return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : 0;
}

function shouldSendRtcMvpGroup(
    environment: "production" | "homologation",
    context?: RtcMvpContext
) {
    if (!["homologation", "production"].includes(environment)) return false;
    if (!context) return true;

    if (context.model === 65) {
        return context.finality === 1 && context.sameState;
    }

    return (
        context.model === 55 &&
        (
            (context.finality === 1 && ["5101", "5102", "6101", "6102"].includes(context.cfop)) ||
            (context.finality === 4 && ["5202", "6202"].includes(context.cfop))
        )
    );
}

function buildRtcMvpItemImposto(
    environment: "production" | "homologation",
    context?: RtcMvpContext,
    baseValue?: number
) {
    if (!shouldSendRtcMvpGroup(environment, context)) return {};

    const vBC = fiscalMoney(baseValue);
    const vIBSUF = fiscalMoney(vBC * RTC_IBS_UF_RATE / 100);
    const vIBSMun = fiscalMoney(vBC * RTC_IBS_MUN_RATE / 100);
    const vIBS = fiscalMoney(vIBSUF + vIBSMun);
    const vCBS = fiscalMoney(vBC * RTC_CBS_RATE / 100);

    return {
        IBSCBS: {
            CST: "000",
            cClassTrib: "000001",
            gIBSCBS: {
                vBC,
                gIBSUF: {
                    pIBSUF: "0.10",
                    vIBSUF,
                },
                gIBSMun: {
                    pIBSMun: "0",
                    vIBSMun,
                },
                vIBS,
                gCBS: {
                    pCBS: "0.90",
                    vCBS,
                },
            },
        },
    };
}

function buildRtcMvpTotal(
    environment: "production" | "homologation",
    context?: RtcMvpContext,
    baseValue?: number
) {
    if (!shouldSendRtcMvpGroup(environment, context)) return {};

    const vBCIBSCBS = fiscalMoney(baseValue);
    const vIBSUF = fiscalMoney(vBCIBSCBS * RTC_IBS_UF_RATE / 100);
    const vIBSMun = fiscalMoney(vBCIBSCBS * RTC_IBS_MUN_RATE / 100);
    const vIBS = fiscalMoney(vIBSUF + vIBSMun);
    const vCBS = fiscalMoney(vBCIBSCBS * RTC_CBS_RATE / 100);

    return {
        IBSCBSTot: {
            vBCIBSCBS,
            gIBS: {
                gIBSUF: {
                    vDif: 0,
                    vDevTrib: 0,
                    vIBSUF,
                },
                gIBSMun: {
                    vDif: 0,
                    vDevTrib: 0,
                    vIBSMun,
                },
                vIBS,
                vCredPres: 0,
                vCredPresCondSus: 0,
            },
            gCBS: {
                vDif: 0,
                vDevTrib: 0,
                vCBS,
                vCredPres: 0,
                vCredPresCondSus: 0,
            },
        },
    };
}
function parseCompanyContractStatus(company: any, model: "NFCe" | "NFe") {
    const lowerModel = model.toLowerCase();
    const directKeys = [
        lowerModel,
        `${lowerModel}_config`,
        `${lowerModel}_contrato`,
        `${lowerModel}_contratado`,
        `${lowerModel}_habilitado`,
    ];

    for (const key of directKeys) {
        const value = company?.[key];
        if (typeof value === "boolean") {
            return { known: true, enabled: value };
        }
        if (value && typeof value === "object") {
            const enabledCandidate = value.habilitado ?? value.ativo ?? value.enabled ?? value.contratado;
            if (typeof enabledCandidate === "boolean") {
                return { known: true, enabled: enabledCandidate };
            }
        }
    }

    const contractLists = [
        company?.contratos,
        company?.contrato,
        company?.servicos,
        company?.servicos_habilitados,
        company?.modulos,
        company?.planos,
    ].filter(Array.isArray);

    for (const list of contractLists) {
        const match = list.find((item: any) => {
            const text = JSON.stringify(item).toLowerCase();
            return text.includes(lowerModel);
        });

        if (match) {
            const enabledCandidate = match.habilitado ?? match.ativo ?? match.enabled ?? match.contratado ?? true;
            return { known: true, enabled: Boolean(enabledCandidate) };
        }
    }

    return { known: false, enabled: true };
}

async function verifyCompanyInutilizationContract(params: {
    cnpj: string;
    environment: "production" | "homologation";
    model: "NFCe" | "NFe";
}) {
    const token = await getNuvemFiscalToken(params.environment);
    const baseUrl = params.environment === "production"
        ? (process.env.NUVEMFISCAL_PROD_URL || "https://api.nuvemfiscal.com.br")
        : (process.env.NUVEMFISCAL_HOM_URL || "https://api.sandbox.nuvemfiscal.com.br");

    const response = await fetch(`${baseUrl}/empresas/${params.cnpj}`, {
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
        },
    });

    if (!response.ok) {
        const result = await response.json().catch(() => null);
        const providerMessage = result?.error?.message || result?.message;
        return {
            success: false as const,
            error: providerMessage || `Nao foi possivel validar o cadastro da empresa na Nuvem Fiscal para ${params.model}.`,
        };
    }

    const company = await response.json().catch(() => ({}));
    const contractStatus = parseCompanyContractStatus(company, params.model);

    if (contractStatus.known && !contractStatus.enabled) {
        return {
            success: false as const,
            error: `A empresa nao esta habilitada para inutilizacao de ${params.model} na Nuvem Fiscal neste ambiente.`,
        };
    }

    return {
        success: true as const,
        token,
        baseUrl,
    };
}

async function tryFetchXmlContent(xmlUrl?: string | null) {
    if (!xmlUrl) return null;
    try {
        const response = await fetch(xmlUrl);
        if (!response.ok) return null;
        return await response.text();
    } catch (error) {
        console.warn("[Fiscal] Nao foi possivel baixar XML automaticamente:", error);
        return null;
    }
}

function extractFiscalAuthorizationMessage(result: any, fallback: string) {
    return (
        result?.autorizacao?.motivo_status ||
        result?.motivo_status ||
        result?.error?.message ||
        fallback
    );
}

function formatFiscalProviderMessage(message: string) {
    const normalized = String(message || "").trim();
    const lower = normalized.toLowerCase();

    if (
        lower.includes("could not connect to server") ||
        lower.includes("winhttp operation") ||
        lower.includes("nfeautorizacao4") ||
        lower.includes("error: (12029)")
    ) {
        return [
            "Falha de comunicacao com a SEFAZ/PR no momento.",
            "A nota nao foi autorizada e voce pode tentar novamente mais tarde.",
            "",
            `Detalhe tecnico: ${normalized}`,
        ].join("\n");
    }

    if (
        lower.includes("ora-04025") ||
        (lower.includes("erro nao catalogado") && lower.includes("sql"))
    ) {
        return [
            "A SEFAZ/PR respondeu com instabilidade interna durante a autorizacao.",
            "Nao parece ser um erro de preenchimento da nota.",
            "",
            `Detalhe tecnico: ${normalized}`,
        ].join("\n");
    }

    return normalized;
}

function isNuvemLocalFiscalUrl(baseUrl: string) {
    return /(^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$)|fiscal\.mentebinaria\.com/i.test(baseUrl.replace(/\/$/, ""));
}

function getFiscalProviderError(result: any, fallback: string) {
    return (
        result?.error?.message ||
        result?.message ||
        result?.motivo_status ||
        result?.mensagens?.[0]?.descricao ||
        fallback
    );
}

async function tryFetchXmlByUuid(
    token: string,
    baseUrl: string,
    tipoDocumento: "NFCe" | "NFSe",
    uuid?: string | null
) {
    if (!uuid) return null;
    try {
        const endpointType = tipoDocumento === "NFCe" ? "nfce" : "nfse";
        const response = await fetch(`${baseUrl}/${endpointType}/${uuid}/xml`, {
            method: "GET",
            headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json"
            }
        });
        if (!response.ok) return null;
        return await response.text();
    } catch {
        return null;
    }
}

async function ensureNoActiveInvoiceForWorkOrder(
    supabase: any,
    payload: EmissionPayload,
    tipoDocumento: "NFCe" | "NFSe",
    environment: "production" | "homologation"
) {
    if (!payload.work_order_id) return null;

    const { data: existingInvoice, error } = await supabase
        .from("fiscal_invoices")
        .select("id, status")
        .eq("organization_id", payload.organization_id)
        .eq("work_order_id", payload.work_order_id)
        .eq("tipo_documento", tipoDocumento)
        .eq("direction", "output")
        .eq("environment", environment)
        .in("status", ["draft", "processing", "authorized"])
        .limit(1)
        .maybeSingle();

    if (error) {
        throw new Error(`Nao foi possivel validar duplicidade de ${tipoDocumento}.`);
    }

    if (!existingInvoice) return null;

    return `Ja existe ${tipoDocumento} ${environment === "production" ? "de producao" : "de homologacao"} para esta OS.`;
}

export async function emitirNFCe(payload: EmissionPayload) {
    const supabase = createClient();
    const adminSupabase = createAdminClient() as any;
    let invoiceId: number | null = null;

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    console.log("[emitirNFCe] User ID:", user?.id, "Auth Error:", authError?.message);

    try {
        const env = payload.environment || 'production';

        // 1. Validar duplicidade antes de qualquer operaÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â§ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£o
        const duplicateError = await ensureNoActiveInvoiceForWorkOrder(adminSupabase, payload, "NFCe", env);
        if (duplicateError) {
            return { success: false, error: duplicateError };
        }

        // 2. Buscar Token Nuvem Fiscal
        const fiscalModuleEnabled = payload.store_id
            ? await isStoreModuleEnabledForStore(payload.store_id, "fiscal")
            : false;

        // 3. Buscar dados da loja (fonte de dados fiscais na ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³tica)
        if (!payload.store_id) {
            throw new Error("store_id ausente no payload. NÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£o ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â© possÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â­vel emitir sem identificar a loja.");
        }

        if (!fiscalModuleEnabled) {
            return { success: false, error: "Modulo fiscal desativado para esta loja." };
        }

        const token = await getNuvemFiscalToken(env);

        const { data: store } = await adminSupabase
            .from("stores")
            .select("*")
            .eq("id", payload.store_id)
            .single() as unknown as { data: StoreRow | null; error: unknown };

        if (!store) {
            console.error("Loja nÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£o encontrada para store_id:", payload.store_id);
            throw new Error("ConfiguraÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â§ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âµes da loja nÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£o encontradas.");
        }

        // Mapear campos da tabela stores para o formato esperado pelo payload NFCe
        let company = {
            cnpj: store.cnpj,
            cpf_cnpj: store.cnpj,
            razao_social: store.razao_social || store.name,
            nome_fantasia: store.name,
            logradouro: store.street,
            numero: store.number,
            complemento: null as string | null,
            bairro: store.neighborhood,
            codigo_municipio_ibge: store.codigo_municipio_ibge,
            cidade: store.city,
            uf: store.state,
            cep: store.cep,
            inscricao_estadual: store.inscricao_estadual,
            regime_tributario: store.regime_tributario || "1",
            email_contato: store.email,
            telefone: store.phone || store.whatsapp,
        };

        company = await hydrateStoreFiscalDataFromNuvemFiscal(company, env, token);

        console.log("[emitirNFCe] Dados da loja:", JSON.stringify(company, null, 2));

        const cnpj = company.cnpj;
        if (!cnpj) {
            throw new Error("CNPJ nÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£o configurado na loja. Preencha nas configuraÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â§ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âµes.");
        }

        if (!company.codigo_municipio_ibge) {
            throw new Error("CÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³digo IBGE do municÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â­pio nÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£o configurado na loja. Preencha nas configuraÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â§ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âµes.");
        }

        // 4. Buscar sÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â©rie NFCe configurada na loja
        const codigoMunicipioIbge = normalizeIbgeCode(company.codigo_municipio_ibge);
        if (!isValidIbgeMunicipalityCode(codigoMunicipioIbge, company.uf)) {
            throw new Error(`Codigo IBGE do municipio invalido na loja ${payload.store_id}: "${company.codigo_municipio_ibge || ""}". Informe os 7 digitos corretos nas configuracoes da loja.`);
        }

        const emitUf = normalizeText(company.uf).toUpperCase();
        const destUf = normalizeText(payload.cliente.endereco?.uf).toUpperCase();
        const sameState = !destUf || destUf === emitUf;
        if (!sameState) {
            return {
                success: false,
                error: "NFC-e interestadual nao e permitida. Emita NF-e para cliente de outra UF.",
            };
        }
        const currentSerie = store.nfce_serie || 1;

        // 5. Obter prÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³xima numeraÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â§ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£o sequencial de forma atÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â´mica via RPC
        // Usa admin client para garantir permissÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£o de execuÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â§ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£o independente de RLS
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: nextNumber, error: rpcError } = await (adminSupabase as any).rpc("get_next_nfce_number", {
            p_org_id: payload.organization_id,
            p_serie: currentSerie
        });

        if (rpcError || !nextNumber) {
            console.error("Erro ao obter numeraÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â§ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£o NFCe:", rpcError);
            throw new Error("NÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£o foi possÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â­vel obter a numeraÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â§ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£o sequencial para a NFCe.");
        }

        const issuedAt = new Date().toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo' }).replace(' ', 'T') + '-03:00';

        // 6. Montar JSON para Nuvem Fiscal (NFC-e)
        // DocumentaÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â§ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£o: https://dev.nuvemfiscal.com.br/docs/api#tag/Nfe/operation/EmitirNfe
        const nfePayload = {
            ambiente: env === 'production' ? 'producao' : 'homologacao',
            infNFe: {
                versao: "4.00",
                ide: {
                    cUF: Number(codigoMunicipioIbge.substring(0, 2)),
                    natOp: "VENDA DE MERCADORIA",
                    mod: 65, // 65 = NFC-e
                    serie: currentSerie,
                    nNF: nextNumber,
                    dhEmi: issuedAt,
                    tpNF: 1, // 1 = SaÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â­da
                    idDest: 1, // 1 = Interna
                    cMunFG: Number(codigoMunicipioIbge),
                    tpImp: 4, // 4 = DANFE NFC-e
                    tpEmis: 1, // 1 = Normal
                    tpAmb: env === 'production' ? 1 : 2, // 1 = ProduÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â§ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£o, 2 = HomologaÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â§ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£o
                    finNFe: 1, // 1 = Normal
                    indFinal: 1, // 1 = Consumidor Final
                    indPres: 1, // 1 = Presencial
                    procEmi: 0,
                    verProc: "GestaoOticaPro 1.0"
                },
                emit: {
                    CNPJ: cnpj.replace(/\D/g, ""),
                    xNome: company.razao_social,
                    xFant: company.nome_fantasia,
                    enderEmit: {
                        xLgr: company.logradouro?.trim() || "NÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£o Informado",
                        nro: (company.numero?.trim() && company.numero.trim() !== "") ? company.numero.trim() : "S/N",
                        xCpl: company.complemento?.trim() || undefined,
                        xBairro: company.bairro?.trim() && company.bairro.trim().length >= 2 ? company.bairro.trim() : "NÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£o Informado",
                        cMun: Number(codigoMunicipioIbge),
                        xMun: company.cidade?.trim() || "NÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£o Informado",
                        UF: emitUf,
                        CEP: normalizeDocument(company.cep) || undefined,
                        cPais: "1058",
                        xPais: "BRASIL"
                    },
                    IE: company.inscricao_estadual?.replace(/\D/g, "") || "ISENTO",
                    CRT: Number(company.regime_tributario || "1") // 1 = Simples Nacional
                },
                dest: (() => {
                    const cleanDoc = payload.cliente.cpf_cnpj ? payload.cliente.cpf_cnpj.replace(/\D/g, "") : "";
                    if (!cleanDoc) return undefined;
                    return {
                        CNPJ: cleanDoc.length > 11 ? cleanDoc : undefined,
                        CPF: cleanDoc.length <= 11 ? cleanDoc : undefined,
                        xNome: sanitizeXNome(payload.cliente.nome),
                        indIEDest: 9, // 9 = NÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£o Contribuinte
                        email: payload.cliente.email || undefined
                    };
                })(),
                det: payload.itens.map((item, index) => ({
                    nItem: index + 1,
                    prod: {
                        cProd: item.codigo,
                        cEAN: "SEM GTIN",
                        xProd: item.descricao,
                        NCM: item.ncm || "00000000",
                        CFOP: item.cfop || "5102",
                        uCom: item.unidade,
                        qCom: item.quantidade,
                        vUnCom: item.valor_unitario,
                        vProd: item.valor_total,
                        cEANTrib: "SEM GTIN",
                        uTrib: item.unidade,
                        qTrib: item.quantidade,
                        vUnTrib: item.valor_unitario,
                        indTot: 1
                    },
                    imposto: {
                        // Simples Nacional bÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡sico
                        ICMS: {
                            ICMSSN102: {
                                orig: 0, // 0 = Nacional
                                CSOSN: "102" // Tributada pelo Simples Nacional sem permissÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£o de crÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â©dito
                            }
                        },
                        PIS: {
                            PISOutr: {
                                CST: "99",
                                vBC: 0.00,
                                pPIS: 0.00,
                                vPIS: 0.00
                            }
                        },
                        COFINS: {
                            COFINSOutr: {
                                CST: "99",
                                vBC: 0.00,
                                pCOFINS: 0.00,
                                vCOFINS: 0.00
                            }
                        },
                        ...buildRtcMvpItemImposto(env, {
                            model: 65,
                            finality: 1,
                            cfop: item.cfop || "5102",
                            sameState,
                        }, item.valor_total)
                    }
                })),
                total: {
                    ICMSTot: {
                        vBC: 0.00,
                        vICMS: 0.00,
                        vICMSDeson: 0.00,
                        vFCP: 0.00,
                        vBCST: 0.00,
                        vST: 0.00,
                        vFCPST: 0.00,
                        vFCPSTRet: 0.00,
                        vProd: payload.valor_total,
                        vFrete: 0.00,
                        vSeg: 0.00,
                        vDesc: 0.00,
                        vII: 0.00,
                        vIPI: 0.00,
                        vIPIDevol: 0.00,
                        vPIS: 0.00,
                        vCOFINS: 0.00,
                        vOutro: 0.00,
                        vNF: payload.valor_total
                    },
                    ...buildRtcMvpTotal(env, {
                        model: 65,
                        finality: 1,
                        cfop: "5102",
                        sameState,
                    }, payload.valor_total)
                },
                transp: {
                    modFrete: 9 // 9 = Sem OcorrÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âªncia de Transporte
                },
                pag: {
                    detPag: (() => {
                        const pagamentos = payload.pagamentos && payload.pagamentos.length > 0
                            ? payload.pagamentos
                            : [{ meio: '01', valor: payload.valor_total }]; // Fallback: Dinheiro

                        const detPagList = pagamentos.map(p => ({
                            tPag: p.meio || '99',
                            vPag: Number(p.valor.toFixed(2))
                        }));

                        // Ajuste de arredondamento: soma dos pagamentos deve bater com vNF
                        const somaPag = detPagList.reduce((acc, p) => acc + p.vPag, 0);
                        const diff = Number((payload.valor_total - somaPag).toFixed(2));
                        if (diff !== 0 && detPagList.length > 0) {
                            detPagList[detPagList.length - 1].vPag = Number(
                                (detPagList[detPagList.length - 1].vPag + diff).toFixed(2)
                            );
                        }

                        return detPagList;
                    })()
                },
                infRespTec: buildRespTec(company, cnpj)
            }
        };

        // 7. Salvar Rascunho no Banco (Status: Processing)
        const { data: invoice, error: dbError } = await adminSupabase
            .from("fiscal_invoices")
            .insert({
                organization_id: payload.organization_id,
                store_id: payload.store_id || null,
                work_order_id: payload.work_order_id || null,
                ...buildOutputInvoiceSnapshot(payload, company, issuedAt),
                tipo_documento: "NFCe",
                status: "processing",
                environment: env,
                payload_json: nfePayload
            })
            .select()
            .single();

        if (dbError) {
            if (dbError.code === "23505") {
                return { success: false, error: "Ja existe NFCe ativa para esta OS neste ambiente." };
            }
            throw dbError;
        }

        invoiceId = invoice.id;

        // 8. Enviar para Nuvem Fiscal
        console.log("[NuvemFiscal] Enviando NFE Payload:", JSON.stringify(nfePayload, null, 2));

        const baseUrl = env === 'production'
            ? (process.env.NUVEMFISCAL_PROD_URL || "https://api.nuvemfiscal.com.br")
            : (process.env.NUVEMFISCAL_HOM_URL || "https://api.sandbox.nuvemfiscal.com.br");

        const response = await fetch(`${baseUrl}/nfce`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(nfePayload)
        });

        console.log("[NuvemFiscal] Response Status:", response.status);

        const responseText = await response.text();
        console.log("[NuvemFiscal] Response Body:", responseText);

        let result;
        try {
            result = responseText ? JSON.parse(responseText) : {};
        } catch (e) {
            console.error("[NuvemFiscal] Erro ao fazer parse da resposta:", responseText);
            // Atualizar banco para nÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£o deixar nota em estado inconsistente
            if (invoice?.id) {
                await adminSupabase.from("fiscal_invoices").update({
                    status: "error",
                    error_message: `Resposta invÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡lida da API (Status ${response.status}). ProvÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡vel timeout.`
                }).eq("id", invoice.id);
            }
            return { success: false, error: `Erro na resposta da Nuvem Fiscal (Status ${response.status}). Verifique os logs.` };
        }

        if (!response.ok) {
            const detailedError = result.error?.errors ? `Detalhes: ${JSON.stringify(result.error.errors)}` : '';
            const errorMsg = `${result.error?.message || "Erro na emissÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£o"}. ${detailedError}`;
            
            await adminSupabase
                .from("fiscal_invoices")
                .update({
                    status: "error",
                    error_message: errorMsg
                })
                .eq("id", invoice.id);

            return { success: false, error: formatFiscalProviderMessage(errorMsg) };
        }

        // 9. Verificar status REAL retornado pela Nuvem Fiscal
        const realStatus = result.status;
        console.log("[NuvemFiscal] Status real retornado:", realStatus);

        if (realStatus === 'rejeitado') {
            const codigoErro = result.autorizacao?.codigo_status || 'N/A';
            const motivoErro = result.autorizacao?.motivo_status || 'Motivo nÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£o informado';

            await adminSupabase
                .from("fiscal_invoices")
                .update({
                    status: "rejected",
                    nuvemfiscal_uuid: result.id,
                    chave_acesso: result.chave,
                    numero: result.numero,
                    serie: result.serie,
                    motivo_rejeicao: `Erro ${codigoErro}: ${motivoErro}`
                })
                .eq("id", invoice.id);

            return {
                success: false,
                error: formatFiscalProviderMessage(`Erro ${codigoErro}: ${motivoErro}`),
                invoiceId: invoice.id
            };
        }

        if (realStatus === 'erro' || realStatus === 'negado') {
            const motivoErro = extractFiscalAuthorizationMessage(result, 'Erro na autorizacao');
            const friendlyError = formatFiscalProviderMessage(motivoErro);

            await adminSupabase
                .from("fiscal_invoices")
                .update({
                    status: "error",
                    nuvemfiscal_uuid: result.id,
                    chave_acesso: result.chave,
                    numero: result.numero,
                    serie: result.serie,
                    error_message: motivoErro
                })
                .eq("id", invoice.id);

            return {
                success: false,
                error: friendlyError,
                invoiceId: invoice.id
            };
        }

        if (realStatus === 'autorizado') {
            let xmlContent = await tryFetchXmlContent(result.xml_url);
            if (!xmlContent) {
                xmlContent = await tryFetchXmlByUuid(token, baseUrl, "NFCe", result.id);
            }
            const authorizedUpdate: Record<string, any> = {
                status: "authorized",
                nuvemfiscal_uuid: result.id,
                chave_acesso: result.chave,
                numero: result.numero,
                serie: result.serie,
                xml_url: result.xml_url,
                pdf_url: result.pdf_url
            };

            if (xmlContent) {
                authorizedUpdate.xml_content = xmlContent;
            }

            await adminSupabase
                .from("fiscal_invoices")
                .update(authorizedUpdate)
                .eq("id", invoice.id);

            return { success: true, invoiceId: invoice.id };
        }

        // Status "processando" ou outro ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â manter como processing
        await adminSupabase
            .from("fiscal_invoices")
            .update({
                status: "processing",
                nuvemfiscal_uuid: result.id,
                chave_acesso: result.chave,
                numero: result.numero,
                serie: result.serie
            })
            .eq("id", invoice.id);

        return { success: true, invoiceId: invoice.id, message: "Nota em processamento" };

    } catch (error: any) {
        console.error("Erro na emissÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£o:", error);

        if (invoiceId) {
            await adminSupabase
                .from("fiscal_invoices")
                .update({
                    status: "error",
                    error_message: error.message
                })
                .eq("id", invoiceId);
        }

        return { success: false, error: error.message };
    }
}

export async function emitirNFSe(payload: EmissionPayload) {
    const supabase = createClient();
    const adminSupabase = createAdminClient() as any;
    let invoiceId: number | null = null;

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    console.log("[emitirNFSe] User ID:", user?.id);

    try {
        // 1. Buscar Token Nuvem Fiscal
        const env = payload.environment || 'production';
        if (payload.store_id && !(await isStoreModuleEnabledForStore(payload.store_id, "fiscal"))) {
            return { success: false, error: "Modulo fiscal desativado para esta loja." };
        }
        const token = await getNuvemFiscalToken(env);

        // 2. Buscar ConfiguraÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â§ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âµes da Empresa
        const { data: company } = await supabase
            .from("company_settings")
            .select("*")
            .eq("organization_id", payload.organization_id)
            .single();

        if (!company || !company.nfse_login) {
            throw new Error("ConfiguraÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â§ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âµes de NFS-e nÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£o encontradas (Login/Senha da Prefeitura).");
        }

        const cnpj = company.cnpj || company.cpf_cnpj;

        // 3. Montar JSON para Nuvem Fiscal (NFS-e - DPS)
        const servicoPrincipal = payload.itens[0]; // Assumindo um serviÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â§o principal ou o primeiro para cabeÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â§alho
        if (!servicoPrincipal) throw new Error("Nenhum serviÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â§o informado.");

        const dpsPayload = {
            ambiente: env === 'production' ? 'producao' : 'homologacao',
            infDPS: {
                dhEmi: new Date().toISOString(),
                dCompet: new Date().toISOString().split('T')[0],
                prest: {
                    CNPJ: cnpj.replace(/\D/g, "")
                },
                toma: {
                    CNPJ: payload.cliente.cpf_cnpj?.length > 11 ? payload.cliente.cpf_cnpj.replace(/\D/g, "") : undefined,
                    CPF: payload.cliente.cpf_cnpj?.length <= 11 ? payload.cliente.cpf_cnpj.replace(/\D/g, "") : undefined,
                    xNome: sanitizeXNome(payload.cliente.nome),
                    end: payload.cliente.endereco ? {
                        xLgr: payload.cliente.endereco.logradouro,
                        nro: payload.cliente.endereco.numero,
                        xBairro: payload.cliente.endereco.bairro,
                        endNac: {
                            cMun: payload.cliente.endereco.codigo_municipio,
                            CEP: payload.cliente.endereco.cep?.replace(/\D/g, "")
                        }
                    } : undefined
                },
                serv: {
                    cServ: {
                        cTribNac: "140102",
                        cTribMun: "4520007", // CNAE Principal
                        CNAE: "4520007",
                        cSitTrib: "0",
                        xDescServ: payload.itens.map(i => `${i.descricao} (R$ ${i.valor_total.toFixed(2)})`).join("; ")
                    }
                },
                valores: {
                    vServPrest: {
                        vServ: payload.valor_total
                    },
                    trib: {
                        tribMun: {
                            tribISSQN: 1, // 1 - TributÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡vel
                            tpRetISSQN: 2, // 2 - NÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£o Retido
                            pAliq: servicoPrincipal.aliquota_iss || 2.01,
                            vISSQN: Number(((payload.valor_total * (servicoPrincipal.aliquota_iss || 2.01)) / 100).toFixed(2))
                        }
                    }
                }
            }
        };

        // 4. Salvar Rascunho no Banco
        const { data: invoice, error: dbError } = await adminSupabase
            .from("fiscal_invoices")
            .insert({
                organization_id: payload.organization_id,
                work_order_id: payload.work_order_id || null,
                tipo_documento: "NFSe",
                status: "processing",
                environment: env,
                payload_json: dpsPayload
            })
            .select()
            .single();

        if (dbError) throw dbError;
        invoiceId = invoice.id;

        // 5. Enviar para Nuvem Fiscal
        console.log("[NuvemFiscal] Enviando DPS Payload:", JSON.stringify(dpsPayload, null, 2));

        const baseUrl = env === 'production'
            ? (process.env.NUVEMFISCAL_PROD_URL || "https://api.nuvemfiscal.com.br")
            : (process.env.NUVEMFISCAL_HOM_URL || "https://api.sandbox.nuvemfiscal.com.br");

        const response = await fetch(`${baseUrl}/nfse/dps`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(dpsPayload)
        });

        const responseText = await response.text();
        console.log("[NuvemFiscal] Response Status:", response.status);
        console.log("[NuvemFiscal] Response Body:", responseText);

        let result;
        try {
            result = responseText ? JSON.parse(responseText) : {};
        } catch (e) {
            console.error("[NuvemFiscal] Erro ao fazer parse da resposta:", responseText);
            result = {};
        }

        if (!response.ok) {
            const errorDetails = result.error?.message || JSON.stringify(result);
            console.error("[NuvemFiscal] Erro detalhado:", errorDetails);

            await adminSupabase
                .from("fiscal_invoices")
                .update({
                    status: "error",
                    error_message: errorDetails
                })
                .eq("id", invoice.id);

            return { success: false, error: `Erro NuvemFiscal: ${errorDetails}` };
        }

        // 6. Sucesso
        await adminSupabase
            .from("fiscal_invoices")
            .update({
                status: "processing", // NFS-e ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â© assÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â­ncrono
                nuvemfiscal_uuid: result.id,
                numero: result.numero,
                serie: result.serie
            })
            .eq("id", invoice.id);

        return { success: true, invoiceId: invoice.id };

    } catch (error: any) {
        console.error("Erro na emissÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£o NFS-e:", error);
        if (invoiceId) {
            await adminSupabase
                .from("fiscal_invoices")
                .update({ status: "error", error_message: error.message })
                .eq("id", invoiceId);
        }
        return { success: false, error: error.message };
    }
}

export async function consultarNFCe(invoiceId: string) {
    const supabase = createAdminClient() as any;

    try {
        const { data: invoice } = await supabase
            .from("fiscal_invoices")
            .select("*")
            .eq("id", invoiceId)
            .single();

        if (!invoice || !invoice.nuvemfiscal_uuid) {
            return { success: false, error: "Nota nÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£o encontrada ou sem ID da NuvemFiscal." };
        }

        if (invoice.store_id && !(await isStoreModuleEnabledForStore(invoice.store_id, "fiscal"))) {
            return { success: false, error: "Modulo fiscal desativado para esta loja." };
        }

        const env = (invoice.environment as 'production' | 'homologation') || 'production';
        const token = await getNuvemFiscalToken(env);

        const baseUrl = env === 'production'
            ? (process.env.NUVEMFISCAL_PROD_URL || "https://api.nuvemfiscal.com.br")
            : (process.env.NUVEMFISCAL_HOM_URL || "https://api.sandbox.nuvemfiscal.com.br");

        const response = await fetch(`${baseUrl}/nfce/${invoice.nuvemfiscal_uuid}`, {
            method: "GET",
            headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json"
            }
        });

        const result = await response.json();
        console.log("[Consultar NFC-e] Resultado:", JSON.stringify(result, null, 2));

        if (!response.ok) {
            return { success: false, error: result.error?.message || "Erro ao consultar status." };
        }

        let novoStatus = invoice.status;
        let errorMessage = null;

        if (result.status === 'autorizado') novoStatus = 'authorized';
        else if (result.status === 'rejeitado') {
            novoStatus = 'rejected';
            errorMessage = extractFiscalAuthorizationMessage(result, "Rejeitada pela SEFAZ");
        }
        else if (result.status === 'erro' || result.status === 'negado') {
            novoStatus = 'error';
            errorMessage = result.motivo_status || "Erro na autorizaÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â§ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£o";
        }
        else if (result.status === 'cancelado') novoStatus = 'cancelled';

        if (novoStatus === 'error') {
            errorMessage = extractFiscalAuthorizationMessage(result, errorMessage || "Erro na autorizacao");
        }

        const updatePayload: Record<string, any> = {
            status: novoStatus,
            numero: result.numero,
            serie: result.serie,
            chave_acesso: result.chave || result.codigo_verificacao,
            xml_url: result.xml_url,
            pdf_url: result.pdf_url || result.link_url,
            error_message: errorMessage
        };

        // Salvar XML localmente (xml_url ou fallback por UUID)
        if ((novoStatus === 'authorized' || novoStatus === 'cancelled') && !invoice.xml_content) {
            let xmlContent: string | null = null;

            if (result.xml_url) {
                try {
                    const xmlResponse = await fetch(result.xml_url);
                    if (xmlResponse.ok) {
                        xmlContent = await xmlResponse.text();
                    }
                } catch (xmlErr) {
                    console.warn('[NFCe] NÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£o foi possÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â­vel baixar XML via xml_url.', xmlErr);
                }
            }

            if (!xmlContent) {
                xmlContent = await tryFetchXmlByUuid(token, baseUrl, "NFCe", invoice.nuvemfiscal_uuid);
            }

            if (xmlContent) {
                updatePayload.xml_content = xmlContent;
                console.log(`[NFCe] XML salvo localmente para nota ${result.numero || invoiceId}`);
            }
        }

        await supabase
            .from("fiscal_invoices")
            .update(updatePayload)
            .eq("id", invoiceId);

        return { success: true, status: novoStatus, data: result };

    } catch (error: any) {
        console.error("Erro ao consultar NFC-e:", error);
        return { success: false, error: error.message };
    }
}

export async function recuperarXmlsNFCePeriodo(params: {
    storeId: number;
    month: number; // 0-11
    year: number;
    environment?: "production" | "homologation";
}) {
    const supabase = createAdminClient() as any;
    const env = params.environment || "production";

    try {
        if (!(await isStoreModuleEnabledForStore(params.storeId, "fiscal"))) {
            return { success: false, error: "Modulo fiscal desativado para esta loja." };
        }

        const start = new Date(Date.UTC(params.year, params.month, 1, 0, 0, 0)).toISOString();
        const end = new Date(Date.UTC(params.year, params.month + 1, 0, 23, 59, 59)).toISOString();

        const { data: invoices, error } = await supabase
            .from("fiscal_invoices")
            .select("id, status, xml_content, xml_url")
            .eq("store_id", params.storeId)
            .eq("tipo_documento", "NFCe")
            .eq("environment", env)
            .gte("data_emissao", start)
            .lte("data_emissao", end)
            .in("status", ["authorized", "cancelled"]);

        if (error) {
            return { success: false, error: error.message };
        }

        const list = invoices || [];
        const target = list.filter((inv: any) => !inv.xml_content && !inv.xml_url);

        let refreshed = 0;
        for (const inv of target) {
            const res = await consultarNFCe(String(inv.id));
            if (res.success) refreshed += 1;
        }

        const { data: after, error: afterError } = await supabase
            .from("fiscal_invoices")
            .select("id, xml_content, xml_url")
            .eq("store_id", params.storeId)
            .eq("tipo_documento", "NFCe")
            .eq("environment", env)
            .gte("data_emissao", start)
            .lte("data_emissao", end)
            .in("status", ["authorized", "cancelled"]);

        if (afterError) {
            return { success: false, error: afterError.message };
        }

        const total = (after || []).length;
        const withXml = (after || []).filter((inv: any) => Boolean(inv.xml_content || inv.xml_url)).length;
        const missing = total - withXml;

        return {
            success: true,
            total,
            withXml,
            missing,
            refreshed,
        };
    } catch (error: any) {
        console.error("Erro ao recuperar XMLs do perÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â­odo:", error);
        return { success: false, error: error.message || "Erro inesperado ao recuperar XMLs." };
    }
}

export async function inutilizarNumeracaoFiscal(params: {
    storeId: number;
    year: number;
    serie: number;
    numeroInicial: number;
    numeroFinal: number;
    justificativa: string;
    model?: "NFCe" | "NFe";
    environment?: "production" | "homologation";
}) {
    const supabase = createAdminClient() as any;
    const env = params.environment || "production";
    const model = params.model === "NFe" ? "NFe" : "NFCe";

    try {
        if (!(await isStoreModuleEnabledForStore(params.storeId, "fiscal"))) {
            return { success: false, error: "Modulo fiscal desativado para esta loja." };
        }

        if (!params.justificativa || params.justificativa.trim().length < 15) {
            return { success: false, error: "Justificativa deve ter ao menos 15 caracteres." };
        }
        if (params.numeroInicial <= 0 || params.numeroFinal <= 0 || params.numeroFinal < params.numeroInicial) {
            return { success: false, error: "Faixa de numeraÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â§ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£o invÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡lida." };
        }

        const { data: store, error: storeError } = await supabase
            .from("stores")
            .select("cnpj, tenant_id")
            .eq("id", params.storeId)
            .single();

        if (storeError || !store?.cnpj) {
            return { success: false, error: "CNPJ da loja nÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£o encontrado." };
        }

        const cnpj = String(store.cnpj).replace(/\D/g, "");
        if (!cnpj) {
            return { success: false, error: "CNPJ invÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡lido na loja." };
        }

        const companyCheck = await verifyCompanyInutilizationContract({
            cnpj,
            environment: env,
            model,
        });
        if (!companyCheck.success) {
            return companyCheck;
        }

        const { token, baseUrl } = companyCheck;

        const payload = {
            ambiente: env === "production" ? "producao" : "homologacao",
            cnpj,
            ano: params.year % 100,
            serie: params.serie,
            numero_inicial: params.numeroInicial,
            numero_final: params.numeroFinal,
            justificativa: params.justificativa.trim(),
        };

        const endpoint = model === "NFe" ? "nfe" : "nfce";
        const response = await fetch(`${baseUrl}/${endpoint}/inutilizacoes`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
        });

        const result = await response.json();
        const duplicateAlreadyInutilized = !response.ok && isDuplicateInutilizationWithProtocol(result);
        if (!response.ok && !duplicateAlreadyInutilized) {
            const apiError = result?.error?.message || "Erro ao solicitar inutilizaÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â§ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£o na Nuvem Fiscal.";
            return { success: false, error: apiError, details: result };
        }

        let persistWarning: string | null = null;

        // Persistir histÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³rico local para permitir download posterior de comprovantes
        try {
            const protocol = extractProtocolFromInutilization(result);
            const externalId = result?.id
                || result?.autorizacao?.id
                || buildInutilizationExternalId({
                    model,
                    environment: env,
                    cnpj,
                    year: params.year,
                    serie: params.serie,
                    numeroInicial: params.numeroInicial,
                    numeroFinal: params.numeroFinal,
                });
            const status = duplicateAlreadyInutilized
                ? "ja_inutilizado"
                : (result?.status || result?.autorizacao?.status || null);

            const payloadToPersist = {
                store_id: params.storeId,
                tenant_id: store.tenant_id || null,
                environment: env,
                model,
                year: params.year,
                serie: params.serie,
                numero_inicial: params.numeroInicial,
                numero_final: params.numeroFinal,
                justificativa: params.justificativa.trim(),
                protocol,
                external_id: externalId,
                status,
                response_json: duplicateAlreadyInutilized
                    ? { ...result, recovered_from_duplicate_response: true }
                    : result,
            };

            const { data: existingInutilization, error: lookupError } = await supabase
                .from("fiscal_inutilizations")
                .select("id")
                .eq("external_id", externalId)
                .maybeSingle();

            if (lookupError) throw lookupError;

            const persistQuery = existingInutilization
                ? supabase.from("fiscal_inutilizations").update(payloadToPersist).eq("id", existingInutilization.id)
                : supabase.from("fiscal_inutilizations").insert(payloadToPersist);

            const { error: persistError } = await persistQuery;
            if (persistError) throw persistError;
        } catch (persistErr) {
            console.warn("[Fiscal] NÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£o foi possÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â­vel persistir histÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³rico de inutilizaÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â§ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£o localmente.", persistErr);
            const persistErrorMessage = persistErr instanceof Error ? persistErr.message : null;
            persistWarning = persistErrorMessage
                ? `Inutilizacao confirmada pela SEFAZ, mas nao foi possivel salvar o historico local: ${persistErrorMessage}`
                : "Inutilizacao confirmada pela SEFAZ, mas nao foi possivel salvar o historico local.";
        }

        return {
            success: true,
            warning: persistWarning,
            data: duplicateAlreadyInutilized
                ? { ...result, status: "ja_inutilizado", recovered_from_duplicate_response: true }
                : result,
        };
    } catch (error: any) {
        console.error(`Erro ao inutilizar numeracao ${model}:`, error);
        return { success: false, error: error.message || "Erro inesperado na inutilizaÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â§ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£o." };
    }
}

export async function listarInutilizacoesFiscal(params: {
    storeId: number;
    year: number;
    model?: "NFCe" | "NFe";
    environment?: "production" | "homologation";
}) {
    const supabase = createAdminClient() as any;
    const env = params.environment || "production";
    const model = params.model === "NFe" ? "NFe" : "NFCe";
    try {
        if (!(await isStoreModuleEnabledForStore(params.storeId, "fiscal"))) {
            return { success: false, error: "Modulo fiscal desativado para esta loja." };
        }

        const { data, error } = await supabase
            .from("fiscal_inutilizations")
            .select("id, environment, year, serie, numero_inicial, numero_final, justificativa, protocol, external_id, status, response_json, created_at")
            .eq("store_id", params.storeId)
            .eq("model", model)
            .eq("environment", env)
            .eq("year", params.year)
            .order("created_at", { ascending: false });

        if (error) {
            return { success: false, error: error.message, data: [] };
        }

        return { success: true, data: data || [] };
    } catch (error: any) {
        return { success: false, error: error.message || "Erro ao listar inutilizaÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â§ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âµes.", data: [] };
    }
}

export async function inutilizarNumeracaoNFCe(params: {
    storeId: number;
    year: number;
    serie: number;
    numeroInicial: number;
    numeroFinal: number;
    justificativa: string;
    environment?: "production" | "homologation";
}) {
    return inutilizarNumeracaoFiscal({ ...params, model: "NFCe" });
}

export async function listarInutilizacoesNFCe(params: {
    storeId: number;
    year: number;
    environment?: "production" | "homologation";
}) {
    return listarInutilizacoesFiscal({ ...params, model: "NFCe" });
}

export async function consultarNFSe(invoiceId: string) {
    const supabase = createAdminClient() as any;

    try {
        const { data: invoice } = await supabase
            .from("fiscal_invoices")
            .select("*")
            .eq("id", invoiceId)
            .single();

        if (!invoice || !invoice.nuvemfiscal_uuid) {
            return { success: false, error: "Nota nÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£o encontrada ou sem ID da NuvemFiscal." };
        }

        if (invoice.store_id && !(await isStoreModuleEnabledForStore(invoice.store_id, "fiscal"))) {
            return { success: false, error: "Modulo fiscal desativado para esta loja." };
        }

        const env = (invoice.environment as 'production' | 'homologation') || 'production';
        const token = await getNuvemFiscalToken(env);

        const baseUrl = env === 'production'
            ? (process.env.NUVEMFISCAL_PROD_URL || "https://api.nuvemfiscal.com.br")
            : (process.env.NUVEMFISCAL_HOM_URL || "https://api.sandbox.nuvemfiscal.com.br");

        const response = await fetch(`${baseUrl}/nfse/${invoice.nuvemfiscal_uuid}`, {
            method: "GET",
            headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json"
            }
        });

        const result = await response.json();
        console.log("[Consultar NFS-e] Resultado:", JSON.stringify(result, null, 2));

        if (!response.ok) {
            return { success: false, error: result.error?.message || "Erro ao consultar status." };
        }

        let novoStatus = invoice.status;
        let errorMessage = null;

        if (result.status === 'autorizado') novoStatus = 'authorized';
        else if (result.status === 'erro' || result.status === 'rejeitado' || result.status === 'negado') {
            novoStatus = 'error';
            errorMessage = result.motivo_status || "Erro na autorizaÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â§ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£o";
        }
        else if (result.status === 'cancelado') novoStatus = 'cancelled';

        await supabase
            .from("fiscal_invoices")
            .update({
                status: novoStatus,
                numero: result.numero,
                serie: result.serie,
                chave_acesso: result.chave || result.codigo_verificacao,
                xml_url: result.xml_url,
                pdf_url: result.pdf_url || result.link_url,
                error_message: errorMessage
            })
            .eq("id", invoiceId);

        return { success: true, status: novoStatus, data: result };

    } catch (error: any) {
        console.error("Erro ao consultar NFS-e:", error);
        return { success: false, error: error.message };
    }
}

export async function updateCompanyCredentials(organizationId: string, environment: 'production' | 'homologation' = 'production') {
    const supabase = createClient();

    try {
        const { data: company } = await supabase
            .from("company_settings")
            .select("*")
            .eq("organization_id", organizationId)
            .single();

        if (!company || !company.nfse_login || !company.nfse_password) {
            return { success: false, error: "Credenciais nÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£o encontradas no banco." };
        }

        const cnpj = (company.cnpj || company.cpf_cnpj).replace(/\D/g, "");
        const token = await getNuvemFiscalToken(environment);

        const payload = {
            ambiente: environment === 'production' ? 'producao' : 'homologacao',
            rps: {
                lote: 1,
                serie: "1",
                numero: 1
            },
            prefeitura: {
                login: cnpj,
                senha: company.nfse_password
            }
        };

        console.log("[Update Company] Enviando credenciais NFS-e...", payload);

        const baseUrl = environment === 'production'
            ? (process.env.NUVEMFISCAL_PROD_URL || "https://api.nuvemfiscal.com.br")
            : (process.env.NUVEMFISCAL_HOM_URL || "https://api.sandbox.nuvemfiscal.com.br");

        const response = await fetch(`${baseUrl}/empresas/${cnpj}/nfse`, {
            method: "PUT",
            headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        });

        const result = await response.json();
        console.log("[Update Company] Resultado:", JSON.stringify(result, null, 2));

        if (!response.ok) {
            if (response.status === 404) {
                console.log("[Update Company] Tentando POST...");
                const responsePost = await fetch(`${baseUrl}/empresas/${cnpj}/nfse`, {
                    method: "POST",
                    headers: {
                        "Authorization": `Bearer ${token}`,
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify(payload)
                });
                const resultPost = await responsePost.json();
                if (!responsePost.ok) {
                    return { success: false, error: resultPost.error?.message || "Erro ao criar config NFS-e." };
                }
                return { success: true, message: "ConfiguraÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â§ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£o NFS-e criada com sucesso!" };
            }
            return { success: false, error: result.error?.message || "Erro ao atualizar config NFS-e." };
        }

        return { success: true, message: "Credenciais NFS-e atualizadas com sucesso!" };

    } catch (error: any) {
        console.error("Erro ao atualizar empresa:", error);
        return { success: false, error: error.message };
    }
}

export async function cancelarNota(invoiceId: string, justificativa: string = "Erro de preenchimento") {
    const supabase = createAdminClient() as any;

    try {
        const { data: invoice } = await supabase
            .from("fiscal_invoices")
            .select("*")
            .eq("id", invoiceId)
            .single();

        if (!invoice || !invoice.nuvemfiscal_uuid) {
            return { success: false, error: "Nota nÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£o encontrada ou sem ID da NuvemFiscal." };
        }

        if (invoice.store_id && !(await isStoreModuleEnabledForStore(invoice.store_id, "fiscal"))) {
            return { success: false, error: "Modulo fiscal desativado para esta loja." };
        }

        const env = (invoice.environment as 'production' | 'homologation') || 'production';
        const token = await getNuvemFiscalToken(env);

        // Verificar prazo de cancelamento para NFC-e (30 minutos)
        if (invoice.tipo_documento === 'NFCe') {
            const emissionTime = new Date(invoice.created_at).getTime();
            const now = Date.now();
            const thirtyMinutes = 30 * 60 * 1000;

            if (now - emissionTime > thirtyMinutes) {
                return {
                    success: false,
                    error: "NFC-e nÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£o pode ser cancelada: Prazo de 30 minutos expirado."
                };
            }
        }

        const baseUrl = env === 'production'
            ? (process.env.NUVEMFISCAL_PROD_URL || "https://api.nuvemfiscal.com.br")
            : (process.env.NUVEMFISCAL_HOM_URL || "https://api.sandbox.nuvemfiscal.com.br");

        const localFiscal = isNuvemLocalFiscalUrl(baseUrl);
        let endpoint = "";
        let body: any = { justificativa };

        if (invoice.tipo_documento === 'NFCe') {
            endpoint = localFiscal
                ? `/nfce/${invoice.nuvemfiscal_uuid}/cancelar`
                : `/nfce/${invoice.nuvemfiscal_uuid}/cancelamento`;
        } else {
            endpoint = `/nfse/${invoice.nuvemfiscal_uuid}/cancelar`;
            body = {
                codigo: "2", // 2 - Erro na emissÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£o
                motivo: justificativa
            };
        }

        console.log(`[Cancelar] Enviando pedido para ${endpoint}...`);

        const response = await fetch(`${baseUrl}${endpoint}`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(body)
        });

        const responseText = await response.text();
        let result: any = {};
        try {
            result = responseText ? JSON.parse(responseText) : {};
        } catch {
            result = { message: responseText };
        }
        console.log("[Cancelar] Resultado:", JSON.stringify(result, null, 2));

        if (!response.ok) {
            return { success: false, error: getFiscalProviderError(result, `Erro ao cancelar nota. Status ${response.status}.`) };
        }

        await supabase
            .from("fiscal_invoices")
            .update({
                status: "cancelled",
                error_message: null
            })
            .eq("id", invoiceId);

        return { success: true, message: "Nota cancelada com sucesso!" };

    } catch (error: any) {
        console.error("Erro ao cancelar:", error);
        return { success: false, error: error.message };
    }
}

export async function syncStoreFiscalData(
    storeData: any,
    certificateFile: File | null,
    certificatePassword: string | null
) {
    const environments = ['production', 'homologation'] as const;
    const results = [];

    console.log(`[Sync Fiscal] Iniciando sincronizaÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â§ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£o para CNPJ: ${storeData.cnpj}`);

    for (const env of environments) {
        try {
            console.log(`[Sync Fiscal] Processando ambiente: ${env.toUpperCase()}`);

            const token = await getNuvemFiscalToken(env);
            const cnpj = storeData.cnpj.replace(/\D/g, "");
            const baseUrl = env === 'production'
                ? (process.env.NUVEMFISCAL_PROD_URL || "https://api.nuvemfiscal.com.br")
                : (process.env.NUVEMFISCAL_HOM_URL || "https://api.sandbox.nuvemfiscal.com.br");

            const companyPayload = {
                cpf_cnpj: cnpj,
                nome_razao_social: storeData.razao_social,
                nome_fantasia: storeData.name,
                inscricao_estadual: storeData.inscricao_estadual?.replace(/\D/g, ""),
                endereco: {
                    logradouro: storeData.street,
                    numero: storeData.number,
                    complemento: null,
                    bairro: storeData.neighborhood,
                    codigo_municipio: normalizeIbgeCode(storeData.codigo_municipio_ibge) || undefined,
                    cidade: storeData.city,
                    uf: normalizeText(storeData.state).toUpperCase() || undefined,
                    cep: storeData.cep?.replace(/\D/g, ""),
                    pais: "BRASIL"
                }
            };

            const checkResponse = await fetch(`${baseUrl}/empresas/${cnpj}`, {
                headers: { "Authorization": `Bearer ${token}` }
            });

            if (checkResponse.ok) {
                await fetch(`${baseUrl}/empresas/${cnpj}`, {
                    method: "PUT",
                    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
                    body: JSON.stringify(companyPayload)
                });
            } else if (checkResponse.status === 404) {
                const createResponse = await fetch(`${baseUrl}/empresas`, {
                    method: "POST",
                    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
                    body: JSON.stringify(companyPayload)
                });
                if (!createResponse.ok) throw new Error(`Falha ao criar empresa em ${env}`);
            }
            const cscId = env === 'production' ? storeData.csc_id_producao : storeData.csc_id_homologacao;
            const cscToken = env === 'production' ? storeData.csc_producao : storeData.csc_homologacao;
            if (cscId && cscToken) {
                console.log(`[Sync Fiscal] Enviando configuracao NFC-e para ${env}...`);
                const nfcePayload = {
                    ambiente: env === 'production' ? 'producao' : 'homologacao',
                    sefaz: {
                        id_csc: Number(String(cscId).replace(/\D/g, '')),
                        csc: String(cscToken).trim()
                    },
                    serie: Number(storeData.nfce_serie || 1),
                    CRT: Number(storeData.regime_tributario || '1')
                };

                const nfceResponse = await fetch(`${baseUrl}/empresas/${cnpj}/nfce`, {
                    method: "PUT",
                    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
                    body: JSON.stringify(nfcePayload)
                });

                if (!nfceResponse.ok) {
                    const errText = await nfceResponse.text();
                    throw new Error(`Falha ao sincronizar NFC-e em ${env}: ${errText}`);
                }

            }

            let certResult = null;
            if (certificateFile && certificatePassword) {
                console.log(`[Sync Fiscal] Enviando certificado para ${env}...`);
                const certArrayBuffer = await certificateFile.arrayBuffer();
                const certBase64 = Buffer.from(certArrayBuffer).toString('base64');

                const certResponse = await fetch(`${baseUrl}/empresas/${cnpj}/certificado`, {
                    method: "PUT",
                    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
                    body: JSON.stringify({ certificado: certBase64, senha: certificatePassword })
                });

                if (!certResponse.ok) {
                    const err = await certResponse.json();
                    console.error(`[Sync Fiscal] Erro certificado ${env}:`, err);
                } else {
                    certResult = await certResponse.json();
                }
            }

            results.push({ env, success: true, cert: certResult });

        } catch (error: any) {
            console.error(`[Sync Fiscal] Erro em ${env}:`, error.message);
            results.push({ env, success: false, error: error.message });
        }
    }

    const prodResult = results.find(r => r.env === 'production');

    return {
        success: true,
        results,
        thumbprint: prodResult?.cert?.thumbprint,
        valid_until: prodResult?.cert?.data_validade
    };
}
