function object(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function canonical(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(canonical)
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)
            .sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, canonical(v)]))
    }
    return value
}

export const NFCE_RECIPIENT_IMMUTABLE = 'RECOVERY_NFCE_RECIPIENT_IMMUTABLE'

/** The reserved attempt's version is fenced again by gop_recovery_prepare_v1.
 * A stale initial preparation cannot overwrite a concurrent prepared recipient. */
export function protectNfceRecoveryRecipient(previous: Record<string, unknown> | null,
    next: Record<string, unknown>, snapshot: Record<string, unknown>) {
    const dest = object(next.infNFe).dest ?? null
    if (previous && JSON.stringify(canonical(object(previous.infNFe).dest ?? null)) !== JSON.stringify(canonical(dest))) {
        throw new Error(NFCE_RECIPIENT_IMMUTABLE)
    }
    const recipient = object(dest)
    return {
        ...snapshot,
        destinatario_nome: typeof recipient.xNome === 'string' ? recipient.xNome : null,
        destinatario_cnpj: typeof (recipient.CPF || recipient.CNPJ) === 'string' ? recipient.CPF || recipient.CNPJ : null,
    }
}
