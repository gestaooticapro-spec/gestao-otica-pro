"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getNfeQueueXml } from "@/lib/actions/nfe-import-queue.actions";
import { extractItemsFromInfNFe, extractItemsFromXmlContent, participantFromOriginDest, participantFromOriginEmit } from "@/lib/nfe_xml";
import type { ParsedNFeItem } from "@/types/nfe";

export type { ParsedNFeItem };

export async function getTenantIdByStore(storeId: number) {
    // Usa admin client para ignorar RLS da tabela stores
    const supabase = createAdminClient() as any;
    const { data: rawData, error } = await supabase
        .from("stores")
        .select("tenant_id")
        .eq("id", storeId)
        .single();

    if (error || !rawData) return null;
    const data = rawData as unknown as { tenant_id: string };
    return data.tenant_id;
}

export async function getFiscalInvoices(storeId: number) {
    const supabase = createAdminClient() as any;
    const tenantId = await getTenantIdByStore(storeId);

    if (!tenantId) return [];

    const { data, error } = await supabase
        .from("fiscal_invoices")
        .select("*")
        .eq("organization_id", tenantId)
        .eq("store_id", storeId)
        .order("created_at", { ascending: false });

    if (error) {
        console.error("Erro ao buscar notas:", error);
        return [];
    }

    return data;
}

export async function getNFeInvoiceWithItemsAction(invoiceId: number) {
    const supabase = createAdminClient() as any;

    const { data: invoice, error } = await supabase
        .from("fiscal_invoices")
        .select("*")
        .eq("id", invoiceId)
        .eq("tipo_documento", "NFe")
        .single();

    if (error || !invoice) return null;

    let items: ParsedNFeItem[] = [];
    let xmlContent = invoice.xml_content;

    if (!xmlContent && invoice.xml_url) {
        try {
            const response = await fetch(invoice.xml_url);
            if (response.ok) {
                xmlContent = await response.text();
                await supabase
                    .from("fiscal_invoices")
                    .update({ xml_content: xmlContent })
                    .eq("id", invoiceId);
            }
        } catch (error) {
            console.warn("[getNFeInvoiceWithItemsAction] Nao foi possivel baixar XML da NF-e:", error);
        }
    }

    if (xmlContent) {
        try {
            const parsed = await extractItemsFromXmlContent(xmlContent);
            items = parsed.items;
        } catch (error) {
            console.warn("[getNFeInvoiceWithItemsAction] Erro ao parsear XML:", error);
        }
    }

    if (items.length === 0 && invoice.payload_json?.infNFe) {
        items = extractItemsFromInfNFe(invoice.payload_json.infNFe);
    }

    return { invoice, items };
}

export async function searchCloneableNFeInvoicesAction(params: {
    storeId: number;
    environment: "production" | "homologation";
    query?: string;
    status?: "authorized" | "error" | "rejected" | "all";
}) {
    const supabase = createAdminClient() as any;
    const tenantId = await getTenantIdByStore(params.storeId);
    if (!tenantId) return [];

    const term = (params.query || "").trim();

    let query = supabase
        .from("fiscal_invoices")
        .select("id, numero, serie, status, environment, destinatario_nome, destinatario_cnpj, valor_total, data_emissao, chave_acesso, payload_json")
        .eq("organization_id", tenantId)
        .eq("store_id", params.storeId)
        .eq("tipo_documento", "NFe")
        .eq("direction", "output")
        .eq("environment", params.environment)
        .order("data_emissao", { ascending: false })
        .limit(30);

    if (params.status && params.status !== "all") {
        query = query.eq("status", params.status);
    }

    if (term) {
        const clean = term.replace(/\D/g, "");
        query = query.or([
            `numero.ilike.%${term}%`,
            `destinatario_nome.ilike.%${term}%`,
            `destinatario_cnpj.ilike.%${clean || term}%`,
            `chave_acesso.ilike.%${clean || term}%`,
        ].join(","));
    }

    const { data, error } = await query;

    if (error) {
        console.error("Erro ao buscar NF-e para clonagem:", error);
        return [];
    }

    return data || [];
}

