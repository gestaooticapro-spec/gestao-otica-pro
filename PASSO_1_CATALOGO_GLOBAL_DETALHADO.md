# Passo 1: Catalogo Global de Lentes - Arquitetura Detalhada

> Status: Documento de arquitetura e planejamento.
> Escopo: Definir a base tecnica que sustenta leitura offline de PDFs, catalogo global curado, ativacao por loja, sugestao futura por IA, composicao na venda/OS e alimentacao do canvas.
> Decisao operacional: Nao vamos criar agora uma UI para ler PDF e montar tabelas globais. A ingestao inicial sera feita offline por aqui, com scripts e curadoria humana.

---

## 1. Objetivo real do Passo 1

O Passo 1 nao e "ler um PDF com IA".

O Passo 1 e construir um dominio confiavel que transforme PDFs confusos de laboratorio em um catalogo tecnico e comercial reutilizavel, versionado, auditavel e ativavel por loja.

Se errarmos essa base, os demais pontos quebram:

1. A venda/OS nao consegue compor lente e tratamento de forma segura.
2. A IA da analise sugere lente errada ou promete o impossivel.
3. O canvas passa a desenhar uma realidade tecnica falsa.
4. A conciliacao futura com XML/NFe fica fraca ou impossivel.

Por isso, o Passo 1 precisa ser pensado como fundacao de dominio, nao como automacao isolada.

---

## 2. Principios de arquitetura

### 2.1. O PDF e fonte, nao verdade operacional

O PDF do laboratorio:
- mistura marketing, instrucoes, tabelas, nomes comerciais e regras tecnicas
- pode vender composicoes e pacotes fechados na mesma pagina
- pode repetir a mesma semantica em familias diferentes
- pode usar nomes inconsistentes

Portanto:
- o PDF deve ser preservado
- o texto extraido deve ser preservado
- a decisao do sistema nao deve depender de ler o PDF em tempo real

### 2.2. Texto bruto e importante, mas nao basta

Vamos manter:
- nome original do item
- texto completo do documento
- chunks e evidencias por pagina/trecho

Mas a operacao precisa de dados estruturados:
- indice
- material
- design
- tipo de visao
- faixa tecnica
- features
- tratamentos permitidos
- status de oferta atomica ou componivel

### 2.3. Nem tudo sera composicao pura

Precisamos suportar dois modos:

- Oferta componivel
  - Exemplo: `Dynamic Premium 1.56`
  - Pode receber tratamentos compativeis.

- Oferta atomica
  - Exemplo: `Blue UV 1.56 com AR Externo`
  - Ja inclui componentes e pode bloquear novas composicoes.

Esse ponto e obrigatorio. O modelo "hamburguer puro" nao aguenta PDFs reais como o da Gamalab.

### 2.4. IA explica e ajuda; regras validam

A IA futura:
- ajuda a extrair
- ajuda a resumir
- ajuda a sugerir
- ajuda a explicar

A IA nao deve:
- decidir compatibilidade tecnica sozinha
- autorizar tratamento invalido
- inventar feature ausente
- substituir a matriz relacional de regra

### 2.5. Provisionamento por snapshot

A loja nao deve depender da tabela global "viva" em tempo real.

O fluxo correto e:
- montar catalogo global
- publicar versao
- loja ativar/provisionar
- gerar snapshot local da versao

Isso protege:
- historico
- precificacao
- consistencia
- conciliacao futura

---

## 3. Os 4 pontos do projeto e como o Passo 1 resolve cada um

### Ponto 1: Leitura por IA e tabelas globais adormecidas

Resolucao:
- construir dominio global versionado
- importar PDFs offline
- salvar bruto + estruturado + evidencia
- aprovar manualmente
- publicar como versao global
- permitir ativacao por loja

### Ponto 2: Nova composicao na venda/OS

