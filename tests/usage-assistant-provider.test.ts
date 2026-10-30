import assert from 'node:assert/strict'
import test from 'node:test'
import Module from 'node:module'
import { getUsageDestinations } from '../src/lib/usage-assistant'

// O marcador server-only é substituído apenas no processo de teste Node.
const loader = Module as unknown as { _load: (...args: any[]) => unknown }
const originalLoad = loader._load
loader._load = function (...args: any[]) {
  if (args[0] === 'server-only') return {}
  return originalLoad.apply(this, args)
}
const { generateUsageAnswer } = require('../src/lib/server/usage-assistant') as typeof import('../src/lib/server/usage-assistant')
loader._load = originalLoad

const destinations = getUsageDestinations(3, 'store_operator', null)
const input = () => ({
  message: 'Onde consulto o laboratório?',
  history: [
    { role: 'user' as const, content: 'Como acompanho os óculos?' },
    { role: 'assistant' as const, content: 'Abra o laboratório.' },
  ],
  role: 'store_operator' as const,
  settings: null,
  destinations,
  signal: new AbortController().signal,
  logUsage: true,
})

async function withProviders<T>(fn: (calls: Array<{ url: string; init: RequestInit }>, logs: string[]) => Promise<T>) {
  const names = Object.keys(process.env).filter(name => /^GEMINI_SECRET_KEY_\d+$/.test(name) || name === 'GOOGLE_API_KEY' || name === 'OPENAI_API_KEY')
  const saved = new Map(names.map(name => [name, process.env[name]]))
  for (const name of names) delete process.env[name]
  const originalFetch = globalThis.fetch
  const originalInfo = console.info
  const calls: Array<{ url: string; init: RequestInit }> = []
  const logs: string[] = []
  console.info = (...args: unknown[]) => { logs.push(args.map(String).join(' ')) }
  try { return await fn(calls, logs) }
  finally {
    globalThis.fetch = originalFetch
    console.info = originalInfo
    for (const name of Object.keys(process.env)) {
      if (/^GEMINI_SECRET_KEY_\d+$/.test(name) || name === 'GOOGLE_API_KEY' || name === 'OPENAI_API_KEY') delete process.env[name]
    }
    for (const [name, value] of saved) if (value !== undefined) process.env[name] = value
  }
}

function openAIResponse() {
  return Response.json({
    status: 'completed',
    output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ answer: 'Abra [Busca](busca).', destinationIds: ['busca'] }) }] }],
    usage: { input_tokens: 120, output_tokens: 35 },
  })
}

test('recebimento de parcela errado recebe orientação verificada sem chamar IA', async () => {
  await withProviders(async (calls, logs) => {
    globalThis.fetch = async (url, init) => { calls.push({ url: String(url), init: init! }); throw new Error('não deve chamar provedor') }
    const result = await generateUsageAnswer({ ...input(), message: 'como faço se eu recebi uma parcela errado?', history: [] })
    assert.match(result.answer, /Reverter/)
    assert.match(result.answer, /PIN de gerente/)
    assert.match(result.answer, /mais de uma parcela/)
    assert.match(result.answer, /não tente corrigir pelo Livro Caixa/)
    assert.equal(result.destinations[0].id, 'parcelamentos')
    assert.equal(calls.length, 0)
    assert.ok(logs.some(line => line.includes('nenhuma chave consultada')))
  })
})

test('correção de parcela respeita acesso e reconhece pergunta de continuação', async () => {
  await withProviders(async () => {
    const sellerDestinations = getUsageDestinations(3, 'vendedor', null)
    const result = await generateUsageAnswer({ ...input(), role: 'vendedor', destinations: sellerDestinations, message: 'Como faço para reverter isso?', history: [{ role: 'user', content: 'Recebi uma parcela.' }, { role: 'assistant', content: 'Certo.' }] })
    assert.equal(result.destinations[0].id, 'busca')
    assert.match(result.answer, /venda experimental/)
    assert.ok(result.destinations.every(item => item.id !== 'parcelamentos'))
  })
})

test('perguntas sobre estorno de parcela mantêm motivo, autorização e consulta correta', async () => {
  await withProviders(async () => {
    for (const message of ['Baixei a parcela errada, como corrijo?', 'Como estornar o recebimento do carnê?', 'Como desfazer uma parcela recebida por engano?']) {
      const result = await generateUsageAnswer({ ...input(), message, history: [] })
      assert.match(result.answer, /Reverter/)
      assert.match(result.answer, /motivo/)
      assert.match(result.answer, /PIN de gerente/)
      assert.equal(result.destinations[0].id, 'parcelamentos')
    }
  })
})

