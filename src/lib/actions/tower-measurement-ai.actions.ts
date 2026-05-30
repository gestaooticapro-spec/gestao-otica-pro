'use server'

import { GoogleGenerativeAI } from '@google/generative-ai'

export type TowerAiPointKey =
  | 'calibA'
  | 'calibB'
  | 'pupilR'
  | 'pupilL'
  | 'bridgeR'
  | 'bridgeL'
  | 'mountR'
  | 'mountL'
  | 'lensLeft'
  | 'lensRight'
  | 'lensTop'
  | 'lensBottom'
  | 'diagA'
  | 'diagB'
  | 'palpebraR'
  | 'palpebraL'

export type TowerAiPoint = { x: number; y: number }
export type TowerAiHandles = Record<TowerAiPointKey, TowerAiPoint>
export type TowerAiMeasurementResult = {
  success: boolean
  handles: Partial<TowerAiHandles> | null
  provider?: string
  model?: string
  error?: string
}

type GeminiResponseLike = {
  text?: () => string
  candidates?: Array<{ content?: { parts?: Array<{ text?: unknown }> } }>
}
type OpenAIResponseLike = {
  output_text?: string
  output?: Array<{ content?: Array<{ type?: string; text?: string }> }>
  usage?: {
    input_tokens?: number
    output_tokens?: number
    total_tokens?: number
  }
  error?: { message?: string; type?: string; code?: string }
}
type AiLensGeometry = {
  points?: Partial<TowerAiHandles>
  rightLensContour?: TowerAiPoint[]
  leftLensContour?: TowerAiPoint[]
  rightLensBox?: { x: number; y: number; width: number; height: number }
  leftLensBox?: { x: number; y: number; width: number; height: number }
  pupils?: { right?: TowerAiPoint; left?: TowerAiPoint }
  bridge?: { right?: TowerAiPoint; left?: TowerAiPoint }
}

const GEMINI_KEYS = [
  process.env.GEMINI_SECRET_KEY_1,
  process.env.GEMINI_SECRET_KEY_2,
  process.env.GEMINI_SECRET_KEY_3,
  process.env.GEMINI_SECRET_KEY_4,
  process.env.GEMINI_SECRET_KEY_5,
  process.env.GOOGLE_API_KEY,
].filter(Boolean) as string[]

const GEMINI_MODEL = 'gemini-2.5-flash'
const OPENAI_API_KEY = process.env.OPENAI_API_KEY
const OPENAI_VISION_MODEL = process.env.OPENAI_VISION_MODEL || 'gpt-4.1-mini'

