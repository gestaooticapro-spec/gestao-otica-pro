import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {PGlite} from '../../.test-tools/node_modules/@electric-sql/pglite/dist/index.js';
import {createGopFixture,org,actor,cnpj} from './gop-database-fixture.mjs';
test('special returns keep source metadata, reserve references and enforce aggregate quantities',async()=>{
  const db=new PGlite();try{
    await createGopFixture(db);const q=async(sql,args=[])=>(await db.query(sql,args)).rows;
    const reserve=async()=>(await q('select public.gop_recovery_reserve_v1($1,$2,1,$3,$4,2,$5,null,$6,$7) as r',
      [randomUUID(),org,cnpj,'NFe','draft:'+randomUUID(),actor,'test-client']))[0].r.attempt;
    const prepare=async(a,marker,key,quantity=1,limits={A:3})=>(await q('select public.gop_recovery_prepare_v1($1,$2,$3,$4) as r',
      [a.requestId,a.version,{ambiente:'producao',[marker]:key,infNFe:{ide:{nNF:a.number,mod:55,tpAmb:1,serie:2,NFref:[{refNFe:key}]},
        emit:{CNPJ:cnpj},det:[{prod:{cProd:'A',qCom:quantity}}]}},{return_limits:limits}]))[0].r;
    for(const marker of ['_shipment_origin_key','_demonstration_origin_key','_transfer_deposit_origin_key']){
      const a=await reserve(),b=await reserve(),key=String(a.number).padStart(44,'1');
      const saved=await prepare(a,marker,key);assert.equal(saved.payload[marker],key);assert.equal(saved.payload._recovery_origin_id,a.originId);
      assert.ok(await prepare(saved,marker,key));await assert.rejects(()=>prepare(b,marker,key),/SPECIAL_REFERENCE_RESERVED/);
      await assert.rejects(()=>prepare(b,marker,'invalid'),/REFERENCE_INVALID/);
    }
    const a=await reserve(),b=await reserve(),c=await reserve(),key='9'.repeat(44);
    await prepare(a,'_entry_access_key',key,2);await assert.rejects(()=>prepare(b,'_entry_access_key',key,2),/QUANTITY_RESERVED/);
    const corrected=await prepare(b,'_entry_access_key',key,1);assert.equal(corrected.number,b.number);
    await assert.rejects(()=>prepare(c,'_entry_access_key',key,1),/QUANTITY_RESERVED/);
    await assert.rejects(()=>prepare(c,'_entry_access_key',key,1,{}),/RETURN_ORIGIN_INVALID/);
  }finally{await db.close();}
});
