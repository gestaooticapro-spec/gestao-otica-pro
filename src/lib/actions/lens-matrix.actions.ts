'use server'

import { createAdminClient } from '@/lib/supabase/admin'

export async function getLensFamilies(storeId: number) {
    const supabase = createAdminClient()
    
    // Cast 'as any' para usar campos que podem não estar mapeados perfeitamente no type
    const { data, error } = await (supabase.from('products') as any)
        .select('id, nome, categoria')
        .eq('store_id', storeId)
        .eq('tem_grade', true)
        .order('nome', { ascending: true })

    if (error) {
        console.error("Erro ao buscar famílias de lentes:", error)
        return []
    }
    
    return data || []
}

export type LensMatrixCell = {
    esferico: number
    cilindrico: number
    estoqueFisico: number
    sobras: number
    perdasRecentes: number
}

export async function getLensMatrixData(storeId: number, productId: number) {
    const supabase = createAdminClient()

    // 1. Buscar todas as variantes organizadas (Oficiais e Sobras)
    const { data: variantes } = await (supabase.from('product_variants') as any)
        .select('esferico, cilindrico, estoque_atual, is_sobra')
        .eq('store_id', storeId)
        .eq('product_id', productId)

    // 2. Buscar Movimentações de Perda dos últimos 3 meses
    const tresMesesAtras = new Date()
    tresMesesAtras.setMonth(tresMesesAtras.getMonth() - 3)
    
    const { data: perdas } = await (supabase.from('stock_movements') as any)
        .select(`
            quantidade,
            product_variants ( esferico, cilindrico )
        `)
        .eq('store_id', storeId)
        .eq('product_id', productId)
        .eq('tipo', 'Perda')
        .gte('created_at', tresMesesAtras.toISOString())

    // 3. Processar dados para a matriz
    const matrixMap = new Map<string, LensMatrixCell>()

    const getCell = (esferico: number, cilindrico: number) => {
        const _esf = esferico || 0
        const _cil = cilindrico || 0
        const key = `${_esf.toFixed(2)}_${_cil.toFixed(2)}`
        if (!matrixMap.has(key)) {
            matrixMap.set(key, { esferico: _esf, cilindrico: _cil, estoqueFisico: 0, sobras: 0, perdasRecentes: 0 })
        }
        return matrixMap.get(key)!
    }

    if (variantes) {
        variantes.forEach((v: any) => {
            const cell = getCell(v.esferico, v.cilindrico)
            if (v.is_sobra && v.estoque_atual > 0) {
                cell.sobras += v.estoque_atual
            } else if (!v.is_sobra) {
                cell.estoqueFisico += Math.max(0, v.estoque_atual)
            }
        })
    }

    if (perdas) {
        perdas.forEach((p: any) => {
            const pv = p.product_variants as any
            if (pv) {
                const cell = getCell(pv.esferico, pv.cilindrico)
                cell.perdasRecentes += p.quantidade || 0
            }
        })
    }

    return Array.from(matrixMap.values())
}
