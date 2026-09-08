import assert from 'node:assert/strict'
import test from 'node:test'
import {
  canvasPointToPhoto,
  mapFrontLensSegmentationToHandles,
  photoPointToCanvas,
  type LensSegmentationResult,
} from '../src/lib/medidas/front-lens-segmentation'

const result: LensSegmentationResult = {
  imageWidth: 640,
  imageHeight: 640,
  mirrored: false,
  lenses: [
    {
      side: 'OE',
      confidence: 0.94,
      bbox: { x: 384, y: 334, width: 122, height: 66 },
      center: { x: 445, y: 367 },
      areaPixels: 6000,
      polygons: [[[384, 350], [400, 334], [490, 336], [505, 360], [495, 399], [390, 398]]],
    },
    {
      side: 'OD',
      confidence: 0.96,
      bbox: { x: 234, y: 333, width: 115, height: 62 },
      center: { x: 291.5, y: 364 },
      areaPixels: 5800,
      polygons: [[[234, 350], [250, 333], [330, 335], [348, 352], [340, 394], [245, 393]]],
    },
  ],
}

const current = {
  pupilR: { x: 292, y: 364 },
  pupilL: { x: 445, y: 367 },
  bridgeR: { x: 345, y: 365 },
  bridgeL: { x: 387, y: 365 },
  mountR: { x: 292, y: 395 },
  mountL: { x: 445, y: 400 },
  lensLeft: { x: 230, y: 365 },
  lensRight: { x: 350, y: 365 },
  lensTop: { x: 290, y: 330 },
  lensBottom: { x: 290, y: 400 },
  diagA: { x: 235, y: 335 },
  diagB: { x: 345, y: 395 },
}

test('A/B/D vem so do OD; OE maior nao altera o aro nem a diagonal D atual (min x+y para max x+y)', () => {
  const wideOe: LensSegmentationResult = {
    ...result,
    lenses: [
      {
        ...result.lenses[0],
        bbox: { x: 360, y: 280, width: 220, height: 180 },
        center: { x: 470, y: 370 },
        polygons: [[[360, 300], [400, 280], [560, 290], [580, 370], [560, 460], [370, 450]]],
      },
      result.lenses[1],
    ],
  }
  const mapped = mapFrontLensSegmentationToHandles(wideOe, { width: 640, height: 640 }, current)
  assert.deepEqual(mapped.handles.lensLeft, { x: 234, y: 363.5 })
  assert.deepEqual(mapped.handles.lensRight, { x: 348, y: 363.5 })
  assert.deepEqual(mapped.handles.lensTop, { x: 291, y: 333 })
  assert.deepEqual(mapped.handles.lensBottom, { x: 291, y: 394 })
  assert.deepEqual(mapped.handles.diagA, { x: 250, y: 333 })
  assert.deepEqual(mapped.handles.diagB, { x: 340, y: 394 })
  assert.equal(mapped.handles.bridgeR?.x, 348)
  assert.equal(mapped.handles.bridgeR?.y, current.bridgeR.y)
  assert.equal(mapped.handles.bridgeL?.x, 360)
  assert.equal(mapped.handles.bridgeL?.y, current.bridgeL.y)
  assert.equal(mapped.handles.mountR?.x, current.pupilR.x)
  assert.equal(mapped.handles.mountL?.x, current.pupilL.x)
  assert.deepEqual(mapped.warnings, [])
})

test('rejeita resultado espelhado, dimensoes divergentes ou apenas uma lente', () => {
  assert.throws(
    () => mapFrontLensSegmentationToHandles({ ...result, mirrored: true as false }, { width: 640, height: 640 }, current),
    /nao espelhada/,
  )
  assert.throws(
    () => mapFrontLensSegmentationToHandles(result, { width: 800, height: 640 }, current),
    /dimensoes diferentes/,
  )
  assert.throws(
    () => mapFrontLensSegmentationToHandles({ ...result, lenses: result.lenses.filter((lens) => lens.side === 'OD') }, { width: 640, height: 640 }, current),
    /lente OE/,
  )
})

test('pupila fora da mascara mantem o mount atual e avisa; nao devolve R1/R2, pupila nem palpebra', () => {
  const mapped = mapFrontLensSegmentationToHandles(result, { width: 640, height: 640 }, {
    ...current,
    pupilR: { x: 20, y: 364 },
    pupilL: { x: 620, y: 367 },
  })
  assert.equal(mapped.handles.mountR, undefined)
  assert.equal(mapped.handles.mountL, undefined)
  assert.equal(mapped.warnings.length, 2)
  assert.equal('calibA' in mapped.handles, false)
  assert.equal('pupilR' in mapped.handles, false)
  assert.equal('palpebraR' in mapped.handles, false)
})

test('converte canvas letterbox e foto com as mesmas dimensoes naturais', () => {
  const bounds = { x: 40, y: 10, w: 400, h: 300 }
  const photo = { width: 800, height: 600 }
  const canvas = { x: 140, y: 85 }
  const photoPoint = canvasPointToPhoto(canvas, bounds, photo)
  assert.deepEqual(photoPoint, { x: 200, y: 150 })
  assert.deepEqual(photoPointToCanvas(photoPoint, bounds, photo), canvas)
})
