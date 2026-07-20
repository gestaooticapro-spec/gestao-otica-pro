'use client'

import { useEffect, useRef, useState } from 'react'
import type * as Three from 'three'

type LensPoint = {
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
  backdrop: Three.Mesh<Three.PlaneGeometry, Three.MeshBasicMaterial>
  envMap: Three.Texture
  pxPerMm: number
  updateFrustum: () => void
}

type LensPhysicalViewProps = {
  rim: LensPoint[]
  samples: LensPoint[]
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
// Elevação da câmera: o suficiente para revelar a face frontal e os reflexos
// de estúdio sem esconder o perfil da borda nem mudar a escala horizontal.
const CAMERA_ELEVATION_DEG = 22
// Com a câmera inclinada, a projeção da lente cresce na vertical; a margem
// evita que o frustum ortográfico corte topo ou base da lente.
const FRUSTUM_VERTICAL_MARGIN = 1.32

function centerSample(samples: LensPoint[], focalX: number, focalY: number) {
  return samples
    .filter((sample) => sample.withinLens)
    .reduce((closest, sample) => Math.hypot(sample.x - focalX, sample.y - focalY) < Math.hypot(closest.x - focalX, closest.y - focalY) ? sample : closest, samples[0])
}

function nearestSample(samples: LensPoint[], x: number, y: number, fallback: LensPoint) {
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

// Estúdio procedural: painéis emissivos viram reflexos suaves na lente via
// PMREM. É gerado uma única vez na abertura da cena; não existe custo por
// frame nem download de textura externa.
function createStudioEnvironment(THREE: typeof Three) {
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x030b16)

  const addPanel = (width: number, height: number, color: number, intensity: number, position: [number, number, number], rotation: [number, number, number]) => {
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })
    material.color.set(color).multiplyScalar(intensity)
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material)
    panel.position.set(position[0], position[1], position[2])
    panel.rotation.set(rotation[0], rotation[1], rotation[2])
    scene.add(panel)
  }

  // Softbox de teto: reflexo principal na face frontal da lente.
  addPanel(150, 64, 0xffffff, 5.5, [0, 10, 150], [Math.PI / 2, 0, 0])
  // Faixa fria à esquerda: brilho ciano de vitrine.
  addPanel(95, 22, 0x67e8f9, 4, [-125, -25, 15], [0, Math.PI / 2, 0])
  // Linha branca estreita à direita: streak especular.
  addPanel(75, 9, 0xffffff, 5, [125, -15, 25], [0, -Math.PI / 2, 0])
  // Preenchimento quente atrás: tira a sombra "morta" da borda inferior.
  addPanel(130, 42, 0xffe7c2, 1.5, [0, 150, -10], [0, Math.PI, 0])

  return scene
}

