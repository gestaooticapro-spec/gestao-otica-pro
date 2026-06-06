"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isStoreModuleEnabledForStore } from "@/lib/store-modules.server";

export type FiscalAuditPayload = {
    storeId: number;
    ambiente: "homologation";
    operacao: string;
    natureza: string;
    tipo_nfe: number;
    finalidade_nfe: number;
    classificacao_destino: string;
    participante: Record<string, unknown>;
    itens: Array<Record<string, unknown>>;
    transporte: Record<string, unknown>;
    campos_tecnicos: Record<string, unknown>;
    observacoes: Record<string, unknown>;
    total: number;
};

type FiscalAuditFinding = {
    categoria?: "inconsistencia" | "confirmar_contador" | "observacao";
    severidade?: "ok" | "atencao" | "inconsistente";
    titulo?: string;
    detalhe?: string;
    sugestao?: string;
};

type FiscalAuditResponse = {
    status?: "parece_correta" | "atencao" | "inconsistente";
    resumo?: string;
    achados?: FiscalAuditFinding[];
    perguntas_contador?: string[];
    conclusao?: string;
};

export type FiscalAuditUiResult = {
    status: "parece_correta" | "atencao" | "inconsistente";
    resumo: string;
    achados: FiscalAuditFinding[];
    perguntas_contador: string[];
    conclusao: string;
    aviso: string;
};

function getGeminiKeys() {
    return [
        process.env.GEMINI_SECRET_KEY_1,
        process.env.GEMINI_SECRET_KEY_2,
        process.env.GEMINI_SECRET_KEY_3,
        process.env.GEMINI_SECRET_KEY_4,
        process.env.GEMINI_SECRET_KEY_5,
    ].filter(Boolean) as string[];
}

function normalizeAudit(result: FiscalAuditResponse): FiscalAuditUiResult {
    return {
        status: result.status || "atencao",
        resumo: result.resumo || "Auditoria concluida com pontos para revisao.",
        achados: result.achados || [],
        perguntas_contador: result.perguntas_contador || [],
        conclusao: result.conclusao || "Confirme o preenchimento com o contador antes de emitir.",
        aviso: "A auditoria por IA nao substitui a revisao do contador.",
    };
}

function cleanJsonResponse(text: string) {
    return text.replace(/^```[a-z]*\s*/i, "").replace(/\s*```$/i, "").trim();
}

export async function auditarNFeAssistidaComIaAction(payload: FiscalAuditPayload) {
    const auth = await createClient();
    const { data: { user } } = await auth.auth.getUser();
    if (!user) return { success: false, error: "Usuario nao autenticado." };

    const supabase = createAdminClient();
    const { data: profile } = await supabase
        .from("profiles")
        .select("tenant_id")
        .eq("id", user.id)
        .maybeSingle();
    const { data: store } = await supabase
        .from("stores")
        .select("tenant_id")
        .eq("id", payload.storeId)
        .maybeSingle();
    const profileRow = profile as unknown as { tenant_id?: string | null } | null;
    const storeRow = store as unknown as { tenant_id?: string | null } | null;
    if (!profileRow?.tenant_id || profileRow.tenant_id !== storeRow?.tenant_id) {
        return { success: false, error: "Esta loja nao pertence ao usuario autenticado." };
    }
    if (!(await isStoreModuleEnabledForStore(payload.storeId, "fiscal"))) {
        return { success: false, error: "O modulo fiscal esta desativado para esta loja." };
    }

    const apiKeys = getGeminiKeys();
    if (!apiKeys.length) {
        return { success: false, error: "Nenhuma chave de IA configurada." };
    }

    const model = "gemini-2.5-flash";
    const prompt = `
Voce audita apenas a consistencia de preenchimento de um rascunho de NF-e brasileira.
Atue como assistente do contador, nunca como autoridade fiscal.

Regras:
- Assuma que a empresa esta habilitada a emitir NF-e.
- Nao use CNAE ou objeto social como bloqueio.
- Aponte conflitos concretos entre natureza, tpNF, finNFe, CFOP, CSOSN, origem, IPI, PIS, COFINS, pagamento, frete e observacoes.
- Quando houver alerta, cite exatamente os campos conflitantes e uma alternativa objetiva.
- Se nao houver conflito concreto, use status "parece_correta".
- Seja conciso: no maximo 5 achados e 3 perguntas ao contador.

Retorne somente JSON valido:
{
  "status": "parece_correta" | "atencao" | "inconsistente",
  "resumo": "texto curto",
  "achados": [
    {
      "categoria": "inconsistencia" | "confirmar_contador" | "observacao",
      "severidade": "ok" | "atencao" | "inconsistente",
      "titulo": "curto",
      "detalhe": "campo e conflito concreto",
      "sugestao": "acao objetiva"
    }
  ],
  "perguntas_contador": ["pergunta objetiva"],
  "conclusao": "texto curto"
}

Rascunho:
${JSON.stringify(payload, null, 2)}
`;

    let lastError = "Nao foi possivel auditar o rascunho.";
    for (let index = 0; index < apiKeys.length; index++) {
        try {
            const response = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKeys[index]}`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: prompt }] }],
                        generationConfig: {
                            temperature: 0.1,
                            maxOutputTokens: 2200,
                            responseMimeType: "application/json",
                            responseSchema: {
                                type: "OBJECT",
                                properties: {
                                    status: { type: "STRING" },
                                    resumo: { type: "STRING" },
                                    achados: {
                                        type: "ARRAY",
                                        items: {
                                            type: "OBJECT",
                                            properties: {
                                                categoria: { type: "STRING" },
                                                severidade: { type: "STRING" },
                                                titulo: { type: "STRING" },
                                                detalhe: { type: "STRING" },
                                                sugestao: { type: "STRING" },
                                            },
                                            required: ["categoria", "severidade", "titulo", "detalhe", "sugestao"],
                                        },
                                    },
                                    perguntas_contador: { type: "ARRAY", items: { type: "STRING" } },
                                    conclusao: { type: "STRING" },
                                },
                                required: ["status", "resumo", "achados", "perguntas_contador", "conclusao"],
                            },
                        },
                    }),
                },
            );

            if (!response.ok) {
                lastError = `Gemini respondeu HTTP ${response.status}.`;
                continue;
            }

            const data = await response.json();
            const usage = data?.usageMetadata || {};
            console.log(
                `[NFe IA Otica] model=${model} tentativa=${index + 1} tokens_in=${usage.promptTokenCount ?? "?"} tokens_out=${usage.candidatesTokenCount ?? "?"} tokens_total=${usage.totalTokenCount ?? "?"}`,
            );
            const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!text) {
                lastError = "A IA nao retornou conteudo.";
                continue;
            }

            const parsed = JSON.parse(cleanJsonResponse(text)) as FiscalAuditResponse;
            return {
                success: true,
                audit: normalizeAudit(parsed),
                raw: parsed,
            };
        } catch (error) {
            lastError = error instanceof Error ? error.message : "Falha desconhecida na auditoria.";
        }
    }

    console.error("[NFe IA Otica] Falha:", lastError);
    return { success: false, error: lastError };
}
