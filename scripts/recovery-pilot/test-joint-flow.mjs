/** Two isolated PostgreSQL engines + production adapters + Fastify HTTP.
 * Run central npm run build first; then node --import tsx --test this file.
 * Only synthetic certificates are used; no .env, hosted database, sockets or fiscal service.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {readFile,rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {PGlite} from '../../.test-tools/node_modules/@electric-sql/pglite/dist/index.js';
import {createGopFixture,org,actor,cnpj} from './gop-database-fixture.mjs';
import {createCatalogFixture,insertTestDocument} from '../../../piloto-emissor/scripts/recovery-pilot/database-fixture.mjs';
import {GopRecoveryClient} from '../../src/lib/fiscal-recovery-client.ts';
import {applyRecoveryResult} from '../../src/lib/fiscal-recovery-apply.ts';
import {handleRecoveryEvent} from '../../src/lib/fiscal-recovery-event-handler.ts';
import {cancelGopRecovery} from '../../src/lib/fiscal-recovery-cancellation.ts';
import {associateGopLegacy} from '../../src/lib/fiscal-recovery-legacy.ts';
const require=createRequire(new URL('../../../piloto-emissor/package.json',import.meta.url));

function sqlClient(db){return {async rpc(name,args){
  assert.match(name,/^(fiscal_recovery|gop_recovery)_[a-z0-9_]+$/);
  const keys=Object.keys(args);for(const key of keys)assert.match(key,/^p_[a-z_]+$/);
  try{const rows=await db.query(`select public.${name}(${keys.map((key,i)=>key+' => $'+(i+1)).join(',')}) as result`,keys.map(key=>args[key]));
    return {data:rows.rows[0].result,error:null};}catch(error){
      if(name.includes('legacy'))process.stderr.write(`Synthetic SQL fixture: ${name}: ${error.message}\n`);
      return {data:null,error:{message:error.message}};}
}};}
for (const model of ['NFCe','NFe']) test(`${model}: GOP and central recover lost replies and cancel without duplicate fiscal sends`,async()=>{
  const endpoint=model==='NFe'?'nfe':'nfce';
  const originalCwd=process.cwd(),centralDir=fileURLToPath(new URL('../../../piloto-emissor/',import.meta.url));
  process.chdir(centralDir);
  const central=new PGlite(),gop=new PGlite();let app;
  const statePath=`./storage/joint-recovery-${process.pid}.json`;
  process.env.SUPABASE_URL='';process.env.NEXT_PUBLIC_SUPABASE_URL='';process.env.SUPABASE_SERVICE_ROLE_KEY='';
  process.env.STATE_FILE=statePath;process.env.JWT_SECRET='joint-synthetic';process.env.CERTIFICATE_ENCRYPTION_KEY='joint-synthetic';
  process.env.FISCAL_PRODUCTION_ENABLED='true';process.env.RECOVERY_V1_ENABLED='false';process.env.AUTO_TRANSMIT_HOMOLOGATION='false';
  process.env.NUVEMFISCAL_PROD_URL='https://fiscal.example.test';delete process.env.NUVEMFISCAL_PROD_AUTH_URL;
  const {RecoveryController}=require('./dist/lib/recovery/controller.js');
  const {SupabaseManagedRepository}=require('./dist/lib/recovery/managed-repository.js');
  const {SupabaseCancellationRepository}=require('./dist/lib/recovery/cancellation-repository.js');
  const {CancellationController}=require('./dist/lib/recovery/cancellation-controller.js');
  const {RecoveryWorker}=require('./dist/lib/recovery/worker.js');
  const {SupabaseRecoveryRepository}=require('./dist/lib/recovery/supabase-repository.js');
  const {RecoveryOutboxWorker,createSyncDelivery}=require('./dist/lib/recovery/outbox.js');
  const {drainCancellation}=require('./dist/lib/recovery/cancellation-drain.js');
  const {associateLegacy,drainLegacy}=require('./dist/lib/recovery/legacy-drain.js');
  const {generateAndSignNfeXml}=require('./dist/lib/nfe-xml.js');
  const {validateNfeXml}=require('./dist/lib/xsd-validator.js');
  const {buildSignedCancellationXml}=require('./dist/lib/sefaz-cancellation.js');
  const {publicManagedDocument}=require('./dist/lib/recovery/runtime.js');
  const {configureTransmissionFence,assertTransmissionPermit,assertCancellationTransmissionPermit}=require('./dist/lib/recovery/transmission-fence.js');
  const {buildApp}=require('./dist/app.js');
  const forge=require('node-forge'),{DOMParser}=require('@xmldom/xmldom');
  let sends=0,cancelSends=0,queries=0,artifactFailed=false,losePost=true,loseFiscalReply=true;
  const httpCalls=[];
  const scope={id:randomUUID(),clientId:'joint-test-client',organizationId:org,storeId:1,cnpj,environment:'producao',model,series:2};
  const namespace='http://www.portalfiscal.inf.br/nfe';
  try{
    await createCatalogFixture(central);await createGopFixture(gop);
    for(const name of ['20261024_recovery_v1_PREPARE_ONLY.sql','20261024_recovery_controller_PREPARE_ONLY.sql',
      '20261024_recovery_sync_PREPARE_ONLY.sql','20261024_recovery_manual_PREPARE_ONLY.sql','20261024_recovery_cancellation_PREPARE_ONLY.sql','20261024_recovery_legacy_adoption_PREPARE_ONLY.sql','20261025_recovery_legacy_queue_PREPARE_ONLY.sql'])
      await central.exec(await readFile(new URL('../../../piloto-emissor/migrations/'+name,import.meta.url),'utf8'));
    await central.query(`insert into fiscal_recovery.scopes(id,client_id,organization_id,store_id,cnpj,environment,model,series,enabled)
      values($1,$2,$3,1,$4,'producao',$5,2,true)`,[scope.id,scope.clientId,org,cnpj,model]);
    const centralRpc=sqlClient(central),gopRpc=sqlClient(gop),repository=new SupabaseManagedRepository(centralRpc);
    const cancellationRepository=new SupabaseCancellationRepository(centralRpc);
    const keys=forge.pki.rsa.generateKeyPair(1024),certificate=forge.pki.createCertificate();
    certificate.publicKey=keys.publicKey;certificate.serialNumber='09';certificate.validity.notBefore=new Date(Date.now()-60000);
    certificate.validity.notAfter=new Date(Date.now()+86400000);certificate.setSubject([{name:'commonName',value:'Joint disposable fixture'}]);
    certificate.setIssuer(certificate.subject.attributes);certificate.sign(keys.privateKey,forge.md.sha256.create());
    const privateKeyPem=forge.pki.privateKeyToPem(keys.privateKey),certificatePem=forge.pki.certificateToPem(certificate);
    const status=(record,code='100')=>{
      const key=record.document.chave;
      const doc=new DOMParser().parseFromString(record.document.xmlSigned,'application/xml');
      const digest=doc.getElementsByTagNameNS('http://www.w3.org/2000/09/xmldsig#','DigestValue').item(0).textContent;
      return `<retConsSitNFe xmlns="${namespace}"><tpAmb>1</tpAmb><cStat>${code}</cStat><chNFe>${key}</chNFe>${code==='100'?
        `<protNFe><infProt><tpAmb>1</tpAmb><chNFe>${key}</chNFe><cStat>100</cStat><nProt>141260000000001</nProt><digVal>${digest}</digVal></infProt></protNFe>`:''}</retConsSitNFe>`;
    };
    const controller=new RecoveryController(repository,{
      async prepare(document){const signed=generateAndSignNfeXml(document.payloadOriginal,privateKeyPem,certificatePem,
        {cscId:'1',csc:'synthetic-only',qrCodeBaseUrl:'https://fixture.test/qrcode',consultationUrl:'https://fixture.test/consulta'});
        const xsd=validateNfeXml(signed.signedXml);assert.deepEqual(xsd.errors,[]);assert.equal(xsd.valid,true);
        return {...signed,xsdValid:xsd.valid,xsdErrors:xsd.errors,certificateId:randomUUID()};},
      async consult(document){queries++;return status({document},'217');},
      async authorize(document){assertTransmissionPermit(document.xmlSigned,'producao',model);sends++;
        if(loseFiscalReply)throw Error('fiscal response lost');
        return status({document}).replaceAll('retConsSitNFe','retEnviNFe').replace('<cStat>100</cStat>','<cStat>104</cStat>');}
    });
    const cancellation=new CancellationController(cancellationRepository,{
      async prepare(record,justification){const signed=buildSignedCancellationXml({uf:'PR',ambiente:'producao',cnpj,
        accessKey:record.document.chave,authorizationProtocol:record.document.protocolo,justification,privateKeyPem,certificatePem,
        eventDate:new Date('2026-10-24T12:00:00Z'),batchId:'123456789012345'});
        return {...signed,signedEventSha256:createHash('sha256').update(signed.signedEventXml).digest('hex'),
          batchSha256:createHash('sha256').update(signed.batchXml).digest('hex')};},
      async transmit(record,snapshot){assertCancellationTransmissionPermit(snapshot.batchXml,'producao',model,record.document.chave);
        cancelSends++;throw Error('cancellation response lost');}
    });
    const runtime={controller,scopes:[scope],ready:true,async start(){},async stop(){},
      async findDocument(id){const r=id.startsWith('rv1_')?await repository.get(id.slice(4)):
        (await centralRpc.rpc('fiscal_recovery_legacy_lookup_v1',{p_legacy:id,p_scopes:[scope.id]})).data;
        return r?publicManagedDocument(r):null;},
      async associateLegacy(id,requestId,originId,clientId,requestedModel){
        if(clientId!==scope.clientId||requestedModel!==model)throw Error('scope');
        const result=await associateLegacy({database:centralRpc,scope,legacyId:id,requestId,originId,
          consult:async document=>{queries++;return status({document});},active:()=>true});
        return {document:result.record?publicManagedDocument(result.record):null,check:result.check};
      },
      async cancel(id,intent,client,justification){return publicManagedDocument(await cancellation.cancel(id.slice(4),intent,client,[scope.id],justification));},
      async requestQuery(id,client){const result=await centralRpc.rpc('fiscal_recovery_request_query_v1',
        {p_request:id.slice(4),p_client:client,p_scopes:[scope.id]});if(result.error)throw Error(result.error.message);return result.data;}
    };
    configureTransmissionFence([scope]);app=buildApp({recovery:runtime});await app.ready();
    app.store.issuers.push({id:'synthetic-issuer',cnpj,razaoSocial:'Synthetic',nomeFantasia:'Synthetic',ambiente:'producao',uf:'PR',ie:'123',crt:'1',serieNfe:2,serieNfce:2,ativo:true});
    app.store.certificates.push({id:randomUUID(),issuerId:'synthetic-issuer',cnpj,active:true,encryptedBundle:'not-a-real-certificate'});
    const apiClient=app.store.upsertApiClient({name:'Joint test',clientId:scope.clientId,clientSecret:'synthetic-only',
      allowedScopes:[endpoint],allowedEnvironments:['producao'],allowedCnpjs:[cnpj],active:true});
    const token=app.store.createAccessToken(apiClient.clientId,[endpoint],['producao'],[cnpj],apiClient.updatedAt).token;
    const network=async(url,options={})=>{
      const target=new URL(String(url));assert.equal(target.origin,'https://fiscal.example.test');assert.equal(options.redirect,'error');
      httpCalls.push({method:options.method??'GET',path:target.pathname});
      const headers=Object.fromEntries(new Headers(options.headers));headers.host=target.host;headers['x-forwarded-proto']='https';
      const result=await app.inject({method:options.method??'GET',url:target.pathname+target.search,headers,payload:options.body});
      if(losePost&&options.method==='POST'&&target.pathname===`/${endpoint}`){losePost=false;throw Error('consumer POST response lost');}
      if(artifactFailed&&target.pathname.endsWith('/xml'))return new Response('temporary artifact failure',{status:503});
      return new Response(result.body,{status:result.statusCode,headers:{'content-type':String(result.headers['content-type']??'application/json')}});
    };
    let consumer;
    const apply=async(a,body,eventId=null)=>applyRecoveryResult(gopRpc,a,body,{fetch:network,token:async()=>token},eventId);
    consumer=new GopRecoveryClient({database:gopRpc,clientId:scope.clientId,token:async()=>token,fetch:network,
      apply:(a,body)=>apply(a,body).then(()=>undefined)});
    const lookup=async(a,eventId=null)=>{
      const response=await network(`https://fiscal.example.test/${endpoint}/rv1_${a.requestId}`,{headers:{authorization:`Bearer ${token}`},redirect:'error'});
      if(!response.ok)throw Error('lookup failed');await apply(a,await response.json(),eventId);return (await consumer.get(a.requestId)).serverVersion;
    };
    const reserved=await consumer.reserve({organizationId:org,storeId:1,cnpj,model,series:2,originId:'sale:77',workOrderId:77,actorId:actor});
    const payload={ambiente:'producao',nuvemLocalFiscal:{cscId:'1',csc:'synthetic-only'},infNFe:{versao:'4.00',
      ide:{cUF:41,natOp:'VENDA DE MERCADORIA',mod:model==='NFe'?55:65,serie:2,nNF:reserved.attempt.number,cNF:'01234567',dhEmi:'2026-10-24T09:00:00-03:00',
        tpNF:1,idDest:1,cMunFG:4108809,tpImp:model==='NFe'?1:4,tpEmis:1,tpAmb:1,finNFe:1,indFinal:1,indPres:1,procEmi:0,verProc:'Fixture'},
      emit:{CNPJ:cnpj,xNome:'Synthetic issuer',IE:'9013681047',CRT:1,enderEmit:{UF:'PR',CEP:'85980000',nro:'1',cMun:4108809,
        xLgr:'Synthetic street',xMun:'Guaira',cPais:'1058',xPais:'BRASIL',xBairro:'Centro'}},
      det:[{nItem:1,prod:{NCM:'00000000',CFOP:'5102',cEAN:'SEM GTIN',qCom:1,uCom:'UN',cProd:'1',qTrib:1,uTrib:'UN',vProd:30,
        xProd:'Synthetic product',indTot:1,vUnCom:30,vUnTrib:30,cEANTrib:'SEM GTIN'},imposto:{ICMS:{ICMSSN102:{orig:0,CSOSN:'102'}},
        PIS:{PISOutr:{CST:'99',vBC:0,pPIS:0,vPIS:0}},COFINS:{COFINSOutr:{CST:'99',vBC:0,pCOFINS:0,vCOFINS:0}}}}],
      total:{ICMSTot:{vBC:0,vII:0,vNF:30,vST:0,vFCP:0,vIPI:0,vPIS:0,vSeg:0,vBCST:0,vDesc:0,vICMS:0,vProd:30,vFCPST:0,
        vFrete:0,vOutro:0,vCOFINS:0,vFCPSTRet:0,vIPIDevol:0,vICMSDeson:0}},transp:{modFrete:9},pag:{vTroco:0,detPag:[{tPag:'01',vPag:30}]},
      infRespTec:{CNPJ:cnpj,fone:'44999999999',email:'fixture@example.test',xContato:'Synthetic technician'}}};
    const prepared=await consumer.prepare(reserved.attempt,payload,{valor_total:30,emitente_nome:'Synthetic',data_emissao:payload.infNFe.ide.dhEmi});
    const submitted=await consumer.submit(prepared);assert.equal(submitted.state,'submission_unknown');assert.equal(sends,1);
    const request=submitted.requestId,originalXml=(await repository.get(request)).document.xmlSigned;
    await consumer.submit(submitted);assert.equal(sends,1);
    const recoveryQueue=new SupabaseRecoveryRepository(centralRpc,'joint-worker',[scope.id],true);
    const due=()=>central.query("update fiscal_recovery.requests set next_at=clock_timestamp()-interval '1 second' where request_id=$1",[request]);
    const runWorker=async(code)=>{const worker=new RecoveryWorker({enabled:true,scopes:[scope],repository:recoveryQueue,
      wakeSource:{async subscribe(){return async()=>{};}},consult:async()=>{queries++;return status(await repository.get(request),code);},
      report:()=>{throw Error('unexpected recovery worker failure');}});await worker.start();await worker.stop();};
    await due();await runWorker('217');assert.equal((await repository.get(request)).phase,'pending');assert.equal(sends,1);
    await due();await runWorker('100');assert.equal((await repository.get(request)).phase,'authorized');assert.equal(sends,1);
    assert.equal((await repository.get(request)).document.xmlSigned,originalXml);
    const secret='joint-fixture-secret-32-bytes-minimum';
    const eventFetch=async(url,options)=>handleRecoveryEvent(new Request(String(url),options),{enabled:true,secret,clientId:scope.clientId,
      database:()=>gopRpc,get:id=>consumer.get(id),lookup});
    const delivery=createSyncDelivery('https://gop.example.test/api/fiscal/recovery-v1/events',secret,eventFetch);
    const outbox=()=>new RecoveryOutboxWorker({database:centralRpc,scopeIds:[scope.id],source:{async subscribe(){return async()=>{};}},
      deliver:delivery,report:()=>{throw Error('unexpected outbox error');}});
    artifactFailed=true;let worker=outbox();await worker.start();await worker.stop();
    assert.equal((await consumer.get(request)).state,'submission_unknown');
    assert.equal((await gop.query('select nf_emitida from public.vendas where id=77')).rows[0].nf_emitida,false);
    artifactFailed=false;await central.query("update fiscal_recovery.request_outbox set next_at=clock_timestamp()-interval '1 second' where request_id=$1 and delivered_at is null",[request]);
    worker=outbox();await worker.start();await worker.stop();
    assert.equal((await consumer.get(request)).state,'authorized');assert.equal((await gop.query('select nf_emitida from public.vendas where id=77')).rows[0].nf_emitida,model==='NFCe');
    assert.equal((await gop.query('select count(*)::int as n from fiscal_recovery_gop.effects')).rows[0].n,model==='NFCe'?1:0);
    const authorizedBody=await (await network(`https://fiscal.example.test/${endpoint}/rv1_${request}`,{headers:{authorization:`Bearer ${token}`},redirect:'error'})).json();
    const beforeCancel=await consumer.get(request);
    const cancelOptions={database:gopRpc,attempt:beforeCancel,actorId:actor,justification:'Erro no preenchimento da venda de teste',token:async()=>token,
      fetch:network,apply:body=>apply(beforeCancel,body).then(()=>undefined),lookup:()=>lookup(beforeCancel).then(()=>undefined)};
    await cancelGopRecovery(cancelOptions);await cancelGopRecovery({...cancelOptions,attempt:await consumer.get(request)});
    assert.equal(cancelSends,1);assert.equal((await consumer.get(request)).state,'authorized');
    const centralCancellation=await repository.get(request),intent=await cancellationRepository.get(centralCancellation.document.cancellationAttemptId);
    await due();let cancelQueries=0;
    const cancelDrain=()=>drainCancellation({database:centralRpc,repository:cancellationRepository,scopes:[scope],consult:async record=>{
      cancelQueries++;const event=intent.intent.snapshot.signedEventXml.replace(/^<\?xml[^?]*\?>/,'');
      return `<retConsSitNFe xmlns="${namespace}"><tpAmb>1</tpAmb><chNFe>${record.document.chave}</chNFe><cStat>101</cStat><procEventoNFe>${event}<retEvento><infEvento><tpAmb>1</tpAmb><cOrgao>41</cOrgao><chNFe>${record.document.chave}</chNFe><tpEvento>110111</tpEvento><nSeqEvento>1</nSeqEvento><cStat>135</cStat><nProt>141260000000002</nProt><dhRegEvento>2026-10-24T09:01:00-03:00</dhRegEvento></infEvento></retEvento></procEventoNFe></retConsSitNFe>`;}});
    assert.ok(await cancelDrain()>Date.now()+3000000);assert.equal(cancelQueries,0);
    await central.query("update fiscal_recovery.requests set query_times=array[clock_timestamp()-interval '61 minutes'] where request_id=$1",[request]);
    await due();await cancelDrain();assert.equal(cancelQueries,1);assert.equal((await repository.get(request)).phase,'cancelled');
    worker=outbox();await worker.start();await worker.stop();
    assert.equal((await consumer.get(request)).state,'cancelled');assert.equal(sends,1);assert.equal(cancelSends,1);
    const invoice=(await gop.query('select status,xml_content,cancellation_xml_content,recovery_cancel_phase from public.fiscal_invoices where id=$1',[submitted.invoiceId])).rows[0];
    assert.equal(invoice.status,'cancelled');assert.ok(invoice.xml_content.includes('nfeProc'));assert.ok(invoice.cancellation_xml_content.includes('procEventoNFe'));
    assert.equal(invoice.recovery_cancel_phase,'confirmed');assert.equal((await gop.query('select nf_emitida from public.vendas where id=77')).rows[0].nf_emitida,false);
    assert.equal((await gop.query('select count(*)::int as n from fiscal_recovery_gop.effects')).rows[0].n,model==='NFCe'?2:0);
    await apply(await consumer.get(request),authorizedBody);assert.equal((await consumer.get(request)).state,'cancelled');
    assert.equal((await gop.query('select count(*)::int as n from fiscal_recovery_gop.effects')).rows[0].n,model==='NFCe'?2:0);
    const finalWorker=outbox();await finalWorker.start();await finalWorker.stop();assert.equal(await cancelDrain(),null);
    assert.equal((await recoveryQueue.claim()).nextWakeAt,null);assert.equal(sends,1);assert.equal(cancelSends,1);
    // The ordinary successful path remains a single POST. Its outbox ACK uses
    // the consumer's already-applied version, without another canonical GET.
    loseFiscalReply=false;await gop.query('insert into public.vendas(id,store_id) values(78,1)');
    const normal=await consumer.reserve({organizationId:org,storeId:1,cnpj,model,series:2,originId:'sale:78',workOrderId:78,actorId:actor});
    const normalPayload=structuredClone(payload);normalPayload.infNFe.ide.nNF=normal.attempt.number;
    const normalPrepared=await consumer.prepare(normal.attempt,normalPayload,{valor_total:30,emitente_nome:'Synthetic',data_emissao:normalPayload.infNFe.ide.dhEmi});
    const normalStart=httpCalls.length,normalSubmitted=await consumer.submit(normalPrepared);
    assert.equal(normalSubmitted.state,'authorized');assert.equal(sends,2);assert.equal(cancelSends,1);
    assert.equal((await gop.query('select nf_emitida from public.vendas where id=78')).rows[0].nf_emitida,model==='NFCe');
    const normalPath=`/${endpoint}/rv1_${normalSubmitted.requestId}`;
    assert.equal(httpCalls.slice(normalStart).filter(c=>c.method==='POST').length,1);
    const callsBeforeAck=httpCalls.length;const normalOutbox=outbox();await normalOutbox.start();await normalOutbox.stop();
    assert.equal(httpCalls.length,callsBeforeAck);assert.equal(httpCalls.filter(c=>c.path===normalPath).length,0);
    assert.equal((await recoveryQueue.claim()).nextWakeAt,null);
    // Existing authorized invoices are associated through the real HTTP route
    // and SQL adapters. A lost association reply is safe to repeat with the
    // same saved ID; it never submits a fiscal authorization/cancellation.
    const oldPayload=structuredClone(payload);oldPayload.infNFe.ide.nNF=901;
    const oldSigned=generateAndSignNfeXml(oldPayload,privateKeyPem,certificatePem,
      {cscId:'1',csc:'synthetic-only',qrCodeBaseUrl:'https://fixture.test/qrcode',consultationUrl:'https://fixture.test/consulta'});
    const legacyId='doc_historical_'+model;
    await insertTestDocument(central,legacyId,901,oldSigned.accessKey,'autorizado');
    await central.query('update public.fiscal_documents set document_type=$1,signed_xml=$2,protocol=$3,issuer_cnpj=$5 where id=$4',
      [model,oldSigned.signedXml,'141260000000001',legacyId,cnpj]);
    const legacyDoc={...((await repository.get(normalSubmitted.requestId)).document),id:legacyId,providerLikeId:legacyId,
      numero:901,chave:oldSigned.accessKey,xmlSigned:oldSigned.signedXml,protocolo:'141260000000001'};
    app.store.documents.push(legacyDoc);
    const oldInvoice=(await gop.query(`insert into public.fiscal_invoices(organization_id,store_id,tipo_documento,status,environment,
      direction,numero,serie,emitente_cnpj,nuvemfiscal_uuid,chave_acesso) values($1,1,$2,'authorized','production','outbound','901','2',$3,$4,$5) returning *`,
      [org,model,cnpj,legacyId,oldSigned.accessKey])).rows[0];
    const countersBefore=(await gop.query('select * from public.test_counters order by model')).rows;
    const oldOptions={database:gopRpc,actorId:actor,clientId:scope.clientId,invoice:oldInvoice,token:async()=>token,fetch:network};
    const fiscalBefore={sends,cancelSends,queries};let lostAssociation=true;
    await assert.rejects(()=>associateGopLegacy({...oldOptions,fetch:async(url,options)=>{
      const reply=await network(url,options);if(lostAssociation){lostAssociation=false;throw Error('association response lost');}return reply;
    }}),/response lost/);
    assert.equal(sends,fiscalBefore.sends);assert.equal(cancelSends,fiscalBefore.cancelSends);assert.equal(queries,fiscalBefore.queries+1);
    const adopted=await associateGopLegacy(oldOptions);assert.ok(adopted);
    assert.equal((await repository.get(adopted.requestId)).sendStartedAt,null);
    assert.equal(adopted.postStartedAt,null);assert.equal(adopted.number,901);
    await lookup(adopted);assert.equal((await consumer.get(adopted.requestId)).state,'authorized');
    assert.deepEqual((await gop.query('select * from public.test_counters order by model')).rows,countersBefore);
    assert.equal(queries,fiscalBefore.queries+1);
    const oldAlias=await network(`https://fiscal.example.test/${endpoint}/${legacyId}`,{headers:{authorization:`Bearer ${token}`},redirect:'error'});
    assert.equal(oldAlias.status,200);assert.equal((await oldAlias.json()).id,'rv1_'+adopted.requestId);
    const adoptedCancel={database:gopRpc,attempt:await consumer.get(adopted.requestId),actorId:actor,
      justification:'Conferencia de cancelamento historico sintetico',token:async()=>token,fetch:network,
      apply:body=>apply(adopted,body).then(()=>undefined),lookup:()=>lookup(adopted).then(()=>undefined)};
    await cancelGopRecovery(adoptedCancel);await cancelGopRecovery({...adoptedCancel,attempt:await consumer.get(adopted.requestId)});
    assert.equal(sends,fiscalBefore.sends);assert.equal(cancelSends,fiscalBefore.cancelSends+1);
    assert.equal((await consumer.get(adopted.requestId)).state,'authorized');
    assert.equal((await central.query('select status from public.fiscal_documents where id=$1',[legacyId])).rows[0].status,'autorizado');
    assert.equal((await central.query('select cardinality(query_times) as n from fiscal_recovery.requests where request_id=$1',[adopted.requestId])).rows[0].n,1);
    assert.equal(await drainLegacy({database:centralRpc,scopes:[scope],consult:async()=>{throw Error('no pending query');}}),null);
  }finally{await app?.close();configureTransmissionFence([]);await central.close();await gop.close();await rm(statePath,{force:true});process.chdir(originalCwd);}
});
