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

type OpenAIResponse = {
    output_text?: string;
    output?: Array<{
        content?: Array<{
            type?: string;
            text?: string;
        }>;
    }>;
    error?: {
        message?: string;
    };
};

type OpenAIChatResponse = {
    choices?: Array<{
        message?: {
            content?: string;
        };
    }>;
    error?: {
        message?: string;
    };
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

function extractOpenAIText(response: OpenAIResponse) {
    if (response.output_text?.trim()) return response.output_text.trim();

    return (response.output || [])
        .flatMap((output) => output.content || [])
        .filter((part) => part.type === "output_text" && part.text?.trim())
        .map((part) => part.text!.trim())
        .join("\n");
}

async function auditWithOpenAI(prompt: string) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY nao configurada.");

    const model = process.env.OPENAI_TEXT_MODEL || "gpt-4.1-nano";
    const responsesResult = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            model,
            input: prompt,
            max_output_tokens: 2200,
        }),
    });
    const responsesData = await responsesResult.json() as OpenAIResponse;
    if (responsesResult.ok) {
        const text = extractOpenAIText(responsesData);
        if (text) return text;
    }

    console.warn(
        `[NFe IA Otica] OpenAI Responses falhou HTTP ${responsesResult.status}; tentando Chat Completions.`,
    );
    const chatResult = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            model,
            messages: [{ role: "user", content: prompt }],
            temperature: 0.1,
            max_completion_tokens: 2200,
        }),
    });
    const chatData = await chatResult.json() as OpenAIChatResponse;
    if (!chatResult.ok) {
        const detail = chatData.error?.message || responsesData.error?.message;
        throw new Error(`OpenAI respondeu HTTP ${chatResult.status}${detail ? `: ${detail}` : "."}`);
    }

    const text = chatData.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error("OpenAI nao retornou conteudo.");
    return text;
}

export async function auditarNFeAssistidaComIaAction(
    payload: FiscalAuditPayload,
    attempt?: number,
) {
    if (attempt !== undefined && (!Number.isInteger(attempt) || attempt < 1 || attempt > 6)) {
        return { success: false, error: "Tentativa de auditoria invalida." };
    }

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
    if (!apiKeys.length && !process.env.OPENAI_API_KEY) {
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
        if (attempt !== undefined && attempt !== index + 1) continue;

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
                            maxOutputTokens: 4096,
                            thinkingConfig: {
                                thinkingBudget: 0,
                            },
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
                console.warn(
                    `[NFe IA Otica] GEMINI_SECRET_KEY_${index + 1} falhou HTTP ${response.status}; tentando proxima chave.`,
                );
                continue;
            }

            const data = await response.json();
            const usage = data?.usageMetadata || {};
            const finishReason = data?.candidates?.[0]?.finishReason ?? "?";
            console.log(
                `[NFe IA Otica] model=${model} chave=${index + 1} finish=${finishReason} tokens_in=${usage.promptTokenCount ?? "?"} tokens_thinking=${usage.thoughtsTokenCount ?? 0} tokens_out=${usage.candidatesTokenCount ?? "?"} tokens_total=${usage.totalTokenCount ?? "?"}`,
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
            console.warn(
                `[NFe IA Otica] resposta da GEMINI_SECRET_KEY_${index + 1} invalida: ${lastError}; tentando proxima chave.`,
            );
        }
    }

    if (attempt !== undefined && attempt <= 5) {
        return { success: false, error: lastError, retryable: true as const };
    }

    if (process.env.OPENAI_API_KEY && (attempt === undefined || attempt === 6)) {
        try {
            console.warn("[NFe IA Otica] Gemini indisponivel; tentando OpenAI.");
            const text = await auditWithOpenAI(prompt);
            const parsed = JSON.parse(cleanJsonResponse(text)) as FiscalAuditResponse;
            return {
                success: true,
                audit: normalizeAudit(parsed),
                raw: parsed,
                provider: "openai" as const,
            };
        } catch (error) {
            lastError = error instanceof Error ? error.message : "Falha desconhecida na OpenAI.";
            console.error(`[NFe IA Otica] OpenAI falhou: ${lastError}`);
        }
    }

    console.error("[NFe IA Otica] Falha, usando contingencia local:", lastError);
    return {
        success: true,
        audit: {
            status: "atencao" as const,
            resumo: "A auditoria por IA esta temporariamente indisponivel. As validacoes locais foram executadas, mas o parecer automatico nao foi obtido.",
            achados: [{
                categoria: "confirmar_contador" as const,
                severidade: "atencao" as const,
                titulo: "Auditoria por IA indisponivel",
                detalhe: lastError,
                sugestao: "Confira natureza, CFOP, CSOSN, impostos, pagamento e observacoes com o contador antes de confirmar.",
            }],
            perguntas_contador: [
                "A natureza, o CFOP e a tributacao informados representam corretamente esta operacao?",
            ],
            conclusao: "A emissao pode prosseguir apenas em homologacao e apos confirmacao manual do responsavel.",
            aviso: "Contingencia local: nenhum parecer fiscal foi produzido pela IA.",
        },
        contingency: true,
    };
}
