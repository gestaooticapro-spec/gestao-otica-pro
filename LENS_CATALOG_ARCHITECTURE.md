# Arquitetura de Catálogo de Lentes: Modelo Híbrido Consolidado

> **Status:** Consenso Arquitetural Aprovado.
> **Princípio Central:** Não tentaremos encaixar a complexidade laboratorial ótica num modelo "hambúrguer puro", nem usaremos o `JSONB` como motor de regras. O PDF será processado offline, gerando um catálogo técnico bruto global com curadoria, que a loja poderá ativar via Snapshots.

### DecisÃ£o Adicional: Recomendação Final Exige Categoria Clínica e Semântica de Preço
Para permitir respostas futuras no formato:
- `Opção 1 (recomendo): Varilux Physio Extensee + Crizal + Transitions — R$ 7.300,00`
- `Opção 2: Varilux Liberty ...`

o catálogo precisa guardar, de forma estruturada:
- **`clinical_category`** na família e na oferta
  - valores como `multifocal`, `visao_simples`, `ocupacional`, `bifocal`, `controle_miopia`, `plana_solar`, `mista`, `indefinida`
  - isso evita que um caso com adição receba visão simples por erro de ranking
- **`price_mode`** na compatibilidade oferta + tratamento
  - `final`: o preço da coluna já é o preço final da combinação
  - `surcharge`: o valor é acréscimo sobre a oferta base

Regra de negócio:
- a recomendação final escolhe uma **configuração específica**, não só uma família
- o motor precisa resolver:
  1. categoria clínica compatível com o caso
  2. oferta tecnicamente elegível
  3. tratamento compatível
  4. preço final consistente
  5. justificativa semântica para a sugestão

---

## 1. O Desafio e a Solução Híbrida

Lentes de visão não são todas vendidas como "Base + Adicionais". Fabricantes (Gamalab, Essilor, Hoya) possuem ofertas mistas em suas tabelas:
- **Oferta Componível:** Ex: *Dynamic Premium 1.56*. Pode receber tratamentos avulsos compatíveis (Sigma Blue, Sigma Supreme, etc.).
- **Oferta Atômica:** Ex: *Blue UV 1.56 com AR Externo*. Já inclui tratamento, é um pacote fechado, não aceita outro antirreflexo.

**Nossas premissas de UX e Inteligência:**
1. A interface filtrará primeiro pela regra técnica (Grau do cliente x Limites de produção da lente).
2. Se a lente for atômica, tratamentos incompatíveis são bloqueados. Se componível, apenas tratamentos da matriz de compatibilidade aparecem.
3. **A IA NÃO decide compatibilidade.** O sistema filtra as opções válidas. A IA atua na "última milha" como consultora (explicando os motivos da sugestão baseada nas tags `computador`, `leitura`, `blue_uv`).
4. **Sem UI de PDF para o cliente:** Os PDFs serão extraídos e validados offline, gerando as tabelas globais curadas.

---

## 2. A Fundação em 3 Camadas

A arquitetura será estritamente dividida para evitar corrupção de dados entre o catálogo do fabricante (Física), o estoque da loja (Comercial) e a Nota Fiscal (XML Fiscal).

### Camada A: Catálogo Técnico Global (A "Bíblia" do Laboratório)
Representação estruturada e normalizada dos catálogos dos fabricantes, processada via scripts offline + IA e com revisão humana do nosso lado.

### Camada B: Catálogo Comercial da Ótica (Provisionamento)
A loja "ativa um snapshot" de uma versão global. O catálogo provisionado recebe a precificação final, ativações e pode ter o Nome alterado para a prateleira.

### Camada C: Snapshot de Venda / O.S. (A Configuração da Lente)
Ao vender, não jogamos "itens avulsos" na OS. Geramos uma `Configuração de Lente` imutável, armazenando a geometria do grau, o ID referencial e um snapshot dos preços e nome aplicado (Crucial no futuro para cruzamento de XML).

### Decisão Adicional: Serviços Não São Lentes
Itens como `Surfaçagem`, `Montagem`, `Retífica`, `Prisma`, `Ultra Light`, `Promoções`, `Caneta teste Foto` e cobranças operacionais **não entram na tabela de lentes**.

Eles devem existir no catálogo final, porém em uma camada própria, separada de:
- `global_lens_offers` (lentes/ofertas vendáveis)
- `global_treatments` (antirreflexo, Transitions, coloração, etc.)

No futuro, o domínio deverá contemplar uma estrutura específica de `services / complements / surcharges`, para que:
- não haja confusão de UX na escolha da lente;
- a IA não trate serviço como se fosse produto óptico;
- a venda possa compor preço final sem poluir a lista principal de lentes.

### Decisão Adicional: Versionamento Sem Duplicidade na Loja
Cada nova tabela global publicada pelo laboratório deve gerar uma **nova versão global**, e a loja deve ativá-la por **snapshot**.

