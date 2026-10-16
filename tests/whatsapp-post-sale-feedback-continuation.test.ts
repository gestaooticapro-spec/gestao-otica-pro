import assert from 'node:assert/strict'
import test from 'node:test'
import { isClearPositiveAdaptationReply, postSaleFeedbackContinuation, needsPostSaleIaraIntroduction } from '../src/lib/whatsapp/post-sale-feedback-continuation'
import { getPostSaleForcedToolCall, validatePostSaleActionReply } from '../src/lib/whatsapp/post-sale-followup'
import { buildWhatsAppPostSaleActionReplyPrompt } from '../src/lib/whatsapp/ai'
const base={context:{postSalesId:1,stage:'awaiting_feedback' as const},hasAttachment:false,explicitHumanRequest:false,explicitOrderRequest:false}
test('Patricia: elogio e brincadeira continuam pos-venda e pedem nota',()=>{
 const text='\u00d3timo\nJeje\nSolo falta ir a pagar'
 assert.equal(postSaleFeedbackContinuation({...base,messageText:text}),'positive')
 assert.deepEqual(getPostSaleForcedToolCall({context:base.context,disposition:'handle_post_sale',intent:'post_sale_positive',explicitRating:null}),{name:'request_post_sale_rating'})
 const prompt=buildWhatsAppPostSaleActionReplyPrompt({action:'request_rating',messageText:text,mustIdentifyIara:true})
 assert.match(prompt,/Sou a IAra/);assert.match(prompt,/nota de 1 a 5/);assert.match(prompt,/sem afirmar divida/)
})
test('comentario na espera de nota nao se torna consulta financeira',()=>{
 assert.equal(postSaleFeedbackContinuation({...base,context:{...base.context,stage:'awaiting_rating'},messageText:'So falta pagar meu cartao'}),'comment')
 assert.equal(postSaleFeedbackContinuation({...base,messageText:'So falta pagar'}),null)
})
test('perguntas financeiras e feedback negativo nao sao ignorados',()=>{
 for(const text of ['Otimo\nQuanto falta pagar?','Otimo\nPode enviar o link','Otimo\nQuero pagar','Otimo mas sinto dor','Otimo\nNao me adaptei','Tudo bem','Otimo preco'])
 assert.equal(postSaleFeedbackContinuation({...base,messageText:text}),null,text)
})
test('continuidade exige contexto aberto, texto e ausencia de pedido humano ou OS',()=>{
 const messageText='Esta otimo\nSo falta pagar'
 for(const changes of [{context:null},{context:{postSalesId:1,stage:'completed' as const}},{context:{postSalesId:1,stage:'handoff' as const}},{hasAttachment:true},{explicitHumanRequest:true},{explicitOrderRequest:true}])
 assert.equal(postSaleFeedbackContinuation({...base,messageText,...changes}),null)
})
test('adaptacao boa em mais de uma frase pede nota mesmo fora da lista curta',()=>{
 assert.equal(isClearPositiveAdaptationReply('Está ótima. Ela esta enxergando muito bem'),true)
 assert.equal(isClearPositiveAdaptationReply('Otimo mas sinto dor'),false)
 assert.equal(isClearPositiveAdaptationReply('Tudo bem'),false)
 assert.equal(isClearPositiveAdaptationReply('Está ótima?'),false)
})
test('identificacao considera somente falas da IA e e validada antes do envio',()=>{
 assert.equal(needsPostSaleIaraIntroduction(['cliente: Sou a IAra']),true)
 assert.equal(needsPostSaleIaraIntroduction(['ia: Sou a IAra, assistente virtual da otica.']),false)
 assert.deepEqual(validatePostSaleActionReply({action:'request_rating',mustIdentifyIara:true,text:'Que bom! Qual nota de 1 a 5 voce da ao atendimento?'}),{valid:false,reason:'iara_identification_missing'})
 assert.equal(validatePostSaleActionReply({action:'request_rating',mustIdentifyIara:true,text:'Sou a IAra, assistente virtual da otica. Que bom! Qual nota de 1 a 5 voce da ao atendimento?'}).valid,true)
})
