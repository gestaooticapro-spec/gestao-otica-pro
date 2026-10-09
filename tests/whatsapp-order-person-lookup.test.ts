import assert from 'node:assert/strict'
import test from 'node:test'
import { groundedOrderPersonName, orderPersonSearchPattern, uniqueExactOrderPerson } from '../src/lib/whatsapp/redesign/order-person-lookup'
import { planStoreOneOrderLookup, runStoreOneOrderStatusTurn, resolveStoreOneOrderDisposition } from '../src/lib/whatsapp/redesign/order-status-live'
import { WhatsAppRedesignClassificationSchema, WhatsAppSystemDecisionSchema } from '../src/lib/whatsapp/redesign/contracts'
const classification = WhatsAppRedesignClassificationSchema.parse({intent:'order_status',confidence:0.98,topicRelation:'continue_topic',requestsHuman:false,mentionsAttachment:false,entities:{patientName:'Jose Paulo de Andrade',customerName:'Sirlei',orderNumber:null,cpf:null}})
const decision=WhatsAppSystemDecisionSchema.parse({action:'lookup_order_status',fallbackReply:'Consultar OS',facts:{},humanHandoffTiming:null,humanization:{mustNotAddFacts:true,mustKeepShort:true,mustIdentifyIara:false,mustMentionHumanHandoff:false,forbiddenClaims:[]}})
const input={storeId:1,enabled:true,classification,decision,messageText:'Foi feito pedido segunda feira',awaitingIdentifier:true,conversationHistory:['Cliente: Jose Paulo de Andrade','Cliente: Ese nome']}
const writer=(text:string)=>async()=>({success:true as const,provider:'openai' as const,model:'test',keyIndex:0,data:{reply_text:text},attempts:1,rawText:text,latencyMs:1,promptText:''})
test('Sirlei: usa nome completo do marido fornecido no contexto, sem consultar o titular pelo telefone',async()=>{
 const plan=planStoreOneOrderLookup(input);assert.equal(plan?.personName,'Jose Paulo de Andrade');assert.equal(plan?.tool,'lookup_open_orders_by_identifier');assert.ok(plan)
 const result=await runStoreOneOrderStatusTurn({plan,assistant:{messageText:input.messageText},executeLookup:async call=>({tool:call.name,ok:true,data:{customerName:'JOSE PAULO DE ANDRADE',orders:[{orderNumber:'1063',patientName:null,status:'lens_in_production',statusText:'Em producao no laboratorio'}]}}),writeReply:writer('A OS 1063 de JOSE PAULO DE ANDRADE esta em producao no laboratorio.')})
 assert.equal(result.disposition.kind,'send');assert.equal(result.disposition.kind==='send'&&result.disposition.action,'auto_reply')
})
test('nome enviado enquanto aguarda identificador vence no_reply contextual, mas nao pausa humana',()=>{
 const waiting={...input,messageText:'Jose Paulo de Andrade',decision:{...decision,action:'no_reply' as const}}
 assert.equal(planStoreOneOrderLookup(waiting)?.personName,'Jose Paulo de Andrade')
 assert.equal(planStoreOneOrderLookup({...waiting,decision:{...waiting.decision,facts:{decisionReason:'human_control_blocks_ai'}}}),null)
})
test('nomes inventados ou presentes somente em resposta da IA nao viram identificador',()=>{
 assert.equal(groundedOrderPersonName('Jose Paulo de Andrade','Bom dia',['IA: Jose Paulo de Andrade']),null)
 assert.equal(groundedOrderPersonName('Jose Paulo de Andrade','Jose Paulo'),null)
 assert.equal(planStoreOneOrderLookup({...input,conversationHistory:[]})?.personName,undefined)
})
test('igualdade completa tolera acento; nome parcial, homonimos e pagina truncada nao identificam pessoa',()=>{
 const customer={id:3216,full_name:'JOSE PAULO DE ANDRADE'}
 assert.equal(uniqueExactOrderPerson('Jos\u00e9 Paulo de Andrade',[customer],10),customer)
 assert.equal(uniqueExactOrderPerson('Jose Paulo',[customer],10),null)
 assert.equal(uniqueExactOrderPerson('Jose Paulo de Andrade',[customer,{...customer,id:99}],10),null)
 assert.equal(uniqueExactOrderPerson('Jose Paulo de Andrade',[customer],1),null)
 assert.equal(orderPersonSearchPattern('Jos\u00e9 Paulo de Andrade'), 'j_s_%p__l_%d_%__dr_d_')
})
test('nome incompleto pede identificador sem afirmar inexistencia de OS',()=>{
 const plan={tool:'lookup_open_orders_by_identifier' as const,source:'canonical_decision' as const,personName:'Jose Paulo'}
 assert.equal(resolveStoreOneOrderDisposition({plan,lookup:{tool:plan.tool,ok:false,data:{code:'order_name_needs_identifier'}},replyText:'Pode me informar o nome completo do titular ou o numero da OS?'}).kind,'send')
})
test('consulta vazia por telefone nao pode afirmar que pesquisou pelo nome',()=>{
 const plan={tool:'lookup_open_orders' as const,source:'canonical_decision' as const}
 const lookup={tool:plan.tool,ok:true,data:{orders:[]}}
 assert.equal(resolveStoreOneOrderDisposition({plan,lookup,replyText:'Pelo nome Jose Paulo nao encontrei pedido. Pode informar o numero da OS?'}).kind,'suppress')
 assert.equal(resolveStoreOneOrderDisposition({plan,lookup,replyText:'Nao encontrei pedido vinculado a este WhatsApp. Poderia me informar o nome completo do titular ou numero da OS?'}).kind,'send')
})
test('nome ambiguo nao permite afirmar que nao existe pedido mesmo pedindo identificador',()=>{
 const plan={tool:'lookup_open_orders_by_identifier' as const,source:'canonical_decision' as const,personName:'Jose Paulo'}
 assert.equal(resolveStoreOneOrderDisposition({plan,lookup:{tool:plan.tool,ok:false,data:{code:'order_name_needs_identifier'}},replyText:'Nao existe pedido desse nome. Poderia me informar o nome completo do titular?'}).kind,'suppress')
})
test('mencionar WhatsApp nao autoriza dizer que houve busca pelo nome',()=>{
 const plan={tool:'lookup_open_orders' as const,source:'canonical_decision' as const}
 assert.equal(resolveStoreOneOrderDisposition({plan,lookup:{tool:plan.tool,ok:true,data:{orders:[]}},replyText:'Pelo nome nao encontrei pedido neste WhatsApp. Poderia me informar o numero da OS?'}).kind,'suppress')
})
