'use client'

import { useEffect, useRef, useState } from 'react'
import type * as Three from 'three'

export type LensPhysicalPoint = {
  x: number
  y: number
  thickness: number
  displayFrontSag: number
  withinLens?: boolean
}

type Runtime = {
  THREE: typeof Three
  host: HTMLDivElement
  scene: Three.Scene
  camera: Three.OrthographicCamera
  renderer: Three.WebGLRenderer
  resizeObserver: ResizeObserver
  lensGroup: Three.Group
  pxPerMm: number
}

type LensPhysicalViewProps = {
  rim: LensPhysicalPoint[]
  samples: LensPhysicalPoint[]
  widthMm: number
  heightMm: number
  focalX: number
  focalY: number
  index: number
  calibrationScale: number
  showCalibrator: boolean
  view: 'edge'
}

const BASE_PX_PER_MM = 4.1

function centerSample(samples: LensPhysicalPoint[], focalX: number, focalY: number) {
  return samples
    .filter((sample) => sample.withinLens)
    .reduce((closest, sample) => Math.hypot(sample.x - focalX, sample.y - focalY) < Math.hypot(closest.x - focalX, closest.y - focalY) ? sample : closest, samples[0])
}

function nearestSample(samples: LensPhysicalPoint[], x: number, y: number, fallback: LensPhysicalPoint) {
  return samples
    .filter((sample) => sample.withinLens)
    .reduce((closest, sample) => Math.hypot(sample.x - x, sample.y - y) < Math.hypot(closest.x - x, closest.y - y) ? sample : closest, fallback)
}

function disposeObject(object: Three.Object3D) {
  object.traverse((child) => {
    const mesh = child as Three.Mesh
    mesh.geometry?.dispose()
    if (Array.isArray(mesh.material)) mesh.material.forEach((material) => material.dispose())
    else mesh.material?.dispose()
  })
}

