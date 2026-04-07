import fs from 'fs'

async function main() {
  const filePath = process.argv[2]

  if (!filePath) {
    process.stdout.write(JSON.stringify({ error: 'Arquivo PDF nao informado.' }))
    process.exit(1)
  }

  try {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
    const data = new Uint8Array(fs.readFileSync(filePath))
    const loadingTask = pdfjs.getDocument({
      data,
      disableWorker: true
    })

    try {
      const pdf = await loadingTask.promise
      try {
        const pageTexts = []

        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
          const page = await pdf.getPage(pageNumber)
          try {
            const content = await page.getTextContent()
            const pageText = content.items
              .map((item) => ('str' in item ? item.str : ''))
              .join(' ')
              .trim()

            if (pageText) {
              pageTexts.push(pageText)
            }
          } finally {
            page.cleanup()
          }
        }

        process.stdout.write(JSON.stringify({ text: pageTexts.join('\n') }))
      } finally {
        await pdf.destroy()
      }
    } finally {
      await loadingTask.destroy()
    }
  } catch (error) {
    process.stdout.write(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Erro ao extrair texto do PDF.'
      })
    )
    process.exit(1)
  }
}

await main()