export async function listImportedNFeOriginsAction(storeId: number) {
    const auth = await createClient();
    const { data: { user } } = await auth.auth.getUser();
    if (!user) return [];

    const supabase = createAdminClient() as any;
    const tenantId = await getTenantIdByStore(storeId);
    if (!tenantId) return [];

    const { data: profile } = await supabase
        .from("profiles")
        .select("tenant_id")
        .eq("id", user.id)
        .maybeSingle();
    if (profile?.tenant_id !== tenantId) return [];

    const { data: imported, error } = await supabase
        .from("imported_invoices")
        .select("id, access_key, nfe_number, series, imported_at")
        .eq("tenant_id", tenantId)
        .eq("store_id", storeId)
        .order("imported_at", { ascending: false })
        .limit(50);

    if (error || !imported?.length) {
        if (error) console.error("Erro ao listar NF-e importadas para devolucao:", error);
        return [];
    }

    const accessKeys = imported.map((invoice: any) => invoice.access_key).filter(Boolean);
    const { data: queueItems } = await supabase
        .from("nfe_import_queue")
        .select("chave_acesso, emitente_nome, emitente_cnpj, data_emissao, valor_total, xml_content")
        .eq("organization_id", tenantId)
        .in("chave_acesso", accessKeys);

    const queueByKey = new Map((queueItems || []).map((item: any) => [item.chave_acesso, item]));

    return imported.map((invoice: any) => {
        const queue = queueByKey.get(invoice.access_key) as any;
        return {
            id: invoice.id,
            accessKey: invoice.access_key,
            number: invoice.nfe_number,
            series: invoice.series,
            importedAt: invoice.imported_at,
            issuerName: queue?.emitente_nome || null,
            issuerCnpj: queue?.emitente_cnpj || null,
            issuedAt: queue?.data_emissao || null,
            total: queue?.valor_total ?? null,
            xmlAvailable: Boolean(queue?.xml_content),
        };
    });
}

export async function getImportedNFeOriginAction(params: {
    storeId: number;
    accessKey: string;
}) {
    const auth = await createClient();
    const { data: { user } } = await auth.auth.getUser();
    if (!user) return { success: false, error: "Usuario nao autenticado." };

    const supabase = createAdminClient() as any;
    const tenantId = await getTenantIdByStore(params.storeId);
    const accessKey = String(params.accessKey || "").replace(/\D/g, "");

    if (!tenantId) return { success: false, error: "Tenant da loja nao encontrado." };

    const { data: profile } = await supabase
        .from("profiles")
        .select("tenant_id")
        .eq("id", user.id)
        .maybeSingle();
    if (profile?.tenant_id !== tenantId) {
        return { success: false, error: "Esta loja nao pertence ao usuario autenticado." };
    }

    if (!/^\d{44}$/.test(accessKey)) {
        return { success: false, error: "A chave da NF-e de origem deve ter 44 digitos." };
    }

    const { data: imported } = await supabase
        .from("imported_invoices")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("store_id", params.storeId)
        .eq("access_key", accessKey)
        .maybeSingle();

    if (!imported) {
        return { success: false, error: "Esta NF-e de entrada nao foi importada nesta loja." };
    }

    const { data: queueItem } = await supabase
        .from("nfe_import_queue")
        .select("id, xml_content")
        .eq("organization_id", tenantId)
        .eq("chave_acesso", accessKey)
        .maybeSingle();

    if (!queueItem) {
        return { success: false, error: "O XML da NF-e importada nao foi localizado na fila fiscal." };
    }

    let xmlContent = queueItem.xml_content as string | null;
    if (!xmlContent) {
        const xmlResult = await getNfeQueueXml(queueItem.id, params.storeId);
        if (!xmlResult.success || !xmlResult.xmlContent) {
            return { success: false, error: xmlResult.error || "Nao foi possivel recuperar o XML da NF-e." };
        }
        xmlContent = xmlResult.xmlContent;
    }

    try {
        const parsed = await extractItemsFromXmlContent(xmlContent);
        if (!parsed.items.length) {
            return { success: false, error: "O XML da NF-e de origem nao possui itens." };
        }

        return {
            success: true,
            accessKey,
            participant: participantFromOriginEmit(parsed.infNFe?.emit),
            items: parsed.items,
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : "Nao foi possivel interpretar o XML da NF-e.",
        };
    }
}

