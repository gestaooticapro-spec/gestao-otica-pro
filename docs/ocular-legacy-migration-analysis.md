# Análise da migração legada — Óticas Ocular (Optisis + programa intermediário)

> Status: **ANÁLISE AUDITADA — MIGRAÇÃO NÃO EXECUTADA**.
> Este documento preserva tudo o que foi descoberto em 2026-08-06 sobre os dados
> legados da Óticas Ocular, para que a migração possa ser executada no futuro sem
> refazer a investigação.
> **Decisão de segurança: a migração NÃO deve rodar contra o banco de produção.**
> Ver seção 9 (Estratégia de execução segura).
>
> Auditoria independente concluída em 2026-08-06: as conclusões confirmadas,
> as exceções e os bloqueios de execução estão nas seções 4, 5, 7 e 8.

## 1. Fontes de dados (`.backupcharles/`)

| Arquivo | Tipo | Conteúdo | Linhas |
|---|---|---|---|
| `clientesÓticas Ocular-06-08-2026.xlsx` | Excel (programa novo) | Cadastro completo de clientes | ~7.076 |
| `Receitas Óticas Ocular-06-08-2026.xlsx` | Excel (programa novo) | Receitas/graus por cliente | ~1.362 |
| `Vendas Óticas Ocular-06-08-2026.xlsx` | Excel (programa novo) | Vendas do período do programa novo | ~1.894 |
| `Contas a Receber Óticas Ocular-06-08-2026.xlsx` | Excel (programa novo) | Títulos/parcelas | ~1.219 |
| `produtos_06-08-2026.xlsx` | Excel (programa novo) | Catálogo de produtos | ~160 |
| `bdoptsis.mdb` (58 MB, backup 20/07/2026) | Access/Jet | **Banco de dados real do Optisis** | ver seção 3 |
| `optisis bk.mdb` (5,7 MB) | Access/Jet | **Frontend** do Optisis (só `Switchboard Items` + tabelas vinculadas apontando para `C:\Optisis\Dados\bdoptsis.mdb`) | — |

Colunas das planilhas (extraídas do XML interno dos xlsx):

- **Clientes**: Nome, Código, CPF, RG, Ótica, Ativo, Celular, Telefone, Data Nascimento, Rua, Número, Cidade, Bairro, Estado, CEP, Nome do Pai, Nome da Mãe, Profissão, Contribuinte ICMS, IE, IM, Observação, Origem do Cliente, Data do Cadastro, Email
- **Receitas**: Nome do Cliente, CPF do Cliente, Data do Exame, Oftalmo/Opto, OD/OE Longe (Esf/Cil/Eixo), OD/OE Perto (Esf/Cil/Eixo), Adição, Observação
- **Vendas**: Data, Número, Cliente, CPF, Celular, Vendedor, Status, Subtotal, Desconto, Acréscimo, Valor Total, Origem Cliente
- **Contas a Receber**: Numero, Nome Cliente, Histórico, Forma Pagamento, Data Vencimento, Data Pagamento, Situação, Valor
- **Produtos**: Referência, Nome, Unidade, Fornecedor, Categoria, Marca, NCM, Controla Estoque, Preço Custo, Preço Venda, Estoque Atual, Ativo, Data Cadastro, Ótica

## 2. Sobre a senha do Optisis

