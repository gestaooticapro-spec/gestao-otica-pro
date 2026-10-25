import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {PGlite} from '../../.test-tools/node_modules/@electric-sql/pglite/dist/index.js';
import {createGopFixture,org,actor,cnpj} from './gop-database-fixture.mjs';
import {createOrderDeleteFixture} from './order-delete-fixture.mjs';
test('pilot order deletion is atomic with stock, links, authorization and fiscal origin checks',async()=>{
  const db=new PGlite();
  try{
    await createGopFixture(db);await createOrderDeleteFixture(db);const q=async(sql,args=[])=>(await db.query(sql,args)).rows;
    const remove=async(order=88,sale=77,user=actor)=>(await q('select public.gop_recovery_delete_order_v1($1,$2,1,$3) as r',[sale,order,user]))[0].r;
    await db.exec(`insert into public.service_orders(id,venda_id,source_optical_evaluation_id) values(88,77,99);
      insert into public.optical_evaluations values(99,1,88,clock_timestamp());insert into public.venda_itens_os_links values(1,88);
      insert into public.products(id,estoque_atual) values(1,10);insert into public.product_variants values(1,1,'${org}',1,5);
      insert into public.stock_movements(tenant_id,store_id,product_id,variant_id,tipo,quantidade,motivo,related_os_id,related_venda_id)
        values('${org}',1,1,1,'Saida',2,'Reserva automatica teste',88,77);`);
    await assert.rejects(()=>remove(88,77,randomUUID()),/ACCESS_DENIED/);
    await q('insert into public.post_sales values(1,88)');await assert.rejects(()=>remove(),/POST_SALE/);await q('delete from public.post_sales');
    await q("update public.vendas set is_historical_import=true where id=77");await assert.rejects(()=>remove(),/HISTORICAL/);
    await q("update public.vendas set is_historical_import=false where id=77");
    await q("update public.stock_movements set motivo='Saida definitiva' where related_os_id=88");
    await assert.rejects(()=>remove(),/STOCK_BLOCKED/);
    assert.equal(Number((await q('select estoque_atual from public.products where id=1'))[0].estoque_atual),10);
    await q("update public.stock_movements set motivo='Reserva automatica teste' where related_os_id=88");
    // Failure at the final DELETE must roll back every earlier inventory/link
    // update, not just refuse the final origin mutation.
    await db.exec(`create function public.reject_delete_fixture() returns trigger language plpgsql as $$
      begin raise exception 'SYNTHETIC_FINAL_DELETE_FAILURE';end $$;
      create trigger synthetic_reject_delete before delete on public.service_orders for each row execute function public.reject_delete_fixture();`);
    await assert.rejects(()=>remove(),/FINAL_DELETE_FAILURE/);
    assert.equal((await q('select estoque_atual from public.products where id=1'))[0].estoque_atual,10);
    assert.equal((await q('select estoque_atual from public.product_variants where id=1'))[0].estoque_atual,5);
    assert.equal((await q('select count(*)::int as n from public.stock_movements'))[0].n,1);
    assert.equal((await q('select exported_service_order_id from public.optical_evaluations where id=99'))[0].exported_service_order_id,88);
    await db.exec('drop trigger synthetic_reject_delete on public.service_orders');
    await q('update public.products set store_id=2 where id=1');
    await assert.rejects(()=>remove(),/PRODUCT_MISSING/);
    assert.equal((await q('select estoque_atual from public.product_variants where id=1'))[0].estoque_atual,5);
    assert.equal((await q('select count(*)::int as n from public.stock_movements'))[0].n,1);
    await q('update public.products set store_id=1 where id=1');assert.equal(await remove(),true);
    assert.equal(Number((await q('select estoque_atual from public.products where id=1'))[0].estoque_atual),12);
    assert.equal(Number((await q('select estoque_atual from public.product_variants where id=1'))[0].estoque_atual),7);
    assert.equal((await q('select count(*)::int as n from public.stock_movements where related_os_id is not null'))[0].n,0);
    assert.equal((await q('select count(*)::int as n from public.service_orders where id=88'))[0].n,0);
    await assert.rejects(()=>remove(),/ORDER_NOT_FOUND/);assert.equal(Number((await q('select estoque_atual from public.products where id=1'))[0].estoque_atual),12);
    await q('insert into public.service_orders(id,venda_id) values(89,77)');
    const reserved=(await q('select public.gop_recovery_reserve_v1($1,$2,1,$3,$4,2,$5,77,$6,$7) as r',
      [randomUUID(),org,cnpj,'NFCe','sale:77',actor,'test-client']))[0].r;
    assert.equal(reserved.created,true);await assert.rejects(()=>remove(89),/FISCAL_ORIGIN_OWNED/);
    assert.equal((await q('select count(*)::int as n from public.service_orders where id=89'))[0].n,1);
    await db.exec('set role anon');await assert.rejects(()=>remove(89),/permission denied/);await db.exec('reset role');
  }finally{await db.close();}
});
