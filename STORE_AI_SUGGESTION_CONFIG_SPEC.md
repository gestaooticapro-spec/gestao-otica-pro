# Configuração de Sugestões por Loja (UI + Rota) — Especificação para Implementação

Este documento descreve **exatamente** o que deve ser implementado para permitir que o gerente/dono configure pesos comerciais que influenciam a IA de recomendação de lentes **sem quebrar as regras clínicas**.  
Ele foi escrito para outra IA implementar com o mínimo de ida e volta.

---

## 1) Objetivo

Criar uma tela de **Configurações de Sugestões** na área do gerente/dono, onde ele define:

1. **Preferência leve por laboratório** (tabela ativa)  
2. **Perfil geral de clientes da loja** (6 dimensões)  
3. **Preferências por marca dentro de cada categoria clínica** (ex.: ocupacional → Interview)

Esses ajustes **não podem substituir** a regra clínica.  
**Categoria clínica vem primeiro.**  
Os pesos atuam **apenas após a elegibilidade clínica**.

---

## 2) Cards da UI (definitivo)

### Card A — Preferências por Tabela (Laboratório)
Lista os catálogos ativos da loja e permite atribuir **peso leve** (0 a 5 estrelas ou slider 0–5).

**Regras:**
- Deve listar apenas **tabelas ativas** da loja.
- O peso é aplicado **depois da categoria clínica**.
- Peso nunca pode tornar elegível algo clinicamente inválido.

**Exemplo UI:**
- Optilab ★★★★
- Gamalab ★★★
- HOYA ★★

**Valor sugerido para peso final:**
- Estrela 0 = 0  
- Estrela 5 = +1.5 (boost leve)

---

### Card B — Perfil Geral da Loja
Seis controles de perfil com valores **baixo / médio / alto**.

Campos:
1. `price_sensitivity` (sensibilidade a preço)
2. `premium_preference` (preferência por premium)
3. `tech_adoption` (apetite por tecnologia)
4. `aesthetic_priority` (prioridade estética)
5. `durability_priority` (prioridade resistência)
6. `outdoor_usage` (uso externo / sol)

**Efeito:**
Cada campo gera **um pequeno ajuste** na pontuação final.  
Ex.: loja com `premium_preference=alto` favorece opções premium quando já clinicamente válidas.

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
2. Dar um **peso de preferência** por marca (0–5)

**Regra crítica:**
O peso só é aplicado quando a recomendação **já está naquela categoria**.  
Ex.: Interview só recebe boost quando a categoria for `ocupacional`.

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
    "price_sensitivity": "alto",
    "premium_preference": "medio",
    "tech_adoption": "alto",
    "aesthetic_priority": "medio",
    "durability_priority": "alto",
    "outdoor_usage": "alto"
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
2. Aplicar **boost leve por laboratório**.
3. Aplicar **boost por perfil de loja**.
4. Aplicar **boost por marca dentro da categoria**.

**Nunca** usar esses pesos para recomendar categoria clínica errada.

---

## 6) Observações finais

- Não permitir que o usuário configure pesos negativos.
- Deixar claro no UI que **a categoria clínica sempre vem primeiro**.
- UI deve ser simples, sem excesso de texto.

---

Se algo for implementado fora destes limites, o resultado pode contaminar as sugestões clínicas da IA.
