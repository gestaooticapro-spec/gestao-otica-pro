import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as fs from 'fs'
import * as path from 'path'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Erro: Variáveis de ambiente NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não encontradas.')
    process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

const STORE_ID = 1
const TENANT_ID = '40b34e90-4c9d-4446-b775-770a3e77d6c0'
const CSV_PATH = path.resolve('estoque/estoque_otica.csv')

async function generateSmartBarcode(storeId: number, costPrice: number | null) {
    const date = new Date()
    const mm = String(date.getMonth() + 1).padStart(2, '0')
    const yy = String(date.getFullYear()).slice(-2)
    const custoRaw = costPrice ? (costPrice * 100).toFixed(0).padStart(5, '0') : '00000'
    const prefixo = `${mm}.${custoRaw}.${yy}.`

    const { count } = await supabase
        .from('products')
        .select('*', { count: 'exact', head: true })
        .eq('store_id', storeId)
        .ilike('codigo_barras', `${prefixo}%`)

    const nextSeq = String((count || 0) + 1).padStart(3, '0')
    return `${prefixo}${nextSeq}`
}

async function runImport() {
    const dryRun = process.argv.includes('--dry-run')

    if (!fs.existsSync(CSV_PATH)) {
        console.error(`Erro: Arquivo não encontrado em ${CSV_PATH}`)
        return
    }

    const content = fs.readFileSync(CSV_PATH, 'utf-8')
    const lines = content.split('\n').filter(line => line.trim() !== '')

    // Pula o cabeçalho: Marca,modelo,quantidade,valor
    const dataLines = lines.slice(1)

    console.log(`Iniciando importação de ${dataLines.length} itens... ${dryRun ? '[MODO DRY-RUN]' : ''}`)

    for (const line of dataLines) {
        const [marca, modelo, quantidade, valor] = line.split(',').map(s => s.trim())

        if (!marca || !modelo) continue

        // Limpeza de valor (caso venha com ponto como separador de milhar, ex: 1.390)
        const normalizedValor = valor.replace(/\./g, '').replace(',', '.')
        const precoVenda = parseFloat(normalizedValor)
        const qtde = parseInt(quantidade)

        if (isNaN(precoVenda)) {
            console.error(`Pulando ${marca} ${modelo}: Preço inválido (${valor})`)
            continue
        }

        const nomeProduto = `${marca} ${modelo}`.trim()

        // UPSERT: Verifica se o produto já existe pelo nome
        const { data: existing } = await supabase
            .from('products')
            .select('id, codigo_barras')
            .eq('store_id', STORE_ID)
            .eq('nome', nomeProduto)
            .limit(1)
            .single()

        if (existing) {
            // ATUALIZA produto existente
            if (dryRun) {
                console.log(`[DRY-RUN] ATUALIZAR: ${nomeProduto} | Preço: ${precoVenda} | Estoque: ${qtde}`)
            } else {
                const { error } = await supabase
                    .from('products')
                    .update({ preco_venda: precoVenda, estoque_atual: qtde })
                    .eq('id', existing.id)

                if (error) {
                    console.error(`Erro ao atualizar ${nomeProduto}:`, error.message)
                } else {
                    console.log(`ATUALIZADO: ${nomeProduto} (ID: ${existing.id}) | Preço: ${precoVenda} | Estoque: ${qtde}`)
                }
            }
        } else {
            // INSERE produto novo
            const generatedBarcode = await generateSmartBarcode(STORE_ID, null)

            const detalhes = {
                modelo: modelo,
                cor: null,
                aro: null,
                ponte: null,
                haste: null
            }

            const payload = {
                tenant_id: TENANT_ID,
                store_id: STORE_ID,
                nome: nomeProduto,
                marca: marca,
                referencia: null,
                codigo_barras: generatedBarcode,
                tipo_produto: 'Solar',
                categoria: 'Solar',
                preco_custo: null,
                preco_venda: precoVenda,
                estoque_atual: qtde,
                detalhes: detalhes,
                gerencia_estoque: true,
                created_at: new Date().toISOString()
            }

            if (dryRun) {
                console.log(`[DRY-RUN] INSERIR: ${nomeProduto} | Barcode: ${generatedBarcode} | Preço: ${precoVenda} | Estoque: ${qtde}`)
            } else {
                const { error } = await supabase.from('products').insert(payload)
                if (error) {
                    console.error(`Erro ao inserir ${nomeProduto}:`, error.message)
                } else {
                    console.log(`INSERIDO: ${nomeProduto} (${generatedBarcode})`)
                }
            }
        }
    }

    console.log('Fim do processo.')
}

runImport()
