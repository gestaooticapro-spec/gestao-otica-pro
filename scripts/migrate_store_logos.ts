import 'dotenv/config'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const BUCKET = 'store-logos'
const MIME_BY_EXTENSION: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
}

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error('Configure NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.')
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function main() {
  const { data: existingBucket } = await supabase.storage.getBucket(BUCKET)
  if (!existingBucket) {
    const { error: bucketError } = await supabase.storage.createBucket(BUCKET, {
      public: true,
      fileSizeLimit: 5 * 1024 * 1024,
      allowedMimeTypes: Object.values(MIME_BY_EXTENSION),
    })
    if (bucketError) throw bucketError
    console.log(`[OK] Bucket ${BUCKET} criado.`)
  } else {
    const { error: bucketError } = await supabase.storage.updateBucket(BUCKET, {
      public: true,
      fileSizeLimit: 5 * 1024 * 1024,
      allowedMimeTypes: Object.values(MIME_BY_EXTENSION),
    })
    if (bucketError) throw bucketError
  }

  const { data: stores, error } = await supabase
    .from('stores')
    .select('id, name, settings')
    .not('settings->>logo', 'is', null)

  if (error) throw error

  let migrated = 0
  let skipped = 0
  let failed = 0

  for (const store of stores || []) {
    const settings = (store.settings || {}) as Record<string, unknown>
    const currentLogo = typeof settings.logo === 'string' ? settings.logo.trim() : ''

    if (!currentLogo) {
      skipped += 1
      continue
    }

    if (/^stores\/\d+\/logo\.(png|jpe?g|webp)$/i.test(currentLogo)) {
      console.log(`[SKIP] Loja ${store.id} (${store.name}): ja migrada (${currentLogo})`)
      skipped += 1
      continue
    }

    if (!/^[a-zA-Z0-9._-]{1,160}$/.test(currentLogo)) {
      console.error(`[ERRO] Loja ${store.id} (${store.name}): referencia invalida (${currentLogo})`)
      failed += 1
      continue
    }

    const extension = path.extname(currentLogo).toLowerCase()
    const contentType = MIME_BY_EXTENSION[extension]
    if (!contentType) {
      console.error(`[ERRO] Loja ${store.id} (${store.name}): formato nao suportado (${currentLogo})`)
      failed += 1
      continue
    }

    try {
      const sourcePath = path.join(process.cwd(), 'public', 'logos', currentLogo)
      const file = await readFile(sourcePath)
      const storagePath = `stores/${store.id}/logo${extension === '.jpeg' ? '.jpg' : extension}`

      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, file, { contentType, upsert: true })
      if (uploadError) throw uploadError

      const { error: updateError } = await supabase
        .from('stores')
        .update({ settings: { ...settings, logo: storagePath } })
        .eq('id', store.id)
      if (updateError) throw updateError

      console.log(`[OK] Loja ${store.id} (${store.name}): ${currentLogo} -> ${storagePath}`)
      migrated += 1
    } catch (migrationError) {
      console.error(`[ERRO] Loja ${store.id} (${store.name}):`, migrationError)
      failed += 1
    }
  }

  console.log(`Resultado: ${migrated} migradas, ${skipped} ignoradas, ${failed} com erro.`)
  if (failed > 0) process.exitCode = 1
}

main().catch((error) => {
  console.error('Falha ao migrar logos:', error)
  process.exitCode = 1
})
