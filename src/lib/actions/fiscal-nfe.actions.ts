"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getNuvemFiscalToken } from "@/lib/nuvemfiscal";
import { isStoreModuleEnabledForStore } from "@/lib/store-modules.server";
import { getImportedNFeOriginAction, getTenantIdByStore } from "@/lib/actions/fiscal-db.actions";

type NFeEnvironment = "homologation" | "production";

type NFeCustomerAddress = {
    logradouro?: string | null;
    numero?: string | null;
    complemento?: string | null;
    bairro?: string | null;
    cidade?: string | null;
    uf?: string | null;
    cep?: string | null;
    codigo_municipio_ibge?: string | null;
    codigo_municipio?: string | null;
    inscricao_estadual?: string | null;
    ind_ie_dest?: number | null;
};

type NFeOperation = "sale" | "bonus" | "return" | "shipment";
type NFeBonusPurpose = "Bonificacao" | "Brinde" | "Doacao";
type NFeShipmentPurpose = "Remessa para conserto" | "Remessa em garantia";

type NFeSaleInput = {
    storeId: number;
    saleId?: number;
    operation?: NFeOperation;
    finalidade_bonus?: NFeBonusPurpose;
    finalidade_remessa?: NFeShipmentPurpose;
    referenceKey?: string;
    cliente?: {
        nome?: string | null;
        cpf_cnpj?: string | null;
        email?: string | null;
        endereco?: NFeCustomerAddress;
    };
    itens?: FiscalItem[];
    valor_total?: number;
    pagamentos?: {
        forma_pagamento?: string | null;
        meio?: string | null;
        valor_pago?: number | null;
        valor?: number | null;
    }[];
};

type SaleItemRow = {
    id: number;
    product_id: number | null;
    descricao: string | null;
    quantidade: number;
    valor_unitario: number;
    valor_total_item: number;
};

type FiscalItem = {
    codigo: string;
    descricao: string;
    ncm: string;
    cest?: string | null;
    cfop?: string | null;
    unidade: string;
    quantidade: number;
    valor_unitario: number;
    valor_total: number;
    origem?: number | null;
    icms_base?: number | null;
    icms_aliquota?: number | null;
    icms_valor?: number | null;
    icms_mod_bc?: number | null;
};

type NFeStoreData = {
    id?: number | null;
    cnpj?: string | number | null;
    razao_social?: string | null;
    name?: string | null;
    inscricao_estadual?: string | number | null;
    codigo_municipio_ibge?: string | number | null;
    cep?: string | number | null;
    street?: string | null;
    number?: string | null;
    neighborhood?: string | null;
    city?: string | null;
    state?: string | null;
    email?: string | null;
    phone?: string | null;
    whatsapp?: string | null;
    nfe_serie?: string | number | null;
    regime_tributario?: string | number | null;
    rt_cnpj?: string | number | null;
    responsavel_tecnico_cnpj?: string | number | null;
    rt_contato?: string | null;
    responsavel_tecnico_nome?: string | null;
    rt_email?: string | null;
    rt_fone?: string | number | null;
    csrt_id_homologation?: string | number | null;
    csrt_id_production?: string | number | null;
    csrt_token_homologation?: string | null;
    csrt_token_production?: string | null;
};

type NuvemFiscalCompany = {
    nome_razao_social?: string | null;
    nome_fantasia?: string | null;
    inscricao_estadual?: string | number | null;
    endereco?: {
        logradouro?: string | null;
        numero?: string | null;
        bairro?: string | null;
        cidade?: string | null;
        uf?: string | null;
        cep?: string | number | null;
        codigo_municipio?: string | number | null;
    } | null;
};

const NFE_ENVIRONMENT: NFeEnvironment = "homologation";

function cleanDigits(value?: string | number | null) {
    return String(value ?? "").replace(/\D/g, "");
}

function cleanText(value?: string | null) {
    return String(value ?? "").trim();
}

function normalizeCityName(value?: string | null) {
    return cleanText(value)
        .replace(/\s*[-/]\s*[A-Z]{2}$/i, "")
        .trim();
}

function normalizeFiscalUnit(value?: string | null) {
    const normalized = cleanText(value)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toUpperCase();

    const map: Record<string, string> = {
        UNIDADE: "UN",
        UN: "UN",
        UNITARIO: "UN",
        PEC: "PC",
        PECA: "PC",
        PEÇAS: "PC",
        PECA_UNITARIA: "PC",
        PAR: "PAR",
        PARES: "PAR",
        CAIXA: "CX",
        CX: "CX",
        KIT: "KIT",
        JOGO: "JG",
        JG: "JG",
    };

    if (normalized.startsWith("PECA")) return "PC";

    return map[normalized] || normalized.slice(0, 6) || "UN";
}

function stringifyProviderError(result: any) {
    const candidates = [
        result?.error?.message,
        result?.message,
        result?.title,
        result?.detail,
        result?.error_description,
    ].filter(Boolean);

    const details = [
        result?.error?.details,
        result?.error?.errors,
        result?.errors,
        result?.validation_errors,
        result?.detalhes,
    ].filter(Boolean);

    if (candidates.length || details.length) {
        return [
            ...candidates.map(String),
            ...details.map((detail) => typeof detail === "string" ? detail : JSON.stringify(detail)),
        ].join(" - ");
    }

    return JSON.stringify(result);
}

function money(value?: number | string | null) {
    return Number(Number(value || 0).toFixed(2));
}

function leftPad(value: string | number, length: number) {
    return String(value ?? "").replace(/\D/g, "").padStart(length, "0").slice(-length);
}

function getSaoPauloIssuedAt() {
    return new Date()
        .toLocaleString("sv-SE", { timeZone: "America/Sao_Paulo" })
        .replace(" ", "T") + "-03:00";
}

