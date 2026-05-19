"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getNuvemFiscalToken } from "@/lib/nuvemfiscal";
import { Database } from "@/lib/database.types";

// Sanitiza xNome para atender à regex do SEFAZ: ^([!-ỹ]{1}[ -ỹ]{0,}[!-ỹ]{1}|[!-ỹ]{1})$
function sanitizeXNome(nome: string | null | undefined): string {
    if (!nome) return "CONSUMIDOR";
    return nome
        .normalize("NFC")
        .replace(/[^\x20-\xFFÀ-ỹ]/g, "") // remove fora do range válido
        .replace(/\s+/g, " ")                        // colapsa espaços múltiplos
        .trim()
        || "CONSUMIDOR";
}

type StoreRow = Database['public']['Tables']['stores']['Row'];

type PagamentoItem = {
    meio: string; // '01' Dinheiro, '03' Cartão Crédito, '04' Débito, '17' PIX, etc.
    valor: number;
};

type EmissionPayload = {
    organization_id: string;
    store_id?: number; // Necessário para buscar a série NFCe configurada na loja
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
    pagamentos: PagamentoItem[]; // Múltiplas formas de pagamento
    environment?: 'production' | 'homologation';
};

function normalizeDocument(value?: string | null) {
    const normalized = value?.replace(/\D/g, "") || "";
    return normalized || null;
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

    const motivo = String(result?.motivo_status || result?.autorizacao?.motivo_status || "");
    const match = motivo.match(/nProt:?\s*(\d+)/i);
    return match?.[1] || null;
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

        // 1. Validar duplicidade antes de qualquer operação
        const duplicateError = await ensureNoActiveInvoiceForWorkOrder(adminSupabase, payload, "NFCe", env);
        if (duplicateError) {
            return { success: false, error: duplicateError };
        }

        // 2. Buscar Token Nuvem Fiscal
        const token = await getNuvemFiscalToken(env);

        // 3. Buscar dados da loja (fonte de dados fiscais na ótica)
        if (!payload.store_id) {
            throw new Error("store_id ausente no payload. Não é possível emitir sem identificar a loja.");
        }

        const { data: store } = await adminSupabase
            .from("stores")
            .select("*")
            .eq("id", payload.store_id)
            .single() as unknown as { data: StoreRow | null; error: unknown };

        if (!store) {
            console.error("Loja não encontrada para store_id:", payload.store_id);
            throw new Error("Configurações da loja não encontradas.");
        }

        // Mapear campos da tabela stores para o formato esperado pelo payload NFCe
        const company = {
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

        console.log("[emitirNFCe] Dados da loja:", JSON.stringify(company, null, 2));

        const cnpj = company.cnpj;
        if (!cnpj) {
            throw new Error("CNPJ não configurado na loja. Preencha nas configurações.");
        }

        if (!company.codigo_municipio_ibge) {
            throw new Error("Código IBGE do município não configurado na loja. Preencha nas configurações.");
        }

        // 4. Buscar série NFCe configurada na loja
        const currentSerie = store.nfce_serie || 1;

        // 5. Obter próxima numeração sequencial de forma atômica via RPC
        // Usa admin client para garantir permissão de execução independente de RLS
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: nextNumber, error: rpcError } = await (adminSupabase as any).rpc("get_next_nfce_number", {
            p_org_id: payload.organization_id,
            p_serie: currentSerie
        });

        if (rpcError || !nextNumber) {
            console.error("Erro ao obter numeração NFCe:", rpcError);
            throw new Error("Não foi possível obter a numeração sequencial para a NFCe.");
        }

        const issuedAt = new Date().toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo' }).replace(' ', 'T') + '-03:00';

        // 6. Montar JSON para Nuvem Fiscal (NFC-e)
        // Documentação: https://dev.nuvemfiscal.com.br/docs/api#tag/Nfe/operation/EmitirNfe
        const nfePayload = {
            ambiente: env === 'production' ? 'producao' : 'homologacao',
            infNFe: {
                versao: "4.00",
                ide: {
                    cUF: Number(company.codigo_municipio_ibge?.substring(0, 2)),
                    natOp: "VENDA DE MERCADORIA",
                    mod: 65, // 65 = NFC-e
                    serie: currentSerie,
                    nNF: nextNumber,
                    dhEmi: issuedAt,
                    tpNF: 1, // 1 = Saída
                    idDest: 1, // 1 = Interna
                    cMunFG: Number(company.codigo_municipio_ibge),
                    tpImp: 4, // 4 = DANFE NFC-e
                    tpEmis: 1, // 1 = Normal
                    tpAmb: env === 'production' ? 1 : 2, // 1 = Produção, 2 = Homologação
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
                        xLgr: company.logradouro?.trim() || "Não Informado",
                        nro: (company.numero?.trim() && company.numero.trim() !== "") ? company.numero.trim() : "S/N",
                        xCpl: company.complemento?.trim() || undefined,
                        xBairro: company.bairro?.trim() && company.bairro.trim().length >= 2 ? company.bairro.trim() : "Não Informado",
                        cMun: Number(company.codigo_municipio_ibge),
                        xMun: company.cidade?.trim() || "Não Informado",
                        UF: company.uf,
                        CEP: company.cep?.replace(/\D/g, ""),
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
                        indIEDest: 9, // 9 = Não Contribuinte
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
                        // Simples Nacional básico
                        ICMS: {
                            ICMSSN102: {
                                orig: 0, // 0 = Nacional
                                CSOSN: "102" // Tributada pelo Simples Nacional sem permissão de crédito
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
                        }
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
                    }
                },
                transp: {
                    modFrete: 9 // 9 = Sem Ocorrência de Transporte
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
                infRespTec: {
                    CNPJ: cnpj.replace(/\D/g, ""),
                    xContato: company.razao_social ? company.razao_social.substring(0, 60) : "Responsavel Tecnico",
                    email: company.email_contato || "email@exemplo.com",
                    fone: company.telefone ? company.telefone.replace(/\D/g, "") : "0000000000"
                }
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
            // Atualizar banco para não deixar nota em estado inconsistente
            if (invoice?.id) {
                await adminSupabase.from("fiscal_invoices").update({
                    status: "error",
                    error_message: `Resposta inválida da API (Status ${response.status}). Provável timeout.`
                }).eq("id", invoice.id);
            }
            return { success: false, error: `Erro na resposta da Nuvem Fiscal (Status ${response.status}). Verifique os logs.` };
        }

        if (!response.ok) {
            const detailedError = result.error?.errors ? `Detalhes: ${JSON.stringify(result.error.errors)}` : '';
            const errorMsg = `${result.error?.message || "Erro na emissão"}. ${detailedError}`;
            
            await adminSupabase
                .from("fiscal_invoices")
                .update({
                    status: "error",
                    error_message: errorMsg
                })
                .eq("id", invoice.id);

            return { success: false, error: errorMsg };
        }

        // 9. Verificar status REAL retornado pela Nuvem Fiscal
        const realStatus = result.status;
        console.log("[NuvemFiscal] Status real retornado:", realStatus);

        if (realStatus === 'rejeitado') {
            const codigoErro = result.autorizacao?.codigo_status || 'N/A';
            const motivoErro = result.autorizacao?.motivo_status || 'Motivo não informado';

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
                error: `NFC-e Rejeitada: Erro ${codigoErro} - ${motivoErro}`,
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

        // Status "processando" ou outro — manter como processing
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
        console.error("Erro na emissão:", error);

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
        const token = await getNuvemFiscalToken(env);

        // 2. Buscar Configurações da Empresa
        const { data: company } = await supabase
            .from("company_settings")
            .select("*")
            .eq("organization_id", payload.organization_id)
            .single();

        if (!company || !company.nfse_login) {
            throw new Error("Configurações de NFS-e não encontradas (Login/Senha da Prefeitura).");
        }

        const cnpj = company.cnpj || company.cpf_cnpj;

        // 3. Montar JSON para Nuvem Fiscal (NFS-e - DPS)
        const servicoPrincipal = payload.itens[0]; // Assumindo um serviço principal ou o primeiro para cabeçalho
        if (!servicoPrincipal) throw new Error("Nenhum serviço informado.");

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
                            tribISSQN: 1, // 1 - Tributável
                            tpRetISSQN: 2, // 2 - Não Retido
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
                status: "processing", // NFS-e é assíncrono
                nuvemfiscal_uuid: result.id,
                numero: result.numero,
                serie: result.serie
            })
            .eq("id", invoice.id);

        return { success: true, invoiceId: invoice.id };

    } catch (error: any) {
        console.error("Erro na emissão NFS-e:", error);
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
            return { success: false, error: "Nota não encontrada ou sem ID da NuvemFiscal." };
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
            errorMessage = result.autorizacao?.motivo_status || result.motivo_status || "Rejeitada pela SEFAZ";
        }
        else if (result.status === 'erro' || result.status === 'negado') {
            novoStatus = 'error';
            errorMessage = result.motivo_status || "Erro na autorização";
        }
        else if (result.status === 'cancelado') novoStatus = 'cancelled';

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
                    console.warn('[NFCe] Não foi possível baixar XML via xml_url.', xmlErr);
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
        console.error("Erro ao recuperar XMLs do período:", error);
        return { success: false, error: error.message || "Erro inesperado ao recuperar XMLs." };
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
    const supabase = createAdminClient() as any;
    const env = params.environment || "production";

    try {
        if (!params.justificativa || params.justificativa.trim().length < 15) {
            return { success: false, error: "Justificativa deve ter ao menos 15 caracteres." };
        }
        if (params.numeroInicial <= 0 || params.numeroFinal <= 0 || params.numeroFinal < params.numeroInicial) {
            return { success: false, error: "Faixa de numeração inválida." };
        }

        const { data: store, error: storeError } = await supabase
            .from("stores")
            .select("cnpj, tenant_id")
            .eq("id", params.storeId)
            .single();

        if (storeError || !store?.cnpj) {
            return { success: false, error: "CNPJ da loja não encontrado." };
        }

        const cnpj = String(store.cnpj).replace(/\D/g, "");
        if (!cnpj) {
            return { success: false, error: "CNPJ inválido na loja." };
        }

        const token = await getNuvemFiscalToken(env);
        const baseUrl = env === "production"
            ? (process.env.NUVEMFISCAL_PROD_URL || "https://api.nuvemfiscal.com.br")
            : (process.env.NUVEMFISCAL_HOM_URL || "https://api.sandbox.nuvemfiscal.com.br");

        const payload = {
            ambiente: env === "production" ? "producao" : "homologacao",
            cnpj,
            ano: params.year % 100,
            serie: params.serie,
            numero_inicial: params.numeroInicial,
            numero_final: params.numeroFinal,
            justificativa: params.justificativa.trim(),
        };

        const response = await fetch(`${baseUrl}/nfce/inutilizacoes`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
        });

        const result = await response.json();
        if (!response.ok) {
            const apiError = result?.error?.message || "Erro ao solicitar inutilização na Nuvem Fiscal.";
            return { success: false, error: apiError, details: result };
        }

        // Persistir histórico local para permitir download posterior de comprovantes
        try {
            const protocol = extractProtocolFromInutilization(result);
            const externalId = result?.id || result?.autorizacao?.id || null;
            const status = result?.status || result?.autorizacao?.status || null;

            await supabase
                .from("fiscal_inutilizations")
                .upsert({
                    store_id: params.storeId,
                    tenant_id: store.tenant_id || null,
                    environment: env,
                    model: "NFCe",
                    year: params.year,
                    serie: params.serie,
                    numero_inicial: params.numeroInicial,
                    numero_final: params.numeroFinal,
                    justificativa: params.justificativa.trim(),
                    protocol,
                    external_id: externalId,
                    status,
                    response_json: result,
                }, { onConflict: "external_id" });
        } catch (persistErr) {
            console.warn("[Fiscal] Não foi possível persistir histórico de inutilização localmente.", persistErr);
        }

        return { success: true, data: result };
    } catch (error: any) {
        console.error("Erro ao inutilizar numeração NFC-e:", error);
        return { success: false, error: error.message || "Erro inesperado na inutilização." };
    }
}