async function userOwnsStore(storeId: number, tenantId: string) {
    const auth = await createClient();
    const { data: { user } } = await auth.auth.getUser();
    if (!user) return false;

    const supabase = createAdminClient() as any;
    const { data: profile } = await supabase
        .from("profiles")
        .select("tenant_id")
        .eq("id", user.id)
        .maybeSingle();

    return profile?.tenant_id === tenantId;
}

function shipmentKindFromPayload(payload: any) {
    const natOp = String(payload?.infNFe?.ide?.natOp || "").toUpperCase();
    const infCpl = String(payload?.infNFe?.infAdic?.infCpl || "").toUpperCase();
    const text = `${natOp} ${infCpl}`;
    if (!natOp.includes("REMESSA")) return null;
    if (text.includes("GARANTIA")) return "garantia" as const;
    if (text.includes("CONSERTO") || text.includes("REPARO")) return "conserto" as const;
    return null;
}

function isDepositRemittanceInfNFe(infNFe: any) {
    const natOp = String(infNFe?.ide?.natOp || "").toUpperCase();
    const items = extractItemsFromInfNFe(infNFe);
    return natOp.includes("DEPOSITO") && !natOp.includes("RETORNO")
        || items.some((item) => ["5905", "6905"].includes(String(item.cfop || "")));
}

export async function listTenantTransferStoresAction(storeId: number) {
    const supabase = createAdminClient() as any;
    const tenantId = await getTenantIdByStore(storeId);
    if (!tenantId || !(await userOwnsStore(storeId, tenantId))) return [];

    const { data, error } = await supabase
        .from("stores")
        .select("id, name, razao_social, cnpj, inscricao_estadual, email, cep, street, number, neighborhood, city, state, codigo_municipio_ibge")
        .eq("tenant_id", tenantId)
        .neq("id", storeId)
        .order("name");

    if (error) {
        console.error("Erro ao listar filiais para transferencia:", error);
        return [];
    }

    return data || [];
}

export async function getTenantTransferStoreAction(params: {
    storeId: number;
    destinationStoreId: number;
}) {
    const supabase = createAdminClient() as any;
    const tenantId = await getTenantIdByStore(params.storeId);
    if (!tenantId || !(await userOwnsStore(params.storeId, tenantId))) {
        return { success: false, error: "Esta loja nao pertence ao usuario autenticado." };
    }
    if (params.destinationStoreId === params.storeId) {
        return { success: false, error: "A filial de destino deve ser diferente da loja emitente." };
    }

    const { data: store, error } = await supabase
        .from("stores")
        .select("id, name, razao_social, cnpj, inscricao_estadual, email, cep, street, number, neighborhood, city, state, codigo_municipio_ibge")
        .eq("tenant_id", tenantId)
        .eq("id", params.destinationStoreId)
        .maybeSingle();

    if (error || !store) {
        return { success: false, error: "Filial de destino nao encontrada neste tenant." };
    }

    return {
        success: true,
        store,
        participant: {
            nome: store.razao_social || store.name || "",
            cpf_cnpj: store.cnpj || "",
            email: store.email || "",
            logradouro: store.street || "",
            numero: store.number || "",
            complemento: "",
            bairro: store.neighborhood || "",
            cidade: store.city || "",
            uf: store.state || "",
            cep: store.cep || "",
            codigo_municipio: store.codigo_municipio_ibge || "",
            inscricao_estadual: store.inscricao_estadual || "",
            ind_ie_dest: store.inscricao_estadual ? 1 : 9,
        },
    };
}

