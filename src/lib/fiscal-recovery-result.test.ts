import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateRecoveryApiResult,validateRecoveredXml,validateRecoveredCancellationXml} from './fiscal-recovery-result';
import type {GopRecoveryAttempt} from './fiscal-recovery-client';

const attempt:GopRecoveryAttempt={requestId:'11111111-1111-4111-8111-111111111111',
  organizationId:'40b34e90-4c9d-4446-b775-770a3e77d6c0',storeId:1,cnpj:'01997929000108',clientId:'fixture',
  model:'NFCe',series:2,number:123,originId:'sale:77',invoiceId:1,version:1,serverVersion:0,
  state:'submission_unknown',postStartedAt:'2026-10-24T12:00:00Z',payload:null,code:'',origin:'transport'};
const pending={id:`rv1_${attempt.requestId}`,status:'processamento',numero:123,serie:2,chave:null,protocolo:null,
  motivo_status:null,xml_url:null,pdf_url:null,recovery:{schema:'recovery-v1',requestId:attempt.requestId,
    originId:attempt.originId,organizationId:attempt.organizationId,storeId:1,clientId:'fixture',version:2,
    phase:'pending',errorOrigin:'transport',code:'COMMUNICATION_FAILURE',sendState:'possibly_sent'}};

test('canonical pending preserves transport failure; fiscal phase cannot masquerade as pending',()=>{
  assert.equal(validateRecoveryApiResult(attempt,pending).status,'processamento');
  for(const phase of ['authorized','rejected','cancelled','blocked_local','cancel_pending']) {
    assert.throws(()=>validateRecoveryApiResult(attempt,{...pending,recovery:{...pending.recovery,phase}}),/PHASE_INVALID/);
  }
});

test('terminal fiscal rejection requires a conclusive external code',()=>{
  const rejected={...pending,status:'rejeitado',recovery:{...pending.recovery,phase:'rejected',errorOrigin:'sefaz',code:'591'}};
  assert.equal(validateRecoveryApiResult(attempt,rejected).status,'rejeitado');
  for(const code of ['204','217','301','302','303','539','656','999','100','TIMEOUT','']) {
    assert.throws(()=>validateRecoveryApiResult(attempt,{...rejected,recovery:{...rejected.recovery,code}}),/REJECTION_UNCERTAIN/);
  }
  assert.throws(()=>validateRecoveryApiResult(attempt,{...rejected,recovery:{...rejected.recovery,errorOrigin:'central'}}),/REJECTION_UNCERTAIN/);
});

test('local correction is allowed only with positive before-send proof',()=>{
  const blocked={...pending,status:'erro',recovery:{...pending.recovery,phase:'blocked_local',errorOrigin:'central',
    code:'XSD_INVALID',sendState:'not_started_proven'}};
  assert.equal(validateRecoveryApiResult(attempt,blocked).recovery.phase,'blocked_local');
  assert.throws(()=>validateRecoveryApiResult(attempt,{...blocked,recovery:{...blocked.recovery,sendState:'possibly_sent'}}),/INTERNAL_ERROR_UNCERTAIN/);
  assert.throws(()=>validateRecoveryApiResult(attempt,{...blocked,recovery:{...blocked.recovery,errorOrigin:'sefaz'}}),/INTERNAL_ERROR_UNCERTAIN/);
});

test('scope and metadata failures cannot reach result application',()=>{
  for(const delta of [{storeId:2},{originId:'sale:88'},{clientId:'other'},{version:0},{sendState:null},{code:null},
    {code:'x'.repeat(129)},{organizationId:'other'},{requestId:'other'},{phase:'arbitrary'}]) {
    assert.throws(()=>validateRecoveryApiResult(attempt,{...pending,recovery:{...pending.recovery,...delta}}));
  }
});