// Fundo interno da vitrine: gradiente pintado em canvas, usado para dar
// profundidade e alimentar a refração do material transmissivo.
function createBackdropTexture(THREE: typeof Three) {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 512
  const context = canvas.getContext('2d')
  if (context) {
    const gradient = context.createRadialGradient(196, 168, 26, 256, 262, 470)
    gradient.addColorStop(0, '#1b5e77')
    gradient.addColorStop(.4, '#0d2438')
    gradient.addColorStop(.78, '#060d1a')
    gradient.addColorStop(1, '#020617')
    context.fillStyle = gradient
    context.fillRect(0, 0, canvas.width, canvas.height)
    const floor = context.createLinearGradient(0, 290, 0, 512)
    floor.addColorStop(0, 'rgba(2,6,23,0)')
    floor.addColorStop(1, 'rgba(2,6,23,.8)')
    context.fillStyle = floor
    context.fillRect(0, 0, canvas.width, canvas.height)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

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
      const elevation = CAMERA_ELEVATION_DEG * Math.PI / 180
      const distance = 150
      const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .1, 600)
      camera.up.set(0, 0, 1)
      camera.position.set(0, -Math.cos(elevation) * distance, Math.sin(elevation) * distance)
      camera.lookAt(0, 0, -4)

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' })
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
      renderer.outputColorSpace = THREE.SRGBColorSpace
      renderer.toneMapping = THREE.ACESFilmicToneMapping
      renderer.toneMappingExposure = 1.1
      host.replaceChildren(renderer.domElement)

      // Base ambiente suave; o grosso dos reflexos vem do environment PMREM.
      scene.add(new THREE.HemisphereLight(0xdff8ff, 0x020617, 1.1))
      const key = new THREE.DirectionalLight(0xffffff, 1.6)
      key.position.set(-35, -42, 90)
      scene.add(key)
      const rimLight = new THREE.DirectionalLight(0x67e8f9, 1.4)
      rimLight.position.set(60, 15, 45)
      scene.add(rimLight)

      const pmrem = new THREE.PMREMGenerator(renderer)
      const envMap = pmrem.fromScene(createStudioEnvironment(THREE), .07).texture
      pmrem.dispose()
      scene.environment = envMap

      const backdropTexture = createBackdropTexture(THREE)
      const backdrop = new THREE.Mesh(
        new THREE.PlaneGeometry(420, 320),
        new THREE.MeshBasicMaterial({ map: backdropTexture })
      )
      backdrop.position.set(0, 78, -34)
      backdrop.lookAt(camera.position)
      scene.add(backdrop)

      const lensGroup = new THREE.Group()
      // O perfil matemático abaixo é espelhado para a comparação com a lente
      // real; a vista física precisa usar a mesma orientação de rotação.
      lensGroup.scale.x = -1
      scene.add(lensGroup)

      const updateFrustum = () => {
        const bounds = host.getBoundingClientRect()
        const activePxPerMm = runtimeRef.current?.pxPerMm ?? BASE_PX_PER_MM * calibrationScale / 100
        const halfWidth = bounds.width / activePxPerMm / 2
        const halfHeight = bounds.height / activePxPerMm / 2 * FRUSTUM_VERTICAL_MARGIN
        camera.left = -halfWidth
        camera.right = halfWidth
        camera.top = halfHeight
        camera.bottom = -halfHeight
        camera.updateProjectionMatrix()
        renderer.setSize(bounds.width, bounds.height, false)
        renderer.render(scene, camera)
      }
      const resizeObserver = new ResizeObserver(updateFrustum)
      resizeObserver.observe(host)

      runtimeRef.current = { THREE, host, scene, camera, renderer, resizeObserver, lensGroup, backdrop, envMap, pxPerMm: BASE_PX_PER_MM * calibrationScale / 100, updateFrustum }
      updateFrustum()
      setReady(true)
    })

    return () => {
      cancelled = true
      setReady(false)
      const runtime = runtimeRef.current
      if (!runtime) return
      runtime.resizeObserver.disconnect()
      disposeObject(runtime.lensGroup)
      runtime.backdrop.geometry.dispose()
      runtime.backdrop.material.map?.dispose()
      runtime.backdrop.material.dispose()
      runtime.envMap.dispose()
      runtime.renderer.dispose()
      runtime.host.replaceChildren()
      runtimeRef.current = null
    }
  // O renderizador, as luzes, o environment e o backdrop são criados somente
  // uma vez; a malha abaixo é atualizada pelos dados calculados.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const runtime = runtimeRef.current
    if (!ready || !runtime || rim.length < 3 || !samples.length) return
    const { THREE, lensGroup } = runtime
    runtime.pxPerMm = BASE_PX_PER_MM * calibrationScale / 100

    while (lensGroup.children.length) {
      const child = lensGroup.children[0]
      lensGroup.remove(child)
      disposeObject(child)
    }

    // ------------------------------------------------------------------
    // Geometria da lente: MESMOS vértices e anéis de sempre. Nenhum dado de
    // espessura é recalculado aqui — rim, samples, thickness e displayFrontSag
    // chegam prontos do cálculo validado em TowerLensThicknessDemo.
    // A única diferença estrutural é que a faixa lateral da borda virou uma
    // malha separada, para receber o material iridescente de borda polida.
    // ------------------------------------------------------------------
    const interior = samples.filter((sample) => sample.withinLens)
    const center = centerSample(interior, focalX, focalY)
    const segments = rim.length
    const rings = 9
    const verticesPerSurface = 1 + rings * segments
    const positions: number[] = []
    const indices: number[] = []

    const addVertex = (point: LensPoint, isBack: boolean) => {
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
    for (let index = 0; index < segments; index += 1) {
      const next = (index + 1) % segments
      indices.push(0, ringOffset(0, 1) + next, ringOffset(0, 1) + index)
      indices.push(verticesPerSurface, verticesPerSurface + ringOffset(0, 1) + index, verticesPerSurface + ringOffset(0, 1) + next)
    }
    for (let ringIndex = 1; ringIndex < rings; ringIndex += 1) {
      const frontInner = ringOffset(0, ringIndex)
      const frontOuter = ringOffset(0, ringIndex + 1)
      const backInner = verticesPerSurface + ringOffset(0, ringIndex)
      const backOuter = verticesPerSurface + ringOffset(0, ringIndex + 1)
      for (let index = 0; index < segments; index += 1) {
        const next = (index + 1) % segments
        indices.push(frontInner + index, frontOuter + index, frontInner + next, frontInner + next, frontOuter + index, frontOuter + next)
        indices.push(backInner + index, backInner + next, backOuter + index, backInner + next, backOuter + next, backOuter + index)
      }
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geometry.setIndex(indices)
    geometry.computeVertexNormals()

    const averageThickness = rim.reduce((total, sample) => total + sample.thickness, 0) / rim.length
    // Vidro premium: transmission + clearcoat para os reflexos de estúdio,
    // iridescência sutil e dispersão leve para franjas de prisma nas curvas.
    // Tudo é calculado no shader; não existe passe extra de renderização.
    const material = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(0xf4fdff),
      metalness: 0,
      roughness: .04,
      transmission: .92,
      thickness: Math.max(averageThickness, .8),
      ior: index,
      clearcoat: 1,
      clearcoatRoughness: .03,
      iridescence: .18,
      iridescenceIOR: 1.32,
      iridescenceThicknessRange: [120, 480],
      dispersion: .28,
      attenuationColor: new THREE.Color(0xa8e4f5),
      attenuationDistance: 55,
      specularIntensity: 1.1,
      envMapIntensity: 1.45,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: .96,
    })
    lensGroup.add(new THREE.Mesh(geometry, material))

    // Faixa lateral da borda: mesma posição dos pontos do rim (espessura
    // intacta), mas com material próprio de borda polida — iridescência alta
    // para o leve efeito arco-íris ao girar a lente.
    const bandPositions: number[] = []
    const bandIndices: number[] = []
    rim.forEach((sample) => {
      const frontZ = -sample.displayFrontSag
      bandPositions.push(sample.x, sample.y, frontZ)
      bandPositions.push(sample.x, sample.y, frontZ - sample.thickness)
    })
    for (let segmentIndex = 0; segmentIndex < segments; segmentIndex += 1) {
      const next = (segmentIndex + 1) % segments
      const frontA = segmentIndex * 2
      const backA = segmentIndex * 2 + 1
      const frontB = next * 2
      const backB = next * 2 + 1
      bandIndices.push(frontA, backA, frontB, backA, backB, frontB)
    }
    const bandGeometry = new THREE.BufferGeometry()
    bandGeometry.setAttribute('position', new THREE.Float32BufferAttribute(bandPositions, 3))
    bandGeometry.setIndex(bandIndices)
    bandGeometry.computeVertexNormals()
    const bandMaterial = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(0xecfdff),
      metalness: 0,
      roughness: .12,
      transmission: .55,
      thickness: Math.max(averageThickness * .8, .6),
      ior: index,
      clearcoat: 1,
      clearcoatRoughness: .06,
      iridescence: .9,
      iridescenceIOR: 1.34,
      iridescenceThicknessRange: [130, 900],
      dispersion: .4,
      envMapIntensity: 2.1,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: .9,
    })
    lensGroup.add(new THREE.Mesh(bandGeometry, bandMaterial))

    // Contornos de definição: linha frontal sutil e linha traseira fria.
    const outlinePoints = rim.map((sample) => new THREE.Vector3(sample.x, sample.y, -sample.displayFrontSag + .03))
    const outline = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(outlinePoints), new THREE.LineBasicMaterial({ color: 0xcaf6ff, transparent: true, opacity: .5 }))
    lensGroup.add(outline)

    const backOutlinePoints = rim.map((sample) => new THREE.Vector3(sample.x, sample.y, -sample.displayFrontSag - sample.thickness - .03))
    const backOutline = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(backOutlinePoints), new THREE.LineBasicMaterial({ color: 0x67e8f9, transparent: true, opacity: .55 }))
    lensGroup.add(backOutline)

    runtime.updateFrustum()
  }, [calibrationScale, focalX, focalY, heightMm, index, ready, rim, samples, view, widthMm])

  return <div className="relative h-full w-full overflow-hidden rounded-2xl bg-[radial-gradient(circle_at_38%_26%,rgba(34,211,238,.18),transparent_31%),linear-gradient(145deg,#071827,#020617_68%)]" role="img" aria-label="Lente tridimensional baseada na espessura calculada">
    <div ref={hostRef} className="absolute inset-0" />
    <div className="pointer-events-none absolute left-4 top-4 rounded-full border border-white/15 bg-slate-950/70 px-3 py-1.5 text-[11px] font-bold text-cyan-100">Borda calculada em 3D</div>
    {showCalibrator && <div className="pointer-events-none absolute bottom-5 left-1/2 -translate-x-1/2 text-center text-amber-200"><p className="mb-1 text-xs font-black">50 mm · calibre com régua</p><div className="relative h-4 border-t-[3px] border-amber-300" style={{ width: `${50 * pxPerMm}px` }}><span className="absolute -left-[3px] -top-2 h-4 border-l-[3px] border-amber-300" /><span className="absolute -right-[3px] -top-2 h-4 border-l-[3px] border-amber-300" /></div></div>}
  </div>
}