Resolucao:
- cada oferta global ja informa se e atomica ou componivel
- cada oferta conhece suas features e tratamentos compativeis
- a venda para de depender apenas de `products` soltos
- a venda passa a montar uma configuracao de lente baseada em catalogo provisionado

### Ponto 3: IA na analise

Resolucao:
- a IA da analise nao vai consultar o PDF inteiro
- ela recebe shortlist estruturada das opcoes elegiveis
- usa tags, features, beneficios e evidencias para justificar recomendacao

### Ponto 4: Canvas

Resolucao:
- o canvas passa a consumir dados estruturados do catalogo
- nao depende de leitura textual solta
- usa medidas, indice, design, adicao, features e perfis de uso

### Ponto 5 futuro: XML/NFe

Resolucao:
- a venda gera snapshot de configuracao
- o sistema preserva nome comercial, composicao e referencias
- a conciliacao futura nao precisa depender da tabela global atual, e sim do snapshot vendido

---

## 4. Arquitetura em camadas

## Camada A: Fonte documental e evidencias

Funcao:
- guardar o PDF original
- guardar texto completo extraido
- guardar chunks e paginas
- manter rastreabilidade e auditoria

Entidades recomendadas:
- `catalog_source_documents`
- `catalog_source_pages`
- `catalog_source_chunks`

Campos importantes:
- laboratorio
- nome_documento
- hash
- versao_referencia
- arquivo_url ou caminho local
- texto_completo
- pagina
- chunk_text
- origem_extracao

Uso:
- auditoria humana
- reprocessamento
- explicacao da IA
- ligacao com familias/ofertas/tratamentos

## Camada B: Dominio global estruturado

Funcao:
- representar semanticamente o catalogo do laboratorio
- suportar filtro tecnico, composicao, IA e publicacao de versoes

Entidades recomendadas:
- `global_catalog_versions`
- `global_lens_families`
- `global_lens_offers`
- `global_treatments`
- `global_offer_treatments_compatibility`
- `global_offer_diopter_grids`
- `global_offer_features`
- `global_usage_profiles`
- `global_source_evidence`

## Camada C: Provisionamento por loja

Funcao:
- ativar uma versao global dentro da loja
- ajustar preco, nome comercial, status de ativacao
- congelar o conjunto importado

Entidades recomendadas:
- `tenant_catalog_activations`
- `tenant_commercial_offers`
- `tenant_commercial_treatments`
- `tenant_offer_status`

## Camada D: Snapshot de venda/OS

Funcao:
- preservar a lente configurada e vendida
- impedir perda de historico se o catalogo global mudar
- viabilizar XML futuro

Entidades recomendadas:
- `sales_lens_configurations`
- `sales_lens_configuration_treatments`
- `sales_lens_configuration_prescription`

---

## 5. Modelo conceitual do catalogo global

### 5.1. Familia

Representa o grupo descritivo principal.

Exemplos:
- `Dynamic Premium`
- `Gamavision 4K`
- `Gamavision Individual Freeform`

Deve guardar:
- nome
- laboratorio
- categoria
- design
- descricoes comerciais
- tags de uso
- tags de beneficio

### 5.2. Oferta

A oferta e o coracao do sistema.
Ela representa aquilo que realmente aparece na tabela e pode ser ativado/vendido.

Exemplos:
- `1.56`
- `Blue UV 1.56`
- `Blue UV 1.56 com AR Externo`
- `Transitions 1.67`

Campos importantes:
- `raw_label`
- `canonical_label`
- `family_id`
- `indice_refracao`
- `material`
- `is_atomic_offer`
- `allows_composition`
- `already_includes_treatment`
- `base_price`
- `confidence_level`

Importante:
- a oferta nao deve concentrar toda a "grade" em colunas simples
- uma mesma oferta pode ter multiplos blocos tecnicos de validade
- por isso a grade deve ser filha da oferta, nao embutida de forma unica

### 5.3. Feature

Feature nao e o mesmo que tratamento.
Ela representa semantica detectada.