function calculateNFeCheckDigit(keyWithoutDigit: string) {
    const digits = cleanDigits(keyWithoutDigit);
    let weight = 2;
    let sum = 0;

    for (let index = digits.length - 1; index >= 0; index--) {
        sum += Number(digits[index]) * weight;
        weight = weight === 9 ? 2 : weight + 1;
    }

    const mod = sum % 11;
    const digit = 11 - mod;
    return digit >= 10 ? 0 : digit;
}

function buildNFeAccessKey(params: {
    cUF: number | string;
    issuedAt: string;
    cnpj: string;
    serie: number;
    numero: number;
    tpEmis?: number;
    cNF: string | number;
}) {
    const issued = new Date(params.issuedAt);
    const year = String(issued.getFullYear()).slice(-2);
    const month = String(issued.getMonth() + 1).padStart(2, "0");
    const keyWithoutDigit = [
        leftPad(params.cUF, 2),
        `${year}${month}`,
        leftPad(params.cnpj, 14),
        "55",
        leftPad(params.serie, 3),
        leftPad(params.numero, 9),
        leftPad(params.tpEmis || 1, 1),
        leftPad(params.cNF, 8),
    ].join("");

    return `${keyWithoutDigit}${calculateNFeCheckDigit(keyWithoutDigit)}`;
}

function generateNFeRandomCode(storeId: number, serie: number, number: number) {
    const seed = `${storeId}${serie}${number}${Date.now()}`;
    return cleanDigits(seed).slice(-8).padStart(8, "0");
}

function getNuvemFiscalBaseUrl(environment: NFeEnvironment) {
    return environment === "homologation"
        ? (process.env.NUVEMFISCAL_HOM_URL || "https://api.sandbox.nuvemfiscal.com.br")
        : (process.env.NUVEMFISCAL_PROD_URL || "https://api.nuvemfiscal.com.br");
}

function mapPaymentMethod(method?: string | null) {
    const normalized = cleanText(method).toLowerCase();
    if (/^\d{2}$/.test(normalized)) return normalized;
    if (normalized.includes("pix")) return "17";
    if (normalized.includes("dinheiro")) return "01";
    if (normalized.includes("debito") || normalized.includes("débito")) return "04";
    if (normalized.includes("credito") || normalized.includes("crédito") || normalized.includes("cartao") || normalized.includes("cartão")) return "03";
    if (normalized.includes("boleto")) return "15";
    if (normalized.includes("carne") || normalized.includes("carnê") || normalized.includes("loja")) return "05";
    return "99";
}

function buildPayments(pagamentos: any[] | null | undefined, total: number) {
    const rows = pagamentos?.length
        ? pagamentos.map((p) => ({
            tPag: mapPaymentMethod(p.forma_pagamento || p.meio),
            vPag: money(p.valor_pago ?? p.valor),
        }))
        : [{ tPag: "01", vPag: total }];

    const sum = money(rows.reduce((acc, row) => acc + row.vPag, 0));
    const diff = money(total - sum);
    if (rows.length > 0 && diff !== 0) {
        rows[rows.length - 1].vPag = money(rows[rows.length - 1].vPag + diff);
    }

    return rows;
}

function distributeTotalAdjustment(totalAdjustment: number, items: FiscalItem[], valorProdutos: number) {
    const value = money(totalAdjustment);
    if (value <= 0 || valorProdutos <= 0 || items.length === 0) {
        return items.map(() => 0);
    }

    let allocated = 0;
    return items.map((item, index) => {
        if (index === items.length - 1) {
            return money(value - allocated);
        }

        const share = money((value * item.valor_total) / valorProdutos);
        allocated = money(allocated + share);
        return share;
    });
}

function assertStoreReadyForNFe(store: NFeStoreData) {
    const missing: string[] = [];

    if (!cleanDigits(store.cnpj)) {
        missing.push("CNPJ");
    }
    if (!cleanText(store.razao_social || store.name)) {
        missing.push("razao social");
    }
    if (!cleanDigits(store.inscricao_estadual)) {
        missing.push("inscricao estadual");
    }
    if (!cleanDigits(store.codigo_municipio_ibge)) {
        missing.push("codigo IBGE do municipio");
    }
    if (!cleanDigits(store.cep)) {
        missing.push("CEP");
    }
    if (!cleanText(store.street)) {
        missing.push("logradouro");
    }
    if (!cleanText(store.number)) {
        missing.push("numero");
    }
    if (!cleanText(store.neighborhood)) {
        missing.push("bairro");
    }
    if (!cleanText(store.city)) {
        missing.push("cidade");
    }
    if (!cleanText(store.state)) {
        missing.push("UF");
    }

    if (missing.length > 0) {
        throw new Error(`Dados fiscais da loja incompletos para NF-e: ${missing.join(", ")}. Complete em Configuracoes > Dados da loja.`);
    }
}