test('cancelamento de cobrança Pix não é confundido com reversão de recebimento', async () => {
  await withProviders(async (calls) => {
    globalThis.fetch = async (url, init) => {
      calls.push({ url: String(url), init: init! })
      throw new Error('não deve chamar provedor')
    }
    const settings = { pix_provider: 'sicredi' as const }
    const result = await generateUsageAnswer({ ...input(), settings, destinations: getUsageDestinations(3, 'store_operator', settings), history: [], message: 'Como cancelar a cobrança Pix pendente de uma parcela?' })
    assert.equal(calls.length, 0)
    assert.doesNotMatch(result.answer, /Reverter/)
    assert.match(result.answer, /Cancelar \/ alterar valor/)
    const manual = await generateUsageAnswer({ ...input(), history: [], message: 'Como cancelar a cobrança Pix pendente de uma parcela?' })
    assert.match(manual.answer, /não está disponível/)
    assert.equal(manual.destinations.length, 0)
  })
})

test('correção de pagamento direto e cobrança duplicada não consultam o modelo', async () => {
  await withProviders(async (calls, logs) => {
    globalThis.fetch = async (url, init) => { calls.push({ url: String(url), init: init! }); throw new Error('não deve chamar provedor') }
    const removed = await generateUsageAnswer({ ...input(), history: [], message: 'Como removo o pagamento direto lançado errado?' })
    assert.match(removed.answer, /Estornar \/ Remover/)
    assert.match(removed.answer, /Livro Caixa/)
    assert.doesNotMatch(removed.answer, /clique em \*\*Reverter\*\*/)
    const duplicated = await generateUsageAnswer({ ...input(), history: [], message: 'O carnê já cobre a venda. Posso gerar outro Pix?' })
    assert.match(duplicated.answer, /Não registre de novo/)
    const ambiguous = await generateUsageAnswer({ ...input(), history: [], message: 'Como cancelo o pagamento?' })
    assert.match(ambiguous.answer, /Diga qual dos dois/)
    assert.equal(calls.length, 0)
    assert.ok(logs.some(line => line.includes('pagamento da venda') && line.includes('nenhuma chave consultada')))
  })
})

test('vendedor sem estoque não consulta o modelo', async () => {
  await withProviders(async calls => {
    globalThis.fetch = async (url, init) => { calls.push({ url: String(url), init: init! }); throw new Error('não deve chamar provedor') }
    const result = await generateUsageAnswer({
      ...input(),
      role: 'vendedor',
      destinations: getUsageDestinations(3, 'vendedor', null),
      history: [],
      message: 'Como lanço uma movimentação de estoque?',
    })
    assert.match(result.answer, /não está disponível neste acesso/)
    assert.equal(calls.length, 0)
    assert.equal(result.destinations.length, 0)
  })
})

test('leitura de WhatsApp no pós-venda não consulta o modelo', async () => {
  await withProviders(async calls => {
    globalThis.fetch = async (url, init) => { calls.push({ url: String(url), init: init! }); throw new Error('não deve chamar provedor') }
    const result = await generateUsageAnswer({ ...input(), history: [], message: 'O cliente recebeu a mensagem da garantia?' })
    assert.match(result.answer, /não prova/)
    assert.match(result.answer, /Cliente sem telefone/)
    assert.equal(calls.length, 0)
  })
})

test('entrega bloqueada não consulta o modelo', async () => {
  await withProviders(async calls => {
    globalThis.fetch = async (url, init) => { calls.push({ url: String(url), init: init! }); throw new Error('não deve chamar provedor') }
    const result = await generateUsageAnswer({ ...input(), history: [], message: 'Não consigo entregar porque a venda está em aberto.' })
    assert.match(result.answer, /Ir para Fechamento/)
    assert.match(result.answer, /não confirma/)
    assert.equal(calls.length, 0)
  })
})