Exemplos:
- `blue_uv`
- `fotossensivel`
- `polarizada`
- `espelhada`
- `antirreflexo_externo`

Pode ser salva:
- como tabela propria
- ou como JSONB controlado

Minha recomendacao:
- usar tabela relacional para o conceito
- usar JSONB complementar para detalhes menores

### 5.4. Tratamento

Representa entidades como:
- `Sigma Blue`
- `Sigma Supreme`
- `Sigma Premium`
- `AR Externo`

Cada tratamento deve ter:
- nome
- tipo
- laboratorio
- tags
- regras complementares

### 5.5. Matriz de compatibilidade

Essa tabela resolve o medo central da UX.

Em vez de mostrar tudo e deixar o usuario errar:
- a oferta selecionada consulta a matriz
- o sistema mostra apenas os tratamentos permitidos
- os demais ficam ocultos ou bloqueados

Isso precisa ser relacional, nao textual.

Evolucao importante:
- a compatibilidade pode carregar preco especifico daquela juncao
- isso cobre casos em que o laboratorio cobra um valor diferente para um AR dependendo da oferta/material

### 5.6. Grade tecnica multipla

Uma mesma oferta pode ter varios blocos de grade.

Exemplo conceitual:
- para certa faixa esferica, aceita cilindrico ate `-2.00`
- para outra faixa mais extrema, aceita cilindrico ate `-1.00`

Por isso, nao devemos modelar a grade como um unico range por oferta.

Precisamos de uma tabela filha:
- uma oferta
- varias linhas de grade
- cada linha representa um bloco tecnico valido

Essa decisao melhora muito a seguranca da validacao.

---

## 6. Estrategia de modelagem para o caso real do PDF

O PDF da Gamalab mostrou exemplos como:
- `Blue UV 1.56`
- `Blue UV 1.56 com AR Externo`
- familias com grupos Sigma que funcionam como antirreflexo

Logo, a modelagem precisa aceitar:

### Caso A: oferta base componivel

`Dynamic Premium 1.56`

Interpretacao:
- oferta componivel
- aceita Sigma Blue
- aceita Sigma Supreme
- aceita Sigma Premium

### Caso B: oferta semi-processada

`Blue UV 1.56`

Interpretacao:
- pode ser uma oferta ainda componivel
- ja possui feature `blue_uv`
- pode ou nao aceitar novo AR, conforme matriz

### Caso C: oferta fechada

`Blue UV 1.56 com AR Externo`

Interpretacao:
- oferta atomica
- ja inclui tratamento
- deve informar isso claramente na UX
- pode bloquear adicao de outro antirreflexo

### Regra geral

O parser sempre deve salvar primeiro a oferta como ela existe na tabela.
Depois ele tenta decompor semanticamente.

Se a decomposicao for boa:
- marcamos componentes
- ligamos features e tratamentos

Se a decomposicao for incerta:
- a oferta continua valida como item atomico
- fica com evidencia e nivel de confianca
- segue para revisao humana

---

## 7. Pipeline offline de ingestao do PDF

## Etapa 1: Registrar o documento fonte

Entrada:
- PDF bruto

Salvar:
- arquivo
- hash
- laboratorio
- nome do documento
- data de vigencia

## Etapa 2: Extrair texto e blocos

Tecnicas:
- extracao textual normal
- OCR apenas se necessario
- segmentacao por pagina e bloco

Salvar:
- texto completo
- paginas
- chunks

## Etapa 3: Separar zonas do PDF

Precisamos diferenciar:
- paginas descritivas de marketing
- paginas de tabela de preco
- cabecalhos de familia
- colunas de tratamento e indice

Essa etapa pode ser heuristica + IA.

## Etapa 4: Extrair familias

Exemplo:
- `Dynamic Premium`

Extrair:
- nome
- design
- beneficios
- tags de uso

## Etapa 5: Extrair ofertas

Exemplo:
- `Blue UV 1.56 com AR Externo`