export async function listAuthorizedDepositTransferOriginsAction(storeId: number) {
    const supabase = createAdminClient() as any;
    const tenantId = await getTenantIdByStore(storeId);
    if (!tenantId || !(await userOwnsStore(storeId, tenantId))) return [];

    const { data: imported, error } = await supabase
        .from("imported_invoices")
        .select("id, access_key, nfe_number, series, imported_at")
        .eq("tenant_id", tenantId)
        .eq("store_id", storeId)
        .order("imported_at", { ascending: false })
        .limit(50);

    if (error || !imported?.length) {
        console.error("Erro ao listar transferencias para deposito:", error);
        return [];
    }

    const accessKeys = imported.map((invoice: any) => invoice.access_key).filter(Boolean);
    const { data: queueItems } = await supabase
        .from("nfe_import_queue")
        .select("chave_acesso, emitente_nome, emitente_cnpj, data_emissao, valor_total, xml_content")
        .eq("organization_id", tenantId)
        .in("chave_acesso", accessKeys);

    const queueByKey = new Map((queueItems || []).map((item: any) => [item.chave_acesso, item]));
    const result = [];

    for (const invoice of imported) {
        const queue = queueByKey.get(invoice.access_key) as any;
        if (!queue?.xml_content) continue;

        try {
            const parsed = await extractItemsFromXmlContent(queue.xml_content);
            if (!isDepositRemittanceInfNFe(parsed.infNFe)) continue;
            result.push({
                id: invoice.id,
                accessKey: invoice.access_key,
                number: invoice.nfe_number,
                series: invoice.series,
                issuedAt: queue.data_emissao || invoice.imported_at,
                recipientName: queue.emitente_nome,
                recipientCnpj: queue.emitente_cnpj,
                total: queue.valor_total,
            });
        } catch {
            continue;
        }
    }

    return result;
}

export async function getAuthorizedDepositTransferOriginAction(params: {
    storeId: number;
    accessKey: string;
}) {
    const supabase = createAdminClient() as any;
    const tenantId = await getTenantIdByStore(params.storeId);
    const accessKey = String(params.accessKey || "").replace(/\D/g, "");

    if (!tenantId || !(await userOwnsStore(params.storeId, tenantId))) {
        return { success: false, error: "Esta loja nao pertence ao usuario autenticado." };
    }
    if (!/^\d{44}$/.test(accessKey)) {
        return { success: false, error: "A chave da transferencia deve ter 44 digitos." };
    }

    const { data: imported } = await supabase
        .from("imported_invoices")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("store_id", params.storeId)
        .eq("access_key", accessKey)
        .maybeSingle();

    if (!imported) {
        return { success: false, error: "Esta NF-e de remessa para deposito nao foi importada nesta loja." };
    }

    const { data: queueItem } = await supabase
        .from("nfe_import_queue")
        .select("id, xml_content")
        .eq("organization_id", tenantId)
        .eq("chave_acesso", accessKey)
        .maybeSingle();

    if (!queueItem) {
        return { success: false, error: "O XML da remessa para deposito nao foi localizado na fila fiscal." };
    }

    let xmlContent = queueItem.xml_content as string | null;
    if (!xmlContent) {
        const xmlResult = await getNfeQueueXml(queueItem.id, params.storeId);
        if (!xmlResult.success || !xmlResult.xmlContent) {
            return { success: false, error: xmlResult.error || "Nao foi possivel recuperar o XML da remessa para deposito." };
        }
        xmlContent = xmlResult.xmlContent;
    }

    try {
        const parsed = await extractItemsFromXmlContent(xmlContent);
        if (!isDepositRemittanceInfNFe(parsed.infNFe)) {
            return { success: false, error: "A NF-e selecionada nao e uma remessa para deposito fechado ou armazem geral." };
        }
        if (!parsed.items.length) {
            return { success: false, error: "A remessa para deposito nao possui itens." };
        }

        return {
            success: true,
            invoiceId: imported.id,
            accessKey,
            participant: participantFromOriginEmit(parsed.infNFe?.emit),
            items: parsed.items,
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : "Nao foi possivel interpretar o XML da remessa para deposito.",
        };
    }
}

