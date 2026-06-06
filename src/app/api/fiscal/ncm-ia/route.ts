import { NextResponse } from "next/server";

type NcmOption = {
    code: string;
    description: string;
    confidence: number;
};

type GeminiNcmPayload = {
    recommendation?: string | null;
    confidence?: number;
    needs_review?: boolean;
    reason?: string;
    options?: unknown;
};

export async function POST(req: Request) {
    const model = "gemini-2.5-flash";
    const requestId = `ncm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    try {
        const { descricao } = await req.json();
        const description = String(descricao || "").trim();

        if (!description) {
            return NextResponse.json({ error: "Descricao do produto nao fornecida." }, { status: 400 });
        }

        const fallback = getOpticalNcmFallback(description);
        const prompt = `NCM Brasil para produto de otica. Descricao: "${description}".
Retorne APENAS JSON curto:
{"recommendation":"12345678" ou null,"confidence":0-100,"needs_review":true/false,"reason":"curto","options":[{"code":"12345678","description":"curto","confidence":0-100}]}
Regras: code com 8 digitos; 1-3 opcoes; se houver duvida, needs_review=true. Considere produtos de otica como armacoes, lentes oftalmicas, lentes de contato, oculos de sol, estojos, flanelas e acessorios.`;

        const apiKeys = [
            process.env.GEMINI_SECRET_KEY_1,
            process.env.GEMINI_SECRET_KEY_2,
            process.env.GEMINI_SECRET_KEY_3,
            process.env.GEMINI_SECRET_KEY_4,
            process.env.GEMINI_SECRET_KEY_5,
            process.env.GOOGLE_API_KEY,
        ].filter(Boolean) as string[];

        if (apiKeys.length === 0) {
            if (fallback) return NextResponse.json(fallback);
            return NextResponse.json({ error: "Nenhuma chave da IA configurada." }, { status: 500 });
        }

        let lastError: unknown = null;
        let textResponse: string | null = null;

        for (let i = 0; i < apiKeys.length; i++) {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKeys[i]}`;

            try {
                const response = await fetch(url, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: prompt }] }],
                        generationConfig: {
                            temperature: 0,
                            maxOutputTokens: 320,
                            responseMimeType: "application/json",
                            responseSchema: {
                                type: "OBJECT",
                                properties: {
                                    recommendation: { type: "STRING", nullable: true },
                                    confidence: { type: "NUMBER" },
                                    needs_review: { type: "BOOLEAN" },
                                    reason: { type: "STRING" },
                                    options: {
                                        type: "ARRAY",
                                        items: {
                                            type: "OBJECT",
                                            properties: {
                                                code: { type: "STRING" },
                                                description: { type: "STRING" },
                                                confidence: { type: "NUMBER" },
                                            },
                                            required: ["code", "description", "confidence"],
                                        },
                                    },
                                },
                                required: ["recommendation", "confidence", "needs_review", "reason", "options"],
                            },
                        },
                    }),
                });

                if (!response.ok) {
                    lastError = new Error(await response.text());
                    continue;
                }

                const data = await response.json();
                textResponse = data?.candidates?.[0]?.content?.parts?.[0]?.text || null;
                if (textResponse) break;
            } catch (error) {
                lastError = error;
            }
        }

        if (!textResponse) {
            console.warn(`[NCM IA][${requestId}] IA indisponivel, fallback=${Boolean(fallback)} erro=`, lastError);
            if (fallback) return NextResponse.json(fallback);
            return NextResponse.json({ error: "Erro ao analisar descricao apos multiplas tentativas." }, { status: 500 });
        }

        let rawPayload: GeminiNcmPayload;
        try {
            rawPayload = JSON.parse(textResponse.replace(/^```[a-z]*\s*/i, "").replace(/\s*```$/i, "").trim());
        } catch {
            const extracted = Array.from(new Set(String(textResponse).match(/\b\d{8}\b/g) || [])).slice(0, 3);
            if (extracted.length === 0) {
                if (fallback) return NextResponse.json(fallback);
                return NextResponse.json({ error: "A IA retornou resposta invalida. Tente novamente." }, { status: 502 });
            }
            rawPayload = {
                recommendation: extracted[0],
                confidence: 65,
                needs_review: true,
                reason: "Resposta parcial da IA; codigo extraido para revisao.",
                options: extracted.map((code) => ({ code, description: "NCM extraido de resposta parcial da IA.", confidence: 65 })),
            };
        }

        const options = normalizeOptions(rawPayload?.options);
        if (options.length === 0) {
            if (fallback) return NextResponse.json(fallback);
            return NextResponse.json({ error: "A IA nao encontrou NCM confiavel para esta descricao." }, { status: 422 });
        }

        const rawConfidence = Number(rawPayload?.confidence || options[0]?.confidence || 0);
        const confidence = rawConfidence > 0 && rawConfidence <= 1 ? Math.round(rawConfidence * 100) : Math.round(rawConfidence);
        const recommendation = String(rawPayload?.recommendation || "").replace(/\D/g, "");
        const hasRecommendation = options.some((option) => option.code === recommendation);
        const canAutoApply = confidence >= 75 && hasRecommendation;

        return NextResponse.json({
            recommendation: canAutoApply ? recommendation : null,
            confidence,
            needs_review: !canAutoApply,
            reason: String(rawPayload?.reason || "").trim() || (canAutoApply ? "Sugestao com confianca alta." : "Revisao manual recomendada."),
            options,
        });
    } catch (error) {
        console.error(`[NCM IA][${requestId}] Erro interno:`, error);
        return NextResponse.json({ error: "Erro interno." }, { status: 500 });
    }
}