Extrair:
- rotulo cru
- familia associada
- preco
- indice
- possiveis features
- possivel tratamento
- pagina/trecho de origem

## Etapa 6: Normalizacao semantica

Detectar:
- `blue uv`
- `com AR Externo`
- `Transitions`
- `Photofusion`
- `Polarizado`

Gerar:
- features canonicas
- tratamentos
- flags de oferta atomica
- confianca

Tambem gerar, quando possivel:
- blocos de grade tecnica
- matriz preliminar de compatibilidade
- precos especiais por juncao oferta+tratamento

## Etapa 7: Matriz de compatibilidade

A partir da tabela:
- identificar quais ofertas aceitam quais tratamentos
- identificar quais ja incluem um tratamento
- bloquear combinacoes conflitantes

## Etapa 8: Curadoria humana

Tela interna nao e prioridade agora.
A curadoria inicial pode ser feita por aqui:
- gerar CSV/JSON intermediario
- revisar ambiguidades
- ajustar rotulos
- confirmar compatibilidades

## Etapa 9: Publicar versao global

Depois da curadoria:
- a versao sai de `draft`
- passa para `published`
- fica disponivel para ativacao pelas lojas

## Etapa 10: Provisionar para a loja

Depois da publicacao:
- a loja ativa uma versao global
- o sistema cria o conjunto comercial local
- o conjunto provisionado deve manter referencia da versao global de origem

Mesmo que o snapshot comercial local nao tenha versionamento complexo, ele precisa manter rastreabilidade:
- qual catalogo foi ativado
- qual versao publicou a oferta
- quando a loja sincronizou

Isso ajuda em auditoria, suporte e BI.

---

## 8. Como a loja vai ativar o catalogo

O fluxo da loja deve ser simples.

Ela nao sobe PDF.
Ela nao monta regra tecnica.
Ela nao faz parser.

Ela apenas:
- ve cards de catalogos publicados
- escolhe uma versao
- ativa esse catalogo

Ao ativar:
- o sistema provisiona um snapshot local
- cria ofertas comerciais locais
- aplica parametros comerciais
- deixa a loja ativar/desativar itens

Nome tecnico recomendado:
- ativar catalogo
- provisionar catalogo
- importar snapshot de catalogo

---

## 9. Como a venda/OS deve usar isso no futuro

Hoje a venda depende muito de `products` e `venda_itens`.
No futuro, para lentes laboratoriais, ela deve usar uma configuracao de lente.

Fluxo esperado:

1. Receber receita e medidas.
2. Filtrar ofertas elegiveis por regra tecnica.
3. Mostrar:
   - nome original
   - nome amigavel
   - badges de features
   - faixa de preco
4. Se a oferta for atomica:
   - exibir `ja inclui`
   - bloquear composicao invalida
5. Se a oferta for componivel:
   - consultar matriz de compatibilidade
   - exibir apenas tratamentos permitidos
6. Gerar snapshot final da configuracao

Esse snapshot e o que vai para OS, relatorios, IA e XML futuro.

Decisao importante:
- a venda nao deve confiar no catalogo provisionado para reconstruir o passado
- o ato da venda precisa gerar snapshot imutavel
- o catalogo provisionado ajuda operacao e BI
- o snapshot protege o historico faturado

---

## 10. Como a IA da analise vai consultar isso no futuro

A IA nao deve ler o PDF inteiro na hora da sugestao.

Fluxo correto:

1. O sistema filtra por SQL e regra estruturada:
   - grau
   - adicao
   - medidas
   - catalogo ativo da loja
   - faixa de preco
   - compatibilidades

2. O sistema gera uma shortlist.

3. A IA recebe para cada opcao:
   - nome da oferta
   - familia
   - features
   - tags de uso
   - tratamentos disponiveis
   - preco
   - resumo comercial
   - evidencias do PDF, se necessario

4. A IA:
   - ordena
   - explica
   - sugere
   - alerta risco

O sistema valida.
A IA justifica.

