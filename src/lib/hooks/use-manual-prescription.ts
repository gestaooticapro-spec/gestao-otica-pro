'use client'

import { useEffect, useRef, useState } from 'react'
import { getLatestManualPrescription } from '@/lib/actions/manual-prescriptions.actions'
import type { ManualPrescription } from '@/lib/manual-prescriptions'

export function useManualPrescription(
    storeId: number, customerId: number | undefined, patient: string, isNew: boolean,
    apply: (recipe: ManualPrescription) => void,
) {
    const key = isNew && customerId ? `${storeId}:${customerId}:${patient}` : null
    const request = useRef(0)
    const [result, setResult] = useState<{ key: string; id?: number; error?: boolean } | null>(null)

    useEffect(() => {
        if (!key || !customerId) return
        const current = ++request.current
        setResult(null)
        void getLatestManualPrescription(storeId, customerId, patient ? Number(patient) : null).then(recipe => {
            if (current !== request.current) return
            if (recipe) apply(recipe)
            setResult({ key, id: recipe?.id })
        }).catch(() => {
            if (current === request.current) setResult({ key, error: true })
        })
        return () => { request.current++ }
    }, [key, storeId, customerId, patient, apply])

    const loading = Boolean(key && result?.key !== key)
    function skipPendingImport() {
        if (!key || !loading) return
        request.current++
        setResult({ key })
    }

    return {
        loading,
        id: key && result?.key === key ? result.id : undefined,
        error: Boolean(key && result?.key === key && result.error),
        skipPendingImport,
    }
}
