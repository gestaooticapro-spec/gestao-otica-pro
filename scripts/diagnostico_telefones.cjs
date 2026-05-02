// ===========================================
// DIAGNÓSTICO: Análise de Telefones no BD
// Roda com: node scripts/diagnostico_telefones.cjs
// ===========================================

const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function main() {
    console.log('\n🔍 DIAGNÓSTICO DE TELEFONES - CUSTOMERS\n')
    console.log('='.repeat(70))

    // Buscar TODOS os clientes com paginação (Supabase limita a 1000 por query)
    let customers = []
    let page = 0
    const PAGE_SIZE = 1000
    while (true) {
        const { data, error } = await supabase
            .from('customers')
            .select('id, full_name, phone, fone_movel, store_id')
            .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
            .order('id')
        if (error) {
            console.error('❌ Erro ao buscar:', error.message)
            return
        }
        customers = customers.concat(data)
        console.log(`  ... página ${page + 1}: ${data.length} registros`)
        if (data.length < PAGE_SIZE) break
        page++
    }

    console.log(`📊 Total de clientes com algum telefone: ${customers.length}\n`)

    // Categorizar
    const stats = {
        fone_movel: { total: 0, vazio: 0, br_11: 0, br_10: 0, br_8: 0, br_9: 0, py: 0, outros: 0, items: [] },
        phone:      { total: 0, vazio: 0, br_11: 0, br_10: 0, br_8: 0, br_9: 0, py: 0, outros: 0, items: [] },
    }

    const celularNoFixo = []   // Celular no campo phone (fixo)
    const fixoNoCelular = []   // Fixo no campo fone_movel (celular)

    for (const c of customers) {
        for (const campo of ['phone', 'fone_movel']) {
            const raw = c[campo]
            const s = stats[campo]
            s.total++

            if (!raw || raw.trim() === '') {
                s.vazio++
                continue
            }

            const digits = raw.replace(/\D/g, '')

            // Detecção PY
            if (digits.startsWith('595') || (digits.startsWith('09') && digits.length <= 10)) {
                s.py++
                continue
            }

            // BR por tamanho
            if (digits.length === 11) s.br_11++
            else if (digits.length === 10) s.br_10++
            else if (digits.length === 9) s.br_9++
            else if (digits.length === 8) s.br_8++
            else {
                s.outros++
                s.items.push({ id: c.id, nome: c.full_name, campo, valor: raw, digitos: digits.length })
            }

            // Detectar celular no campo fixo:
            // Celular BR = 11 dígitos, 3º dígito é 9
            // Ou 9 dígitos começando com 9 (sem DDD)
            if (campo === 'phone') {
                const isCelular = (digits.length === 11 && digits[2] === '9') ||
                                  (digits.length === 9 && digits[0] === '9')
                if (isCelular) {
                    celularNoFixo.push({ id: c.id, nome: c.full_name, phone: raw, fone_movel: c.fone_movel || '(vazio)' })
                }
            }

            // Detectar fixo no campo celular:
            // Fixo BR = 10 dígitos, 3º dígito NÃO é 9
            // Ou 8 dígitos não começando com 9
            if (campo === 'fone_movel') {
                const isFixo = (digits.length === 10 && digits[2] !== '9') ||
                               (digits.length === 8 && digits[0] !== '9')
                if (isFixo) {
                    fixoNoCelular.push({ id: c.id, nome: c.full_name, fone_movel: raw, phone: c.phone || '(vazio)' })
                }
            }
        }
    }

    // --- RELATÓRIO ---

    for (const [campo, s] of Object.entries(stats)) {
        const label = campo === 'fone_movel' ? '📱 CELULAR (fone_movel)' : '📞 FIXO (phone)'
        console.log(`\n${label}`)
        console.log('-'.repeat(40))
        console.log(`  Total registros: ${s.total}`)
        console.log(`  Vazios:          ${s.vazio}`)
        console.log(`  BR 11 dígitos:   ${s.br_11}  ✅ (formato completo)`)
        console.log(`  BR 10 dígitos:   ${s.br_10}  ⚠️  (DDD + 8, falta o 9)`)
        console.log(`  BR  9 dígitos:   ${s.br_9}   ⚠️  (sem DDD, tem o 9)`)
        console.log(`  BR  8 dígitos:   ${s.br_8}   ⚠️  (sem DDD, sem 9)`)
        console.log(`  Paraguaios:      ${s.py}`)
        console.log(`  Outros:          ${s.outros}`)
        if (s.items.length > 0) {
            console.log(`\n  📋 Números com tamanho inesperado:`)
            s.items.slice(0, 15).forEach(i => {
                console.log(`     ID ${i.id} | ${i.nome} | ${i.campo}="${i.valor}" (${i.digitos} dígitos)`)
            })
            if (s.items.length > 15) console.log(`     ... e mais ${s.items.length - 15}`)
        }
    }

    console.log('\n' + '='.repeat(70))
    console.log(`\n🔀 CELULAR GRAVADO NO CAMPO FIXO (phone): ${celularNoFixo.length}`)
    if (celularNoFixo.length > 0) {
        console.log('-'.repeat(40))
        celularNoFixo.slice(0, 20).forEach(c => {
            console.log(`  ID ${c.id} | ${c.nome}`)
            console.log(`    phone (fixo):      ${c.phone}`)
            console.log(`    fone_movel (cel):   ${c.fone_movel}`)
        })
        if (celularNoFixo.length > 20) console.log(`  ... e mais ${celularNoFixo.length - 20}`)
    }

    console.log(`\n📞 FIXO GRAVADO NO CAMPO CELULAR (fone_movel): ${fixoNoCelular.length}`)
    if (fixoNoCelular.length > 0) {
        console.log('-'.repeat(40))
        fixoNoCelular.slice(0, 20).forEach(c => {
            console.log(`  ID ${c.id} | ${c.nome}`)
            console.log(`    fone_movel (cel):   ${c.fone_movel}`)
            console.log(`    phone (fixo):       ${c.phone}`)
        })
        if (fixoNoCelular.length > 20) console.log(`  ... e mais ${fixoNoCelular.length - 20}`)
    }

    console.log('\n✅ Diagnóstico completo.\n')
}

main().catch(console.error)