export async function locateTowerMeasurementPointsWithAiAction(params: {
  dataUrl: string
  width: number
  height: number
  existingHandles?: Partial<TowerAiHandles>
  crop?: { x: number; y: number; width: number; height: number }
}): Promise<TowerAiMeasurementResult> {
  if (!params.dataUrl.startsWith('data:image/')) {
    return { success: false, handles: null, error: 'Imagem invalida' }
  }

  const prompt = buildPrompt(params.width, params.height, params.existingHandles, params.crop)
  const image = parseDataUrl(params.dataUrl)
  if (!image) return { success: false, handles: null, error: 'Nao foi possivel ler a imagem' }

  for (let index = 0; index < GEMINI_KEYS.length; index += 1) {
    const keyLabel = index < 5 ? `GEMINI_SECRET_KEY_${index + 1}` : 'GOOGLE_API_KEY'
    try {
      const genAI = new GoogleGenerativeAI(GEMINI_KEYS[index])
      const model = genAI.getGenerativeModel({
        model: GEMINI_MODEL,
        generationConfig: {
          temperature: 0.05,
          responseMimeType: 'application/json',
        },
      })
      const result = await model.generateContent([
        prompt,
        {
          inlineData: {
            mimeType: image.mimeType,
            data: image.base64,
          },
        },
      ])
      const usage = result.response.usageMetadata
      console.log(
        `[IA Medidas Torre] Gemini ok ${keyLabel} | modelo: ${GEMINI_MODEL} | entrada: ${usage?.promptTokenCount ?? '?'} tokens | saida: ${usage?.candidatesTokenCount ?? '?'} tokens | total: ${usage?.totalTokenCount ?? '?'} tokens`,
      )

      const json = extractJsonObject(extractGeminiText(result.response))
      if (!hasReliableDualLensContours(json, params.width, params.height)) {
        throw new Error('JSON sem contorno duplo confiavel')
      }
      const handles = normalizeAiHandles(json, params.width, params.height)
      if (!hasReliableDerivedHandles(handles, json, params.width, params.height)) {
        throw new Error('JSON sem medidas derivadas confiaveis')
      }
      if (handles) {
        logAiHandles('Gemini', GEMINI_MODEL, handles)
        return { success: true, handles, provider: keyLabel, model: GEMINI_MODEL }
      }
      throw new Error('JSON sem contorno valido')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.warn(`[IA Medidas Torre] Gemini falhou ${keyLabel} | modelo: ${GEMINI_MODEL} | erro: ${message}`)
      if (
        message.includes('contorno valido') ||
        message.includes('contorno duplo confiavel') ||
        message.includes('medidas derivadas confiaveis')
      ) {
        console.warn('[IA Medidas Torre] Gemini descartado por geometria fraca; tentando OpenAI')
        break
      }
    }
  }

  if (!OPENAI_API_KEY) {
    return { success: false, handles: null, error: 'Gemini falhou e OPENAI_API_KEY nao esta configurada' }
  }

  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: OPENAI_VISION_MODEL,
        temperature: 0.05,
        input: [
          {
            role: 'user',
            content: [
              { type: 'input_text', text: prompt },
              { type: 'input_image', image_url: params.dataUrl, detail: 'high' },
            ],
          },
        ],
      }),
    })
    const data = (await response.json()) as OpenAIResponseLike
    console.log(
      `[IA Medidas Torre] OpenAI ${response.ok ? 'ok' : 'falhou'} | modelo: ${OPENAI_VISION_MODEL} | entrada: ${data.usage?.input_tokens ?? '?'} tokens | saida: ${data.usage?.output_tokens ?? '?'} tokens | total: ${data.usage?.total_tokens ?? '?'} tokens`,
    )

    if (!response.ok) throw new Error(data.error?.message || `OpenAI falhou com status ${response.status}`)
    const handles = normalizeAiHandles(extractJsonObject(extractOpenAIText(data)), params.width, params.height)
    if (handles) {
      logAiHandles('OpenAI', OPENAI_VISION_MODEL, handles)
      return { success: true, handles, provider: 'OPENAI_API_KEY', model: OPENAI_VISION_MODEL }
    }
    throw new Error('OpenAI retornou JSON sem pontos validos')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[IA Medidas Torre] OpenAI erro | modelo: ${OPENAI_VISION_MODEL} | ${message}`)
    return { success: false, handles: null, error: message }
  }
}

function buildPrompt(
  width: number,
  height: number,
  existingHandles?: Partial<TowerAiHandles>,
  crop?: { x: number; y: number; width: number; height: number },
) {
  return `
Voce e um especialista em medidas opticas olhando uma foto de uma pessoa usando oculos.

Tarefa:
Marque pontos 2D da armacao em coordenadas de pixel da imagem enviada.
Imagem enviada: largura ${width}px, altura ${height}px. Origem (0,0) no canto superior esquerdo.
${crop ? `Observacao: esta imagem e um recorte da foto original. O recorte comeca em x=${crop.x}, y=${crop.y} na foto original e tem ${crop.width}x${crop.height}px. Responda coordenadas do recorte, nao da foto original.` : ''}

IMPORTANTE:
- Responda todas as coordenadas normalizadas de 0 a 1, relativas a largura/altura da imagem enviada.
- Nao responda pixels.
- Use 0.0 no canto superior/esquerdo e 1.0 no canto inferior/direito.