async function hydrateStoreFiscalDataFromNuvemFiscal(supabase: any, storeId: number, store: NFeStoreData) {
    const cnpj = cleanDigits(store.cnpj);
    if (!cnpj) return store;

    const missingLocalAddress =
        !cleanText(store.street) ||
        !cleanText(store.number) ||
        !cleanText(store.neighborhood) ||
        !cleanText(store.city) ||
        !cleanText(store.state) ||
        !cleanDigits(store.cep) ||
        !cleanDigits(store.codigo_municipio_ibge) ||
        !cleanDigits(store.inscricao_estadual);

    if (!missingLocalAddress) return store;

    try {
        const token = await getNuvemFiscalToken(NFE_ENVIRONMENT);
        const response = await fetch(`${getNuvemFiscalBaseUrl(NFE_ENVIRONMENT)}/empresas/${cnpj}`, {
            headers: { Authorization: `Bearer ${token}` },
        });

        if (!response.ok) return store;

        const company = await response.json() as NuvemFiscalCompany;
        const address = company.endereco || {};
        const patch: Partial<NFeStoreData> = {};

        if (!cleanText(store.razao_social) && cleanText(company.nome_razao_social)) patch.razao_social = cleanText(company.nome_razao_social);
        if (!cleanText(store.name) && cleanText(company.nome_fantasia)) patch.name = cleanText(company.nome_fantasia);
        if (!cleanDigits(store.inscricao_estadual) && cleanDigits(company.inscricao_estadual)) patch.inscricao_estadual = cleanDigits(company.inscricao_estadual);
        if (!cleanDigits(store.codigo_municipio_ibge) && cleanDigits(address.codigo_municipio)) patch.codigo_municipio_ibge = cleanDigits(address.codigo_municipio);
        if (!cleanDigits(store.cep) && cleanDigits(address.cep)) patch.cep = cleanDigits(address.cep);
        if (!cleanText(store.street) && cleanText(address.logradouro)) patch.street = cleanText(address.logradouro);
        if (!cleanText(store.number) && cleanText(address.numero)) patch.number = cleanText(address.numero);
        if (!cleanText(store.neighborhood) && cleanText(address.bairro)) patch.neighborhood = cleanText(address.bairro);
        if (!cleanText(store.city) && cleanText(address.cidade)) patch.city = cleanText(address.cidade);
        if (!cleanText(store.state) && cleanText(address.uf)) patch.state = cleanText(address.uf).toUpperCase();

        if (Object.keys(patch).length === 0) return store;

        await supabase
            .from("stores")
            .update(patch)
            .eq("id", storeId);

        return { ...store, ...patch };
    } catch (error) {
        console.warn("[NF-e] Nao foi possivel complementar dados da loja pela Nuvem Fiscal:", error);
        return store;
    }
}

function buildDest(customer: any, override?: NFeSaleInput["cliente"]) {
    const address = override?.endereco || {};
    const doc = cleanDigits(override?.cpf_cnpj || customer?.cpf);
    const nome = cleanText(override?.nome || customer?.full_name);
    const uf = cleanText(address.uf || customer?.uf).toUpperCase();
    const codigoMunicipio = cleanDigits(address.codigo_municipio_ibge || address.codigo_municipio || customer?.codigo_municipio_ibge || customer?.codigo_municipio);
    const cep = cleanDigits(address.cep || customer?.cep);
    const logradouro = cleanText(address.logradouro || customer?.rua);
    const numero = cleanText(address.numero || customer?.numero);
    const bairro = cleanText(address.bairro || customer?.bairro);
    const cidade = normalizeCityName(address.cidade || customer?.cidade);

    if (doc.length !== 11 && doc.length !== 14) {
        throw new Error("CPF/CNPJ do destinatario e obrigatorio para NF-e.");
    }
    if (!nome) {
        throw new Error("Nome do destinatario e obrigatorio para NF-e.");
    }
    if (!logradouro || !numero || !bairro || !cidade || !uf || !cep || !codigoMunicipio) {
        throw new Error("Endereco completo do destinatario e obrigatorio para NF-e. Inclua tambem o codigo IBGE do municipio.");
    }

    const ie = cleanDigits(address.inscricao_estadual || customer?.inscricao_estadual);
    const indIeDest = [1, 2, 9].includes(Number(address.ind_ie_dest))
        ? Number(address.ind_ie_dest)
        : ie ? 1 : 9;

    return {
        CNPJ: doc.length === 14 ? doc : undefined,
        CPF: doc.length === 11 ? doc : undefined,
        xNome: nome,
        enderDest: {
            xLgr: logradouro,
            nro: numero,
            xCpl: cleanText(address.complemento || customer?.complemento) || undefined,
            xBairro: bairro,
            cMun: Number(codigoMunicipio),
            xMun: cidade,
            UF: uf,
            CEP: cep,
            cPais: "1058",
            xPais: "BRASIL",
        },
        indIEDest: indIeDest,
        ...(indIeDest === 1 && ie ? { IE: ie } : {}),
        email: cleanText(override?.email || customer?.email) || undefined,
    };
}

function buildItemTax(item: FiscalItem, csosn: "102" | "400" = "102") {
    return {
        ICMS: {
            // The Nuvem Fiscal DTO groups CSOSN 102/103/300/400 under ICMSSN102.
            ICMSSN102: {
                orig: Number(item.origem ?? 0),
                CSOSN: csosn,
            },
        },
        PIS: {
            PISOutr: {
                CST: "99",
                vBC: 0,
                pPIS: 0,
                vPIS: 0,
            },
        },
        COFINS: {
            COFINSOutr: {
                CST: "99",
                vBC: 0,
                pCOFINS: 0,
                vCOFINS: 0,
            },
        },
    };
}

function buildReturnItemTax(item: FiscalItem) {
    const rate = Number(item.icms_aliquota || 0);
    if (rate > 0 && Number(item.icms_valor || 0) > 0) {
        const base = money(item.valor_total);
        return {
            ICMS: {
                ICMSSN900: {
                    orig: Number(item.origem ?? 0),
                    CSOSN: "900",
                    modBC: Number(item.icms_mod_bc ?? 3),
                    vBC: base,
                    pICMS: rate,
                    vICMS: money(base * rate / 100),
                },
            },
            PIS: { PISOutr: { CST: "99", vBC: 0, pPIS: 0, vPIS: 0 } },
            COFINS: { COFINSOutr: { CST: "99", vBC: 0, pCOFINS: 0, vCOFINS: 0 } },
        };
    }

    return buildItemTax(item, "102");
}

function buildOutputSnapshot(total: number, store: NFeStoreData, customer: any, issuedAt: string) {
    return {
        direction: "output",
        data_emissao: issuedAt,
        valor_total: total,
        emitente_nome: store.razao_social || store.name || null,
        emitente_cnpj: cleanDigits(store.cnpj),
        destinatario_nome: customer?.full_name || customer?.nome || null,
        destinatario_cnpj: cleanDigits(customer?.cpf || customer?.cpf_cnpj) || null,
    };
}