export async function listAuthorizedShipmentOriginsAction(params: {
    storeId: number;
    kind: "conserto" | "garantia";
}) {
    const supabase = createAdminClient() as any;
    const tenantId = await getTenantIdByStore(params.storeId);
    if (!tenantId || !(await userOwnsStore(params.storeId, tenantId))) return [];

    const { data, error } = await supabase
        .from("fiscal_invoices")
        .select("id, numero, serie, chave_acesso, destinatario_nome, destinatario_cnpj, valor_total, data_emissao, payload_json")
        .eq("organization_id", tenantId)
        .eq("store_id", params.storeId)
        .eq("tipo_documento", "NFe")
        .eq("direction", "output")
        .eq("environment", "homologation")
        .eq("status", "authorized")
        .order("data_emissao", { ascending: false })
        .limit(50);

    if (error) {
        console.error("Erro ao listar remessas autorizadas:", error);
        return [];
    }

    return (data || [])
        .filter((invoice: any) => shipmentKindFromPayload(invoice.payload_json) === params.kind)
        .filter((invoice: any) => /^\d{44}$/.test(String(invoice.chave_acesso || "")))
        .map((invoice: any) => ({
            id: invoice.id,
            accessKey: invoice.chave_acesso,
            number: invoice.numero,
            series: invoice.serie,
            issuedAt: invoice.data_emissao,
            recipientName: invoice.destinatario_nome,
            recipientCnpj: invoice.destinatario_cnpj,
            total: invoice.valor_total,
        }));
}

export async function getAuthorizedShipmentOriginAction(params: {
    storeId: number;
    accessKey: string;
    kind: "conserto" | "garantia";
}) {
    const supabase = createAdminClient() as any;
    const tenantId = await getTenantIdByStore(params.storeId);
    const accessKey = String(params.accessKey || "").replace(/\D/g, "");

    if (!tenantId || !(await userOwnsStore(params.storeId, tenantId))) {
        return { success: false, error: "Esta loja nao pertence ao usuario autenticado." };
    }
    if (!/^\d{44}$/.test(accessKey)) {
        return { success: false, error: "A chave da remessa deve ter 44 digitos." };
    }

    const { data: invoice, error } = await supabase
        .from("fiscal_invoices")
        .select("*")
        .eq("organization_id", tenantId)
        .eq("store_id", params.storeId)
        .eq("tipo_documento", "NFe")
        .eq("direction", "output")
        .eq("environment", "homologation")
        .eq("status", "authorized")
        .eq("chave_acesso", accessKey)
        .maybeSingle();

    if (error || !invoice) {
        return { success: false, error: "Remessa autorizada nao encontrada nesta loja." };
    }
    if (shipmentKindFromPayload(invoice.payload_json) !== params.kind) {
        return {
            success: false,
            error: params.kind === "garantia"
                ? "A NF-e selecionada nao e uma remessa em garantia."
                : "A NF-e selecionada nao e uma remessa para conserto.",
        };
    }

    let infNFe = invoice.payload_json?.infNFe;
    let items = extractItemsFromInfNFe(infNFe);
    if ((!infNFe || !items.length) && invoice.xml_content) {
        const parsed = await extractItemsFromXmlContent(invoice.xml_content);
        infNFe = parsed.infNFe;
        items = parsed.items;
    }

    if (!infNFe || !items.length) {
        return { success: false, error: "A remessa nao possui payload ou XML completo para montar o retorno." };
    }

    return {
        success: true,
        invoiceId: invoice.id,
        accessKey,
        participant: participantFromOriginDest(infNFe.dest),
        items,
    };
}

