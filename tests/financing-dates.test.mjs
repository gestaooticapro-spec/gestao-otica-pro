import assert from 'node:assert/strict'
import test from 'node:test'
import {readFileSync} from 'node:fs'
import {spawnSync} from 'node:child_process'
import ts from 'typescript'

const code=ts.transpileModule(readFileSync(new URL('../src/lib/financing-dates.ts',import.meta.url),'utf8'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText
function evaluate(tz,values,method='getSuggestedFirstDueDate'){
  // Processos separados para garantir o fuso no Windows e nao alterar o runner.
  const script=`const module={exports:{}};const exports=module.exports;${code}
    process.stdout.write(JSON.stringify(${JSON.stringify(values)}.map(parts=>module.exports.${method}(new Date(...parts)))));`
  const r=spawnSync(process.execPath,['-e',script],{env:{...process.env,TZ:tz},encoding:'utf8'})
  assert.equal(r.status,0,r.stderr)
  return JSON.parse(r.stdout)
}
for(const tz of ['America/Sao_Paulo','UTC','Pacific/Kiritimati','America/Los_Angeles'])
test(`sugestão mantém o mesmo dia local em todos os horários — ${tz}`,()=>{
  assert.deepEqual(evaluate(tz,[0,3,12,20,21,23].map(hour=>[2026,10,7,hour,59])),Array(6).fill('2026-12-07'))
})
for(const [label,date,expected] of [
  ['janeiro com dia 31',[2026,0,31,23],'2026-02-28'],
  ['ano bissexto',[2028,0,31,23],'2028-02-29'],
  ['mes com 30 dias',[2026,2,31,23],'2026-04-30'],
  ['virada do ano',[2026,11,31,23],'2027-01-31'],
  ['primeiro dia do mes',[2026,10,1,0],'2026-12-01'],
])test(label,()=>assert.deepEqual(evaluate('America/Sao_Paulo',[date]),[expected]))
for(const tz of ['America/Sao_Paulo','UTC','Pacific/Kiritimati','America/Los_Angeles'])
test(`data do recebimento mantém o dia local à noite e na virada do ano — ${tz}`,()=>{
  assert.deepEqual(evaluate(tz,[[2026,10,7,0,1],[2026,10,7,21,1],[2026,10,7,23,59],[2026,11,31,23,59]],'getLocalDateKey'),
    ['2026-11-07','2026-11-07','2026-11-07','2026-12-31'])
})
