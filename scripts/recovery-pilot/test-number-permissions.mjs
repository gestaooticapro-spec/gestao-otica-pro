/** Catalog-reviewed NF-e bodies in disposable SQL. Never reads hosted rows. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '../../.test-tools/node_modules/@electric-sql/pglite/dist/index.js';
import {createGopFixture,org,actor,cnpj} from './gop-database-fixture.mjs';
import {randomUUID} from 'node:crypto';

test('both installed NF-e overloads require service_role; managed reservation keeps atomic scoped counters',async()=>{
  const db=new PGlite();
  try{
    await createGopFixture(db);
    await db.exec(`drop function public.get_next_nfe_number(uuid,integer,text);
      drop function public.get_next_nfe_number(uuid,bigint,integer,text);
      create table public.nfe_sequences(organization_id uuid not null,store_id bigint,serie integer not null,
        environment text not null,last_number integer,updated_at timestamptz,
        unique(organization_id,store_id,serie,environment));
      create function public.get_next_nfe_number(p_org_id uuid,p_serie integer,p_environment text default 'production')
      returns integer language plpgsql security definer as $$ declare v_next integer;begin
        insert into public.nfe_sequences(organization_id,serie,environment,last_number) values(p_org_id,p_serie,p_environment,1)
        on conflict(organization_id,serie,environment) do update set last_number=public.nfe_sequences.last_number+1,updated_at=now()
        returning last_number into v_next;return v_next;end $$;
      create function public.get_next_nfe_number(p_org_id uuid,p_store_id bigint,p_serie integer,p_environment text default 'production')
      returns integer language plpgsql security definer as $$ declare v_next integer;begin
        insert into public.nfe_sequences(organization_id,store_id,serie,environment,last_number)
        values(p_org_id,p_store_id,p_serie,p_environment,1)
        on conflict(organization_id,store_id,serie,environment) do update set last_number=public.nfe_sequences.last_number+1,updated_at=now()
        returning last_number into v_next;return v_next;end $$;
      grant usage on schema public to anon,authenticated,service_role;
      grant execute on function public.get_next_nfe_number(uuid,integer,text) to anon,authenticated,service_role;
      grant execute on function public.get_next_nfe_number(uuid,bigint,integer,text) to anon,authenticated,service_role;
      insert into public.nfe_sequences values('${org}',1,2,'production',51,now());`);
    await db.exec(await readFile(new URL('../../supabase/migrations/20261024200000_recovery_number_permissions_gop.sql',import.meta.url),'utf8'));
    assert.equal((await db.query('select last_number from public.nfe_sequences')).rows[0].last_number,51);
    for(const role of ['anon','authenticated']){
      await db.exec('set role '+role);
      await assert.rejects(()=>db.query('select public.get_next_nfe_number($1,2,$2)',[org,'production']),/permission denied/);
      await assert.rejects(()=>db.query('select public.get_next_nfe_number($1,1::bigint,2,$2)',[org,'production']),/permission denied/);
      await db.exec('reset role');
    }
    await db.exec('set role service_role');
    const result=(await db.query('select public.gop_recovery_reserve_v1($1,$2,1,$3,$4,2,$5,77,$6,$7) as r',
      [randomUUID(),org,cnpj,'NFe','sale:77',actor,'test-client'])).rows[0].r;
    assert.equal(result.attempt.number,52);
    // The catalog has only the store-scoped index. The retained old overload
    // cannot resolve its ON CONFLICT target; do not invent an index to hide it.
    await assert.rejects(()=>db.query('select public.get_next_nfe_number($1,3,$2) as n',[org,'homologation']),
      /no unique or exclusion constraint matching/);
    await db.exec('reset role');
    assert.equal((await db.query("select last_number from public.nfe_sequences where environment='production'")).rows[0].last_number,52);
  }finally{await db.close();}
});
