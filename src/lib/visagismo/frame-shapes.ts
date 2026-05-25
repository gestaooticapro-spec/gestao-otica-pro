export type FrameShapeCategory =
  | 'round'
  | 'oval'
  | 'panto'
  | 'rectangular'
  | 'square'
  | 'cat-eye'
  | 'aviator'
  | 'geometric'

export type FrameShapeIntensity = 'light' | 'medium' | 'bold'

export interface FrameShapeAnchorSet {
  wearerRightPupil: { x: number; y: number }
  wearerLeftPupil: { x: number; y: number }
  bridgeCenter: { x: number; y: number }
}

export interface FrameShapeGuide {
  totalWidth: number
  lensWidth: number
  lensHeight: number
  bridgeWidth: number
  defaultStrokeWidth: number
}

export interface FrameShapeTemplate {
  id: string
  name: string
  category: FrameShapeCategory
  intensity: FrameShapeIntensity
  description: string
  viewBox: { width: number; height: number }
  anchors: FrameShapeAnchorSet
  guide: FrameShapeGuide
  paths: {
    outerRight: string
    outerLeft: string
    innerRight?: string
    innerLeft?: string
    bridge: string
    brow?: string
    accents?: string[]
  }
}

const VIEW_BOX = { width: 140, height: 56 } as const
const DEFAULT_ANCHORS: FrameShapeAnchorSet = {
  wearerRightPupil: { x: 45, y: 29 },
  wearerLeftPupil: { x: 95, y: 29 },
  bridgeCenter: { x: 70, y: 27 },
}

function shape(
  input: Omit<FrameShapeTemplate, 'viewBox' | 'anchors'> & {
    anchors?: Partial<FrameShapeAnchorSet>
  },
): FrameShapeTemplate {
  return {
    ...input,
    viewBox: VIEW_BOX,
    anchors: { ...DEFAULT_ANCHORS, ...input.anchors },
  }
}

