import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'

function load(file,mocks={},globals={}){
  const module={exports:{}},native=createRequire(import.meta.url)
  const code=ts.transpileModule(readFileSync(new URL(`../${file}`,import.meta.url),'utf8'),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText
  runInNewContext(code,{module,exports:module.exports,FormData,console,
    require:id=>mocks[id]||(id==='@/lib/financing-dates'?load('src/lib/financing-dates.ts'):
      ['zod','node:crypto'].includes(id)?native(id):{}),...globals})
  return module.exports
}
const nodes=n=>!n||typeof n!=='object'?[]:Array.isArray(n)?n.flatMap(nodes):[n,...nodes(n.props?.children)]
const text=n=>typeof n==='string'?n:Array.isArray(n)?n.map(text).join(''):text(n?.props?.children||'')
function hooks(){
  const state=[],effects=[],pending=[];let cursor=0
  const react={useState(initial){const i=cursor++;if(!(i in state))state[i]=typeof initial==='function'?initial():initial;
    return [state[i],v=>{state[i]=typeof v==='function'?v(state[i]):v}]},
    useRef(initial){const i=cursor++;if(!(i in state))state[i]={current:initial};return state[i]},
    useEffect(fn){effects.push(fn)},useTransition:()=>[false,fn=>pending.push(fn())]}
  return {react,pending,render(fn){cursor=0;effects.length=0;return fn()},effects(){for(const f of [...effects])f()}}
}
const jsx=(type,props)=>({type,props})
const customer={id:20,full_name:'Cliente teste',cpf:'12345678900',fone_movel:'11999999999',obs_debito:null,person_type:'PF'}
function modalHarness(result={success:true,vendaId:42}){
  const h=hooks(),calls=[],routes=[],alerts=[];let resets=0,closed=0,resolve
  const waiting=new Promise(r=>{resolve=r})
  const Component=load('src/components/modals/PaymentModal.tsx',{
    react:h.react,'react/jsx-runtime':{jsx,jsxs:jsx},
    '@/components/vendas/FinanciamentoBox':{default:'finance'},
    '@/lib/contexts/StoreModulesContext':{useStoreModules:()=>({installments:true})},
    '@/lib/actions/vendas.actions':{searchCustomersByName:async()=>({success:true,data:[customer]}),
      criarVendaParcialCarnê:async fd=>{calls.push(fd);await waiting;return result}},
  },{alert:m=>alerts.push(m),window:{location:{assign:path=>routes.push(path)}}}).default
  const render=()=>h.render(()=>Component({isOpen:true,storeId:1,employeeId:5,valorTotal:100,
    cartItems:[{price:100,quantity:1}],onReset:()=>resets++,onClose:()=>closed++}))
  const button=label=>nodes(render()).find(n=>n.type==='button'&&text(n).trim()===label)
  const start=async()=>{
    button('Carnê').props.onClick()
    nodes(render()).find(n=>n.type==='input').props.onChange({target:{value:'Cliente'}})
    const search=nodes(render()).find(n=>n.type==='button'&&n.props.onClick?.name==='handleSearchCustomer')
    await search.props.onClick()
    return nodes(render()).find(n=>n.type==='div'&&n.props.onClick&&text(n).includes('Cliente teste'))
  }
  return {render,button,start,calls,routes,alerts,resolve:()=>resolve(),pending:h.pending,
    counters:()=>({resets,closed})}
}
test('Expressa passa o cliente escolhido ao carnê, cria uma vez em cliques simultâneos e oferece retomada',async()=>{
  const h=modalHarness(),choice=await h.start()
  choice.props.onClick();choice.props.onClick()
  assert.equal(h.calls.length,1)
  h.button('Pagamento').props.onClick()
  assert.ok(!h.button('Confirmar Pagamento'))
  nodes(h.render()).find(n=>n.props?.['aria-label']==='Fechar pagamento').props.onClick()
  assert.deepEqual(h.counters(),{resets:0,closed:0})
  h.resolve();await Promise.all(h.pending)
  const finance=nodes(h.render()).find(n=>n.type==='finance')
  assert.equal(finance.props.customer.id,20);assert.equal(finance.props.customer.cpf,customer.cpf)
  assert.equal(finance.props.customerId,20);assert.equal(finance.props.vendaId,42)
  assert.ok(!h.button('Pagamento'))
  h.button('Continuar na Venda Experimental').props.onClick()
  assert.deepEqual(h.routes,['/dashboard/loja/1/vendas/42/experimental'])
  assert.deepEqual(h.counters(),{resets:1,closed:0})
})
test('falha informada na criação não monta carnê sem venda nem perde a cesta',async()=>{
  const h=modalHarness({success:false,message:'synthetic failure'}),choice=await h.start()
  choice.props.onClick();h.resolve();await Promise.all(h.pending)
  assert.ok(!nodes(h.render()).some(n=>n.type==='finance'))
  assert.match(h.alerts[0],/synthetic failure/)
  assert.deepEqual(h.counters(),{resets:0,closed:0})
})
test('fechar depois de criar a venda retoma o mesmo registro e consome a cesta',async()=>{
  const h=modalHarness(),choice=await h.start()
  choice.props.onClick();h.resolve();await Promise.all(h.pending)
  nodes(h.render()).find(n=>n.props?.['aria-label']==='Fechar pagamento').props.onClick()
  assert.deepEqual(h.routes,['/dashboard/loja/1/vendas/42/experimental'])
  assert.deepEqual(h.counters(),{resets:1,closed:0})
})

function financingHarness(cust,renegotiating=false){
  const h=hooks(),payloads=[],alerts=[];let added=0
  const Component=load('src/components/vendas/FinanciamentoBox.tsx',{
    react:h.react,'react-dom':{useFormState:()=>[{success:false,message:''},()=>{}]},
    'react/jsx-runtime':{jsx,jsxs:jsx},
    '@/lib/contexts/StoreModulesContext':{useStoreModules:()=>({installments:true})},
    '@/components/modals/EmployeeAuthModal':{default:'auth'},
    '@/components/modals/UpdateCpfModal':{default:'complete-customer'},
    '@/lib/installment-balance':load('src/lib/installment-balance.ts'),
    '@/lib/pix/installment-charge-presentation':{getPixInstallmentActionLabel:()=> 'Receber',shouldOpenExistingPixInstallmentCharge:()=>false},
    sonner:{toast:{success(){}}},
    '@/lib/actions/vendas.actions':{saveFinanciamentoLoja:async(_,payload)=>{payloads.push(payload);return {success:true,data:{id:77}}},
      renegociarFinanciamentoLoja:async payload=>{payloads.push(payload);return {success:true,message:'Renegociado'}}},
  },{alert:m=>alerts.push(m),confirm:()=>true,window:{open(){}}}).default
  const financing=renegotiating?{id:7,valor_total_financiado:100,financiamento_parcelas:[{
    id:8,numero_parcela:1,valor_parcela:100,valor_pago:0,status:'Pendente',data_vencimento:'2026-12-07'}]}:null
  const render=()=>h.render(()=>Component({financiamento:financing,vendaId:42,customerId:cust.id,customer:cust,
    storeId:1,employeeId:5,valorRestante:100,onFinanceAdded:async()=>{added++},disabled:false,isModal:true}))
  render();if(!renegotiating)h.effects()
  const button=label=>nodes(render()).find(n=>n.type==='button'&&text(n).trim()===label)
  if(renegotiating)button('RENEGOCIAR').props.onClick()
  button('Calcular').props.onClick()
  return {render,button,payloads,alerts,added:()=>added}
}
for(const cust of [customer,{...customer,person_type:'PJ',cpf:null,cnpj:'12345678000199'}])
test(`cliente ${cust.person_type} completo chega ao PIN e envia cliente/venda corretos`,async()=>{
  const h=financingHarness(cust)
  assert.equal(h.button('GERAR CARNÊ').props.disabled,false)
  h.button('GERAR CARNÊ').props.onClick()
  assert.ok(!nodes(h.render()).some(n=>n.type==='complete-customer'))
  nodes(h.render()).find(n=>n.type==='auth').props.onSuccess({id:9,full_name:'Autorizador'})
  await new Promise(resolve=>setTimeout(resolve,0))
  assert.equal(h.payloads.length,1);assert.equal(h.payloads[0].customer_id,20)
  assert.equal(h.payloads[0].venda_id,42);assert.equal(h.payloads[0].employee_id,9)
  assert.equal(h.added(),1)
})
for(const missing of ['cpf','fone_movel'])test(`cliente sem ${missing} abre complemento e depois PIN`,()=>{
  const h=financingHarness({...customer,[missing]:null})
  h.button('GERAR CARNÊ').props.onClick()
  const modal=nodes(h.render()).find(n=>n.type==='complete-customer')
  assert.equal(modal.props.customerId,20)
  assert.ok(!nodes(h.render()).some(n=>n.type==='auth'))
  modal.props.onSuccess()
  assert.ok(nodes(h.render()).some(n=>n.type==='auth'))
  assert.equal(h.payloads.length,0)
})
test('formulário compartilhado envia a observação da renegociação após o PIN',async()=>{
  const h=financingHarness(customer,true)
  const input=nodes(h.render()).find(n=>n.type==='input'&&n.props.placeholder==='Opcional...')
  assert.equal(input.props.maxLength,2000)
  input.props.onChange({target:{value:'Combinado novo vencimento'}})
  h.button('CONFIRMAR RENEGOCIAÇÃO').props.onClick()
  nodes(h.render()).find(n=>n.type==='auth').props.onSuccess({id:9,full_name:'Autorizador'})
  await new Promise(resolve=>setTimeout(resolve,0))
  assert.equal(h.payloads[0].obs,'Combinado novo vencimento')
  assert.equal(h.payloads[0].employee_id,9);assert.equal(h.added(),1)
  assert.deepEqual(h.alerts,[])
})
