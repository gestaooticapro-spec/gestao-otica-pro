import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ownRecoveryOrigin,isOwnRecoveryInvoice,specialRecoveryMetadata,returnQuantityLimits} from './fiscal-recovery-special';
test('only the exact admitted draft can be excluded from its own duplicate guard',()=>{
  const id='11111111-1111-4111-8111-111111111111',origin=ownRecoveryOrigin(id,true);
  assert.equal(origin,`draft:${id}`);assert.equal(ownRecoveryOrigin(id,false),null);assert.equal(ownRecoveryOrigin('arbitrary',true),null);
  assert.equal(isOwnRecoveryInvoice({payload_json:{_recovery_origin_id:origin}},origin),true);
  assert.equal(isOwnRecoveryInvoice({payload_json:{_recovery_origin_id:'other'}},origin),false);
  assert.equal(isOwnRecoveryInvoice({payload_json:null},origin),false);assert.equal(isOwnRecoveryInvoice({},null),false);
});
test('special origin markers and grouped return limits survive pilot preparation',()=>{
  assert.deepEqual(specialRecoveryMetadata({returnEntry:true,shipmentReturn:false,demonstrationReturn:false,depositReturn:false,key:'fixture'}),{_entry_access_key:'fixture'});
  assert.deepEqual(specialRecoveryMetadata({returnEntry:false,shipmentReturn:true,demonstrationReturn:true,depositReturn:false,key:'fixture'}),{_demonstration_origin_key:'fixture'});
  const limits=returnQuantityLimits([{codigo:'A',quantidade:1},{codigo:'A',quantidade:2},{codigo:'B',quantidade:0.5}]);
  assert.equal(limits.A,3);assert.equal(limits.B,0.5);assert.throws(()=>returnQuantityLimits([{codigo:'A',quantidade:NaN}]));
});
