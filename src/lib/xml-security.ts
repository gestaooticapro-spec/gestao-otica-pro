export const MAX_FISCAL_XML_BYTES = 10 * 1024 * 1024

export function assertSafeFiscalXml(xmlContent: string) {
  if (!xmlContent.trim()) {
    throw new Error('O XML esta vazio.')
  }

  const xmlSize = new TextEncoder().encode(xmlContent).byteLength
  if (xmlSize > MAX_FISCAL_XML_BYTES) {
    throw new Error('O XML excede o limite de 10 MB.')
  }

  if (xmlContent.includes('\u0000')) {
    throw new Error('O XML contem caracteres invalidos.')
  }

  if (/<!(?:DOCTYPE|ENTITY)\b/i.test(xmlContent)) {
    throw new Error('O XML contem declaracoes de entidades nao permitidas.')
  }

  const entityReferences = xmlContent.match(
    /&(?:#\d+|#x[\da-f]+|[a-z_][\w.:-]*);/gi,
  ) || []
  const allowedEntities = /^&(amp|lt|gt|quot|apos);$/i

  if (entityReferences.some((entity) => !allowedEntities.test(entity))) {
    throw new Error('O XML contem referencias de entidades nao permitidas.')
  }
}