Regras de negócio futuras:
- a nova importação **não substitui fisicamente** o histórico anterior;
- a nova ativação cria um novo snapshot comercial local;
- snapshots antigos permanecem arquivados para histórico, auditoria e conciliação;
- a tela de venda da loja deve listar **somente a versão ativa**;
- portanto, o usuário final **não pode ver produtos duplicados** por causa de versões antigas.

Em resumo:
- histórico preservado no banco;
- uma ativação comercial ativa por vez na loja;
- busca comercial filtrada pela ativação vigente.

---

## 3. Schema Inicial Recomendado: O Passo 1 (Visão Global)

Aqui desenhamos o Banco de Dados do Catálogo Técnico Global, abordando Família, Oferta, Tratamento e Compatibilidade.

```sql
-- 1. Controle de Versão do Catálogo do Laboratório
CREATE TABLE global_catalog_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    laboratorio TEXT NOT NULL,         -- Ex: 'Gamalab'
    versao TEXT NOT NULL,              -- Ex: 'Lentes Prontas 2024'
    published_at TIMESTAMPTZ,
    status TEXT DEFAULT 'draft',       -- 'draft', 'published', 'archived'
    raw_pdf_url TEXT NULL
);

-- 2. Famílias de Lentes (Agrupamento Descritivo e de Marketing)
CREATE TABLE global_lens_families (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    version_id UUID REFERENCES global_catalog_versions(id) ON DELETE CASCADE,
    nome TEXT NOT NULL,                -- Ex: 'Dynamic Premium'
    design TEXT NOT NULL,              -- Ex: 'Multifocal'
    -- Tags vindas das páginas de marketing do PDF. Nutrirão o prompt da IA:
    tags_beneficios TEXT[]             -- Ex: ['computador', 'conforto_visual', 'leitura']
);

-- 3. As Ofertas da Tabela (O coração do sistema)
CREATE TABLE global_lens_offers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_id UUID REFERENCES global_lens_families(id) ON DELETE CASCADE,
    
    -- Texto inalterado como saiu da página do PDF (Evidência e Auditoria)
    raw_label TEXT NOT NULL,           -- Ex: "Blue uv 1.56 com AR Externo"
    nome_canonico TEXT NULL,
    material TEXT NOT NULL,            -- Ex: 'Resina'
    indice_refracao NUMERIC(4,2) NOT NULL, -- Ex: 1.56
    
    -- Controle de Composição (Crucial)
    is_atomic_offer BOOLEAN NOT NULL DEFAULT false,
    
    -- Semântica Detectada pela Extração Offline (Tags Estruturadas)
    features JSONB NOT NULL DEFAULT '{}'::jsonb, 
    -- Exemplo: {"blue_uv": true, "has_antirreflexo": true, "antirreflexo_tipo": "externo"}

    -- Matriz Restritiva Técnica (Motor Numérico, não TEXT)
    sph_min NUMERIC(5,2) NOT NULL,
    sph_max NUMERIC(5,2) NOT NULL,
    cyl_max NUMERIC(5,2) NOT NULL DEFAULT 0.00,
    add_min NUMERIC(5,2) NULL,
    add_max NUMERIC(5,2) NULL,
    
    -- Dados de Preço de Fábrica (se constante na grade) e Evidência
    base_price NUMERIC(10,2) NULL,
    page_reference TEXT NULL,          -- Identificação no PDF (ex: 'Página 12')
    confidence_level NUMERIC(4,2) NULL -- Confiança da extração da IA (0.00 a 1.00)
);

-- 4. Tratamentos Estruturados 
CREATE TABLE global_treatments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    version_id UUID REFERENCES global_catalog_versions(id) ON DELETE CASCADE,
    nome TEXT NOT NULL,                -- Ex: 'Sigma Supreme'
    tipo TEXT NOT NULL                 -- Ex: 'Antirreflexo'
);

-- 5. Matriz de Compatibilidade Rígida
-- A IA "Consultora" da Loja nunca adivinha; ela só pode sugerir tratamentos listados aqui.
CREATE TABLE global_offer_treatments_compatibility (
    offer_id UUID REFERENCES global_lens_offers(id) ON DELETE CASCADE,
    treatment_id UUID REFERENCES global_treatments(id) ON DELETE CASCADE,
    PRIMARY KEY (offer_id, treatment_id)
);
```

## Próximos Passos (Workflow Prático)

Conforme alinhado, as Etapas de Implementação seguirão esta exata restrição:
1. Validar e aplicar este sub-sistema gerando as Types.
2. Criar os nossos scripts offline para gerar a primeira V1 da Base Global (Lendo tabelas como a Gamalab em Python/TS locais) e inserindo no banco.
3. Construir a Interface "Ativar Catálogo" no Dashboard do Gestor (Onde ele aceita a tabela provisionando para a loja dele em `tenant_commercial_*`).
4. Remodelar a arquitetura da Venda/O.S. englobando tudo num `LENS_CONFIG`.