async function getNextNFeNumber(supabase: any, organizationId: string, storeId: number, serie: number) {
    const { data, error } = await supabase.rpc("get_next_nfe_number", {
        p_org_id: organizationId,
        p_store_id: storeId,
        p_serie: serie,
        p_environment: NFE_ENVIRONMENT,
    });

    if (error || !data) {
        console.error("[NFe Otica] Erro ao obter numeracao:", error);
        throw new Error("Nao foi possivel obter numeracao da NF-e. Execute a migration_nfe_sequence.sql antes de emitir.");
    }

    return Number(data);
}

async function ensureNFeSequenceAtLeast(supabase: any, organizationId: string, storeId: number, serie: number, number: number) {
    if (!Number.isFinite(number) || number <= 0) return;

    const { error } = await supabase
        .from("nfe_sequences")
        .upsert({
            organization_id: organizationId,
            store_id: storeId,
            serie,
            environment: NFE_ENVIRONMENT,
            last_number: number,
            updated_at: new Date().toISOString(),
        }, { onConflict: "organization_id,store_id,serie,environment" });

    if (error) {
        console.warn("[NFe Otica] Nao foi possivel ajustar sequencia apos rejeicao:", error);
    }
}

function extractNFeNumberFromAccessKey(accessKey?: string | null) {
    const key = cleanDigits(accessKey);
    if (key.length !== 44) return null;
    const number = Number(key.slice(25, 34));
    return Number.isFinite(number) && number > 0 ? number : null;
}

function buildNFeInfRespTec(store: NFeStoreData, cnpjEmit: string, environment: NFeEnvironment) {
    const isProduction = environment === "production";
    const rtCnpj = cleanDigits(
        process.env.NFE_RT_CNPJ ||
        store.rt_cnpj ||
        store.responsavel_tecnico_cnpj ||
        cnpjEmit
    );
    const rtContato = cleanText(
        process.env.NFE_RT_CONTATO ||
        store.rt_contato ||
        store.responsavel_tecnico_nome ||
        store.razao_social ||
        store.name ||
        "Responsavel Tecnico"
    ).slice(0, 60);
    const rtEmail = cleanText(
        process.env.NFE_RT_EMAIL ||
        store.rt_email ||
        store.email ||
        "suporte@gestao-otica.local"
    );
    const rtFone = cleanDigits(
        process.env.NFE_RT_FONE ||
        store.rt_fone ||
        store.phone ||
        store.whatsapp ||
        "0000000000"
    );
    const idCSRT = cleanDigits(
        (isProduction ? store.csrt_id_production : store.csrt_id_homologation) ||
        (isProduction ? process.env.NFE_CSRT_ID_PRODUCTION : process.env.NFE_CSRT_ID_HOMOLOGATION)
    );
    const CSRT = cleanText(
        (isProduction ? store.csrt_token_production : store.csrt_token_homologation) ||
        (isProduction ? process.env.NFE_CSRT_TOKEN_PRODUCTION : process.env.NFE_CSRT_TOKEN_HOMOLOGATION)
    );

    if (!idCSRT || !CSRT) {
        throw new Error("CSRT da NF-e nao configurado. Configure idCSRT e token CSRT de NF-e; CSC de NFC-e nao e valido para NF-e modelo 55.");
    }

    return {
        CNPJ: rtCnpj || cnpjEmit,
        xContato: rtContato,
        email: rtEmail,
        fone: rtFone || "0000000000",
        ...(idCSRT && CSRT ? { idCSRT: Number(idCSRT), CSRT } : {}),
    };
}

function logNFePayloadDiagnostic(payload: any, accessKey: string, sources: { idCSRT: "store" | "env"; csrt: "store" | "env"; rtCnpj: "env" | "store" | "emitente" }) {
    const infNFe = payload?.infNFe || {};
    const resp = infNFe.infRespTec || {};
    console.log("[NFe Otica] Payload diagnostico:", JSON.stringify({
        ambiente: payload?.ambiente,
        modelo: infNFe.ide?.mod,
        chave_calculada: accessKey,
        ide: {
            cUF: infNFe.ide?.cUF,
            cNF: infNFe.ide?.cNF,
            serie: infNFe.ide?.serie,
            nNF: infNFe.ide?.nNF,
            tpAmb: infNFe.ide?.tpAmb,
            cDV: infNFe.ide?.cDV,
        },
        emit: {
            CNPJ: infNFe.emit?.CNPJ,
            IE: infNFe.emit?.IE,
            UF: infNFe.emit?.enderEmit?.UF,
        },
        infRespTec: {
            CNPJ: resp.CNPJ,
            xContato: resp.xContato,
            email: resp.email,
            fone: resp.fone,
            idCSRT: resp.idCSRT,
            has_CSRT_raw: Object.prototype.hasOwnProperty.call(resp, "CSRT"),
            CSRT_length: typeof resp.CSRT === "string" ? resp.CSRT.length : null,
            has_hashCSRT: Object.prototype.hasOwnProperty.call(resp, "hashCSRT"),
        },
        sources,
    }, null, 2));
}

function getNFePayloadDiagnosticSources(store: NFeStoreData, environment: NFeEnvironment) {
    const isProduction = environment === "production";
    const storeIdCSRT = isProduction ? store.csrt_id_production : store.csrt_id_homologation;
    const storeCSRT = isProduction ? store.csrt_token_production : store.csrt_token_homologation;

    return {
        idCSRT: cleanDigits(storeIdCSRT) ? "store" as const : "env" as const,
        csrt: cleanText(storeCSRT) ? "store" as const : "env" as const,
        rtCnpj: process.env.NFE_RT_CNPJ
            ? "env" as const
            : cleanDigits(store.rt_cnpj || store.responsavel_tecnico_cnpj)
                ? "store" as const
                : "emitente" as const,
    };
}

async function fetchXmlContent(xmlUrl?: string | null) {
    if (!xmlUrl) return null;
    try {
        const response = await fetch(xmlUrl);
        if (!response.ok) return null;
        return await response.text();
    } catch {
        return null;
    }
}