function normalizeOptions(rawOptions: unknown): NcmOption[] {
    if (!Array.isArray(rawOptions)) return [];

    const unique = new Map<string, NcmOption>();
    for (const raw of rawOptions) {
        const option = raw as Partial<NcmOption>;
        const code = String(option.code || "").replace(/\D/g, "").slice(0, 8);
        if (!/^\d{8}$/.test(code) || unique.has(code)) continue;
        unique.set(code, {
            code,
            description: String(option.description || "").trim(),
            confidence: Number(option.confidence || 0),
        });
    }

    return Array.from(unique.values()).slice(0, 3);
}

function getOpticalNcmFallback(description: string) {
    const text = description
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");

    const fallback = (reason: string, options: NcmOption[]) => ({
        recommendation: null,
        confidence: Math.max(...options.map((option) => option.confidence)),
        needs_review: true,
        reason,
        options,
    });

    if (/\b(lente|lentes)\b/.test(text) && /contato/.test(text)) {
        return fallback("Fallback por palavra-chave para lente de contato.", [
            { code: "90013000", description: "Lentes de contato.", confidence: 74 },
        ]);
    }

    if (/\b(oculos|oculo)\b/.test(text) && /\b(sol|solar)\b/.test(text)) {
        return fallback("Fallback por palavra-chave para oculos de sol.", [
            { code: "90041000", description: "Oculos de sol.", confidence: 72 },
        ]);
    }

    if (/\b(armacao|aro|montura)\b/.test(text)) {
        return fallback("Fallback por palavra-chave para armacao de oculos.", [
            { code: "90031100", description: "Armacoes de plastico para oculos.", confidence: 68 },
            { code: "90031910", description: "Armacoes de metal comum para oculos.", confidence: 66 },
        ]);
    }

    if (/\b(lente|lentes)\b/.test(text)) {
        return fallback("Fallback por palavra-chave para lente oftalmica.", [
            { code: "90015000", description: "Lentes de outras materias para oculos.", confidence: 70 },
            { code: "90014000", description: "Lentes de vidro para oculos.", confidence: 62 },
        ]);
    }

    if (/\b(estojo|case)\b/.test(text)) {
        return fallback("Fallback por palavra-chave para estojo de oculos.", [
            { code: "42023200", description: "Artigos de bolso ou bolsa com superficie exterior de plastico ou materia textil.", confidence: 60 },
        ]);
    }

    return null;
}