Use a perspectiva de quem olha a foto:
- A lente direita do cliente aparece no lado esquerdo da imagem. E nela que A, B e D principais devem ser calculados.
- rightLensContour: exatamente 12 pontos seguindo o contorno externo visivel da lente direita do cliente, em sentido horario.
- leftLensContour: exatamente 12 pontos seguindo o contorno externo visivel da lente esquerda do cliente, em sentido horario.
- Cada ponto de rightLensContour deve cair sobre o aro preto/escuro ou sobre a borda externa real da lente, nao no reflexo azul e nao no olho.
- Cada ponto de leftLensContour tambem deve cair sobre o aro preto/escuro ou borda externa real da lente.
- Distribua os 12 pontos pelo aro: canto superior externo, topo, topo interno, ponte interna, lateral interna, canto inferior interno, base, base externa, lateral externa e pontos intermediarios da curva.
- rightLensBox: caixa aproximada que envolve a lente direita do cliente.
- leftLensBox: caixa aproximada que envolve a lente esquerda do cliente.
- pupilR/pupilL: centros das pupilas/iris do cliente.
- bridge.right/bridge.left: pontos internos do aro na ponte, onde as lentes encontram a ponte.

Prioridade absoluta:
1. Os pontos de aro devem ficar sobre a borda preta/externa da armação.
2. A linha A deve representar a maior largura util da lente direita.
3. A linha B deve representar a altura util da lente direita.
4. A diagonal D deve ir de canto de aro a canto de aro. Nunca atravesse a pupila como se fosse ponto final.
5. Nao responda uma caixa retangular generica se o aro for curvo/trapezoidal. O contorno precisa seguir a forma visivel da armação.

Responda somente JSON valido, sem markdown, neste formato:
{
  "rightLensContour": [
    {"x": 0.0, "y": 0.0}
  ],
  "leftLensContour": [
    {"x": 0.0, "y": 0.0}
  ],
  "rightLensBox": {"x": 0.0, "y": 0.0, "width": 0.0, "height": 0.0},
  "leftLensBox": {"x": 0.0, "y": 0.0, "width": 0.0, "height": 0.0},
  "pupils": {
    "right": {"x": 0.0, "y": 0.0},
    "left": {"x": 0.0, "y": 0.0}
  },
  "bridge": {
    "right": {"x": 0.0, "y": 0.0},
    "left": {"x": 0.0, "y": 0.0}
  },
  "points": {
    "calibA": {"x": 0.0, "y": 0.0},
    "calibB": {"x": 0.0, "y": 0.0},
    "mountR": {"x": 0.0, "y": 0.0},
    "mountL": {"x": 0.0, "y": 0.0},
    "palpebraR": {"x": 0.0, "y": 0.0},
    "palpebraL": {"x": 0.0, "y": 0.0}
  }
}