export async function listarInutilizacoesNFCe(params: {
    storeId: number;
    year: number;
    environment?: "production" | "homologation";
}) {
    const supabase = createAdminClient() as any;
    const env = params.environment || "production";
    try {
        const { data, error } = await supabase
            .from("fiscal_inutilizations")
            .select("id, environment, year, serie, numero_inicial, numero_final, justificativa, protocol, external_id, status, response_json, created_at")
            .eq("store_id", params.storeId)
            .eq("model", "NFCe")
            .eq("environment", env)
            .eq("year", params.year)
            .order("created_at", { ascending: false });

        if (error) {
            return { success: false, error: error.message, data: [] };
        }

        return { success: true, data: data || [] };
    } catch (error: any) {
        return { success: false, error: error.message || "Erro ao listar inutilizações.", data: [] };
    }
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
            return { success: false, error: "Nota não encontrada ou sem ID da NuvemFiscal." };
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
            errorMessage = result.motivo_status || "Erro na autorização";
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
            return { success: false, error: "Credenciais não encontradas no banco." };
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
                return { success: true, message: "Configuração NFS-e criada com sucesso!" };
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
            return { success: false, error: "Nota não encontrada ou sem ID da NuvemFiscal." };
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
                    error: "NFC-e não pode ser cancelada: Prazo de 30 minutos expirado."
                };
            }
        }

        let endpoint = "";
        let body: any = { justificativa };

        if (invoice.tipo_documento === 'NFCe') {
            endpoint = `/nfce/${invoice.nuvemfiscal_uuid}/cancelar`;
        } else {
            endpoint = `/nfse/${invoice.nuvemfiscal_uuid}/cancelar`;
            body = {
                codigo: "2", // 2 - Erro na emissão
                motivo: justificativa
            };
        }

        console.log(`[Cancelar] Enviando pedido para ${endpoint}...`);

        const baseUrl = env === 'production'
            ? (process.env.NUVEMFISCAL_PROD_URL || "https://api.nuvemfiscal.com.br")
            : (process.env.NUVEMFISCAL_HOM_URL || "https://api.sandbox.nuvemfiscal.com.br");

        const response = await fetch(`${baseUrl}${endpoint}`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(body)
        });

        const result = await response.json();
        console.log("[Cancelar] Resultado:", JSON.stringify(result, null, 2));

        if (!response.ok) {
            return { success: false, error: result.error?.message || "Erro ao cancelar nota." };
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

    console.log(`[Sync Fiscal] Iniciando sincronização para CNPJ: ${storeData.cnpj}`);

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
                    codigo_municipio: "0000000", // TODO: IBGE real
                    cidade: storeData.city,
                    uf: storeData.state,
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