export async function searchNFeParticipantsAction(params: {
    storeId: number;
    query: string;
}) {
    const supabase = createAdminClient() as any;
    const term = params.query.trim();
    if (term.length < 2) return [];

    const clean = term.replace(/\D/g, "");
    const orParts = [
        `full_name.ilike.%${term}%`,
        `cpf.ilike.%${term}%`,
        `fone_movel.ilike.%${term}%`,
        `phone.ilike.%${term}%`,
        clean ? `cpf.ilike.%${clean}%` : "",
        clean ? `fone_movel.ilike.%${clean}%` : "",
        clean ? `phone.ilike.%${clean}%` : "",
    ].filter(Boolean).join(",");

    const baseSelect = "id, full_name, cpf, email, phone, fone_movel, rua, numero, complemento, bairro, cidade, uf, cep";
    const fiscalSelect = `${baseSelect}, codigo_municipio_ibge, inscricao_estadual`;

    let { data, error } = await supabase
        .from("customers")
        .select(fiscalSelect)
        .eq("store_id", params.storeId)
        .or(orParts)
        .order("full_name")
        .limit(20);

    // Permite a busca funcionar mesmo antes da migration dos campos fiscais ser rodada.
    if (error && String(error.message || "").includes("codigo_municipio_ibge")) {
        const fallback = await supabase
            .from("customers")
            .select(baseSelect)
            .eq("store_id", params.storeId)
            .or(orParts)
            .order("full_name")
            .limit(20);

        data = (fallback.data || []).map((customer: any) => ({
            ...customer,
            codigo_municipio_ibge: null,
            inscricao_estadual: null,
        }));
        error = fallback.error;
    }

    if (error) {
        console.error("Erro ao buscar participantes NF-e:", error);
        return [];
    }

    return data || [];
}

export async function saveNFeCustomerParticipantAction(params: {
    storeId: number;
    customerId?: number | null;
    participant: {
        nome: string;
        cpfCnpj: string;
        email?: string;
        logradouro?: string;
        numero?: string;
        complemento?: string;
        bairro?: string;
        cidade?: string;
        uf?: string;
        cep?: string;
        codigoMunicipioIbge?: string;
        inscricaoEstadual?: string;
    };
}) {
    const supabase = createAdminClient() as any;
    const tenantId = await getTenantIdByStore(params.storeId);
    if (!tenantId) return { success: false, error: "Tenant da loja nao encontrado." };

    const nome = params.participant.nome.trim();
    if (!nome) return { success: false, error: "Informe o nome do participante antes de salvar." };

    const cleanDoc = params.participant.cpfCnpj.replace(/\D/g, "");
    const payload = {
        store_id: params.storeId,
        tenant_id: tenantId,
        full_name: nome,
        cpf: cleanDoc || null,
        email: params.participant.email?.trim() || null,
        rua: params.participant.logradouro?.trim() || null,
        numero: params.participant.numero?.trim() || null,
        complemento: params.participant.complemento?.trim() || null,
        bairro: params.participant.bairro?.trim() || null,
        cidade: params.participant.cidade?.trim() || null,
        uf: params.participant.uf?.trim().toUpperCase() || null,
        cep: params.participant.cep?.replace(/\D/g, "") || null,
        codigo_municipio_ibge: params.participant.codigoMunicipioIbge?.replace(/\D/g, "") || null,
        inscricao_estadual: params.participant.inscricaoEstadual?.replace(/\D/g, "") || null,
    };

    try {
        let targetId = params.customerId || null;

        if (!targetId && cleanDoc) {
            const { data: existing } = await supabase
                .from("customers")
                .select("id")
                .eq("store_id", params.storeId)
                .eq("cpf", cleanDoc)
                .maybeSingle();
            targetId = existing?.id || null;
        }

        if (targetId) {
            const { data, error } = await supabase
                .from("customers")
                .update(payload)
                .eq("id", targetId)
                .eq("store_id", params.storeId)
                .select("id")
                .single();

            if (error) throw error;
            return { success: true, customerId: data.id, created: false };
        }

        const { data, error } = await supabase
            .from("customers")
            .insert(payload)
            .select("id")
            .single();

        if (error) throw error;
        return { success: true, customerId: data.id, created: true };
    } catch (error: any) {
        if (error?.code === "23505") {
            return { success: false, error: "Ja existe um cadastro com este CPF/CNPJ." };
        }
        return { success: false, error: error?.message || "Erro ao salvar participante." };
    }
}

