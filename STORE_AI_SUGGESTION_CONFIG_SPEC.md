# Configuração de Sugestões por Loja (UI + Rota) — Especificação para Implementação

Este documento descreve **exatamente** o que deve ser implementado para permitir que o gerente/dono configure pesos comerciais que influenciam a IA de recomendação de lentes **sem quebrar as regras clínicas**.  
Ele foi escrito para outra IA implementar com o mínimo de ida e volta.

---

## 1) Objetivo

Criar uma tela de **Configurações de Sugestões** na área do gerente/dono, onde ele define:

1. **Preferência por laboratório/tabela** (peso comercial forte)
2. **Perfil geral de clientes da loja** (3 dimensões)
3. **Preferências por marca dentro de cada categoria clínica** (ex.: ocupacional → Interview)

Esses ajustes **não podem substituir** a regra clínica.  
**Categoria clínica vem primeiro.**  
Os pesos atuam **apenas após a elegibilidade clínica**.

---

## 2) Cards da UI (definitivo)

### Card A — Preferências por Tabela (Laboratório)
Lista os catálogos ativos da loja e permite atribuir **peso forte** (1 a 5 estrelas).

**Regras:**
- Deve listar apenas **tabelas ativas** da loja.
- O peso é aplicado **depois da categoria clínica**.
- Peso nunca pode tornar elegível algo clinicamente inválido.
- Estrelas aqui podem **virar o resultado** quando a diferença técnica for pequena.

**Exemplo UI:**
- Optilab ★★★★★
- Gamalab ★★★
- HOYA ★★

**Regra de bônus (motor):**
`bonus_lab = (estrelas - 3) * 10`

---

### Card B — Perfil Geral da Loja
Três controles de perfil. Dois em **baixo / médio / alto** e um em **econômico / equilibrado / premium**.

Campos:
1. `investment_profile` (econômico / equilibrado / premium)
2. `tech_adoption` (apetite por tecnologia)
3. `aesthetic_priority` (prioridade estética)

**Efeito:**
Cada campo gera **um pequeno ajuste** na pontuação final.  
Ex.: loja com `investment_profile=premium` favorece opções premium quando já clinicamente válidas, **apenas se o cliente não informou orçamento**.

---

### Card C — Preferências por Marca dentro da Categoria
Aqui o gerente indica **qual marca é preferida para cada categoria clínica**.

Categorias:
- `multifocal`
- `ocupacional`
- `controle_miopia`
- `visao_simples`
- `bifocal`
- `plana_solar`

Para cada categoria:
1. Selecionar **uma ou mais marcas**
2. Dar um **peso de preferência** por marca (1–5)

**Regra crítica:**
O peso só é aplicado quando a recomendação **já está naquela categoria**.  
Ex.: Interview só recebe boost quando a categoria for `ocupacional`.

**Regra de bônus (motor):**
`bonus_brand = (estrelas - 3) * 8`

---

## 3) Rotas (sem implementar lógica da IA)

### Rota para salvar config
`POST /api/store/[storeId]/ai-suggestion-config`

Payload (exemplo):
```json
{
  "lab_preferences": [
    { "version_id": "uuid", "laboratorio": "Optilab", "weight": 4 }
  ],
  "store_profile": {
    "investment_profile": "equilibrado",
    "tech_adoption": "alto",
    "aesthetic_priority": "medio"
  },
  "category_brand_preferences": {
    "ocupacional": [
      { "brand": "Interview", "weight": 5 }
    ],
    "multifocal": [
      { "brand": "Varilux", "weight": 5 }
    ],
    "controle_miopia": [
      { "brand": "MinhaMarca", "weight": 5 }
    ]
  }
}
```

### Rota para leitura
`GET /api/store/[storeId]/ai-suggestion-config`

Resposta deve devolver o payload completo.

---

## 4) Persistência (tabela ou campo)

Você pode persistir:
- em um novo campo JSON (`stores.settings.ai_suggestion_config`)
ou
- em uma tabela dedicada `store_ai_suggestion_config`

**Preferido:** `stores.settings.ai_suggestion_config`  
mantém simples, sem migração complexa.

---

## 5) Como a IA vai usar isso (regra resumida)

Durante ranking:
1. **Categoria clínica decide o conjunto elegível.**
2. Aplicar **boost forte por laboratório**.
3. Aplicar **boost por perfil de loja** (só se orçamento não foi informado).
4. Aplicar **boost por marca dentro da categoria**.

**Nunca** usar esses pesos para recomendar categoria clínica errada.

---

## 6) Observações finais

- Não permitir pesos negativos.
- Deixar claro no UI que **a categoria clínica sempre vem primeiro**.
- UI deve ser simples, sem excesso de texto.

---

Se algo for implementado fora destes limites, o resultado pode contaminar as sugestões clínicas da IA.
