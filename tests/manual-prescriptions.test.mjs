import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { PGlite } from '../.test-tools/wallet-validation/node_modules/@electric-sql/pglite/dist/index.js'

const db = new PGlite()
const tenant = '00000000-0000-0000-0000-000000000001'
const otherTenant = '00000000-0000-0000-0000-000000000002'
const migration = readFileSync(new URL('../supabase/migrations/20261119120000_customer_manual_prescriptions.sql', import.meta.url), 'utf8')
const editMigration = readFileSync(new URL('../supabase/migrations/20261119121000_edit_customer_manual_prescriptions.sql', import.meta.url), 'utf8')
const deleteMigration = readFileSync(new URL('../supabase/migrations/20261119122000_delete_available_manual_prescriptions.sql', import.meta.url), 'utf8')

before(async () => {
    await db.exec(`
        create role anon;
        create role authenticated;
        create role service_role bypassrls;
        create schema auth;
        create table auth.users (id uuid primary key);
        create table tenants (id uuid primary key);
        create table stores (id bigint primary key);
        create table customers (id bigint primary key);
        create table dependentes (id bigint primary key);
        create table oftalmologistas (id bigint primary key);
        create table service_orders (
            id bigint primary key, tenant_id uuid, store_id bigint, customer_id bigint, dependente_id bigint,
            oftalmologista_id bigint, obs_os text, medida_dnp_od text,
            receita_longe_od_esferico text, receita_longe_od_cilindrico text, receita_longe_od_eixo text,
            receita_longe_oe_esferico text, receita_longe_oe_cilindrico text, receita_longe_oe_eixo text,
            receita_perto_od_esferico text, receita_perto_od_cilindrico text, receita_perto_od_eixo text,
            receita_perto_oe_esferico text, receita_perto_oe_cilindrico text, receita_perto_oe_eixo text,
            receita_adicao text
        );
        insert into tenants values ('${tenant}'), ('${otherTenant}');
        insert into stores values (1), (2);
        insert into customers values (1), (2);
        insert into dependentes values (10), (11);
    `)
    await db.exec(migration)
    await db.exec(editMigration)
    await db.exec(deleteMigration)
})

after(() => db.close())

async function fixture(dependenteId = null) {
    const { rows: [rx] } = await db.query(`
        insert into customer_manual_prescriptions (
            tenant_id, store_id, customer_id, dependente_id, data_receita, obs_os, medida_dnp_od,
            receita_longe_od_esferico, receita_longe_od_eixo, receita_longe_oe_esferico, receita_perto_oe_cilindrico, receita_adicao
        ) values ($1, 1, 1, $2, '2026-11-10', 'avulsa', '31', '-4,00', '175º', '-2,00', '-1,00', '+2,00')
        returning id
    `, [tenant, dependenteId])
    await db.query(`
        insert into service_orders (
            id, tenant_id, store_id, customer_id, dependente_id, data_receita, oftalmologista_id, obs_os, medida_dnp_od,
            receita_longe_od_esferico, receita_longe_od_eixo, receita_longe_oe_esferico, receita_perto_oe_cilindrico, receita_adicao
        ) values ($1, $2, 1, 1, $3, '2026-11-19', 7, 'obs da OS', '32', '-4.0', '175', '-2,00', '-1,00', '2')
    `, [rx.id, tenant, dependenteId])
    return rx.id
}

async function consume(id, storeId = 1, tenantId = tenant) {
    const { rows: [result] } = await db.query(
        'select consume_manual_prescription($1, $1, $2, $3) as consumed', [id, storeId, tenantId],
    )
    return result.consumed
}

test('graus equivalentes consomem uma vez, mesmo com data, médico, DNP e observação diferentes', async () => {
    const id = await fixture()
    assert.equal(await consume(id), true)
    assert.equal(await consume(id), false)
    const { rows: [rx] } = await db.query('select used_service_order_id, used_at from customer_manual_prescriptions where id = $1', [id])
    assert.equal(rx.used_service_order_id, id)
    assert.ok(rx.used_at)
})

test('alterar um campo de perto, a adição ou um campo que estava em branco preserva o avulso', async () => {
    const id = await fixture(10)
    await db.query("update service_orders set receita_perto_oe_cilindrico = '-1,25' where id = $1", [id])
    assert.equal(await consume(id), false)
    await db.query("update service_orders set receita_perto_oe_cilindrico = '-1,00', receita_adicao = '+2,25' where id = $1", [id])
    assert.equal(await consume(id), false)
    await db.query("update service_orders set receita_adicao = '+2,00', receita_longe_oe_cilindrico = '+0,00' where id = $1", [id])
    assert.equal(await consume(id), false)
    await db.query("update service_orders set receita_longe_oe_cilindrico = '-' where id = $1", [id])
    assert.equal(await consume(id), true)
})