async function ensureNoActiveNFeForSale(supabase: any, organizationId: string, storeId: number, saleId: number) {
    const { data, error } = await supabase
        .from("fiscal_invoices")
        .select("id")
        .eq("organization_id", organizationId)
        .eq("store_id", storeId)
        .eq("work_order_id", saleId)
        .eq("tipo_documento", "NFe")
        .eq("direction", "output")
        .eq("environment", NFE_ENVIRONMENT)
        .in("status", ["draft", "processing", "authorized"])
        .limit(1)
        .maybeSingle();

    if (error) {
        throw new Error("Nao foi possivel validar duplicidade de NF-e para esta venda.");
    }

    if (data) {
        throw new Error(`Ja existe NF-e ativa em ${NFE_ENVIRONMENT === "production" ? "producao" : "homologacao"} para esta venda.`);
    }
}

async function ensureNoActiveReturnForOrigin(supabase: any, organizationId: string, storeId: number, accessKey: string) {
    const { data, error } = await supabase
        .from("fiscal_invoices")
        .select("id")
        .eq("organization_id", organizationId)
        .eq("store_id", storeId)
        .eq("tipo_documento", "NFe")
        .eq("direction", "output")
        .eq("environment", NFE_ENVIRONMENT)
        .contains("payload_json", { _entry_access_key: accessKey })
        .in("status", ["draft", "processing", "authorized"])
        .limit(1)
        .maybeSingle();

    if (error) {
        throw new Error("Nao foi possivel validar duplicidade da devolucao.");
    }
    if (data) {
        throw new Error("Ja existe uma NF-e de devolucao ativa para esta nota de entrada em homologacao.");
    }
}

async function buildFiscalItems(supabase: any, saleItems: SaleItemRow[]) {
    const productIds = saleItems
        .map((item) => item.product_id)
        .filter((id): id is number => typeof id === "number");

    const productMap = new Map<number, any>();

    if (productIds.length > 0) {
        const { data: products, error } = await supabase
            .from("products")
            .select("id, nome, codigo_barras, referencia, ncm, cest, cfop, unidade_medida, origem_mercadoria")
            .in("id", productIds);

        if (error) {
            throw new Error("Nao foi possivel buscar dados fiscais dos produtos.");
        }

        for (const product of products || []) {
            productMap.set(product.id, product);
        }
    }

    return saleItems.map((item, index): FiscalItem => {
        const product = item.product_id ? productMap.get(item.product_id) : null;
        const ncm = cleanDigits(product?.ncm);

        if (!/^\d{8}$/.test(ncm) || ncm === "00000000") {
            throw new Error(`NCM valido e obrigatorio para NF-e. Verifique o item: ${item.descricao || product?.nome || item.id}.`);
        }

        return {
            codigo: cleanText(product?.codigo_barras || product?.referencia || item.product_id || item.id || index + 1),
            descricao: cleanText(item.descricao || product?.nome || `Item ${index + 1}`),
            ncm,
            cest: cleanDigits(product?.cest) || undefined,
            cfop: cleanDigits(product?.cfop) || undefined,
            unidade: normalizeFiscalUnit(product?.unidade_medida),
            quantidade: Number(item.quantidade || 0),
            valor_unitario: money(item.valor_unitario),
            valor_total: money(item.valor_total_item),
            origem: product?.origem_mercadoria ?? 0,
        };
    });
}

function normalizeManualItems(items: FiscalItem[] | undefined) {
    if (!items?.length) {
        throw new Error("Adicione ao menos um item para emitir NF-e.");
    }

    return items.map((item, index): FiscalItem => {
        const ncm = cleanDigits(item.ncm);
        if (!/^\d{8}$/.test(ncm) || ncm === "00000000") {
            throw new Error(`NCM valido e obrigatorio para NF-e. Verifique o item: ${item.descricao || item.codigo || index + 1}.`);
        }

        const quantidade = Number(item.quantidade || 0);
        const valorUnitario = money(item.valor_unitario);
        const valorTotal = money(item.valor_total || quantidade * valorUnitario);

        if (quantidade <= 0 || valorUnitario <= 0 || valorTotal <= 0) {
            throw new Error(`Quantidade e valores precisam ser maiores que zero. Verifique o item: ${item.descricao || item.codigo || index + 1}.`);
        }

        return {
            codigo: cleanText(item.codigo) || String(index + 1),
            descricao: cleanText(item.descricao) || `Item ${index + 1}`,
            ncm,
            cest: cleanDigits(item.cest) || undefined,
            cfop: cleanDigits(item.cfop) || undefined,
            unidade: normalizeFiscalUnit(item.unidade),
            quantidade,
            valor_unitario: valorUnitario,
            valor_total: valorTotal,
            origem: item.origem ?? 0,
        };
    });
}