- Formato Jet (Access 97-2003). A senha de banco Jet é fraca (XOR com chave conhecida) e, na prática, **ferramentas de leitura de baixo nível a ignoram** — lemos todo o conteúdo sem saber a senha, usando [Jackcess](https://jackcess.sourceforge.io/).
- O VBA do frontend **não** foi extraído (`olevba` não suporta `.mdb`; não há
  Microsoft Access instalado neste ambiente). O frontend confirmou que mantém
  localmente apenas `Switchboard Items` e referências para todas as tabelas de
  negócio em `C:\Optisis\Dados\bdoptsis.mdb`; porém formulários/módulos ficam
  em tabelas de sistema que Jackcess não consegue ler. A ausência de VBA **não**
  pode ser presumida.

### Como reproduzir a leitura do MDB (ambiente já montado)

- Venv Python: `tmp/ocular-import-venv/` (tem `access-parser` e `oletools`; access-parser é instável para este arquivo — só serviu para listar tabelas via `MSysObjects`).
- Java: JRE 8 instalado (sem JDK). Compilador usado: **ECJ** (`tmp/jackcess/ecj-3.26.0.jar`).
- Jars em `tmp/jackcess/`: `jackcess-3.0.1.jar`, `commons-lang3-3.8.1.jar`, `commons-logging-1.2.jar` (Maven Central).
- Classes já compiladas em `tmp/jackcess/`: `DumpSchema` (schema + 2 linhas amostra/tabela), `Stats` (contagens de vínculos), `Count2` (contagem por iteração). Uso:
  ```bash
  cd tmp/jackcess
  CP="jackcess-3.0.1.jar;commons-lang3-3.8.1.jar;commons-logging-1.2.jar"
  java -jar ecj-3.26.0.jar -1.8 -nowarn -cp "$CP" MinhaClasse.java -d .
  java -cp "$CP;." MinhaClasse "../../.backupcharles/bdoptsis.mdb" | iconv -f CP1252 -t UTF-8
  ```
  (saída do Jackcess vem em CP1252 — o `iconv` evita mojibake).
- Dump completo do schema com amostras: `tmp/bdoptsis_schema_dump.txt` (CP1252) / `tmp/bdoptsis_schema_utf8.txt`.

## 3. Inventário do banco Optisis (`bdoptsis.mdb`)

Contagens por iteração real (não `rowCount` — diverge levemente em tabelas com deletados):

| Tabela | Linhas | Papel |
|---|---|---|
| `TabCliente` | 6.291 | Cadastro de clientes |
| `TabCompra` | 7.855 | Compras históricas com ID único; 7.066 têm algum campo de grau e 7.016 dessas apontam diretamente para cliente existente |
| `TabRecibo` | 14.662 | Lançamentos financeiros avulsos por cliente |
| `Tabparcelas` | 3.095 | Carnês/parcelas por cliente (tabela larga) |
| `Tab Assistencia` | 418 | Assistências técnicas/garantias |
| `Tablentes` | 144 | Lista de referência de lentes (não vinculada) |
| `Tabarmacoes` | 99 | Lista de referência de armações (não vinculada) |
| `Taboftalmo` | 116 | Médicos |
| `TabTratamento` | 43 | Tratamentos de lente |
| `TabAnamnese` | 10 | Anamneses (quase não usado) |
| `Tab CupomTroca` | 2 | Cupons de troca |
| `Tab Reserva` | 1 | Reservas |
| `TabDebito` | 1 | Débitos (abandonado) |
| `Tabpedido` | 0 | **Vazia** |
| `Tabpagamento` | 0 | **Vazia** |
| `Erros ao colar` | 1 | Lixo de um copy-paste do Access |

`TabCliente` possui 6.291 IDs únicos. A planilha do programa novo tem 7.076
linhas, mas a alegação de cobertura de 100% do Optisis ainda **não foi provada**:
a coluna `Código` da planilha só está preenchida em 23 linhas. A planilha pode
ser a melhor fonte de dados cadastrais recentes, mas não é uma chave canônica
determinística até a reconciliação por CPF/nome/telefone/data de nascimento.

## 4. Semântica descoberta (o risco real da migração)

O usuário conhecia a lógica do Optisis por experiência própria; **todos os
pressupostos foram confirmados pelos dados**:

### 4.1 Recibo nunca é ligado a venda

`TabRecibo.CodigoCompra` = **0 em 14.662 de 14.662 registros**.
O recibo é um lançamento financeiro avulso pendurado no cliente
(`CodigoCliente` preenchido em 14.614; `CodCli` em 739). Campos:
`Referente` (texto, ex.: "Prestação", "À Vista"), `OBS` (ex.: "1/6 A 6/6"),
`Produto` (texto livre, ex.: "1 OCULOS COMPLETO"), `Valor`, `Data`, `Hora`,
`Aprovadopor`.

**Implicação**: recibos devem migrar como *histórico financeiro do cliente*,
nunca como pagamento de uma venda importada. Qualquer amarração recibo↔venda
seria inventada.

### 4.2 Parcelas/carnês também não se ligam a venda

`Tabparcelas.CodigoCompra` = **0 em 3.095 de 3.095 registros**. Tabela larga:
`Vencimento1..10`, `Valor1..10`, flags booleanas `Qtdevalor1..10`
(provavelmente "parcela paga"), `Valor Total`, `Produto` (texto), `DataCompra`,
`Aprovadopor`, `Referencia`, `Lentes`.

**Implicação**: carnês migram como histórico financeiro por cliente; só o
saldo em aberto (se o cliente quiser) vira cobrança real no sistema novo.

### 4.3 Produtos não são vinculados ao cadastro

Em `TabCompra`, os itens são **texto livre**: `Lentes`, `Armacao`,
`Laboratório`, `Tratamentodesc`, com valores soltos (`ValorLentes`,
`ValorArmacao`, `Valortratamento`, `Valor Total`). Todas as FKs
(`Codigolentes`, `CodigoArmacao`, `Codigolaboratorio`, `Codigopagamento`,
`Codigopedido`, `Codigooftalmo`) estão zeradas em todos os registros.
`Tablentes`/`Tabarmacoes` são meras listas de digitação rápida.
6.882 compras têm `Lentes` preenchido (texto).

**Implicação**: vendas importadas do Optisis não terão itens estruturados —
preservar o texto bruto (ex.: em `source_payload`).

### 4.4 Duas colunas de cliente: redundância, não troca de chave

`CodigoCliente`/`Codigocliente` e `CodCli` coexistem em algumas tabelas, mas a
auditoria do MDB mostrou que elas não representam duas chaves conflitantes:

- `TabRecibo`: 13.875 só com a chave antiga; 739 com ambas e **sempre iguais**;
  48 sem cliente.
- `Tabparcelas`: 2.863 só com a chave antiga; 184 com ambas e **sempre iguais**;
  48 sem cliente.
- `Tab Assistencia`: 404 só com a chave antiga, 6 só com `CodCli` e 8 sem cliente.

**Implicação**: recibos e parcelas devem priorizar `CodigoCliente` e usar
`CodCli` apenas como fallback equivalente; não há remapeamento interno a inferir.
Assistências exigem fallback para `CodCli`. `TabCliente` usa apenas
`Codigocliente` como PK.

### 4.5 A receita/grau do cliente mora dentro de `TabCompra`

`TabCompra` carrega a receita usada naquela compra: `Longe OD/OE`,
`Cilindrico OD/OE` (há colunas duplicadas: `Cilindrico longeOD/OE`),
`Eixo OD/OE` (+ `Eixo longeOD/OE` duplicados), `Perto OD/OE`, `Adição`,
`Altura`, `DP`, `Diâmetro`, `Oftalmo` (texto) — tudo TEXT, sem normalização.

Há 7.066 compras com algum campo de grau. Destas, 7.016 têm cliente presente em
`TabCliente`, 19 apontam para um ID ausente e 31 não têm cliente. Somente as
7.016 são candidatas a importação automática após a reconciliação do cliente.

As colunas duplicadas não podem ser ignoradas: há valores somente na alternativa
e 31 divergências entre coluna principal e alternativa (cilindro/eixo OD/OE).
Regra obrigatória: usar a coluna principal; usar a alternativa somente se a
principal estiver vazia; enviar cada divergência para a fila de revisão, sem
escolher silenciosamente.

`DP` e `Altura` são valores únicos no Optisis, enquanto o destino possui campos
por olho. Eles devem permanecer no `source_payload` até haver regra clínica
explícita; não duplicar o valor em OD e OE. O mesmo vale para `Oftalmo` em texto.

**Implicação**: os graus históricos do Optisis complementam as receitas da
planilha do programa novo, mas ambas as fontes só entram em
`customer_prescription_history` após validação de identidade e qualidade.

### 4.6 Lixo e linhas vazias

- As primeiras linhas físicas de `TabCompra` incluem registros zerados sem
  cliente. No total, há 225 compras sem `Codigocliente`; entre as receitas, 31
  não têm cliente e devem ir para quarentena, não para um cliente genérico.
- `Erros ao colar` é lixo de operação do Access. `TabDebito`, `Tabpedido`,
  `Tabpagamento`, `Tab Reserva`, `Tab CupomTroca` e `TabAnamnese` ficam fora
  do escopo desta migração. A anamnese pode permanecer disponível no Optisis
  original para consulta eventual, mas não será cruzada nem migrada.
- `Situação`, `Prometidopara`, flags de montagem (`Montagem`, `Zilo`, `Metal`,
  `Nylon`, `Parafuso`, `Surfaçagem`...) e campos `*-optilab`/`*-indio` em
  `TabCompra` refletem o fluxo de laboratório da loja — úteis só como
  histórico textual.

### 4.7 A planilha "Vendas" NÃO representa o histórico do Optisis

1.894 linhas na planilha vs. 7.855 compras + 14.662 recibos no Optisis.
A planilha cobre apenas o período do programa novo. Misturar as duas fontes
como "venda" equivalente **é o erro que este documento existe para evitar**.

### 4.8 Cadeia correta das fontes e hipótese dos 785 clientes

A sequência da Ótica Ocular é:

```
Optisis original (Access) → sistema intermediário representado pelas planilhas → MB Optical
```

As planilhas não devem ser tratadas automaticamente como uma cópia fiel do
Optisis. Elas são uma camada intermediária que precisa ser auditada antes de
ser usada como fonte de migração para o MB Optical. O Optisis permanece como
fonte histórica de conferência.

A planilha de clientes possui 7.076 linhas, enquanto `TabCliente` do Optisis
possui 6.291 clientes. A diferença aritmética é de 785 linhas. Portanto, é
plausível que existam clientes cadastrados depois da troca de sistema, mas
**ainda não está comprovado que sejam 785 clientes novos**. A diferença também
pode incluir duplicidades, alterações de nome/CPF/telefone, registros sem nome
ou clientes vindos de outra origem.

Essa conclusão não pode ser obtida pela coluna `Código` da planilha, pois ela
só está preenchida em 23 linhas. A confirmação deve cruzar nome, CPF, telefone
e data de nascimento, classificando cada caso como correspondência clara,
provável cliente novo, possível duplicidade, dados alterados ou insuficiência
de informação. Telefone sozinho não é critério suficiente, pois pode ser
compartilhado por clientes diferentes.

## 5. Destino no gestao-otica-pro (schema já existente)

Migração `supabase/migrations/20260801110000_customer_prescription_history.sql`
criou infraestrutura específica para migração legada:

- `customer_external_references(store_id, source_system, source_customer_id, customer_id, match_method, migration_batch_id)` — vínculo cliente↔ID legado; `match_method ∈ (created, cpf, name_phone, name_birth_date, name_confirmed, manual)`; `UNIQUE(store_id, source_system, source_customer_id)` → idempotência.
- `customer_prescription_history(...)` — campos de graus batem 1:1 com a planilha de Receitas; exige `source_snapshot_sha256` (64 hex) + `source_record_key`; `source_payload JSONB`; `UNIQUE(store_id, source_system, source_snapshot_sha256, source_record_key)` → idempotência.
- `src/lib/actions/customer-history.actions.ts` já expõe `PrescriptionSummary` com `origem: 'os' | 'legado'` — a UI sabe exibir receitas migradas.
- Tabelas operacionais: `customers`, `vendas`, produtos, parcelas.

Mapeamento proposto:

| Origem | Destino | Observação |
|---|---|---|
| Clientes xlsx (7.076) | `customers` + referências somente após reconciliação | só 23 têm Código; 262 não têm nome; 19 CPFs repetem. Não criar nem vincular automaticamente sem identidade suficiente |
| Receitas xlsx (1.362) | `customer_prescription_history` (`source_system='ocular-novo'`) | só 426 têm CPF; 159 não têm nome nem CPF; 764 não têm data. Quarentenar linhas sem identidade e preservar data ausente como ausente |
| Vendas xlsx (1.894) | estudar separadamente | 1.887 `Vendido`, 6 `Cancelada`, 1 `Venda Trocada`; 190 sem nome nem CPF. Não criar vendas operacionais automaticamente |
| Contas a Receber xlsx | cobrança real somente após decisão | 1.219 linhas estão como `Aberto` e nenhuma tem Data Pagamento; 66 não têm nome. Não assumir vínculo automático |
| Produtos xlsx (160) | tabela de produtos da loja | trivial |
| `TabCompra` Optisis | graus → `customer_prescription_history` (`source_system='optisis'`) | 7.016 receitas com cliente conhecido são candidatas; texto de produto e campos não normalizados → `source_payload` |
| `TabRecibo` (14.662) | **histórico financeiro do cliente** — NÃO vincular a vendas | pode exigir tabela/campo de histórico |
| `Tabparcelas` (3.095) | histórico financeiro; saldo aberto → cobrança real (opcional) | desnormalizar Vencimento1..10 |
| `Tab Assistencia` (418) | histórico do cliente | baixa prioridade; 6 usam somente `CodCli` |

Para os registros de grau do Optisis, `service_description` deve ser definido
explicitamente como uma composição rotulada de `Lentes`, `Armacao` e
`Tratamentodesc` quando existirem. Essa regra não pode ficar implícita apenas no
`source_payload`, pois o usuário consulta a descrição no histórico de graus.

## 6. Scripts de migração anteriores (repo `../otica-gestao`)

O usuário já migrou várias lojas do Optisis para o sistema anterior
(`otica-gestao`). Os scripts e artefatos dessa época **sobrevivem na raiz do
repo** e validam as decisões semânticas da seção 4 — além de servirem de
referência de implementação:

### Pipeline usado na época

1. Exportação manual das tabelas do MDB para **CSV** (separador `;`, formato
   pt-BR: datas `dd/mm/aaaa`, números com vírgula, booleanos `VERDADEIRO`).
   CSVs preservados: `tabcompra.csv`, `tabcompra8.csv`, `recibos.csv`,
   `tabparcelas.csv`, `clientes4/5/7/8/9.csv` (um por loja), `armacoes.csv`,
   `lentes8.csv`, `oftalmologistas.csv`, `CONTid9csv.csv`.
2. **Mapas de IDs** em JSON: `migracao_maps/clientes.map.json` e
   `employees.map.json` (legado → novo), com fallbacks especiais
   `IMPORTADO` / `IMPORTADO_SISTEMA_ANTIGO` para órfãos.
   ⚠️ O diretório `migracao_maps/` **não existe mais** — os mapas e o script
   que gerava os clientes se perderam. No gestao-otica-pro isso é resolvido
   melhor: `customer_external_references` guarda o mapa no próprio banco.
3. Scripts Node (`csv-parser` + Supabase service role), um por entidade:

| Script | Origem → Destino | Lógica reutilizável |
|---|---|---|
| `migrate-service-orders-3.0.js` (+ `-replace`) | `tabcompra.csv` → `service_orders` | produtos resolvidos por colunas `legacy_codigo_*` em `lentes`/`tratamentos`/`armacoes`; parse `VERDADEIRO`, datas e números BR |
| `migrate-recibos20.js` | `recibos.csv` → `recibos` | **recibos como registro do cliente, SEM vínculo com venda** (confirma §4.1); heurísticas do campo `Referente` (`SOLAR X`, `ARMACAO X`, `ARM X`) para extrair marca; `isAVista()`; descarta valor/data inválidos; contadores de órfãos/inseridos/substituídos; idempotência por `legacy_codigorecibo` |
| `migrate-duplicatas.js` | `tabparcelas.csv` → `duplicatas` | carnês viram duplicatas do cliente (confirma §4.2) |
| `migrate-duplicata-parcelas.js` | desdobramento das parcelas | — |
| `migrate-oftalmologistas.js` | `oftalmologistas.csv` → oftalmologistas | — |

### O que reaproveitar para a migração da Ocular

- **Padrão de idempotência por código legado** (`legacy_codigorecibo` etc.) —
  no gestao-otica-pro já existe equivalente nas UNIQUEs de origem.
- **Parsers pt-BR** (`parseBRDate`, `parseBRNumber`, `parseBool`,
  `parseHora`) — copiar quase literalmente.
- **Heurísticas do campo `Referente`/`Produto`** dos recibos (extração de
  marca, detecção de à-vista) — o mesmo padrão textual do Optisis aparecerá
  nos dados da Ocular.
- **Não reutilizar diretamente os scripts de carga.** Eles foram feitos para
  outro banco/dados: usam apenas `CodCli`, enquanto `TabCompra` da Ocular usa
  `Codigocliente`; tentam resolver produtos por códigos, mas todas as FKs da
  Ocular estão zeradas; e ignoram as colunas alternativas de cilindro/eixo.
- Registros sem cliente devem ir para relatório/fila de revisão. Não usar o
  cliente genérico `IMPORTADO_SISTEMA_ANTIGO`, pois isso destrói o histórico
  individual e impede correção segura depois.
- **Decisões de domínio já validadas pelo usuário**: recibo = registro
  financeiro do cliente (nunca pagamento de venda); carnê = duplicata do
  cliente; compra = OS com produto resolvido por catálogo quando possível.
- **Diferença importante**: em `otica-gestao` os produtos migravam para
  catálogos com `legacy_codigo_*` e as OSs vinculavam a eles; no Optisis da
  Ocular as FKs de produto estão **zeradas** (§4.3), então o vínculo será por
  texto, não por código.
- Hoje não precisamos mais do passo "exportar CSV pelo Access": a leitura
  direta via Jackcess (seção 2) gera o mesmo insumo sem intervenção manual.

## 7. Riscos

1. **Misturar semânticas** (venda do programa novo ≠ `TabCompra`; recibo ≠ pagamento de venda). Mitigação: `source_system` distinto e tipos de registro separados.
2. **Multi-tenant**: qualquer script errante pode tocar outras stores/tenants. Mitigação: filtrar sempre por `tenant_id`+`store_id` da Ocular e rodar fora de produção (seção 9).
3. **Qualidade de match**: clientes sem CPF exigem `name_phone`/`name_birth_date` e revisão `manual`.
4. **Dupla coluna de cliente** no Optisis (4.4) — esquecer `CodCli` perde ~5% dos vínculos.
5. **Vendas legadas não podem disparar** estoque, comissões, fiscal, NFC-e.
6. **Encoding**: MDB e xlsx em CP1252/Latin-1.
7. **Idempotência**: garantida pelas UNIQUEs de origem — usar sempre `migration_batch_id` e `source_record_key` estáveis para permitir dry-run e re-execução.
8. **Identidade incompleta nas planilhas**: não preencher cliente, CPF ou data
   por suposição. Linhas sem identidade suficiente precisam de relatório e
   decisão humana.
9. **Descrição de serviço indefinida**: o importador deve compor e testar a
   descrição visível do histórico, além de preservar todos os campos brutos.
10. **Frontend Access não auditado por completo**: o VBA/formulários ainda não
    foram extraídos. Não presumir que não há regras de tela.

## 8. O que ainda falta investigar antes de executar

- [ ] Localizar `tenant_id`/`store_id` da Óticas Ocular.
- [ ] Definir destino dos recibos/parcelas (existe tabela de histórico financeiro adequada ou será `source_payload` em tabela nova?).
- [ ] Amostra cruzada validada pelo dono da loja (5 clientes: cadastro + compras + recibos + parcelas lado a lado).
- [ ] Cruzar os 7.076 clientes xlsx com os 6.291 do Optisis por CPF e chaves
  normalizadas (nome+telefone/nascimento); o Código da planilha não resolve o
  vínculo.
- [ ] Decidir política de contas a receber (só abertas? quitadas como histórico?).
- [ ] Verificar se a planilha de Receitas do programa novo já inclui graus migrados do Optisis (risco de duplicar com `TabCompra`).
- [ ] Definir e validar com a loja a composição de `service_description`:
  Lentes + Armação + Tratamento.
- [ ] Revisar 31 divergências entre as colunas duplicadas de cilindro/eixo e as
  50 receitas do Optisis sem cliente resolvido.
- [ ] Abrir **uma cópia** de `optisis bk.mdb` no Microsoft Access e exportar
  módulos VBA/formulários, se possível. `olevba` não suporta MDB e Jackcess não
  lê as tabelas de sistema que guardam esses objetos.

## 9. Estratégia de execução segura (quando chegar a hora)

**Premissa acordada: nunca rodar contra produção com tráfego ativo.**

1. **Ensaiar sem banco**: gerar manifestos, relatórios de match, divergências de
   grau e quarentena diretamente dos XLSX/MDB, em modo somente leitura.
2. **Sandbox Docker local**: aplicar o schema e rodar o importador contra um
   PostgreSQL descartável. Validar parsers, acentos, datas, idempotência,
   `service_description` e exemplos reais, sem acesso ao banco de produção.
3. **Congelar a loja**: janela de manutenção ou bloqueio de escrita para a
   store da Ocular (os poucos lançamentos já feitos no sistema novo precisam
   ser preservados — a migração deve ser *merge*, nunca overwrite).
4. **Ambiente de ensaio**: restaurar backup do Supabase em projeto de staging
   (ou branch), rodar a migração completa lá, validar relatórios de
   reconciliação (criados/matchados/ignorados/erros por etapa) com o dono da
   loja.
5. **Execução em produção**: somente após validação em staging, com script
   idempotente (re-executável), `--dry-run` primeiro, `migration_batch_id`
   único, e ponto de restauração (backup) imediatamente anterior.
6. **Rollback**: receitas e referências carregam `migration_batch_id` +
   `source_system` e podem ser removidas cirurgicamente. Clientes criados
   exigem conferência de dependências/movimentações posteriores antes de remoção.

## 10. Artefatos desta investigação

- `tmp/bdoptsis_schema_dump.txt` / `tmp/bdoptsis_schema_utf8.txt` — schema completo + amostras.
- `tmp/jackcess/` — ambiente Java/Jackcess com classes compiladas (`DumpSchema`, `Stats`, `Count2`, `CheckPedido`).
- `tmp/ocular-import-venv/` — venv Python (access-parser, oletools).
- Este documento.