Pontos atuais, apenas como referencia aproximada para nao trocar OD/OE:
${JSON.stringify(existingHandles ?? {}, null, 2)}
`.trim()
}

function parseDataUrl(dataUrl: string) {
  if (!dataUrl.startsWith('data:image/')) return null
  const separator = ';base64,'
  const separatorIndex = dataUrl.indexOf(separator)
  if (separatorIndex < 0) return null

  const mimeType = dataUrl.slice('data:'.length, separatorIndex)
  const base64 = dataUrl.slice(separatorIndex + separator.length)
  if (!mimeType || !base64) return null
  return { mimeType, base64 }
}

function normalizeAiHandles(raw: Record<string, unknown> | null, width: number, height: number): Partial<TowerAiHandles> | null {
  if (!raw) return null
  const geometry = normalizeAiGeometry(raw, width, height)
  const handles: Partial<TowerAiHandles> = { ...geometry.points }

  if (geometry.pupils?.right) handles.pupilR = geometry.pupils.right
  if (geometry.pupils?.left) handles.pupilL = geometry.pupils.left
  if (geometry.bridge?.right) handles.bridgeR = geometry.bridge.right
  if (geometry.bridge?.left) handles.bridgeL = geometry.bridge.left

  const contour = geometry.rightLensContour
  if (!contour || contour.length < 8) return null
  const box = contourToBox(contour) ?? geometry.rightLensBox
  if (box) {
    const centerY = box.y + box.height / 2
    const centerX = box.x + box.width / 2
    const lensLeft = leftmostAtBand(contour, centerY, box.height * 0.26)
    const lensRight = rightmostAtBand(contour, centerY, box.height * 0.26)
    const lensTop = topmostAtBand(contour, centerX, box.width * 0.3)
    const lensBottom = bottommostAtBand(contour, centerX, box.width * 0.3)
    handles.lensLeft = { x: lensLeft?.x ?? box.x, y: centerY }
    handles.lensRight = { x: lensRight?.x ?? box.x + box.width, y: centerY }
    handles.lensTop = { x: centerX, y: lensTop?.y ?? box.y }
    handles.lensBottom = { x: centerX, y: lensBottom?.y ?? box.y + box.height }
    handles.diagA = topLeftCorner(contour) ?? { x: box.x, y: box.y }
    handles.diagB = bottomRightCorner(contour) ?? { x: box.x + box.width, y: box.y + box.height }
  }

  return Object.keys(handles).length >= 8 ? handles : null
}

function hasReliableDualLensContours(raw: Record<string, unknown> | null, width: number, height: number) {
  if (!raw) return false
  const rightContour = normalizePointArray(raw.rightLensContour, width, height)
  const leftContour = normalizePointArray(raw.leftLensContour, width, height)
  const rightBox = contourToBox(rightContour)
  const leftBox = contourToBox(leftContour)
  if (!rightContour || !leftContour || !rightBox || !leftBox) return false

  const rightUniqueX = countDistinctRoundedCoordinates(rightContour, 'x')
  const rightUniqueY = countDistinctRoundedCoordinates(rightContour, 'y')
  const leftUniqueX = countDistinctRoundedCoordinates(leftContour, 'x')
  const leftUniqueY = countDistinctRoundedCoordinates(leftContour, 'y')
  if (rightUniqueX < 5 || rightUniqueY < 5 || leftUniqueX < 5 || leftUniqueY < 5) return false

  // Em um recorte com as duas lentes, a lente direita do cliente fica no lado esquerdo.
  // Se o "contorno" invade o centro/olho oposto demais, normalmente e caixa generica.
  if (rightBox.x + rightBox.width > width * 0.68) return false
  if (leftBox.x < width * 0.32) return false
  if (rightBox.width > width * 0.58 || leftBox.width > width * 0.58) return false
  if (rightBox.height > height * 0.78 || leftBox.height > height * 0.78) return false

  return true
}

function hasReliableDerivedHandles(
  handles: Partial<TowerAiHandles> | null,
  raw: Record<string, unknown> | null,
  width: number,
  height: number,
) {
  if (!handles || !raw) return false
  const rightContour = normalizePointArray(raw.rightLensContour, width, height)
  const rightBox = contourToBox(rightContour)
  if (!rightContour || !rightBox) return false

  const requiredKeys: TowerAiPointKey[] = ['lensLeft', 'lensRight', 'lensTop', 'lensBottom', 'diagA', 'diagB', 'pupilR', 'pupilL']
  if (requiredKeys.some((key) => !handles[key])) return false

  const lensLeft = handles.lensLeft!
  const lensRight = handles.lensRight!
  const lensTop = handles.lensTop!
  const lensBottom = handles.lensBottom!
  const diagA = handles.diagA!
  const diagB = handles.diagB!
  const pupilR = handles.pupilR!

  const horizontalTilt = Math.abs(lensLeft.y - lensRight.y)
  const verticalTilt = Math.abs(lensTop.x - lensBottom.x)
  const measuredWidth = Math.abs(lensRight.x - lensLeft.x)
  const measuredHeight = Math.abs(lensBottom.y - lensTop.y)
  if (horizontalTilt > rightBox.height * 0.12) return false
  if (verticalTilt > rightBox.width * 0.18) return false
  if (measuredWidth < rightBox.width * 0.82) return false
  if (measuredHeight < rightBox.height * 0.72) return false

  const leftMargin = Math.abs(lensLeft.x - rightBox.x)
  const rightMargin = Math.abs(lensRight.x - (rightBox.x + rightBox.width))
  const topMargin = Math.abs(lensTop.y - rightBox.y)
  const bottomMargin = Math.abs(lensBottom.y - (rightBox.y + rightBox.height))
  if (leftMargin > rightBox.width * 0.16 || rightMargin > rightBox.width * 0.16) return false
  if (topMargin > rightBox.height * 0.2 || bottomMargin > rightBox.height * 0.2) return false

  if (Math.abs(diagA.x - rightBox.x) > rightBox.width * 0.26) return false
  if (Math.abs(diagA.y - rightBox.y) > rightBox.height * 0.3) return false
  if (Math.abs(diagB.x - (rightBox.x + rightBox.width)) > rightBox.width * 0.26) return false
  if (Math.abs(diagB.y - (rightBox.y + rightBox.height)) > rightBox.height * 0.3) return false

  if (pupilR.x < rightBox.x || pupilR.x > rightBox.x + rightBox.width) return false
  if (pupilR.y < rightBox.y || pupilR.y > rightBox.y + rightBox.height) return false

  return true
}

function normalizeAiGeometry(raw: Record<string, unknown>, width: number, height: number): AiLensGeometry {
  const pointsSource =
    raw.points && typeof raw.points === 'object' && !Array.isArray(raw.points)
      ? (raw.points as Record<string, unknown>)
      : {}

  return {
    points: normalizePointMap(pointsSource, width, height),
    rightLensContour: normalizePointArray(raw.rightLensContour, width, height),
    leftLensContour: normalizePointArray(raw.leftLensContour, width, height),
    rightLensBox: normalizeBox(raw.rightLensBox, width, height),
    leftLensBox: normalizeBox(raw.leftLensBox, width, height),
    pupils:
      raw.pupils && typeof raw.pupils === 'object' && !Array.isArray(raw.pupils)
        ? {
            right: normalizePoint((raw.pupils as Record<string, unknown>).right, width, height),
            left: normalizePoint((raw.pupils as Record<string, unknown>).left, width, height),
          }
        : undefined,
    bridge:
      raw.bridge && typeof raw.bridge === 'object' && !Array.isArray(raw.bridge)
        ? {
            right: normalizePoint((raw.bridge as Record<string, unknown>).right, width, height),
            left: normalizePoint((raw.bridge as Record<string, unknown>).left, width, height),
          }
        : undefined,
  }
}

function normalizePointMap(source: Record<string, unknown>, width: number, height: number) {
  const keys: TowerAiPointKey[] = ['calibA', 'calibB', 'mountR', 'mountL', 'palpebraR', 'palpebraL']
  const handles: Partial<TowerAiHandles> = {}
  for (const key of keys) {
    const point = normalizePoint(source[key], width, height)
    if (point) handles[key] = point
  }
  return handles
}

function normalizePoint(value: unknown, width: number, height: number): TowerAiPoint | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const x = Number((value as { x?: unknown }).x)
  const y = Number((value as { y?: unknown }).y)
  if (!Number.isFinite(x) || !Number.isFinite(y)) return undefined
  const normalized = Math.abs(x) <= 1.5 && Math.abs(y) <= 1.5
  return {
    x: clamp(normalized ? x * width : x, 0, width),
    y: clamp(normalized ? y * height : y, 0, height),
  }
}

function normalizePointArray(value: unknown, width: number, height: number) {
  if (!Array.isArray(value)) return undefined
  const points = value
    .map((item) => normalizePoint(item, width, height))
    .filter((item): item is TowerAiPoint => Boolean(item))
  return points.length >= 8 ? points : undefined
}

function normalizeBox(value: unknown, width: number, height: number) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const raw = value as { x?: unknown; y?: unknown; width?: unknown; height?: unknown }
  const x = Number(raw.x)
  const y = Number(raw.y)
  const boxWidth = Number(raw.width)
  const boxHeight = Number(raw.height)
  if (![x, y, boxWidth, boxHeight].every(Number.isFinite)) return undefined
  const normalized = Math.max(Math.abs(x), Math.abs(y), Math.abs(boxWidth), Math.abs(boxHeight)) <= 1.5
  return {
    x: clamp(normalized ? x * width : x, 0, width),
    y: clamp(normalized ? y * height : y, 0, height),
    width: clamp(normalized ? boxWidth * width : boxWidth, 1, width),
    height: clamp(normalized ? boxHeight * height : boxHeight, 1, height),
  }
}

function contourToBox(contour: TowerAiPoint[] | undefined) {
  if (!contour?.length) return undefined
  const minX = Math.min(...contour.map((point) => point.x))
  const maxX = Math.max(...contour.map((point) => point.x))
  const minY = Math.min(...contour.map((point) => point.y))
  const maxY = Math.max(...contour.map((point) => point.y))
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

function countDistinctRoundedCoordinates(points: TowerAiPoint[], axis: 'x' | 'y') {
  return new Set(points.map((point) => Math.round(point[axis] / 6))).size
}

function leftmostAtBand(points: TowerAiPoint[] | undefined, y: number, band: number) {
  return minBy(points?.filter((point) => Math.abs(point.y - y) <= band) ?? points ?? [], (point) => point.x)
}

function rightmostAtBand(points: TowerAiPoint[] | undefined, y: number, band: number) {
  return maxBy(points?.filter((point) => Math.abs(point.y - y) <= band) ?? points ?? [], (point) => point.x)
}

function topmostAtBand(points: TowerAiPoint[] | undefined, x: number, band: number) {
  return minBy(points?.filter((point) => Math.abs(point.x - x) <= band) ?? points ?? [], (point) => point.y)
}

function bottommostAtBand(points: TowerAiPoint[] | undefined, x: number, band: number) {
  return maxBy(points?.filter((point) => Math.abs(point.x - x) <= band) ?? points ?? [], (point) => point.y)
}

function topLeftCorner(points: TowerAiPoint[] | undefined) {
  return minBy(points ?? [], (point) => point.x + point.y)
}

function bottomRightCorner(points: TowerAiPoint[] | undefined) {
  return maxBy(points ?? [], (point) => point.x + point.y)
}

function minBy<T>(items: T[], score: (item: T) => number) {
  return items.reduce<T | undefined>((best, item) => (best === undefined || score(item) < score(best) ? item : best), undefined)
}

function maxBy<T>(items: T[], score: (item: T) => number) {
  return items.reduce<T | undefined>((best, item) => (best === undefined || score(item) > score(best) ? item : best), undefined)
}

function logAiHandles(provider: string, model: string, handles: Partial<TowerAiHandles>) {
  const keys: TowerAiPointKey[] = ['lensLeft', 'lensRight', 'lensTop', 'lensBottom', 'diagA', 'diagB', 'pupilR', 'pupilL']
  const payload = Object.fromEntries(
    keys
      .filter((key) => handles[key])
      .map((key) => [key, { x: Math.round(handles[key]!.x), y: Math.round(handles[key]!.y) }]),
  )
  console.log(`[IA Medidas Torre] pontos IA convertidos | provedor: ${provider} | modelo: ${model} | ${JSON.stringify(payload)}`)
}

function extractGeminiText(response: GeminiResponseLike): string {
  if (typeof response.text === 'function') {
    try {
      const text = response.text()
      if (text?.trim()) return text.trim()
    } catch {}
  }

  return (response.candidates ?? [])
    .flatMap((candidate) => candidate.content?.parts ?? [])
    .map((part) => (typeof part.text === 'string' ? part.text : ''))
    .join('\n')
    .trim()
}

function extractOpenAIText(data: OpenAIResponseLike): string {
  if (data.output_text?.trim()) return data.output_text.trim()

  return (data.output ?? [])
    .flatMap((item) => item.content ?? [])
    .map((content) => (content.type === 'output_text' || content.type === 'text' ? content.text ?? '' : ''))
    .join('\n')
    .trim()
}

function extractJsonObject(text: string): Record<string, unknown> | null {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start < 0 || end <= start) return null

  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1)) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null
  } catch {
    return null
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}