---

## 11. Como o canvas vai usar o Passo 1

O canvas so deve nascer quando houver dado confiavel.

Dados que podem vir do Passo 1:
- tipo de visao
- design
- tags como `computador`, `leitura`, `adaptacao_rapida`
- indice
- familias premium/intermediarias/basicas
- presencia de blue uv, foto, polarizado

Dados que o canvas nao deve inventar:
- efeito optico exato sem base tecnica
- comportamento fisico sem parametro confiavel

Conclusao:
- Passo 1 alimenta o canvas
- mas nao devemos prometer simulacao fisica completa se o catalogo nao trouxer base suficiente

---

## 12. Estrategia para XML/NFe no futuro

O XML futuro sera mais facil se a venda gerar snapshot completo.

Na hora da venda devemos guardar:
- nome exibido
- familia
- componentes aplicados
- preco base
- tratamentos
- features
- referencias de codigo, quando existirem

Assim, quando vier o XML:
- nao dependemos do catalogo atual
- nao dependemos do nome ter permanecido igual
- conciliamos com o que foi efetivamente vendido

Recomendacao de modelagem:
- manter JSONB de snapshot para espelhar rapidamente o "pacote vendido"
- mas nao depender apenas dele
- manter tambem estrutura relacional para itens relevantes do snapshot

Exemplo:
- `sales_lens_configurations`
- `sales_lens_configuration_treatments`

O JSONB ajuda a preservar fidelidade textual/fiscal.
A tabela filha ajuda relatorios, busca e validacao.

---

## 13. Riscos principais e mitigacoes

### Risco 1: parser extrai componente errado

Mitigacao:
- salvar oferta crua
- salvar confianca
- exigir revisao nos casos ambiguos

### Risco 2: UX confusa entre item fechado e item componivel

Mitigacao:
- badge visual obrigatoria:
  - `ja inclui AR Externo`
  - `permite composicao`
- comportamento de tela diferente para cada caso

### Risco 3: excesso de dependencia em JSONB

Mitigacao:
- JSONB apenas para complemento e evidencia
- regra tecnica e compatibilidade em tabelas relacionais
- snapshot fiscal pode usar JSONB como espelho, mas nao como unica estrutura

### Risco 4: loja importar catalogo vivo e perder consistencia

Mitigacao:
- ativacao por snapshot versionado

### Risco 5: IA sugerir opcao tecnicamente invalida

Mitigacao:
- shortlist filtrada antes
- IA sem poder de validacao tecnica

---

## 14. Decisoes fechadas

1. Nao criar agora UI de leitura de PDF.
2. Fazer ingestao offline por scripts com curadoria humana.
3. Preservar texto bruto e PDF como evidencia.
4. Estruturar dados criticos em dominio relacional.
5. Suportar oferta atomica e componivel.
6. Filtrar compatibilidade por banco, nao por IA.
7. Provisionar catalogo para a loja por snapshot.
8. Fazer o Passo 1 primeiro como fundacao dos demais.

---

## 15. Ordem recomendada de implementacao

1. Definir schema minimo do dominio global.
2. Definir estrategia de migracao dos campos `receita_*` hoje em `TEXT`.
3. Criar migrations das tabelas globais.
4. Criar tipos do banco.
5. Criar scripts offline de leitura e extracao.
6. Criar formato intermediario de revisao humana.
7. Publicar a primeira versao global curada.
8. Criar mecanismo de ativacao por loja.
9. Adaptar venda/OS para configuracao de lente.
10. Integrar IA da analise a shortlist estruturada.
11. Avaliar canvas e XML sobre a base consolidada.

Observacao sobre a migracao de receitas:
- a direcao correta e sair de `TEXT` para tipos numericos
- mas a transicao precisa ser cuidadosa
- preferencialmente com backfill e camada de compatibilidade temporaria
- nao e recomendavel uma troca brusca sem adaptar os pontos atuais da aplicacao

---

