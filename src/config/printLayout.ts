// src/config/printLayout.ts

export const PRINT_CONFIG = {
  // === CAMPOS DE TEXTO SIMPLES ===
  // O sistema vai pegar o valor e imprimir nessas coordenadas
  
  os_numero: [
    { x: 71, y: 43 }, // Via Superior
    { x: 71, y: 98 }  // Via Inferior
  ],

  cliente_nome: [
    { x: 17, y: 45 },
    { x: 17, y: 111 }
  ],

  cliente_fone: [
    { x: 67, y: 105 } // Só existe na inferior
  ],

  // === CAMPOS FINANCEIROS (Formatação R$) ===
  
  total_venda: [
    { x: 29, y: 55 }, // Total à Vista (Sup)
    { x: 29, y: 121 }, // Total à Vista (Inf)
    { x: 75, y: 55 }, // Total a Prazo (Sup)
    { x: 75, y: 121 }  // Total a Prazo (Inf)
  ],

  valor_sinal: [ 
    { x: 21, y: 60 }, // Sinal (Sup)
    { x: 21, y: 126 }, // Sinal (Inf)
    { x: 70, y: 60 }, // Entrada (Sup) - É o mesmo valor
    { x: 70, y: 126 }  // Entrada (Inf)
  ],

  valor_restante: [
    { x: 27, y: 66 }, // "Retirada" (Sup)
    { x: 27, y: 132 }  // "Restante" (Inf)
  ],

  qtd_parcelas: [
    { x: 53, y: 66 }, // Sup
    { x: 53, y: 132 }  // Inf
  ],

  valor_primeira_parcela: [
    { x: 81, y: 66 }, // Sup
    { x: 81, y: 132 }  // Inf
  ],

  // === CAMPOS DE DATA (Desmembrados) ===
  
  data_emissao: {
    dia: [{ x: 18, y: 39 }, { x: 18, y: 105 }],
    mes: [{ x: 30, y: 39 }, { x: 30, y: 105 }],
    ano: [{ x: 42, y: 39 }, { x: 42, y: 105 }]
  },

  data_entrega: {
    dia:  [{ x: 37, y: 74 }, { x: 37, y: 139 }],
    mes:  [{ x: 50, y: 74 }, { x: 50, y: 139 }],
    hora: [{ x: 66, y: 74 }, { x: 66, y: 139 }],
    min:  [{ x: 77, y: 74 }, { x: 77, y: 139 }]
  },

  // === DADOS TÉCNICOS (Somente Via Inferior) ===
  od_esf:  [{ x: 11, y: 152 }],
  od_cil:  [{ x: 25, y: 152 }],
  od_eixo: [{ x: 44, y: 152 }],
  od_dnp:  [{ x: 37, y: 146 }],

  oe_esf:  [{ x: 61, y: 152 }],
  oe_cil:  [{ x: 75, y: 152 }],
  oe_eixo: [{ x: 92, y: 152 }],
  oe_dnp:  [{ x: 83, y: 146 }],

  adicao:   [{ x: 17, y: 159 }],
  altura:   [{ x: 40, y: 159 }],
  diametro: [{ x: 65, y: 159 }],
  
  // === PRODUTOS ===
  desc_lente:    [{ x: 27, y: 165 }],
  valor_lente:   [{ x: 85, y: 165 }],
  
  desc_armacao:  [{ x: 22, y: 171 }],
  valor_armacao: [{ x: 85, y: 171 }],

  laboratorio:   [{ x: 37, y: 179 }]
}