import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import test from 'node:test'
const source = await readFile(new URL('../services/whatsapp-automation/server.mjs', import.meta.url), 'utf8')
function declaration(name) {
 const start=source.indexOf(`function ${name}(`);assert.notEqual(start,-1)
 const next=source.indexOf('\nfunction ',start+1)
 return source.slice(start,next===-1?source.length:next)
}
function fixture() {
 let now=0,id=0;const timers=new Map(),flushed=[]
 const api=runInNewContext(['normalizeAggregationText','inboundBufferKey','clearBufferedInboundTimer','bufferedInboundWindowMs','scheduleBufferedInbound','enqueueBufferedInbound'].map(declaration).join('\n')+'\n({enqueueBufferedInbound,bufferedInboundWindowMs})',{
 INBOUND_AGGREGATION_WINDOW_MS:20000,INBOUND_GREETING_WINDOW_MS:60000,inboundBuffers:new Map(),
 setTimeout:(fn,ms)=>{timers.set(++id,{fn,at:now+ms});return id},clearTimeout:key=>timers.delete(key),
 flushBufferedInbound:async key=>{flushed.push(key)},previewText:()=>'',console:{log(){},error(){}}
 })
 return {api,flushed,advance(ms){now+=ms;for(const [key,timer] of timers)if(timer.at<=now){timers.delete(key);timer.fn()}},send(text,key){api.enqueueBufferedInbound('store1',{phone:'test',providerMessageId:key,messageText:text})}}
}
test('Cristine: depois de Tudo bem espera a continuacao e agrupa antes de chamar o app',()=>{
 const f=fixture();f.send('Bom dia','1');f.advance(10000);f.send('Tudo bem?','2')
 f.advance(35000);assert.equal(f.flushed.length,0)
 f.send('Sera que a gente consegue tentar novamente','3');f.advance(10000)
 f.send('Meu sogro trocou de cartao','4');f.advance(15000);assert.equal(f.flushed.length,0)
 f.advance(5000);assert.equal(f.flushed.length,1)
})
test('pergunta junto do cumprimento e conteudo usam janela normal; cada mensagem reinicia',()=>{
 const f=fixture();f.send('Bom dia, queria saber se esta pronto','1');f.advance(19000);assert.equal(f.flushed.length,0)
 f.send('OS 123','2');f.advance(19000);assert.equal(f.flushed.length,0)
 f.advance(1000);assert.equal(f.flushed.length,1)
})
test('cumprimento isolado tem espera finita de 60 segundos',()=>{
 const f=fixture();f.send('Bom dia\nTudo bem?','1');f.advance(59000);assert.equal(f.flushed.length,0)
 f.advance(1000);assert.equal(f.flushed.length,1)
})
test('nomes, confirmacoes, emojis e conteudo nao sao cumprimentos isolados',()=>{
 const f=fixture();for(const text of ['Meu sogro trocou de cartao','Tudo bem com o pagamento?','Bom dia, posso tentar novamente?','Jose Paulo','Sim','\u{1f44d}'])
 assert.equal(f.api.bufferedInboundWindowMs({messages:[{messageText:text}]}),20000)
 assert.equal(f.api.bufferedInboundWindowMs({messages:[{messageText:'Hola!'},{messageText:'Que tal?'}]}),60000)
})
