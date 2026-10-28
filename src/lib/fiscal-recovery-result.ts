import { XMLParser, XMLValidator } from 'fast-xml-parser';
import type {GopRecoveryAttempt} from './fiscal-recovery-client';
import {resolveNuvemLocalEndpoints} from './nuvem-local-endpoints';

export type RecoveryApiResult = {
  id:string;status:string;numero:number;serie:number;chave:string|null;protocolo:string|null;motivo_status:string|null;
  autorizacao?:{codigo_status:string};xml_url:string|null;pdf_url:string|null;
  cancelamento?:{codigo_status:string;numero_protocolo:string;estado:string;tentativa_id:string;
    justificativa:string;xml_evento_url:string;xml_evento_disponivel:boolean};
  recovery:{schema:'recovery-v1';requestId:string;originId:string;version:number;phase:string;organizationId:string;
    storeId:number;clientId:string;errorOrigin:string;code:string;sendState:'not_started_proven'|'possibly_sent'};
};

export function validateRecoveryApiResult(attempt:GopRecoveryAttempt,body:unknown):RecoveryApiResult {
  const r=body as RecoveryApiResult;
  if(!r||typeof r!=='object'||!r.recovery||r.recovery.schema!=='recovery-v1'||r.id!==`rv1_${attempt.requestId}`||
    r.recovery.requestId!==attempt.requestId||r.recovery.originId!==attempt.originId||r.recovery.storeId!==attempt.storeId||
    r.recovery.organizationId!==attempt.organizationId||r.recovery.clientId!==attempt.clientId||
    !Number.isSafeInteger(r.recovery.version)||r.recovery.version<1||r.numero!==attempt.number||r.serie!==attempt.series||
    !['processamento','autorizado','rejeitado','erro','cancelado'].includes(r.status)||
    !['accepted','prepared','send_started','pending','authorized','rejected','blocked_local','manual_review','cancel_started','cancel_pending','cancelled'].includes(r.recovery.phase)||
    !['consumer','central','transport','sefaz'].includes(r.recovery.errorOrigin)||
    !['not_started_proven','possibly_sent'].includes(r.recovery.sendState)||
    typeof r.recovery.code!=='string'||r.recovery.code.length>128) throw new Error('RECOVERY_RESULT_IDENTITY_INVALID');
  const expectedStatus:Record<string,string>={authorized:'autorizado',cancel_started:'autorizado',cancel_pending:'autorizado',
    rejected:'rejeitado',blocked_local:'erro',cancelled:'cancelado'};
  if(r.status!==(expectedStatus[r.recovery.phase]??'processamento'))throw new Error('RECOVERY_RESULT_PHASE_INVALID');
  if(r.chave!==null&&r.chave!==undefined) {
    const key=String(r.chave);
    if(!/^\d{44}$/.test(key)||key.slice(6,20)!==attempt.cnpj||key.slice(20,22)!==(attempt.model==='NFe'?'55':'65')||
      Number(key.slice(22,25))!==attempt.series||Number(key.slice(25,34))!==attempt.number)throw new Error('RECOVERY_RESULT_KEY_INVALID');
  }
  if(r.status==='autorizado'&&(!['authorized','cancel_started','cancel_pending'].includes(r.recovery.phase)||
    !/^\d{15}$/.test(r.protocolo??'')||!['100','150'].includes(String(r.autorizacao?.codigo_status??r.motivo_status))||!r.chave)) {
    throw new Error('RECOVERY_AUTHORIZATION_UNVERIFIED');
  }
  if(r.status==='rejeitado'&&(r.recovery.phase!=='rejected'||r.recovery.errorOrigin!=='sefaz'||
    !/^\d{3}$/.test(r.recovery.code)||Number(r.recovery.code)<200||
    ['204','217','301','302','303','539','656','999'].includes(r.recovery.code)))throw new Error('RECOVERY_REJECTION_UNCERTAIN');
  if(r.status==='erro'&&(r.recovery.phase!=='blocked_local'||r.recovery.sendState!=='not_started_proven'||
    !['consumer','central'].includes(r.recovery.errorOrigin)))throw new Error('RECOVERY_INTERNAL_ERROR_UNCERTAIN');
  if(r.status==='cancelado'&&(r.recovery.phase!=='cancelled'||r.cancelamento?.estado!=='confirmado'||
    !/^\d{15}$/.test(r.protocolo??'')||!['100','150'].includes(String(r.autorizacao?.codigo_status??r.motivo_status))||
    !['135','155'].includes(r.cancelamento?.codigo_status??'')||!/^\d{15}$/.test(r.cancelamento?.numero_protocolo??'')||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(r.cancelamento?.tentativa_id??'')||
    !r.cancelamento?.xml_evento_disponivel||!r.cancelamento?.xml_evento_url||!r.chave))throw new Error('RECOVERY_CANCELLATION_UNVERIFIED');
  return r;
}

