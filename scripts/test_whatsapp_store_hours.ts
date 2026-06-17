import { StoreHoursConfig } from '../src/lib/store-modules'
import { evaluateStoreHours } from '../src/lib/whatsapp/store-hours-logic'

const testConfig: StoreHoursConfig = {
    timezone: 'America/Sao_Paulo',
    weekly_schedule: {
        0: { is_open: false, open_time: '08:00', close_time: '18:00' },
        1: { is_open: true, open_time: '08:00', close_time: '18:00' },
        2: { is_open: true, open_time: '08:00', close_time: '18:00' },
        3: { is_open: true, open_time: '08:00', close_time: '18:00' },
        4: { is_open: true, open_time: '08:00', close_time: '18:00' },
        5: { is_open: true, open_time: '08:00', close_time: '18:00' },
        6: { is_open: true, open_time: '08:00', close_time: '12:00' },
    },
    break_windows: [
        { id: '1', start_time: '12:00', end_time: '13:00', days: [1, 2, 3, 4, 5], reason: 'Almoço' }
    ],
    special_closures: [
        { id: 'c1', date: '2026-12-25', reason: 'Natal' }
    ],
    special_openings: [
        { id: 'o1', date: '2026-12-20', open_time: '09:00', close_time: '15:00', reason: 'Domingo Especial' } // A Sunday
    ]
}

function runTests() {
    console.log("=== INICIANDO TESTES DO MOTOR DE HORÁRIOS ===")

    // Teste 1: Quarta-feira, 10:00 da manhã -> Aberto
    // 2026-06-17 é uma Quarta-feira. (Lembrando que os meses no JS começam em 0, então Junho é 5)
    let ref = new Date(Date.UTC(2026, 5, 17, 13, 0, 0)) // 13:00 UTC = 10:00 BRT
    let res = evaluateStoreHours(testConfig, ref)
    console.log("\nTeste 1 - Quarta 10h:")
    console.log(res.is_open_now === true ? "✅ Aberto" : "❌ ERRO: Deveria estar aberto")

    // Teste 2: Quarta-feira, 12:30 (Horário de almoço) -> Fechado e não é exceptional global
    ref = new Date(Date.UTC(2026, 5, 17, 15, 30, 0)) // 15:30 UTC = 12:30 BRT
    res = evaluateStoreHours(testConfig, ref)
    console.log("\nTeste 2 - Quarta 12:30 (Almoço):")
    console.log(res.is_open_now === false ? "✅ Fechado" : "❌ ERRO: Deveria estar fechado")
    console.log(res.is_exceptional_closure === false ? "✅ Não é fechamento excepcional" : "❌ ERRO: Almoço não deve acionar exceção")
    console.log("Next open:", res.next_open_schedule) // Deveria ser "Hoje às 13:00"

    // Teste 3: Sábado 13:00 (Fim do expediente) -> Fechado
    ref = new Date(Date.UTC(2026, 5, 20, 16, 0, 0)) // 16:00 UTC = 13:00 BRT
    res = evaluateStoreHours(testConfig, ref)
    console.log("\nTeste 3 - Sábado 13h (Fechado):")
    console.log(res.is_open_now === false ? "✅ Fechado" : "❌ ERRO: Deveria estar fechado")
    console.log("Next open:", res.next_open_schedule) // Deveria ser "Segunda-feira às 08:00"

    // Teste 4: Feriado (Natal) -> Excepcionalmente fechado
    ref = new Date(Date.UTC(2026, 11, 25, 13, 0, 0)) // 25/Dez/2026 10h BRT
    res = evaluateStoreHours(testConfig, ref)
    console.log("\nTeste 4 - Natal (Sexta-feira 10h):")
    console.log(res.is_open_now === false && res.is_exceptional_closure === true ? "✅ Fechado Excepcionalmente" : "❌ ERRO: Feriado falhou")
    console.log("Motivo:", res.exceptional_closure_reason)

    // Teste 5: Domingo Especial -> Aberto
    ref = new Date(Date.UTC(2026, 11, 20, 13, 0, 0)) // 20/Dez/2026 10h BRT
    res = evaluateStoreHours(testConfig, ref)
    console.log("\nTeste 5 - Domingo Especial (Aberto às 10h):")
    console.log(res.is_open_now === true ? "✅ Aberto no Domingo Especial" : "❌ ERRO: Deveria estar aberto")

    console.log("\n=== TESTES CONCLUÍDOS ===")
}

runTests()