export async function getPendingSales(storeId: number) {
    const supabase = createClient();
    const tenantId = await getTenantIdByStore(storeId);

    if (!tenantId) return [];

    // Busca Vendas que estão 'Fechada' mas ainda não têm nota fiscal emitida
    // Mapeamos work_order_id da tabela fiscal_invoices para o ID da venda

    const { data: invoices } = await supabase
        .from("fiscal_invoices")
        .select("work_order_id")
        .eq("organization_id", tenantId)
        .not("work_order_id", "is", null);

    const invoicedIds = invoices?.map(i => i.work_order_id) || [];

    let query = supabase
        .from("vendas")
        .select(`
            id, 
            created_at, 
            valor_final, 
            status,
            customer_id,
            customers (full_name, cpf)
        `)
        .eq("store_id", storeId)
        .eq("status", "Fechada")
        .order("created_at", { ascending: false });

    if (invoicedIds.length > 0) {
        query = query.not("id", "in", `(${invoicedIds.join(',')})`);
    }

    const { data, error } = await query;

    if (error) {
        console.error("Erro ao buscar Vendas pendentes:", error);
        return [];
    }

    return data.map(v => {
        const rawCustomer = v.customers as any;
        const customer = Array.isArray(rawCustomer) ? rawCustomer[0] : rawCustomer;

        return {
            id: v.id,
            created_at: v.created_at,
            total: v.valor_final,
            status: v.status,
            client_id: v.customer_id,
            clients: {
                nome: customer?.full_name,
                cpf_cnpj: customer?.cpf
            }
        };
    });
}

export async function getSaleData(saleId: number) {
    const supabase = createClient();

    // Busca dados da venda e itens
    const { data: venda, error } = await supabase
        .from("vendas")
        .select(`
            *,
            customers (*),
            venda_itens (*),
            pagamentos (*)
        `)
        .eq("id", saleId)
        .single();

    if (error) return null;

    return venda;
}

export async function searchProducts(query: string, storeId?: number) {
    const supabase = createAdminClient() as any;
    const term = query.trim();
    if (term.length < 2) return [];

    let productsQuery = supabase
        .from("products")
        .select("id, nome, preco_venda, ncm, cfop, unidade_medida, codigo_barras, referencia, marca")
        .or([
            `nome.ilike.%${term}%`,
            `codigo_barras.ilike.%${term}%`,
            `referencia.ilike.%${term}%`,
            `marca.ilike.%${term}%`,
        ].join(","))
        .order("nome")
        .limit(10);

    if (storeId) {
        productsQuery = productsQuery.eq("store_id", storeId);
    }

    const { data, error } = await productsQuery;

    if (error) {
        console.error("Erro ao buscar produtos:", error);
        return [];
    }

    return (data || []).map((p: any) => ({
        id: p.id,
        nome: p.nome,
        preco_venda: p.preco_venda,
        ncm: p.ncm,
        cfop: p.cfop,
        unidade: p.unidade_medida
    }));
}