export function recoveryArtifactUrl(attempt:GopRecoveryAttempt,url:string,kind:'xml'|'pdf'|'cancelamento/xml'):string {
  const {apiUrl}=resolveNuvemLocalEndpoints('production');
  const base=new URL(apiUrl);const target=new URL(url);
  const path=`${base.pathname.replace(/\/$/,'')}/${attempt.model==='NFe'?'nfe':'nfce'}/rv1_${attempt.requestId}/${kind}`;
  if(target.origin!==base.origin||target.pathname!==path||target.username||target.password||target.hash||
    [...target.searchParams.keys()].some(key=>key!=='token'))throw new Error('RECOVERY_ARTIFACT_DESTINATION_INVALID');
  return target.toString();
}

/** Requires the actual event artifact, fetched from the configured authority
 * with OAuth. A cancellation flag/protocol in JSON alone cannot release origin.
 */
export function validateRecoveredCancellationXml(attempt:GopRecoveryAttempt,result:RecoveryApiResult,xml:string):void {
  if(!xml||xml.length>4_000_000||/<!DOCTYPE|<!ENTITY/i.test(xml)||XMLValidator.validate(xml)!==true)throw new Error('RECOVERY_CANCEL_XML_INVALID');
  const root=new XMLParser({ignoreAttributes:false,attributeNamePrefix:'@_',removeNSPrefix:true,parseTagValue:false}).parse(xml);
  const proc=root.procEventoNFe,event=proc?.evento,info=event?.infEvento,ret=proc?.retEvento,resultInfo=ret?.infEvento;
  const detail=info?.detEvento,ref=event?.Signature?.SignedInfo?.Reference,c=result.cancelamento;
  if(!c||!proc||!event||!info||!ret||!resultInfo||!detail||!ref||
    [proc,event,info,ret,resultInfo,detail,ref,event.Signature,event.Signature?.SignedInfo].some(Array.isArray)||
    info['@_Id']!==`ID110111${result.chave}01`||ref['@_URI']!==`#ID110111${result.chave}01`||!ref.DigestValue||
    String(info.tpAmb)!=='1'||String(info.CNPJ)!==attempt.cnpj||String(info.chNFe)!==result.chave||
    String(info.tpEvento)!=='110111'||String(info.nSeqEvento)!=='1'||String(info.cOrgao)!==result.chave?.slice(0,2)||
    String(detail.nProt)!==result.protocolo||String(detail.xJust)!==c.justificativa||String(detail.descEvento)!=='Cancelamento'||
    String(resultInfo.tpAmb)!=='1'||String(resultInfo.chNFe)!==result.chave||String(resultInfo.tpEvento)!=='110111'||
    String(resultInfo.nSeqEvento)!=='1'||String(resultInfo.cOrgao)!==result.chave?.slice(0,2)||
    String(resultInfo.cStat)!==c.codigo_status||!['135','155'].includes(String(resultInfo.cStat))||
    String(resultInfo.nProt)!==c.numero_protocolo||!Number.isFinite(Date.parse(String(resultInfo.dhRegEvento)))) {
    throw new Error('RECOVERY_CANCEL_XML_IDENTITY_INVALID');
  }
}

/** Bounded XML identity/digest checks in the consumer, in addition to the
 * central controller's authenticated protocol verification. Never trusts a URL
 * supplied by an event or switches to an arbitrary artifact host.
 */
export function validateRecoveredXml(attempt:GopRecoveryAttempt,result:RecoveryApiResult,xml:string):void {
  if(!xml||xml.length>4_000_000||/<!DOCTYPE|<!ENTITY/i.test(xml)||XMLValidator.validate(xml)!==true)throw new Error('RECOVERY_XML_INVALID');
  const root=new XMLParser({ignoreAttributes:false,attributeNamePrefix:'@_',removeNSPrefix:true,parseTagValue:false}).parse(xml);
  const proc=root.nfeProc,nfe=proc?.NFe,info=nfe?.infNFe,protocol=proc?.protNFe?.infProt;
  const ref=nfe?.Signature?.SignedInfo?.Reference;
  if(!proc||Array.isArray(proc)||!info||Array.isArray(nfe)||Array.isArray(info)||Array.isArray(proc.protNFe)||Array.isArray(protocol)||
    !ref||Array.isArray(ref)||info['@_Id']!==`NFe${result.chave}`||ref['@_URI']!==`#NFe${result.chave}`||
    String(info.ide?.tpAmb)!=='1'||String(info.ide?.mod)!==(attempt.model==='NFe'?'55':'65')||
    Number(info.ide?.serie)!==attempt.series||Number(info.ide?.nNF)!==attempt.number||String(info.emit?.CNPJ)!==attempt.cnpj||
    String(protocol?.chNFe)!==result.chave||String(protocol?.tpAmb)!=='1'||String(protocol?.nProt)!==result.protocolo||
    !['100','150'].includes(String(protocol?.cStat))||!ref.DigestValue||String(ref.DigestValue)!==String(protocol?.digVal)) {
    throw new Error('RECOVERY_XML_IDENTITY_INVALID');
  }
}