test('OS sem modo da loja não consulta o modelo', async () => {
  await withProviders(async calls => {
    globalThis.fetch = async (url, init) => { calls.push({ url: String(url), init: init! }); throw new Error('não deve chamar provedor') }
    const result = await generateUsageAnswer({ ...input(), history: [], message: 'Como lanço a OS do óculos?' })
    assert.match(result.answer, /Lançar OS/)
    assert.match(result.answer, /Nova OS/)
    assert.equal(calls.length, 0)
  })
})

test('venda bloqueada na abertura não consulta o modelo', async () => {
  await withProviders(async calls => {
    globalThis.fetch = async (url, init) => { calls.push({ url: String(url), init: init! }); throw new Error('não deve chamar provedor') }
    const result = await generateUsageAnswer({ ...input(), history: [], message: 'A venda não abre. O que pode ser?' })
    assert.match(result.answer, /Avaliação/)
    assert.match(result.answer, /mensalidade/)
    assert.equal(calls.length, 0)
    assert.ok(result.destinations.some(item => item.id === 'receituario'))
  })
})

test('promessa de cobrança não consulta o modelo nem recebe a parcela', async () => {
  await withProviders(async calls => {
    globalThis.fetch = async (url, init) => { calls.push({ url: String(url), init: init! }); throw new Error('não deve chamar provedor') }
    const result = await generateUsageAnswer({ ...input(), history: [], message: 'Registrei o contato na cobrança. A dívida foi recebida?' })
    assert.match(result.answer, /não recebem a parcela/i)
    assert.equal(calls.length, 0)
    assert.ok(result.destinations.some(item => item.id === 'receber-parcela'))
  })
})

test('entrada posterior do carnê não consulta o modelo', async () => {
  await withProviders(async (calls, logs) => {
    globalThis.fetch = async (url, init) => { calls.push({ url: String(url), init: init! }); throw new Error('não deve chamar provedor') }
    const result = await generateUsageAnswer({
      ...input(),
      history: [],
      message: 'O cliente pediu a venda a prazo sem entrada. Gerei as parcelas e depois ele quis dar entrada. Como faço?',
    })
    assert.match(result.answer, /Fechada/)
    assert.match(result.answer, /uma única vez/)
    assert.equal(result.destinations[0]?.id, 'busca')
    assert.equal(calls.length, 0)
    assert.ok(logs.some(line => line.includes('pagamento da venda') && line.includes('nenhuma chave consultada')))
  })
})

test('continuação sem procedimento protegido continua indo ao modelo', async () => {
  await withProviders(async calls => {
    process.env.GEMINI_SECRET_KEY_1 = 'gemini-sintetica-1'
    globalThis.fetch = async (url, init) => {
      calls.push({ url: String(url), init: init! })
      return Response.json({
        candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({ answer: 'Abra [Busca](busca) e confira A Receber.', destinationIds: ['busca'] }) }] } }],
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 8 },
      })
    }
    const result = await generateUsageAnswer({ ...input(), history: [], message: 'Como registro um pagamento na venda?' })
    assert.equal(calls.length, 1)
    assert.match(result.answer, /A Receber/)
    const body = JSON.parse(String(calls[0].init.body))
    assert.match(body.systemInstruction.parts[0].text, /lixeira da venda experimental/)
    assert.match(body.systemInstruction.parts[0].text, /não oriente pagamento parcial/)
  })
})

test('reversão informa a restrição após renegociação', async () => {
  await withProviders(async () => {
    const result = await generateUsageAnswer({ ...input(), history: [], message: 'Uma parcela foi baixada e depois renegociei o carnê. Como reverto aquele recebimento?' })
    assert.match(result.answer, /anterior à renegociação/)
    assert.doesNotMatch(result.answer, /clique em \*\*Reverter/)
  })
})

