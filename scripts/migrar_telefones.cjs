// ===========================================
// MIGRAÇÃO: Normalização de Telefones
// Roda com: node scripts/migrar_telefones.cjs
// ===========================================

const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
)

const DDD_PADRAO = '44'

function classifyPhone(raw) {
    if (!raw || raw.trim() === '') return { type: 'vazio' }
    const digits = raw.replace(/\D/g, '')
    if (!digits || digits.length < 7) return { type: 'lixo', digits }
    if (digits.startsWith('595') || (digits.startsWith('09') && digits.length <= 10)) return { type: 'py', digits }
    if (digits.length > 13) return { type: 'lixo', digits }
    // Celular: 3º dígito (após DDD) é 9, ou começa com 9 sem DDD
    const isCelular = (digits.length === 11 && digits[2] === '9') ||
                      (digits.length === 9 && digits[0] === '9') ||
                      (digits.length === 10 && digits[2] === '9') ||
                      (digits.length === 8 && digits[0] === '9')
    return { type: isCelular ? 'celular' : 'fixo', digits }
}

function normalizeBR(digits) {
    if (digits.length === 8) return DDD_PADRAO + '9' + digits
    if (digits.length === 9) return DDD_PADRAO + digits
    if (digits.length === 10) return digits.slice(0, 2) + '9' + digits.slice(2)
    return digits // 11 = já ok
}

async function fetchAll() {
    let all = []
    let page = 0
    while (true) {
        const { data, error } = await supabase
            .from('customers')
            .select('id, phone, fone_movel')
            .range(page * 1000, (page + 1) * 1000 - 1)
            .order('id')
        if (error) throw error
        all = all.concat(data)
        if (data.length < 1000) break
        page++
    }
    return all
}

async function main() {
    console.log('\n🚀 MIGRAÇÃO DE TELEFONES\n')

    const customers = await fetchAll()
    console.log(`📊 Total de clientes: ${customers.length}\n`)

    let updates = []
    let stats = { moverParaCelular: 0, normCelular: 0, normFixo: 0, limpeza: 0, skip: 0 }

    for (const c of customers) {
        const phoneInfo = classifyPhone(c.phone)
        const celInfo = classifyPhone(c.fone_movel)
        let patch = {}

        // ETAPA 1: Mover celular que está no campo fixo -> fone_movel (se fone_movel vazio)
        if (phoneInfo.type === 'celular' && celInfo.type === 'vazio') {
            const normalized = normalizeBR(phoneInfo.digits)
            patch.fone_movel = normalized
            patch.phone = null // limpar campo fixo
            stats.moverParaCelular++
        } else {
            // ETAPA 2: Normalizar fone_movel (BR only)
            if (celInfo.type === 'celular' || (celInfo.type === 'fixo' && celInfo.digits)) {
                if (celInfo.digits && celInfo.digits.length >= 8 && celInfo.digits.length <= 10) {
                    patch.fone_movel = normalizeBR(celInfo.digits)
                    stats.normCelular++
                }
            }
            // Limpar lixo do fone_movel
            if (celInfo.type === 'lixo') {
                patch.fone_movel = null
                stats.limpeza++
            }

            // ETAPA 3: Normalizar phone (fixo) BR only
            if (phoneInfo.type === 'fixo' && phoneInfo.digits) {
                if (phoneInfo.digits.length === 8) {
                    patch.phone = DDD_PADRAO + phoneInfo.digits
                    stats.normFixo++
                } else if (phoneInfo.digits.length === 9 && phoneInfo.digits[0] !== '9') {
                    // 9 dígitos que não começa com 9 = fixo sem DDD com dígito extra
                    patch.phone = DDD_PADRAO + phoneInfo.digits.slice(1)
                    stats.normFixo++
                }
            }
            // Celular no campo fixo MAS fone_movel já tem dado -> normalizar ambos
            if (phoneInfo.type === 'celular' && celInfo.type !== 'vazio') {
                if (phoneInfo.digits.length >= 8 && phoneInfo.digits.length <= 10) {
                    patch.phone = normalizeBR(phoneInfo.digits) // normalizar in-place
                    stats.normFixo++
                }
            }
            // Limpar lixo do phone
            if (phoneInfo.type === 'lixo') {
                patch.phone = null
                stats.limpeza++
            }
        }

        if (Object.keys(patch).length > 0) {
            updates.push({ id: c.id, ...patch })
        } else {
            stats.skip++
        }
    }

    console.log('📋 Resumo da migração:')
    console.log(`  Mover celular do fixo → fone_movel: ${stats.moverParaCelular}`)
    console.log(`  Normalizar celular (DDD/9):         ${stats.normCelular}`)
    console.log(`  Normalizar fixo (DDD):              ${stats.normFixo}`)
    console.log(`  Limpar lixo:                        ${stats.limpeza}`)
    console.log(`  Sem alteração:                      ${stats.skip}`)
    console.log(`  Total updates:                      ${updates.length}\n`)

    // Executar em batches de 50
    const BATCH = 50
    let done = 0
    let errors = 0
    for (let i = 0; i < updates.length; i += BATCH) {
        const batch = updates.slice(i, i + BATCH)
        const promises = batch.map(u => {
            const { id, ...fields } = u
            return supabase.from('customers').update(fields).eq('id', id)
        })
        const results = await Promise.all(promises)
        results.forEach(r => { if (r.error) errors++ })
        done += batch.length
        process.stdout.write(`\r  ⏳ ${done}/${updates.length} processados...`)
    }

    console.log(`\n\n✅ Migração completa! ${done} registros atualizados, ${errors} erros.\n`)
}

main().catch(e => console.error('❌ Erro fatal:', e))