// Port fiel do renderizador fisico da Torre. O relatorio publico tambem usa a
// malha 3D calculada, nunca uma aproximacao SVG da borda.
export function LensPhysicalView({ rim, samples, widthMm, heightMm, focalX, focalY, index, calibrationScale, showCalibrator, view }: LensPhysicalViewProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const runtimeRef = useRef<Runtime | null>(null)
  const [ready, setReady] = useState(false)
  const pxPerMm = BASE_PX_PER_MM * calibrationScale / 100

  useEffect(() => {
    let cancelled = false
    const host = hostRef.current
    if (!host) return

    void import('three').then((THREE) => {
      if (cancelled || !host) return
      const scene = new THREE.Scene()
      const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .1, 500)
      camera.up.set(0, 0, 1)
      camera.position.set(0, -160, 0)
      camera.lookAt(0, 0, -2)
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' })
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
      renderer.outputColorSpace = THREE.SRGBColorSpace
      renderer.toneMapping = THREE.ACESFilmicToneMapping
      renderer.toneMappingExposure = 1.15
      host.replaceChildren(renderer.domElement)
      scene.add(new THREE.HemisphereLight(0xcffafe, 0x020617, 2.6))
      const key = new THREE.DirectionalLight(0xffffff, 4.5)
      key.position.set(-35, -42, 80)
      scene.add(key)
      const rimLight = new THREE.DirectionalLight(0x67e8f9, 3.2)
      rimLight.position.set(50, 10, 38)
      scene.add(rimLight)
      const fill = new THREE.DirectionalLight(0xe0f2fe, 2)
      fill.position.set(-10, 45, -12)
      scene.add(fill)
      const lensGroup = new THREE.Group()
      lensGroup.scale.x = -1
      scene.add(lensGroup)
      const resize = () => {
        const bounds = host.getBoundingClientRect()
        const activePxPerMm = runtimeRef.current?.pxPerMm ?? BASE_PX_PER_MM * calibrationScale / 100
        const halfWidth = bounds.width / activePxPerMm / 2
        const halfHeight = bounds.height / activePxPerMm / 2
        camera.left = -halfWidth
        camera.right = halfWidth
        camera.top = halfHeight
        camera.bottom = -halfHeight
        camera.updateProjectionMatrix()
        renderer.setSize(bounds.width, bounds.height, false)
        renderer.render(scene, camera)
      }
      const resizeObserver = new ResizeObserver(resize)
      resizeObserver.observe(host)
      resize()
      runtimeRef.current = { THREE, host, scene, camera, renderer, resizeObserver, lensGroup, pxPerMm: BASE_PX_PER_MM * calibrationScale / 100 }
      setReady(true)
    })

    return () => {
      cancelled = true
      setReady(false)
      const runtime = runtimeRef.current
      if (!runtime) return
      runtime.resizeObserver.disconnect()
      disposeObject(runtime.lensGroup)
      runtime.renderer.dispose()
      runtime.host.replaceChildren()
      runtimeRef.current = null
    }
  // The renderer is created once; the mesh is rebuilt below from persisted data.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const runtime = runtimeRef.current
    if (!ready || !runtime || rim.length < 3 || !samples.length) return
    const { THREE, lensGroup, scene, camera, renderer, host } = runtime
    runtime.pxPerMm = BASE_PX_PER_MM * calibrationScale / 100
    while (lensGroup.children.length) {
      const child = lensGroup.children[0]
      lensGroup.remove(child)
      disposeObject(child)
    }
    const rimMinimumX = Math.min(...rim.map((sample) => sample.x))
    const rimMaximumX = Math.max(...rim.map((sample) => sample.x))
    lensGroup.position.x = (rimMinimumX + rimMaximumX) / 2
    const interior = samples.filter((sample) => sample.withinLens)
    const center = centerSample(interior, focalX, focalY)
    const segments = rim.length
    const rings = 9
    const verticesPerSurface = 1 + rings * segments
    const positions: number[] = []
    const indices: number[] = []
    const addVertex = (point: LensPhysicalPoint, isBack: boolean) => {
      const frontZ = -point.displayFrontSag
      positions.push(point.x, point.y, isBack ? frontZ - point.thickness : frontZ)
    }
    const surfaceRings = Array.from({ length: rings }, (_, ringOffset) => {
      const ringIndex = ringOffset + 1
      const radial = ringIndex / rings
      return rim.map((edge) => {
        if (ringIndex === rings) return edge
        const x = focalX + (edge.x - focalX) * radial
        const y = focalY + (edge.y - focalY) * radial
        return nearestSample(interior, x, y, edge)
      })
    })
    addVertex(center, false)
    surfaceRings.forEach((ring) => ring.forEach((point) => addVertex(point, false)))
    addVertex(center, true)
    surfaceRings.forEach((ring) => ring.forEach((point) => addVertex(point, true)))
    const ringOffset = (surface: 0 | 1, ringIndex: number) => surface * verticesPerSurface + 1 + (ringIndex - 1) * segments
    for (let pointIndex = 0; pointIndex < segments; pointIndex += 1) {
      const next = (pointIndex + 1) % segments
      indices.push(0, ringOffset(0, 1) + next, ringOffset(0, 1) + pointIndex)
      indices.push(verticesPerSurface, verticesPerSurface + ringOffset(0, 1) + pointIndex, verticesPerSurface + ringOffset(0, 1) + next)
    }
    for (let ringIndex = 1; ringIndex < rings; ringIndex += 1) {
      const frontInner = ringOffset(0, ringIndex)
      const frontOuter = ringOffset(0, ringIndex + 1)
      const backInner = verticesPerSurface + ringOffset(0, ringIndex)
      const backOuter = verticesPerSurface + ringOffset(0, ringIndex + 1)
      for (let pointIndex = 0; pointIndex < segments; pointIndex += 1) {
        const next = (pointIndex + 1) % segments
        indices.push(frontInner + pointIndex, frontOuter + pointIndex, frontInner + next, frontInner + next, frontOuter + pointIndex, frontOuter + next)
        indices.push(backInner + pointIndex, backInner + next, backOuter + pointIndex, backInner + next, backOuter + next, backOuter + pointIndex)
      }
    }
    const frontEdge = ringOffset(0, rings)
    const backEdge = verticesPerSurface + ringOffset(0, rings)
    for (let pointIndex = 0; pointIndex < segments; pointIndex += 1) {
      const next = (pointIndex + 1) % segments
      indices.push(frontEdge + pointIndex, backEdge + pointIndex, frontEdge + next, frontEdge + next, backEdge + pointIndex, backEdge + next)
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geometry.setIndex(indices)
    geometry.computeVertexNormals()
    const averageThickness = rim.reduce((total, sample) => total + sample.thickness, 0) / rim.length
    const material = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(0xcffafe), roughness: .05, transmission: .9, thickness: Math.max(averageThickness, .8), ior: index, clearcoat: 1, clearcoatRoughness: .04, attenuationColor: new THREE.Color(0x67e8f9), attenuationDistance: 95, specularIntensity: 1, side: THREE.DoubleSide, transparent: true, opacity: .58 })
    lensGroup.add(new THREE.Mesh(geometry, material))
    const outlinePoints = rim.map((sample) => new THREE.Vector3(sample.x, sample.y, -sample.displayFrontSag + .025))
    lensGroup.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(outlinePoints), new THREE.LineBasicMaterial({ color: 0xa5f3fc, transparent: true, opacity: .45 })))
    const backOutlinePoints = rim.map((sample) => new THREE.Vector3(sample.x, sample.y, -sample.displayFrontSag - sample.thickness - .025))
    lensGroup.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(backOutlinePoints), new THREE.LineBasicMaterial({ color: 0x67e8f9, transparent: true, opacity: .66 })))
    const bounds = host.getBoundingClientRect()
    const activePxPerMm = BASE_PX_PER_MM * calibrationScale / 100
    camera.left = -(bounds.width / activePxPerMm / 2)
    camera.right = bounds.width / activePxPerMm / 2
    camera.top = bounds.height / activePxPerMm / 2
    camera.bottom = -(bounds.height / activePxPerMm / 2)
    camera.updateProjectionMatrix()
    renderer.render(scene, camera)
  }, [calibrationScale, focalX, focalY, heightMm, index, ready, rim, samples, view, widthMm])

  return <div className="relative h-full w-full overflow-hidden rounded-2xl bg-[radial-gradient(circle_at_38%_26%,rgba(34,211,238,.18),transparent_31%),linear-gradient(145deg,#071827,#020617_68%)]" role="img" aria-label="Lente tridimensional baseada na espessura calculada">
    <div ref={hostRef} className="absolute inset-0" />
    <div className="pointer-events-none absolute left-4 top-4 rounded-full border border-white/15 bg-slate-950/70 px-3 py-1.5 text-[11px] font-bold text-cyan-100">Borda calculada em 3D</div>
    {showCalibrator && <div className="pointer-events-none absolute bottom-5 left-1/2 -translate-x-1/2 text-center text-amber-200"><p className="mb-1 text-xs font-black">50 mm · calibre com régua</p><div className="relative h-4 border-t-[3px] border-amber-300" style={{ width: `${50 * pxPerMm}px` }}><span className="absolute -left-[3px] -top-2 h-4 border-l-[3px] border-amber-300" /><span className="absolute -right-[3px] -top-2 h-4 border-l-[3px] border-amber-300" /></div></div>}
  </div>
}
