const fs = require('fs')
const path = require('path')
const dotenv = require('dotenv')
const { Client } = require('pg')

dotenv.config({ path: path.join(process.cwd(), '.env.local') })

async function main() {
  const migrationPath = process.argv[2]
  const commit = process.argv.includes('--commit')
  if (!migrationPath) throw new Error('Informe o caminho da migration.')
  if (!process.env.SUPABASE_DB_URL) throw new Error('SUPABASE_DB_URL ausente.')

  const absolutePath = path.resolve(process.cwd(), migrationPath)
  const sql = fs.readFileSync(absolutePath, 'utf8')
  const client = new Client({
    connectionString: process.env.SUPABASE_DB_URL,
    ssl: { rejectUnauthorized: false },
  })

  await client.connect()
  try {
    await client.query('begin')
    await client.query(sql)
    await client.query(commit ? 'commit' : 'rollback')
    console.log(
      commit
        ? `Migration aplicada com commit: ${migrationPath}`
        : `Dry-run concluido com rollback: ${migrationPath}`,
    )
  } catch (error) {
    await client.query('rollback').catch(() => undefined)
    throw error
  } finally {
    await client.end()
  }
}

main().catch((error) => {
  console.error(error.message || error)
  process.exit(1)
})
