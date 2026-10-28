import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fiscalDraftIdentity} from './fiscal-recovery-draft';
test('draft survives reload and retry without changing unrelated URL state',()=>{
  const id='11111111-1111-4111-8111-111111111111';
  const first=fiscalDraftIdentity(new URL('https://fixture.test/fiscal/nfe?operation=return'),()=>id);
  assert.equal(first.changed,true);assert.equal(first.url.searchParams.get('operation'),'return');
  const reloaded=fiscalDraftIdentity(new URL(first.url),()=>{throw Error('must not create a second identity');});
  assert.equal(reloaded.changed,false);assert.equal(reloaded.id,id);
  const next=fiscalDraftIdentity(new URL('https://fixture.test/fiscal/nfe'),()=>'22222222-2222-4222-8222-222222222222');
  assert.notEqual(next.id,id);
});