export const FRAME_SHAPE_TEMPLATES: FrameShapeTemplate[] = [
  shape({
    id: 'round-classic',
    name: 'Redondo classico',
    category: 'round',
    intensity: 'medium',
    description: 'Circular e equilibrado, bom para suavizar linhas retas do rosto.',
    guide: { totalWidth: 128, lensWidth: 44, lensHeight: 44, bridgeWidth: 20, defaultStrokeWidth: 2.6 },
    paths: {
      outerRight: 'M22 28 C22 15 31 7 45 7 C59 7 68 15 68 28 C68 41 59 49 45 49 C31 49 22 41 22 28 Z',
      outerLeft: 'M72 28 C72 15 81 7 95 7 C109 7 118 15 118 28 C118 41 109 49 95 49 C81 49 72 41 72 28 Z',
      innerRight: 'M28 28 C28 18 35 13 45 13 C55 13 62 18 62 28 C62 38 55 43 45 43 C35 43 28 38 28 28 Z',
      innerLeft: 'M78 28 C78 18 85 13 95 13 C105 13 112 18 112 28 C112 38 105 43 95 43 C85 43 78 38 78 28 Z',
      bridge: 'M66 27 C68 24 72 24 74 27',
      accents: [
        'M18 28 L22 28 M118 28 L122 28',
        'M64 31 C66 35 69 36 70 31 M70 31 C71 36 74 35 76 31',
      ],
    },
  }),
  shape({
    id: 'round-soft',
    name: 'Redondo suave',
    category: 'round',
    intensity: 'light',
    description: 'Arredondado mais leve, com menos peso visual e leitura delicada.',
    guide: { totalWidth: 126, lensWidth: 43, lensHeight: 40, bridgeWidth: 20, defaultStrokeWidth: 2.1 },
    paths: {
      outerRight: 'M23 29 C23 17 32 10 45 10 C58 10 67 17 67 29 C67 40 58 47 45 47 C32 47 23 40 23 29 Z',
      outerLeft: 'M73 29 C73 17 82 10 95 10 C108 10 117 17 117 29 C117 40 108 47 95 47 C82 47 73 40 73 29 Z',
      innerRight: 'M29 29 C29 20 36 16 45 16 C54 16 61 20 61 29 C61 37 54 41 45 41 C36 41 29 37 29 29 Z',
      innerLeft: 'M79 29 C79 20 86 16 95 16 C104 16 111 20 111 29 C111 37 104 41 95 41 C86 41 79 37 79 29 Z',
      bridge: 'M66 28 C68 26 72 26 74 28',
      accents: [
        'M20 29 L23 29 M117 29 L120 29',
        'M65 31 C67 34 69 34 70 31 M70 31 C71 34 73 34 75 31',
      ],
    },
  }),
  shape({
    id: 'oval',
    name: 'Oval',
    category: 'oval',
    intensity: 'light',
    description: 'Horizontal e suave, reduz contraste em rostos angulares.',
    guide: { totalWidth: 130, lensWidth: 48, lensHeight: 35, bridgeWidth: 18, defaultStrokeWidth: 2.2 },
    paths: {
      outerRight: 'M19 29 C19 18 30 12 45 12 C60 12 70 18 70 29 C70 40 60 46 45 46 C30 46 19 40 19 29 Z',
      outerLeft: 'M70 29 C70 18 80 12 95 12 C110 12 121 18 121 29 C121 40 110 46 95 46 C80 46 70 40 70 29 Z',
      innerRight: 'M26 29 C26 21 34 17 45 17 C56 17 63 21 63 29 C63 37 56 41 45 41 C34 41 26 37 26 29 Z',
      innerLeft: 'M77 29 C77 21 84 17 95 17 C106 17 114 21 114 29 C114 37 106 41 95 41 C84 41 77 37 77 29 Z',
      bridge: 'M67 28 C69 26 71 26 73 28',
      accents: [
        'M16 29 L19 29 M121 29 L124 29',
        'M64 31 C66 34 69 34 70 31 M70 31 C71 34 74 34 76 31',
      ],
    },
  }),
  shape({
    id: 'panto',
    name: 'Panto',
    category: 'panto',
    intensity: 'medium',
    description: 'Topo levemente reto com base arredondada, classico e versatil.',
    guide: { totalWidth: 130, lensWidth: 46, lensHeight: 42, bridgeWidth: 20, defaultStrokeWidth: 2.5 },
    paths: {
      outerRight: 'M22 24 C24 13 33 8 45 8 C57 8 66 13 68 24 C70 38 59 49 45 49 C31 49 20 38 22 24 Z',
      outerLeft: 'M72 24 C74 13 83 8 95 8 C107 8 116 13 118 24 C120 38 109 49 95 49 C81 49 70 38 72 24 Z',
      innerRight: 'M29 25 C30 17 36 14 45 14 C54 14 60 17 61 25 C63 36 54 43 45 43 C36 43 27 36 29 25 Z',
      innerLeft: 'M79 25 C80 17 86 14 95 14 C104 14 110 17 111 25 C113 36 104 43 95 43 C86 43 77 36 79 25 Z',
      bridge: 'M66 26 C68 22 72 22 74 26',
      brow: 'M28 15 C36 9 54 9 62 15 M78 15 C86 9 104 9 112 15',
      accents: [
        'M18 26 L22 24 M118 24 L122 26',
        'M64 30 C66 34 69 35 70 30 M70 30 C71 35 74 34 76 30',
      ],
    },
  }),
  shape({
    id: 'rectangular-soft',
    name: 'Retangular suave',
    category: 'rectangular',
    intensity: 'medium',
    description: 'Mais horizontal, com cantos arredondados para manter leveza.',
    guide: { totalWidth: 134, lensWidth: 51, lensHeight: 34, bridgeWidth: 18, defaultStrokeWidth: 2.5 },
    paths: {
      outerRight: 'M16 25 C16 16 22 12 32 12 L57 12 C66 12 71 17 71 27 L71 32 C71 41 65 46 55 46 L32 46 C22 46 16 41 16 32 Z',
      outerLeft: 'M69 27 C69 17 74 12 83 12 L108 12 C118 12 124 16 124 25 L124 32 C124 41 118 46 108 46 L85 46 C75 46 69 41 69 32 Z',
      innerRight: 'M23 26 C23 20 27 18 34 18 L55 18 C61 18 64 21 64 28 L64 31 C64 37 60 40 54 40 L34 40 C27 40 23 37 23 31 Z',
      innerLeft: 'M76 28 C76 21 79 18 85 18 L106 18 C113 18 117 20 117 26 L117 31 C117 37 113 40 106 40 L86 40 C80 40 76 37 76 31 Z',
      bridge: 'M68 27 C69 25 71 25 72 27',
      accents: [
        'M12 28 L16 28 M124 28 L128 28',
        'M65 31 C67 34 69 34 70 31 M70 31 C71 34 73 34 75 31',
      ],
    },
  }),
  shape({
    id: 'rectangular-marked',
    name: 'Retangular marcado',
    category: 'rectangular',
    intensity: 'bold',
    description: 'Linha reta e forte, indicado para dar estrutura ao rosto.',
    guide: { totalWidth: 136, lensWidth: 52, lensHeight: 32, bridgeWidth: 18, defaultStrokeWidth: 3.1 },
    paths: {
      outerRight: 'M15 17 L68 17 L70 39 L17 39 Z',
      outerLeft: 'M70 17 L123 17 L125 39 L72 39 Z',
      innerRight: 'M23 22 L61 22 L62 34 L24 34 Z',
      innerLeft: 'M78 22 L116 22 L117 34 L79 34 Z',
      bridge: 'M67 27 L73 27',
      brow: 'M16 16 L69 16 M71 16 L124 16',
      accents: [
        'M11 28 L15 28 M125 28 L129 28',
        'M65 30 C67 32 69 32 70 30 M70 30 C71 32 73 32 75 30',
      ],
    },
  }),
  shape({
    id: 'square',
    name: 'Quadrado',
    category: 'square',
    intensity: 'bold',
    description: 'Proporcao alta e angular, com presenca visual clara.',
    guide: { totalWidth: 132, lensWidth: 45, lensHeight: 43, bridgeWidth: 20, defaultStrokeWidth: 3 },
    paths: {
      outerRight: 'M20 12 L66 12 L68 45 L22 47 Z',
      outerLeft: 'M72 12 L118 12 L120 47 L74 45 Z',
      innerRight: 'M28 18 L60 18 L61 39 L29 40 Z',
      innerLeft: 'M80 18 L112 18 L111 40 L79 39 Z',
      bridge: 'M66 27 C68 25 72 25 74 27',
      accents: [
        'M16 29 L20 28 M120 28 L124 29',
        'M64 31 C66 34 69 35 70 31 M70 31 C71 35 74 34 76 31',
      ],
    },
  }),
  shape({
    id: 'square-rounded',
    name: 'Quadrado arredondado',
    category: 'square',
    intensity: 'medium',
    description: 'Estrutura quadrada com cantos suaves, bom equilibrio entre forca e conforto.',
    guide: { totalWidth: 132, lensWidth: 46, lensHeight: 41, bridgeWidth: 20, defaultStrokeWidth: 2.6 },
    paths: {
      outerRight: 'M20 24 C20 15 26 10 36 10 L55 10 C65 10 70 16 70 27 L70 35 C70 44 64 49 54 49 L36 49 C26 49 20 43 20 34 Z',
      outerLeft: 'M70 27 C70 16 75 10 85 10 L104 10 C114 10 120 15 120 24 L120 34 C120 43 114 49 104 49 L86 49 C76 49 70 44 70 35 Z',
      innerRight: 'M27 25 C27 19 31 16 38 16 L54 16 C60 16 63 20 63 28 L63 34 C63 40 59 43 53 43 L38 43 C31 43 27 39 27 33 Z',
      innerLeft: 'M77 28 C77 20 80 16 86 16 L102 16 C109 16 113 19 113 25 L113 33 C113 39 109 43 102 43 L87 43 C81 43 77 40 77 34 Z',
      bridge: 'M67 27 C69 25 71 25 73 27',
      accents: [
        'M16 29 L20 28 M120 28 L124 29',
        'M65 31 C67 34 69 34 70 31 M70 31 C71 34 73 34 75 31',
      ],
    },
  }),
  shape({
    id: 'cat-eye-soft',
    name: 'Gatinho suave',
    category: 'cat-eye',
    intensity: 'medium',
    description: 'Ascendente discreto, levanta a expressao sem exagero.',
    guide: { totalWidth: 134, lensWidth: 49, lensHeight: 37, bridgeWidth: 18, defaultStrokeWidth: 2.6 },
    paths: {
      outerRight: 'M17 30 C20 17 35 14 49 17 C60 19 68 23 71 30 C66 43 51 47 36 45 C24 43 16 38 17 30 Z',
      outerLeft: 'M69 30 C72 23 80 19 91 17 C105 14 120 17 123 30 C124 38 116 43 104 45 C89 47 74 43 69 30 Z',
      innerRight: 'M25 30 C28 22 38 20 49 22 C57 23 62 25 64 30 C60 38 50 41 39 39 C30 38 24 35 25 30 Z',
      innerLeft: 'M76 30 C78 25 83 23 91 22 C102 20 112 22 115 30 C116 35 110 38 101 39 C90 41 80 38 76 30 Z',
      bridge: 'M67 29 C69 27 71 27 73 29',
      brow: 'M18 29 C32 15 52 13 70 25 M70 25 C88 13 108 15 122 29',
      accents: [
        'M13 31 L17 30 M123 30 L127 31',
        'M64 32 C66 35 69 35 70 32 M70 32 C71 35 74 35 76 32',
      ],
    },
  }),
  shape({
    id: 'cat-eye-marked',
    name: 'Gatinho marcado',
    category: 'cat-eye',
    intensity: 'bold',
    description: 'Pontas altas e expressivas, formato fashion e direcionador.',
    guide: { totalWidth: 138, lensWidth: 50, lensHeight: 38, bridgeWidth: 18, defaultStrokeWidth: 3 },
    paths: {
      outerRight: 'M14 31 C21 13 42 13 56 19 C63 22 70 25 72 30 C66 42 50 48 34 46 C21 44 12 38 14 31 Z',
      outerLeft: 'M68 30 C70 25 77 22 84 19 C98 13 119 13 126 31 C128 38 119 44 106 46 C90 48 74 42 68 30 Z',
      innerRight: 'M24 31 C30 21 43 20 54 24 C59 25 63 27 65 30 C61 37 50 41 38 40 C29 39 23 35 24 31 Z',
      innerLeft: 'M75 30 C77 27 81 25 86 24 C97 20 110 21 116 31 C117 35 111 39 102 40 C90 41 79 37 75 30 Z',
      bridge: 'M67 29 C69 26 71 26 73 29',
      brow: 'M14 30 C31 11 54 12 72 26 M68 26 C86 12 109 11 126 30',
      accents: [
        'M10 32 L14 31 M126 31 L130 32',
        'M64 32 C66 36 69 36 70 32 M70 32 C71 36 74 36 76 32',
      ],
    },
  }),
  shape({
    id: 'aviator',
    name: 'Aviador',
    category: 'aviator',
    intensity: 'medium',
    description: 'Topo largo e base em gota, alonga a leitura vertical.',
    guide: { totalWidth: 136, lensWidth: 51, lensHeight: 43, bridgeWidth: 16, defaultStrokeWidth: 2.4 },
    paths: {
      outerRight: 'M16 21 C25 13 43 11 61 16 C69 19 70 28 65 39 C59 51 45 52 34 47 C23 42 15 31 16 21 Z',
      outerLeft: 'M75 16 C93 11 111 13 120 21 C121 31 113 42 102 47 C91 52 77 51 71 39 C66 28 67 19 75 16 Z',
      innerRight: 'M24 23 C31 18 43 17 56 20 C62 22 63 28 59 36 C55 44 46 45 38 42 C29 38 23 30 24 23 Z',
      innerLeft: 'M84 20 C97 17 109 18 116 23 C117 30 111 38 102 42 C94 45 85 44 81 36 C77 28 78 22 84 20 Z',
      bridge: 'M63 20 C67 16 73 16 77 20 M64 25 C68 22 72 22 76 25',
      brow: 'M20 19 C34 12 55 13 66 18 M74 18 C85 13 106 12 120 19',
      accents: [
        'M12 23 L16 21 M120 21 L128 23',
        'M62 30 C65 35 68 36 69 31 M71 31 C72 36 75 35 78 30',
      ],
    },
  }),
  shape({
    id: 'geometric-hexagonal',
    name: 'Geometrico hexagonal',
    category: 'geometric',
    intensity: 'medium',
    description: 'Angular moderno, cria interesse sem ficar tao reto quanto o quadrado.',
    guide: { totalWidth: 132, lensWidth: 47, lensHeight: 39, bridgeWidth: 18, defaultStrokeWidth: 2.6 },
    paths: {
      outerRight: 'M21 27 L31 12 L56 12 L69 27 L60 45 L33 47 Z',
      outerLeft: 'M71 27 L84 12 L109 12 L119 27 L107 47 L80 45 Z',
      innerRight: 'M29 28 L36 18 L54 18 L61 28 L55 39 L37 40 Z',
      innerLeft: 'M79 28 L86 18 L104 18 L111 28 L103 40 L85 39 Z',
      bridge: 'M67 27 C69 25 71 25 73 27',
      accents: [
        'M17 28 L21 27 M119 27 L123 28',
        'M64 31 C66 34 69 34 70 31 M70 31 C71 34 74 34 76 31',
      ],
    },
  }),
]

export function getFrameShapeTemplate(id: string) {
  return FRAME_SHAPE_TEMPLATES.find((shapeTemplate) => shapeTemplate.id === id) ?? null
}