## 16. Decisoes de schema fechadas para iniciar

Estas decisoes ja parecem maduras o bastante para servir como base do modulo:

1. O catalogo global sera versionado.
2. A oferta global sera a unidade central de ativacao e venda.
3. A grade tecnica ficara em tabela filha `global_offer_diopter_grids`.
4. A compatibilidade com tratamento sera relacional `N:N`.
5. A compatibilidade pode ter preco especifico por juncao oferta+tratamento.
6. A oferta pode ser atomica ou componivel.
7. Texto bruto do PDF sera preservado.
8. Evidencias documentais ficarao separadas do dominio operacional.
9. A loja ativara snapshots do catalogo global.
10. A venda gerara snapshot proprio e imutavel.
11. JSONB sera usado como apoio, nao como motor principal de regra.
12. A IA nao valida tecnicamente; ela sugere sobre shortlist ja filtrada.

---

## 17. Proposta de schema inicial consolidado

Trecho conceitual para unificar o que ficou melhor entre os dois documentos:

```sql
CREATE TABLE global_catalog_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    laboratorio TEXT NOT NULL,
    versao TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    published_at TIMESTAMPTZ NULL
);

CREATE TABLE global_lens_families (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    version_id UUID NOT NULL REFERENCES global_catalog_versions(id) ON DELETE CASCADE,
    nome TEXT NOT NULL,
    design TEXT NOT NULL,
    tags_beneficios TEXT[] NULL
);

CREATE TABLE global_lens_offers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_id UUID NOT NULL REFERENCES global_lens_families(id) ON DELETE CASCADE,
    raw_label TEXT NOT NULL,
    canonical_label TEXT NULL,
    material TEXT NULL,
    indice_refracao NUMERIC(5,2) NULL,
    is_atomic_offer BOOLEAN NOT NULL DEFAULT FALSE,
    allows_composition BOOLEAN NOT NULL DEFAULT TRUE,
    already_includes_treatment BOOLEAN NOT NULL DEFAULT FALSE,
    features JSONB NOT NULL DEFAULT '{}'::jsonb,
    base_price NUMERIC(10,2) NULL,
    confidence_level NUMERIC(4,2) NULL
);

CREATE TABLE global_offer_diopter_grids (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    offer_id UUID NOT NULL REFERENCES global_lens_offers(id) ON DELETE CASCADE,
    sph_min NUMERIC(5,2) NOT NULL,
    sph_max NUMERIC(5,2) NOT NULL,
    cyl_min NUMERIC(5,2) NOT NULL DEFAULT 0.00,
    cyl_max NUMERIC(5,2) NOT NULL,
    add_min NUMERIC(5,2) NULL,
    add_max NUMERIC(5,2) NULL
);

CREATE TABLE global_treatments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    version_id UUID NOT NULL REFERENCES global_catalog_versions(id) ON DELETE CASCADE,
    nome TEXT NOT NULL,
    tipo TEXT NOT NULL
);

CREATE TABLE global_offer_treatments_compatibility (
    offer_id UUID NOT NULL REFERENCES global_lens_offers(id) ON DELETE CASCADE,
    treatment_id UUID NOT NULL REFERENCES global_treatments(id) ON DELETE CASCADE,
    special_price NUMERIC(10,2) NULL,
    PRIMARY KEY (offer_id, treatment_id)
);
```

Esse bloco nao fecha todo o dominio, mas fecha a espinha dorsal do Passo 1.

---

## 18. Resultado esperado do Passo 1

Ao final do Passo 1, devemos ter:

- uma versao global de catalogo publicada
- familias, ofertas, tratamentos e compatibilidades estruturados
- blocos de grade tecnica por oferta
- evidencias do PDF preservadas
- uma estrategia clara para provisionamento por loja
- base solida para venda/OS, IA de analise e canvas

Se o Passo 1 ficar bem feito, os demais modulos deixam de ser adivinhacao e passam a operar sobre uma verdade catalogal consistente.
