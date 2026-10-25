const SEFAZ_COMMUNICATION_USER_MESSAGE = [
    "Houve uma falha de comunicação na emissão.",
    "O resultado da emissão ainda não foi confirmado.",
    "Consulte esta nota antes de tentar emitir novamente.",
].join("\n");

const SEFAZ_INTERNAL_USER_MESSAGE = [
    "A SEFAZ/PR respondeu com instabilidade interna durante a autorização.",
    "Não parece ser um erro de preenchimento da nota.",
].join("\n");

function normalizeFiscalMessage(message?: string | null) {
    return String(message || "").trim();
}

function includesAny(haystack: string, needles: string[]) {
    return needles.some((needle) => haystack.includes(needle));
}

function isSefazCommunicationFailure(message: string) {
    const lower = message.toLowerCase();
    return includesAny(lower, [
        "econnrefused",
        "econnreset",
        "etimedout",
        "fetch failed",
        "failed to fetch",
        "tempo esgotado",
        "timeout",
        "could not connect to server",
        "winhttp operation",
        "nfeautorizacao4",
        "error: (12029)",
    ]);
}

function isSefazInternalFailure(message: string) {
    const lower = message.toLowerCase();
    return lower.includes("ora-04025") || (lower.includes("erro nao catalogado") && lower.includes("sql"));
}

function withTechnicalDetail(userMessage: string, original: string, includeTechnicalDetail: boolean) {
    if (!includeTechnicalDetail || !original || original === userMessage) {
        return userMessage;
    }

    return `${userMessage}\n\nDetalhe técnico: ${original}`;
}

export function formatFiscalUserMessage(
    message?: string | null,
    options?: { includeTechnicalDetail?: boolean }
) {
    const original = normalizeFiscalMessage(message);
    const includeTechnicalDetail = Boolean(options?.includeTechnicalDetail);

    if (!original) return "Erro desconhecido";

    if (isSefazCommunicationFailure(original)) {
        return withTechnicalDetail(SEFAZ_COMMUNICATION_USER_MESSAGE, original, includeTechnicalDetail);
    }

    if (isSefazInternalFailure(original)) {
        return withTechnicalDetail(SEFAZ_INTERNAL_USER_MESSAGE, original, includeTechnicalDetail);
    }

    return original;
}
