import assert from 'node:assert/strict'
import test from 'node:test'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {runInNewContext} from 'node:vm'
import ts from 'typescript'
function load(file,mocks={},globals={}){
  const module={exports:{}},native=createRequire(import.meta.url)
  runInNewContext(ts.transpileModule(readFileSync(new URL(`../${file}`,import.meta.url),'utf8'),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,
    {module,exports:module.exports,FormData,console:{log(){},error(){}},require:id=>mocks[id]||
      (['zod','node:crypto'].includes(id)?native(id):{}),...globals})
  return module.exports
}
const nodes=n=>!n||typeof n!=='object'?[]:Array.isArray(n)?n.flatMap(nodes):[n,...nodes(n.props?.children)]
test('modal usa uma única data local para envio e chave da tentativa, inclusive na virada do dia',async()=>{
  const state=[],effects=[],pending=[],calls=[];let cursor=0,dateCalls=0,keys=0
  const jsx=(type,props)=>({type,props})
  const react={useState(initial){const i=cursor++;if(!(i in state))state[i]=initial;return [state[i],v=>{state[i]=typeof v==='function'?v(state[i]):v}]},
    useRef(initial){const i=cursor++;if(!(i in state))state[i]={current:initial};return state[i]},
    useEffect(fn){effects.push(fn)},useCallback:fn=>fn,useTransition:()=>[false,fn=>pending.push(fn())]}
  const Component=load('src/components/modals/ParcelaSearchModal.tsx',{
    react,'react-dom':{createPortal:node=>node},'react/jsx-runtime':{jsx,jsxs:jsx},
    'next/navigation':{useRouter:()=>({refresh(){}})},
    '@/lib/installment-balance':load('src/lib/installment-balance.ts'),
    '@/lib/financing-dates':{getLocalDateKey:()=>++dateCalls===1?'2026-11-07':'2026-11-08'},
    '@/components/modals/EmployeeAuthModal':{default:'auth'},
    '@/lib/actions/pix-installment.actions':{getPixProviderForStore:async()=> 'manual'},
    '@/lib/actions/vendas.actions':{receberParcela:async(_,fd)=>{calls.push(fd);return {success:false,message:'synthetic retry'}}},
  },{document:{body:{}},setTimeout(){},clearTimeout(){},alert(){},crypto:{randomUUID:()=>`attempt-${++keys}`}}).default
  const render=()=>{cursor=0;effects.length=0;return Component({isOpen:true,storeId:1,onClose(){},initialParcela:{
    id:8,venda_id:10,valor_parcela:100,valor_pago:0,status:'Pendente',data_vencimento:'2026-12-07',numero_parcela:1}})}
  render();for(const effect of [...effects])effect()
  const start=()=>nodes(render()).find(n=>n.type==='button'&&n.props.onClick?.name==='handlePreConfirm').props.onClick()
  start();const auth=nodes(render()).find(n=>n.type==='auth')
  dateCalls=0;auth.props.onSuccess({id:5});await Promise.all(pending)
  assert.equal(dateCalls,1)
  assert.equal(calls[0].get('data_pagamento'),'2026-11-07')
  // Mesma data/dados reconhecem a tentativa anterior; a assinatura usa a data enviada.
  dateCalls=0;auth.props.onSuccess({id:5});await Promise.all(pending)
  assert.equal(calls[1].get('idempotency_key'),calls[0].get('idempotency_key'));assert.equal(keys,1)
  // Um centavo também exige aviso; a tela não promete baixa antes da resposta.
  const content=n=>typeof n==='string'?n:Array.isArray(n)?n.map(content).join(' '):content(n?.props?.children||'')
  for(const amount of ['100,01','250,00']){
    nodes(render()).find(n=>n.type==='input'&&n.props.type==='text').props.onChange({target:{value:amount}})
    const message=content(render())
    assert.match(message,/Excedente a validar/)
    assert.match(message,/uma ou mais parcelas/)
    assert.match(message,/recebimento será recusado/)
    assert.doesNotMatch(message,/descontado automaticamente/)
    assert.equal(calls.length,2) // Mudar valor e mostrar prévia não registra dinheiro.
  }
})
test('action preserva a data recebida ao chamar a RPC, sem conversão de fuso',async()=>{
  const calls=[],tenant='00000000-0000-0000-0000-000000000001'
  const actions=load('src/lib/actions/vendas.actions.ts',{
    '@/lib/supabase/server':{createClient:()=>({auth:{getUser:async()=>({data:{user:{id:'user'}}})}})},
    '@/lib/supabase/admin':{getProfileByAdmin:async()=>({tenant_id:tenant,store_id:1,role:'funcionario'}),
      createAdminClient:()=>({rpc:async(name,p)=>{calls.push({name,p});return {error:{message:'synthetic'}}}})},
    '@/lib/store-modules.server':{isStoreModuleEnabledForStore:async()=>true},
  })
  const fd=new FormData()
  for(const [key,value] of Object.entries({parcela_id:8,venda_id:10,store_id:1,employee_id:5,valor_pago_total:'100',valor_juros:'0',
    forma_pagamento:'Dinheiro',data_pagamento:'2026-11-07',estrategia:'quitacao_total',idempotency_key:'00000000-0000-4000-8000-000000000005'}))fd.set(key,String(value))
  const result=await actions.receberParcela(null,fd)
  assert.match(result.message,/synthetic/)
  assert.equal(calls.length,1);assert.equal(calls[0].name,'receive_installment_payment')
  assert.equal(calls[0].p.p_received_on,'2026-11-07')
})