test('authorization artifact must be complete XML with the same key, issuer, number and protocol digest',()=>{
  const key='41'+'2610'+attempt.cnpj+'65'+'002'+'000000123'+'1'+'01234567'+'0';
  const result=validateRecoveryApiResult(attempt,{...pending,status:'autorizado',chave:key,protocolo:'141260000000001',
    autorizacao:{codigo_status:'100'},recovery:{...pending.recovery,phase:'authorized',errorOrigin:'sefaz',code:'100'}});
  const xml=`<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe"><NFe><infNFe Id="NFe${key}"><ide><tpAmb>1</tpAmb><mod>65</mod><serie>2</serie><nNF>123</nNF></ide><emit><CNPJ>${attempt.cnpj}</CNPJ></emit></infNFe><Signature><SignedInfo><Reference URI="#NFe${key}"><DigestValue>fixture-digest</DigestValue></Reference></SignedInfo></Signature></NFe><protNFe><infProt><chNFe>${key}</chNFe><tpAmb>1</tpAmb><nProt>141260000000001</nProt><cStat>100</cStat><digVal>fixture-digest</digVal></infProt></protNFe></nfeProc>`;
  assert.doesNotThrow(()=>validateRecoveredXml(attempt,result,xml));
  for(const changed of [xml.slice(0,-10),xml.replace('<digVal>fixture-digest','<digVal>other'),
    xml.replace('<tpAmb>1','<tpAmb>2'),xml.replace('<nNF>123','<nNF>124'),
    xml.replace('<nProt>141260000000001','<nProt>141260000000002'),
    '<!DOCTYPE nfeProc [<!ENTITY unsafe "x">]>'+xml]) {
    assert.throws(()=>validateRecoveredXml(attempt,result,changed));
  }
});

test('cancelled result requires linked protocol and matching event artifact; uncertain event is refused',()=>{
  const key='41'+'2610'+attempt.cnpj+'65'+'002'+'000000123'+'1'+'01234567'+'0';
  const body={...pending,status:'cancelado',chave:key,protocolo:'141260000000001',autorizacao:{codigo_status:'100'},
    cancelamento:{codigo_status:'135',numero_protocolo:'141260000000002',estado:'confirmado',tentativa_id:'22222222-2222-4222-8222-222222222222',
      justificativa:'Erro no preenchimento da venda',xml_evento_disponivel:true,xml_evento_url:`https://fiscal.example.test/nfce/rv1_${attempt.requestId}/cancelamento/xml`},
    recovery:{...pending.recovery,phase:'cancelled',errorOrigin:'sefaz',code:'135'}};
  const result=validateRecoveryApiResult(attempt,body);
  const xml=`<procEventoNFe xmlns="http://www.portalfiscal.inf.br/nfe"><evento><infEvento Id="ID110111${key}01"><tpAmb>1</tpAmb><CNPJ>${attempt.cnpj}</CNPJ><cOrgao>41</cOrgao><chNFe>${key}</chNFe><tpEvento>110111</tpEvento><nSeqEvento>1</nSeqEvento><detEvento><descEvento>Cancelamento</descEvento><nProt>141260000000001</nProt><xJust>Erro no preenchimento da venda</xJust></detEvento></infEvento><Signature><SignedInfo><Reference URI="#ID110111${key}01"><DigestValue>fixture</DigestValue></Reference></SignedInfo></Signature></evento><retEvento><infEvento><tpAmb>1</tpAmb><cOrgao>41</cOrgao><chNFe>${key}</chNFe><tpEvento>110111</tpEvento><nSeqEvento>1</nSeqEvento><cStat>135</cStat><nProt>141260000000002</nProt><dhRegEvento>2026-10-24T09:01:00-03:00</dhRegEvento></infEvento></retEvento></procEventoNFe>`;
  assert.doesNotThrow(()=>validateRecoveredCancellationXml(attempt,result,xml));
  for(const changed of [xml.replace('<cStat>135','<cStat>136'),xml.replace('<tpAmb>1','<tpAmb>2'),
    xml.replace('<nSeqEvento>1','<nSeqEvento>2'),xml.replace('<nProt>141260000000002','<nProt>141260000000003'),
    xml.replace('Erro no preenchimento','Outra justificativa no preenchimento'),xml.slice(0,-12)]){
    assert.throws(()=>validateRecoveredCancellationXml(attempt,result,changed));
  }
  for(const delta of [{codigo_status:'136'},{estado:'pendente_confirmacao'},{numero_protocolo:''},{xml_evento_disponivel:false},{tentativa_id:''}]){
    assert.throws(()=>validateRecoveryApiResult(attempt,{...body,cancelamento:{...body.cancelamento,...delta}}));
  }
});