export async function emitirNFeVendaHomologacao(input: NFeSaleInput) {
    const supabase = createAdminClient() as any;
    let invoiceId: number | null = null;

    try {
        if (!(await isStoreModuleEnabledForStore(input.storeId, "fiscal"))) {
            return { success: false, error: "Modulo fiscal desativado para esta loja." };
        }

        const organizationId = await getTenantIdByStore(input.storeId);
        if (!organizationId) {
            throw new Error("Tenant da loja nao encontrado.");
        }

        const operation = input.operation || "sale";
        if (!["sale", "bonus", "return", "shipment"].includes(operation)) {
            throw new Error("Operacao NF-e ainda nao suportada.");
        }
        const isSaleOperation = operation === "sale";
        const isReturnOperation = operation === "return";
        const isShipmentOperation = operation === "shipment";
        const referenceKey = cleanDigits(input.referenceKey);

        if (input.saleId && isSaleOperation) {
            await ensureNoActiveNFeForSale(supabase, organizationId, input.storeId, input.saleId);
        }
        if (isReturnOperation) {
            if (!/^\d{44}$/.test(referenceKey)) {
                throw new Error("Selecione uma NF-e de entrada importada para emitir a devolucao.");
            }
            await ensureNoActiveReturnForOrigin(supabase, organizationId, input.storeId, referenceKey);
        }

        const { data: store } = await supabase
            .from("stores")
            .select("*")
            .eq("id", input.storeId)
            .single();

        if (!store) throw new Error("Loja nao encontrada.");

        const hydratedStore = await hydrateStoreFiscalDataFromNuvemFiscal(supabase, input.storeId, store);
        assertStoreReadyForNFe(hydratedStore);

        let sale: any | null = null;
        let customer: any = input.cliente
            ? { nome: input.cliente.nome, cpf_cnpj: input.cliente.cpf_cnpj }
            : null;
        let fiscalItems: FiscalItem[];
        let salePayments: any[] = input.pagamentos || [];

        if (isReturnOperation) {
            const originResult = await getImportedNFeOriginAction({
                storeId: input.storeId,
                accessKey: referenceKey,
            });
            if (!originResult.success || !originResult.participant || !originResult.items) {
                throw new Error(originResult.error || "Nao foi possivel carregar a NF-e de origem.");
            }

            customer = {
                full_name: originResult.participant.nome,
                cpf: originResult.participant.cpf_cnpj,
                email: originResult.participant.email,
                rua: originResult.participant.logradouro,
                numero: originResult.participant.numero,
                bairro: originResult.participant.bairro,
                cidade: originResult.participant.cidade,
                uf: originResult.participant.uf,
                cep: originResult.participant.cep,
                codigo_municipio_ibge: originResult.participant.codigo_municipio,
                inscricao_estadual: originResult.participant.inscricao_estadual,
                ind_ie_dest: Number(originResult.participant.ind_ie_dest || 9),
            };

            if (!input.itens?.length) {
                throw new Error("Selecione ao menos um item da NF-e de origem para devolver.");
            }

            const requestedByCode = new Map(input.itens.map((item) => [cleanText(item.codigo), item]));
            fiscalItems = originResult.items
                .filter((originItem) => requestedByCode.has(cleanText(originItem.codigo)))
                .map((originItem): FiscalItem => {
                    const requested = requestedByCode.get(cleanText(originItem.codigo))!;
                    const quantity = Number(requested.quantidade || 0);
                    const originalQuantity = Number(originItem.quantidade || 0);
                    const ncm = cleanDigits(originItem.ncm);
                    if (quantity <= 0 || quantity > originalQuantity) {
                        throw new Error(`Quantidade de devolucao invalida para o item ${originItem.descricao}. Maximo: ${originalQuantity}.`);
                    }
                    if (!/^\d{8}$/.test(ncm) || ncm === "00000000") {
                        throw new Error(`NCM invalido na NF-e de origem para o item ${originItem.descricao}.`);
                    }

                    return {
                        codigo: cleanText(originItem.codigo),
                        descricao: cleanText(originItem.descricao),
                        ncm,
                        cest: cleanDigits(originItem.cest) || undefined,
                        unidade: normalizeFiscalUnit(originItem.unidade),
                        quantidade: quantity,
                        valor_unitario: money(originItem.valor_unitario),
                        valor_total: money(quantity * Number(originItem.valor_unitario || 0)),
                        origem: Number(originItem.origem || 0),
                        icms_base: Number(originItem.icms_base || 0),
                        icms_aliquota: Number(originItem.icms_aliquota || 0),
                        icms_valor: Number(originItem.icms_valor || 0),
                        icms_mod_bc: Number(originItem.icms_mod_bc ?? 3),
                    };
                });

            if (fiscalItems.length !== input.itens.length) {
                throw new Error("Um ou mais itens selecionados nao pertencem a NF-e de origem.");
            }
            salePayments = [];
        } else if (input.saleId && isSaleOperation) {
            const { data: saleData, error: saleError } = await supabase
                .from("vendas")
                .select("*, customers (*), venda_itens (*), pagamentos (*)")
                .eq("id", input.saleId)
                .eq("store_id", input.storeId)
                .single();

            if (saleError || !saleData) throw new Error("Venda nao encontrada.");
            if (saleData.status !== "Fechada") throw new Error("A NF-e so pode ser emitida para venda fechada.");

            sale = saleData;
            customer = Array.isArray(sale.customers) ? sale.customers[0] : sale.customers;

            const saleItems = (sale.venda_itens || []) as SaleItemRow[];
            if (saleItems.length === 0) {
                throw new Error("A venda nao possui itens para emitir NF-e.");
            }

            fiscalItems = await buildFiscalItems(supabase, saleItems);
            salePayments = sale.pagamentos || [];
        } else {
            fiscalItems = normalizeManualItems(input.itens);
        }

        const dest = buildDest(customer, isReturnOperation ? undefined : input.cliente);
        const emitUF = cleanText(hydratedStore.state).toUpperCase();
        const destUF = cleanText(dest.enderDest.UF).toUpperCase();
        const sameState = !destUF || destUF === emitUF;
        const bonusPurpose: NFeBonusPurpose = input.finalidade_bonus || "Bonificacao";
        const shipmentPurpose: NFeShipmentPurpose = input.finalidade_remessa || "Remessa para conserto";
        if (isShipmentOperation && !["Remessa para conserto", "Remessa em garantia"].includes(shipmentPurpose)) {
            throw new Error("Nesta etapa, apenas remessas para conserto ou garantia estao liberadas.");
        }
        const template = isSaleOperation
            ? {
                natOp: "VENDA DE MERCADORIA",
                cfop: sameState ? "5102" : "6102",
                csosn: "102" as const,
                indPres: 1,
                finNFe: 1,
                indFinal: 1,
                detPag: null,
                infCpl: "NF-e de venda emitida pelo Gestao Otica Pro.",
            }
            : isReturnOperation
                ? {
                    natOp: "DEVOLUCAO DE MERCADORIA",
                    cfop: sameState ? "5202" : "6202",
                    csosn: "102" as const,
                    indPres: 9,
                    finNFe: 4,
                    indFinal: 0,
                    detPag: [{ tPag: "90", vPag: 0 }],
                    infCpl: "DEVOLUCAO DE COMPRA REFERENTE A NF-E DE ORIGEM INFORMADA.",
                }
                : isShipmentOperation
                    ? {
                        natOp: shipmentPurpose === "Remessa em garantia"
                            ? "REMESSA EM GARANTIA"
                            : "REMESSA PARA CONSERTO",
                        cfop: sameState ? "5915" : "6915",
                        csosn: "400" as const,
                        indPres: 9,
                        finNFe: 1,
                        indFinal: dest.indIEDest === 9 ? 1 : 0,
                        detPag: [{ tPag: "90", vPag: 0 }],
                        infCpl: shipmentPurpose === "Remessa em garantia"
                            ? "REMESSA DE MERCADORIA/BEM EM GARANTIA. SEM INCIDENCIA DE COBRANCA."
                            : "REMESSA DE MERCADORIA/BEM PARA CONSERTO OU REPARO. SEM INCIDENCIA DE COBRANCA.",
                    }
                : {
                natOp: bonusPurpose === "Bonificacao"
                    ? "BONIFICACAO"
                    : bonusPurpose === "Brinde"
                        ? "REMESSA DE BRINDE"
                        : "DOACAO",
                cfop: sameState ? "5910" : "6910",
                csosn: "400" as const,
                indPres: 9,
                finNFe: 1,
                indFinal: 1,
                detPag: [{ tPag: "90", vPag: 0 }],
                infCpl: bonusPurpose === "Bonificacao"
                    ? "SAIDA EM BONIFICACAO SEM COBRANCA."
                    : bonusPurpose === "Brinde"
                        ? "SAIDA DE BRINDE SEM COBRANCA."
                        : "SAIDA EM DOACAO SEM COBRANCA.",
                };
        const serie = Number(hydratedStore.nfe_serie || 1);
        const nextNumber = await getNextNFeNumber(supabase, organizationId, input.storeId, serie);
        const issuedAt = getSaoPauloIssuedAt();
        const cUF = Number(cleanDigits(hydratedStore.codigo_municipio_ibge).slice(0, 2));
        const cNF = generateNFeRandomCode(input.storeId, serie, nextNumber);
        const accessKey = buildNFeAccessKey({
            cUF,
            issuedAt,
            cnpj: cleanDigits(hydratedStore.cnpj),
            serie,
            numero: nextNumber,
            tpEmis: 1,
            cNF,
        });
        const cDV = Number(accessKey.slice(-1));
        const valorProdutos = money(fiscalItems.reduce((sum, item) => sum + item.valor_total, 0));
        const valorTotal = isReturnOperation
            ? valorProdutos
            : money(input.valor_total || sale?.valor_final || valorProdutos);
        const descontoTotal = valorProdutos > valorTotal ? money(valorProdutos - valorTotal) : 0;
        const outrasDespesasTotal = valorTotal > valorProdutos ? money(valorTotal - valorProdutos) : 0;
        const descontosPorItem = distributeTotalAdjustment(descontoTotal, fiscalItems, valorProdutos);
        const outrasPorItem = distributeTotalAdjustment(outrasDespesasTotal, fiscalItems, valorProdutos);
        const detPag = template.detPag || buildPayments(salePayments, valorTotal);
        const isProduction = NFE_ENVIRONMENT === "production";

        const nfePayload = {
            ambiente: isProduction ? "producao" : "homologacao",
            infNFe: {
                versao: "4.00",
                ide: {
                    cUF,
                    cNF,
                    natOp: template.natOp,
                    mod: 55,
                    serie,
                    nNF: nextNumber,
                    dhEmi: issuedAt,
                    tpNF: 1,
                    idDest: sameState ? 1 : 2,
                    cMunFG: Number(cleanDigits(hydratedStore.codigo_municipio_ibge)),
                    tpImp: 1,
                    tpEmis: 1,
                    cDV,
                    tpAmb: isProduction ? 1 : 2,
                    finNFe: template.finNFe,
                    indFinal: template.indFinal,
                    indPres: template.indPres,
                    indIntermed: 0,
                    procEmi: 0,
                    verProc: "GestaoOticaPro 1.0",
                    ...(isReturnOperation ? { NFref: [{ refNFe: referenceKey }] } : {}),
                },
                emit: {
                    CNPJ: cleanDigits(hydratedStore.cnpj),
                    xNome: cleanText(hydratedStore.razao_social || hydratedStore.name),
                    xFant: cleanText(hydratedStore.name),
                    enderEmit: {
                        xLgr: cleanText(hydratedStore.street),
                        nro: cleanText(hydratedStore.number),
                        xBairro: cleanText(hydratedStore.neighborhood),
                        cMun: Number(cleanDigits(hydratedStore.codigo_municipio_ibge)),
                        xMun: cleanText(hydratedStore.city),
                        UF: cleanText(hydratedStore.state).toUpperCase(),
                        CEP: cleanDigits(hydratedStore.cep),
                        cPais: "1058",
                        xPais: "BRASIL",
                    },
                    IE: cleanDigits(hydratedStore.inscricao_estadual),
                    CRT: Number(hydratedStore.regime_tributario || "1"),
                },
                dest,
                det: fiscalItems.map((item, index) => ({
                    nItem: index + 1,
                    prod: {
                        cProd: item.codigo,
                        cEAN: "SEM GTIN",
                        xProd: item.descricao,
                        NCM: item.ncm,
                        CFOP: template.cfop,
                        ...(item.cest ? { CEST: item.cest } : {}),
                        uCom: item.unidade,
                        qCom: item.quantidade,
                        vUnCom: item.valor_unitario,
                        vProd: item.valor_total,
                        ...(descontosPorItem[index] > 0 ? { vDesc: descontosPorItem[index] } : {}),
                        ...(outrasPorItem[index] > 0 ? { vOutro: outrasPorItem[index] } : {}),
                        cEANTrib: "SEM GTIN",
                        uTrib: item.unidade,
                        qTrib: item.quantidade,
                        vUnTrib: item.valor_unitario,
                        indTot: 1,
                    },
                    imposto: isReturnOperation
                        ? buildReturnItemTax(item)
                        : buildItemTax(item, template.csosn),
                })),
                total: {
                    ICMSTot: {
                        vBC: isReturnOperation
                            ? money(fiscalItems.reduce((sum, item) => sum + (Number(item.icms_aliquota || 0) > 0 ? item.valor_total : 0), 0))
                            : 0,
                        vICMS: isReturnOperation
                            ? money(fiscalItems.reduce((sum, item) => sum + money(item.valor_total * Number(item.icms_aliquota || 0) / 100), 0))
                            : 0,
                        vICMSDeson: 0,
                        vFCP: 0,
                        vBCST: 0,
                        vST: 0,
                        vFCPST: 0,
                        vFCPSTRet: 0,
                        vProd: valorProdutos,
                        vFrete: 0,
                        vSeg: 0,
                        vDesc: descontoTotal,
                        vII: 0,
                        vIPI: 0,
                        vIPIDevol: 0,
                        vPIS: 0,
                        vCOFINS: 0,
                        vOutro: outrasDespesasTotal,
                        vNF: valorTotal,
                    },
                },
                transp: { modFrete: 9 },
                pag: { detPag },
                infAdic: {
                    infCpl: isProduction
                        ? template.infCpl
                        : `${template.infCpl} EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL.`,
                },
                infRespTec: buildNFeInfRespTec(hydratedStore, cleanDigits(hydratedStore.cnpj), NFE_ENVIRONMENT),
            },
        };

        logNFePayloadDiagnostic(nfePayload, accessKey, getNFePayloadDiagnosticSources(hydratedStore, NFE_ENVIRONMENT));

        const { data: invoice, error: dbError } = await supabase
            .from("fiscal_invoices")
            .insert({
                organization_id: organizationId,
                store_id: input.storeId,
                work_order_id: isSaleOperation ? input.saleId || null : null,
                ...buildOutputSnapshot(valorTotal, hydratedStore, customer, issuedAt),
                tipo_documento: "NFe",
                status: "processing",
                environment: NFE_ENVIRONMENT,
                payload_json: isReturnOperation
                    ? { ...nfePayload, _entry_access_key: referenceKey }
                    : nfePayload,
            })
            .select()
            .single();

        if (dbError || !invoice) {
            throw dbError || new Error("Nao foi possivel gravar a NF-e no banco.");
        }

        invoiceId = invoice.id;

        const token = await getNuvemFiscalToken(NFE_ENVIRONMENT);
        const baseUrl = process.env.NUVEMFISCAL_HOM_URL || "https://api.sandbox.nuvemfiscal.com.br";
        const response = await fetch(`${baseUrl}/nfe`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(nfePayload),
        });

        const responseText = await response.text();
        let result: any = {};
        try {
            result = responseText ? JSON.parse(responseText) : {};
        } catch {
            await supabase
                .from("fiscal_invoices")
                .update({ status: "error", error_message: `Resposta invalida da API (${response.status})` })
                .eq("id", invoiceId);
            return { success: false, error: `Resposta invalida da API (${response.status})`, invoiceId };
        }

        if (!response.ok) {
            const providerError = stringifyProviderError(result);

            await supabase
                .from("fiscal_invoices")
                .update({ status: "error", error_message: providerError })
                .eq("id", invoiceId);

            return { success: false, error: providerError || "Erro na emissao da NF-e.", invoiceId };
        }

        if (result.status === "rejeitado") {
            const code = result.autorizacao?.codigo_status || "N/A";
            const reason = result.autorizacao?.motivo_status || "Motivo nao informado";
            const rejectedNumber = Number(result.numero || nextNumber) || extractNFeNumberFromAccessKey(result.chave) || nextNumber;
            if (String(code) === "539") {
                await ensureNFeSequenceAtLeast(supabase, organizationId, input.storeId, serie, rejectedNumber);
            }
            await supabase
                .from("fiscal_invoices")
                .update({
                    status: "rejected",
                    nuvemfiscal_uuid: result.id,
                    chave_acesso: result.chave,
                    numero: String(result.numero || rejectedNumber || ""),
                    serie: String(result.serie || ""),
                    error_message: `Erro ${code}: ${reason}`,
                    motivo_rejeicao: reason,
                })
                .eq("id", invoiceId);

            const retryHint = String(code) === "539" ? " A numeracao local foi ajustada; tente emitir novamente para usar o proximo numero." : "";
            return { success: false, error: `NF-e rejeitada: ${code} - ${reason}${retryHint}`, invoiceId };
        }

        const xmlContent = await fetchXmlContent(result.xml_url);
        const update: Record<string, any> = {
            status: result.status === "autorizado" ? "authorized" : "processing",
            nuvemfiscal_uuid: result.id,
            chave_acesso: result.chave,
            numero: String(result.numero || nextNumber),
            serie: String(result.serie || serie),
            xml_url: result.xml_url,
            pdf_url: result.pdf_url,
        };
        if (xmlContent) update.xml_content = xmlContent;

        await supabase.from("fiscal_invoices").update(update).eq("id", invoiceId);

        return {
            success: true,
            invoiceId,
            status: update.status,
            message: update.status === "authorized"
                ? `NF-e autorizada em ${NFE_ENVIRONMENT === "production" ? "producao" : "homologacao"}.`
                : "NF-e em processamento.",
        };
    } catch (error: any) {
        console.error("[NFe Otica] Erro na emissao:", error);
        if (invoiceId) {
            await supabase
                .from("fiscal_invoices")
                .update({ status: "error", error_message: error.message })
                .eq("id", invoiceId);
        }
        return { success: false, error: error.message || "Erro inesperado ao emitir NF-e." };
    }
}