type FechamentoInvoice = {
    id: string;
    numero: string | null;
    status: string;
    valor_total: number | null;
    chave_acesso: string | null;
    xml_content: string | null;
    xml_url: string | null;
    motivo_rejeicao: string | null;
    error_message: string | null;
    data_emissao: string | null;
    created_at: string;
};

export async function getFechamentoData(storeId: number, month: number, year: number): Promise<FechamentoInvoice[] | null> {
    const supabase = createAdminClient() as any;
    const tenantId = await getTenantIdByStore(storeId);
    if (!tenantId) return null;

    const startDate = new Date(year, month, 1).toISOString();
    const endDate = new Date(year, month + 1, 1).toISOString();
    const fields = "id, numero, status, valor_total, chave_acesso, xml_content, xml_url, motivo_rejeicao, error_message, data_emissao, created_at";

    const [{ data: byEmission }, { data: byCreation }] = await Promise.all([
        supabase.from("fiscal_invoices").select(fields)
            .eq("organization_id", tenantId).eq("store_id", storeId).eq("environment", "production").eq("tipo_documento", "NFCe")
            .gte("data_emissao", startDate).lt("data_emissao", endDate),
        supabase.from("fiscal_invoices").select(fields)
            .eq("organization_id", tenantId).eq("store_id", storeId).eq("environment", "production").eq("tipo_documento", "NFCe")
            .is("data_emissao", null).gte("created_at", startDate).lt("created_at", endDate),
    ]) as [{ data: FechamentoInvoice[] | null }, { data: FechamentoInvoice[] | null }];

    const all = [...(byEmission || []), ...(byCreation || [])]
        .filter((doc, i, arr) => arr.findIndex(d => d.id === doc.id) === i);

    return all;
}

export async function getEmissoesByVenda(vendaId: number) {
    const supabase = createAdminClient() as any;
    const { data, error } = await supabase
        .from("fiscal_invoices")
        .select("id, environment, status, tipo_documento")
        .eq("work_order_id", vendaId)
        .in("status", ["authorized", "processing"])
        .order("created_at", { ascending: false });

    if (error) return [];
    return data as { id: number; environment: string; status: string; tipo_documento: string }[];
}

export async function updateCustomerCpf(customerId: number, cpf: string) {
    const supabase = createClient();
    const { error } = await supabase
        .from("customers")
        .update({ cpf })
        .eq("id", customerId);

    if (error) {
        console.error("Erro ao atualizar CPF:", error);
        return { success: false, error: error.message };
    }
    return { success: true };
}

export async function getProductFiscalData(productId: number) {
    const supabase = createClient();

    const { data, error } = await supabase
        .from("products")
        .select("ncm, cfop, unidade_medida")
        .eq("id", productId)
        .single();

    if (error) return null;

    return {
        ncm: data.ncm,
        cfop: data.cfop,
        unidade: data.unidade_medida
    };
}

export async function saveMissingProductNcmAction(params: {
    storeId: number;
    productId: number;
    ncm: string;
}) {
    const supabase = createAdminClient() as any;
    const ncm = String(params.ncm || "").replace(/\D/g, "");

    if (!/^\d{8}$/.test(ncm) || ncm === "00000000") {
        return { success: false, error: "Informe um NCM valido com 8 digitos." };
    }

    const { data: product, error: findError } = await supabase
        .from("products")
        .select("id, ncm")
        .eq("id", params.productId)
        .eq("store_id", params.storeId)
        .single();

    if (findError || !product) {
        return { success: false, error: "Produto nao encontrado nesta loja." };
    }

    if (String(product.ncm || "").replace(/\D/g, "")) {
        return { success: true, saved: false };
    }

    const { error } = await supabase
        .from("products")
        .update({ ncm })
        .eq("id", params.productId)
        .eq("store_id", params.storeId);

    if (error) {
        return { success: false, error: error.message };
    }

    return { success: true, saved: true };
}