test('o grau pertence à pessoa, ao cliente, à loja e à empresa da OS', async () => {
    const id = await fixture(10)
    await db.query('update service_orders set dependente_id = 11 where id = $1', [id])
    assert.equal(await consume(id), false)
    await db.query('update service_orders set dependente_id = null where id = $1', [id])
    assert.equal(await consume(id), false)
    await db.query('update service_orders set dependente_id = 10, customer_id = 2 where id = $1', [id])
    assert.equal(await consume(id), false)
    await db.query('update service_orders set customer_id = 1 where id = $1', [id])
    assert.equal(await consume(id, 2), false)
    assert.equal(await consume(id, 1, otherTenant), false)
    assert.equal(await consume(id), true)
})

test('permissões reservam criação, consulta e consumo ao servidor', async () => {
    const { rows: [grants] } = await db.query(`
        select has_table_privilege('authenticated', 'customer_manual_prescriptions', 'select') as read_direct,
               has_function_privilege('authenticated', 'consume_manual_prescription(bigint,bigint,bigint,uuid)', 'execute') as use_direct,
               has_table_privilege('service_role', 'customer_manual_prescriptions', 'insert') as server_insert,
               has_function_privilege('service_role', 'consume_manual_prescription(bigint,bigint,bigint,uuid)', 'execute') as server_use
    `)
    assert.deepEqual(grants, { read_direct: false, use_direct: false, server_insert: true, server_use: true })
})

test('o servidor atualiza o registro avulso sem poder alterar o vínculo de uso', async () => {
    const id = await fixture()
    await db.exec('set role service_role')
    try {
        const result = await db.query("update customer_manual_prescriptions set obs_os = 'corrigida' where id = $1 returning id", [id])
        assert.equal(result.rows[0].id, id)
        await assert.rejects(db.query('update customer_manual_prescriptions set used_at = now() where id = $1', [id]), { code: '42501' })
    } finally {
        await db.exec('reset role')
    }
    const { rows: [permissions] } = await db.query(`
        select has_column_privilege('authenticated', 'customer_manual_prescriptions', 'obs_os', 'update') as direct_edit
    `)
    assert.equal(permissions.direct_edit, false)
    assert.equal(await consume(id), true)
})

test('o esférico de perto soma valores com sinal e exige os dois campos preenchidos', () => {
    const source = readFileSync(new URL('../src/lib/manual-prescriptions.ts', import.meta.url), 'utf8')
    const result = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } })
    const exports = {}
    runInNewContext(result.outputText, { exports })
    const { calculateNearSphere } = exports
    assert.equal(calculateNearSphere('-2,00', '+1,50'), '-0,50')
    assert.equal(calculateNearSphere('-0,50', '+1,50'), '+1,00')
    assert.equal(calculateNearSphere('-0,75', '+0,75'), '+0,00')
    assert.equal(calculateNearSphere('+0,00', '+0,25'), '+0,25')
    assert.equal(calculateNearSphere('', '+1,50'), null)
    assert.equal(calculateNearSphere('-2,00', '+'), null)
})

test('a exclusão remove fisicamente apenas o avulso disponível do cliente na loja autorizada', async () => {
    const id = await fixture(10)
    const usedId = await fixture()
    assert.equal(await consume(usedId), true)
    const deleteAvailable = async (prescriptionId, storeId = 1, tenantId = tenant, customerId = 1) => {
        const { rows: [result] } = await db.query(
            'select delete_available_manual_prescription($1, $2, $3, $4) as deleted',
            [prescriptionId, storeId, tenantId, customerId],
        )
        return result.deleted
    }
    await db.exec('set role authenticated')
    try {
        await assert.rejects(deleteAvailable(id), { code: '42501' })
    } finally {
        await db.exec('reset role')
    }
    await db.exec('set role service_role')
    try {
        assert.equal(await deleteAvailable(usedId), false)
        assert.equal(await deleteAvailable(id, 2), false)
        assert.equal(await deleteAvailable(id, 1, otherTenant), false)
        assert.equal(await deleteAvailable(id, 1, tenant, 2), false)
        assert.equal(await deleteAvailable(id), true)
        assert.equal(await deleteAvailable(id), false)
        const { rows } = await db.query('select id from customer_manual_prescriptions where id in ($1, $2)', [id, usedId])
        assert.deepEqual(rows.map(row => row.id), [usedId])
    } finally {
        await db.exec('reset role')
    }
    const { rows: [os] } = await db.query('select id from service_orders where id = $1', [id])
    assert.equal(os.id, id)
})
