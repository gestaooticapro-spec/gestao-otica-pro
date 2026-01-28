"use server";

import { createClient } from "@/src/utils/supabase/server";
import { cookies } from "next/headers";
import { getNuvemFiscalToken } from "@/src/lib/nuvemfiscal";

type EmissionPayload = {
    organization_id: string;
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
    meio_pagamento: string; // '01' Dinheiro, '03' Cartão Crédito, etc.
    environment?: 'production' | 'homologation';
};

export async function emitirNFCe(payload: EmissionPayload) {
    const supabase = createClient();
    let invoiceId: number | null = null;

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    console.log("[emitirNFCe] User ID:", user?.id, "Auth Error:", authError?.message);

    try {
        // 1. Buscar Token Nuvem Fiscal
        const env = payload.environment || 'production';
        const token = await getNuvemFiscalToken(env);

        // 2. Buscar Configurações da Empresa (Emissor)
        const { data: company } = await supabase
            .from("company_settings")
            .select("*")
            .eq("organization_id", payload.organization_id)
            .single();

        if (!company) {
            console.error("Empresa não encontrada para org:", payload.organization_id);
            throw new Error("Configurações da empresa não encontradas.");
        }

        console.log("[emitirNFCe] Dados da empresa:", JSON.stringify(company, null, 2));

        // Compatibilidade: Verifica cnpj ou cpf_cnpj
        const cnpj = company.cnpj || company.cpf_cnpj;

        if (!cnpj) {
            throw new Error("Dados da empresa incompletos para emissão (CNPJ ausente).");
        }

        // 3. Montar JSON para Nuvem Fiscal (NFC-e)
        // Documentação: https://dev.nuvemfiscal.com.br/docs/api#tag/Nfe/operation/EmitirNfe
        const nfePayload = {
            ambiente: env === 'production' ? 'producao' : 'homologacao',
            infNFe: {
                versao: "4.00",
                ide: {
                    cUF: Number(company.codigo_municipio_ibge?.substring(0, 2)),
                    natOp: "VENDA DE MERCADORIA",
                    mod: 65, // 65 = NFC-e
                    serie: 1,
                    nNF: Math.floor(Math.random() * 100000) + 1, // TODO: Controle sequencial real
                    dhEmi: new Date().toISOString(),
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
                    verProc: "AutoEletrica 1.0"
                },
                emit: {
                    CNPJ: company.cnpj.replace(/\D/g, ""),
                    xNome: company.razao_social,
                    xFant: company.nome_fantasia,
                    enderEmit: {
                        xLgr: company.logradouro,
                        nro: company.numero,
                        xCpl: company.complemento || undefined,
                        xBairro: company.bairro,
                        cMun: Number(company.codigo_municipio_ibge),
                        xMun: company.cidade,
                        UF: company.uf,
                        CEP: company.cep?.replace(/\D/g, ""),
                        cPais: "1058",
                        xPais: "BRASIL"
                    },
                    IE: company.inscricao_estadual?.replace(/\D/g, ""),
                    CRT: Number(company.regime_tributario || "1") // 1 = Simples Nacional
                },
                dest: payload.cliente.cpf_cnpj ? {
                    CNPJ: payload.cliente.cpf_cnpj.length > 11 ? payload.cliente.cpf_cnpj.replace(/\D/g, "") : undefined,
                    CPF: payload.cliente.cpf_cnpj.length <= 11 ? payload.cliente.cpf_cnpj.replace(/\D/g, "") : undefined,
                    xNome: payload.cliente.nome,
                    indIEDest: 9, // 9 = Não Contribuinte
                    email: payload.cliente.email
                } : undefined, // Consumidor não identificado se não tiver CPF
                det: payload.itens.map((item, index) => ({
                    nItem: index + 1,
                    prod: {
                        cProd: item.codigo,
                        cEAN: "SEM GTIN",
                        xProd: item.descricao,
                        NCM: item.ncm || "00000000", // Fallback perigoso, ideal validar antes
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
                    detPag: [
                        {
                            tPag: payload.meio_pagamento || "01", // 01 = Dinheiro
                            vPag: payload.valor_total
                        }
                    ]
                }
            }
        };

        // 4. Salvar Rascunho no Banco (Status: Processing)
        const { data: invoice, error: dbError } = await supabase
            .from("fiscal_invoices")
            .insert({
                organization_id: payload.organization_id,
                work_order_id: payload.work_order_id || null,
                tipo_documento: "NFCe",
                status: "processing",
                environment: env,
                payload_json: nfePayload
            })
            .select()
            .single();

        if (dbError) throw dbError;
        invoiceId = invoice.id;

        // 5. Enviar para Nuvem Fiscal
        console.log("[NuvemFiscal] Enviando NFE Payload:", JSON.stringify(nfePayload, null, 2));

        // CORREÇÃO: Endpoint correto para NFC-e é /nfce (POST)
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
            return { success: false, error: `Erro na resposta da Nuvem Fiscal (Status ${response.status}). Verifique os logs.` };
        }

        if (!response.ok) {
            // Erro na API
            await supabase
                .from("fiscal_invoices")
                .update({
                    status: "error",
                    error_message: result.error?.message || JSON.stringify(result)
                })
                .eq("id", invoice.id);

            return { success: false, error: result.error?.message || "Erro na emissão" };
        }

        // 6. Sucesso - Atualizar Banco
        await supabase
            .from("fiscal_invoices")
            .update({
                status: "authorized", // Idealmente verificar status real, mas assumindo sincrono por enquanto
                nuvemfiscal_uuid: result.id,
                chave_acesso: result.chave,
                numero: result.numero,
                serie: result.serie,
                xml_url: result.xml_url, // Ajustar conforme resposta real
                pdf_url: result.pdf_url  // Ajustar conforme resposta real
            })
            .eq("id", invoice.id);

        return { success: true, invoiceId: invoice.id };

    } catch (error: any) {
        console.error("Erro na emissão:", error);

        if (invoiceId) {
            await supabase
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
                    xNome: payload.cliente.nome,
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
                        cSitTrib: "0", // 0 = Tributada Integralmente (IPM). Se der erro 00060, verificar cadastro na prefeitura ou bug na integração Nuvem Fiscal.
                        xDescServ: payload.itens.map(i => `${i.descricao} (R$ ${i.valor_total.toFixed(2)})`).join("; ")
                    }
                },
                valores: {
                    vServPrest: {
                        vServ: payload.valor_total
                    },
                    trib: {
                        tribMun: {
                            tribISSQN: 1, // 1 - Tributável (Com alíquota > 0 para forçar aceite)
                            tpRetISSQN: 2, // 2 - Não Retido
                            pAliq: servicoPrincipal.aliquota_iss || 2.01, // Alíquota efetiva
                            vISSQN: Number(((payload.valor_total * (servicoPrincipal.aliquota_iss || 2.01)) / 100).toFixed(2))
                        }
                    }
                }
            }
        };

        // 4. Salvar Rascunho no Banco
        const { data: invoice, error: dbError } = await supabase
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

            await supabase
                .from("fiscal_invoices")
                .update({
                    status: "error",
                    error_message: errorDetails
                })
                .eq("id", invoice.id);

            return { success: false, error: `Erro NuvemFiscal: ${errorDetails}` };
        }

        // 6. Sucesso
        await supabase
            .from("fiscal_invoices")
            .update({
                status: "processing", // NFS-e é assíncrono, fica processando até consultar depois
                nuvemfiscal_uuid: result.id,
                numero: result.numero, // Pode não vir imediato
                serie: result.serie
            })
            .eq("id", invoice.id);

        return { success: true, invoiceId: invoice.id };

    } catch (error: any) {
        console.error("Erro na emissão NFS-e:", error);
        if (invoiceId) {
            await supabase
                .from("fiscal_invoices")
                .update({ status: "error", error_message: error.message })
                .eq("id", invoiceId);
        }
        return { success: false, error: error.message };
    }
}

