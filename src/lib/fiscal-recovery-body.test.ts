import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readRecoveryArtifact} from './fiscal-recovery-body';
test('artifact download caps the real bytes even without Content-Length',async()=>{
  assert.equal(await readRecoveryArtifact(new Response('<fixture/>')),'<fixture/>');
  await assert.rejects(()=>readRecoveryArtifact(new Response('x'.repeat(11)),10),/TOO_LARGE/);
  await assert.rejects(()=>readRecoveryArtifact(new Response('fixture',{headers:{'content-length':'999'}}),10),/DOWNLOAD_FAILED/);
  await assert.rejects(()=>readRecoveryArtifact(new Response('')) ,/EMPTY/);
  await assert.rejects(()=>readRecoveryArtifact(new Response(new Uint8Array([0xff,0xfe]))));
  await assert.rejects(()=>readRecoveryArtifact(new Response('fixture',{status:503})),/DOWNLOAD_FAILED/);
});
