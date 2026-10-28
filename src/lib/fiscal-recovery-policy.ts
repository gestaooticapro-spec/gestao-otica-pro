/** Recovery-v1 contract. Ordinary legacy responses must not be cast to this type. */
export type FiscalRecoveryScope = {
  organizationId: string;
  storeId: number;
  cnpj: string;
  environment: 'production';
  model: '55' | '65';
  series: number;
};

export type FiscalRecoveryCurrent = FiscalRecoveryScope & {
  originId: string;
  documentId: string;
  number: number;
  version: number;
  status: 'processing' | 'authorized' | 'rejected' | 'cancelled' | 'blocked_local';
};

export type FiscalRecoveryResult = FiscalRecoveryCurrent & {
  protocol: string | null;
  origin: 'consumer' | 'central' | 'transport' | 'sefaz' | 'sefin';
  code: string;
  evidence: 'none' | 'before_send' | 'authorization_verified' | 'rejection_verified' | 'cancellation_verified';
  sendState: 'not_started_proven' | 'possibly_sent';
};

export type FiscalRecoveryTransition =
  | { apply: false; reason: 'scope_mismatch' | 'identity_mismatch' | 'invalid_result' | 'stale' | 'terminal_conflict' }
  | { apply: true; status: FiscalRecoveryCurrent['status']; version: number;
      keepReservation: boolean; pending: boolean; origin: FiscalRecoveryResult['origin']; code: string };

function sameScope(a: FiscalRecoveryScope, b: FiscalRecoveryScope): boolean {
  return a.organizationId === b.organizationId && a.storeId === b.storeId && a.cnpj === b.cnpj &&
    a.environment === b.environment && a.model === b.model && a.series === b.series;
}

/** Pure policy only; persistence must compare version/status atomically in SQL. */
export function decideFiscalRecoveryTransition(
  allowed: FiscalRecoveryScope, current: FiscalRecoveryCurrent, result: FiscalRecoveryResult
): FiscalRecoveryTransition {
  if (!sameScope(allowed, current) || !sameScope(allowed, result)) return { apply: false, reason: 'scope_mismatch' };
  if (current.documentId !== result.documentId || current.originId !== result.originId || current.number !== result.number) {
    return { apply: false, reason: 'identity_mismatch' };
  }
  if (!Number.isSafeInteger(current.version) || current.version < 0 ||
      !Number.isSafeInteger(result.version) || !result.code || result.code.length > 128) {
    return { apply: false, reason: 'invalid_result' };
  }
  if (result.version <= current.version) return { apply: false, reason: 'stale' };
  if (current.status === 'cancelled' || (current.status === 'authorized' && result.status !== 'authorized' && result.status !== 'cancelled') ||
      (current.status === 'rejected' && result.status !== 'rejected')) return { apply: false, reason: 'terminal_conflict' };
  const authority = result.origin === 'sefaz' || result.origin === 'sefin';
  let status: FiscalRecoveryCurrent['status'] = 'processing';
  if (result.status === 'authorized') {
    if (!authority || result.evidence !== 'authorization_verified' || !/^\d{15}$/.test(result.protocol ?? '') ||
        (result.origin === 'sefaz' && !['100', '150'].includes(result.code))) return { apply: false, reason: 'invalid_result' };
    status = 'authorized';
  } else if (result.status === 'cancelled') {
    if (!authority || result.evidence !== 'cancellation_verified' || current.status !== 'authorized') return { apply: false, reason: 'invalid_result' };
    status = 'cancelled';
  } else if (result.status === 'rejected') {
    // Duplicity/not-found never release the business origin or advance a number.
    if (authority && result.evidence === 'rejection_verified' && !['204', '217', '539'].includes(result.code)) status = 'rejected';
  } else if (result.status === 'blocked_local' && !authority && result.origin !== 'transport' &&
      result.evidence === 'before_send' && result.sendState === 'not_started_proven') {
    status = 'blocked_local';
  } else if (result.status !== 'processing' && result.status !== 'blocked_local') {
    return { apply: false, reason: 'invalid_result' };
  }
  // A missing UUID is never proof that the central service did not accept a POST.
  return { apply: true, status, version: result.version, keepReservation: status !== 'rejected' && status !== 'cancelled',
    pending: status === 'processing', origin: result.origin, code: result.code };
}