test('esgota Gemini e usa OpenAI com contexto, destinos permitidos e logs de tokens sem segredos', async () => {
  await withProviders(async (calls, logs) => {
    process.env.GEMINI_SECRET_KEY_1 = 'gemini-sintetica-1'
    process.env.GEMINI_SECRET_KEY_2 = 'gemini-sintetica-2'
    process.env.OPENAI_API_KEY = 'openai-sintetica'
    globalThis.fetch = async (url, init) => {
      calls.push({ url: String(url), init: init! })
      return String(url).includes('generativelanguage') ? new Response('{}', { status: 429 }) : openAIResponse()
    }
    const result = await generateUsageAnswer(input())
    assert.equal(calls.length, 3)
    assert.ok(calls[0].url.includes('generativelanguage') && calls[1].url.includes('generativelanguage'))
    assert.equal(calls[2].url, 'https://api.openai.com/v1/responses')
    const body = JSON.parse(String(calls[2].init.body))
    assert.equal(body.store, false)
    assert.equal(body.input.at(-1).content, input().message)
    assert.equal(body.input.at(-2).content, input().history[1].content)
    assert.equal(body.text.format.type, 'json_schema')
    assert.equal(result.destinations[0].kind === 'page' && result.destinations[0].href, '/dashboard/loja/3/consultas')
    assert.ok(logs.some(line => line.includes('GEMINI_SECRET_KEY_1')))
    assert.ok(logs.some(line => line.includes('GEMINI_SECRET_KEY_2')))
    assert.ok(logs.some(line => line.includes('OPENAI_API_KEY') && line.includes('entrada=120') && line.includes('saída=35')))
    assert.ok(logs.every(line => !line.includes('sintetica') && !line.includes('Como registro')))
  })
})

test('resposta Gemini valida evita o fallback pago e registra tokens retornados', async () => {
  await withProviders(async (calls, logs) => {
    process.env.GEMINI_SECRET_KEY_1 = 'gemini-sintetica-1'
    process.env.OPENAI_API_KEY = 'openai-sintetica'
    globalThis.fetch = async (url, init) => {
      calls.push({ url: String(url), init: init! })
      return Response.json({
        candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({ answer: 'Consulte [Busca](busca).', destinationIds: ['busca'] }) }] } }],
        usageMetadata: { promptTokenCount: 50, candidatesTokenCount: 12, thoughtsTokenCount: 3 },
      })
    }
    await generateUsageAnswer(input())
    assert.equal(calls.length, 1)
    assert.ok(calls[0].url.includes('generativelanguage'))
    assert.ok(logs.some(line => line.includes('GEMINI_SECRET_KEY_1') && line.includes('entrada=50') && line.includes('saída=15')))
    assert.ok(logs.every(line => !line.includes('OPENAI_API_KEY') && !line.includes('sintetica')))
  })
})

test('OpenAI funciona sem Gemini e indisponibilidade continua sinalizada se ambos falharem', async () => {
  await withProviders(async calls => {
    process.env.OPENAI_API_KEY = 'openai-sintetica'
    globalThis.fetch = async (url, init) => { calls.push({ url: String(url), init: init! }); return openAIResponse() }
    assert.ok(await generateUsageAnswer(input()))
    assert.equal(calls.length, 1)
    assert.equal(calls[0].url, 'https://api.openai.com/v1/responses')
    process.env.GEMINI_SECRET_KEY_1 = 'gemini-sintetica-1'
    globalThis.fetch = async () => new Response('{}', { status: 503 })
    await assert.rejects(generateUsageAnswer(input()), /usage_assistant_unavailable/)
  })
})

test('resposta Gemini invalida usa o fallback e chamadas sem diagnostico nao registram logs', async () => {
  await withProviders(async (calls, logs) => {
    process.env.GEMINI_SECRET_KEY_1 = 'gemini-sintetica-1'
    process.env.OPENAI_API_KEY = 'openai-sintetica'
    globalThis.fetch = async (url, init) => {
      calls.push({ url: String(url), init: init! })
      return String(url).includes('generativelanguage')
        ? Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{invalido' }] } }] })
        : openAIResponse()
    }
    assert.ok(await generateUsageAnswer({ ...input(), logUsage: false }))
    assert.equal(calls.length, 2)
    assert.equal(calls[1].url, 'https://api.openai.com/v1/responses')
    assert.deepEqual(logs, [])
  })
})

test('cancelar a conversa impede consulta paga posterior', async () => {
  await withProviders(async calls => {
    process.env.GEMINI_SECRET_KEY_1 = 'gemini-sintetica-1'
    process.env.OPENAI_API_KEY = 'openai-sintetica'
    const controller = new AbortController()
    globalThis.fetch = async (url, init) => {
      calls.push({ url: String(url), init: init! })
      controller.abort()
      throw new Error('cancelado')
    }
    await assert.rejects(generateUsageAnswer({ ...input(), signal: controller.signal }), /usage_assistant_aborted/)
    assert.equal(calls.length, 1)
    assert.ok(calls[0].url.includes('generativelanguage'))
  })
})