export async function consultarNFSe(invoiceId: string) {
    const supabase = createClient();

    try {
        // 1. Buscar a nota no banco para pegar o ID da NuvemFiscal
        const { data: invoice } = await supabase
            .from("fiscal_invoices")
            .select("*")
            .eq("id", invoiceId)
            .single();

        if (!invoice || !invoice.nuvemfiscal_uuid) {
            return { success: false, error: "Nota não encontrada ou sem ID da NuvemFiscal." };
        }

        // 2. Buscar Token
        const env = (invoice.environment as 'production' | 'homologation') || 'production';
        const token = await getNuvemFiscalToken(env);

        // 3. Consultar na NuvemFiscal
        // Endpoint: GET /nfce/{id} ou /nfse/{id}
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

        // 4. Atualizar status no banco
        // Mapeamento de status NuvemFiscal -> Nosso Banco
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
                chave_acesso: result.chave,
                xml_url: result.xml_url, // Verificar se a API retorna direto ou em objeto aninhado
                pdf_url: result.pdf_url,
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
        // 1. Buscar Configurações
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

        // 2. Atualizar na NuvemFiscal - Endpoint Específico de NFS-e
        // PUT /empresas/{cpf_cnpj}/nfse
        const payload = {
            ambiente: environment === 'production' ? 'producao' : 'homologacao',
            rps: {
                lote: 1,
                serie: "1",
                numero: 1
            },
            prefeitura: {
                login: cnpj, // Usando CNPJ como login
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
            // Se der 404, pode ser que precise criar a configuração primeiro com POST
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
    const supabase = createClient();

    try {
        // 1. Buscar a nota
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

        // 2. Verificar prazo de cancelamento para NFC-e (30 minutos)
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

        // 3. Cancelar na NuvemFiscal
        // Endpoint: POST /nfce/{id}/cancelar ou /nfse/{id}/cancelar
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

        // 3. Atualizar Banco
        await supabase
            .from("fiscal_invoices")
            .update({
                status: "cancelled",
                error_message: null // Limpar erro se houver
            })
            .eq("id", invoiceId);

        return { success: true, message: "Nota cancelada com sucesso!" };

    } catch (error: any) {
        console.error("Erro ao cancelar:", error);
        return { success: false, error: error.message };
    }
}
