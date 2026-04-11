# Fluxo Estratégico de Avaliação Óptica e Conversão (CRM)

Este documento detalha a arquitetura lógica e técnica para o sistema de rastreamento de performance e suporte à venda na interface de Avaliação Óptica.

## 1. Visão Geral
O objetivo é transformar a interface de avaliação em um **Termômetro de Performance de Vendas (CRM)**, capturando dados desde a intenção inicial do cliente até o fechamento da venda, permitindo medir taxas de conversão e qualidade da venda (Upsell/Downsell).

---

## 2. Pilares do Fluxo

### A. Registro de Intenção (O Lead)
O sistema não depende do salvamento manual para existir. A interação é validada por um **Limiar de Intenção**:
- **Autenticação:** O consultor assina com seu PIN.
- **Identificação:** O cliente é selecionado.
- **Interação:** O grau é digitado ou um PDF iVision é importado.
- **Resultado:** O sistema cria um registro único no Banco de Dados (`id` da sessão) com status inicial `em_andamento`.

### B. O Mural de Retomada (Dashboard de Entrada)
Quando o consultor acessa a página sem um cliente selecionado, o sistema exibe um **Mural de Atendimentos Recentes**:
- **Filtro Base:** Avaliações criadas pelo funcionário logado que ainda **não** foram convertidas em venda.
- **Utilidade:** Permite retomar um atendimento rapidamente caso o cliente retorne à loja ou o consultor precise finalizar o registro do desfecho.
- **Filtros Temporais Rápidos:** Além dos 3 dias úteis padrão, o mural deve oferecer botões de filtro para:
    - *Semana Passada*
    - *Este Mês*
    - *Mês Passado*
- **Busca:** A barra de pesquisa prioriza encontrar atendimentos ativos neste mural antes de buscar no cadastro geral de clientes.

### C. Evolução do Registro (Atualização Única)
Não são criadas várias linhas para o mesmo atendimento. O sistema realiza **Updates** na mesma linha de banco de dados (`evaluation_id`):
1. **Importação iVision:** Salva dados extraídos e Snapshot inicial.
2. **Entrada Manual de Grau:** Salva a receita médica.
3. **Sugestão de IA:** Atualiza a linha com o Snapshot dos produtos e argumentos sugeridos.
4. **Gatilho de Retenção (Pânico):** Atualiza com o motivo da hesitação do cliente (pesquisa, preço, etc.).

### D. Perspectivas Distintas
- **Para o Consultor (Apoio):** A tela é uma aliada que fornece argumentos de vendas, sugestões técnicas e "saídas" para contornar objeções (Botões de Pânico). Não há foco visual em "estou sendo vigiado".
- **Para o Gerente (Métricas):** Os dados salvos geram relatórios de taxa de conversão bruta (Entradas vs. OS Geradas) e ticket médio potencial vs. real.

---

## 3. Detalhamento Técnico da Implementação

### Esquema do Banco de Dados (`optical_evaluations`)
| Campo | Tipo | Descrição |
| :--- | :--- | :--- |
| `id` | SERIAL | Chave primária da sessão de avaliação. |
| `employee_id` | FK | ID do consultor que "assinou" o início do atendimento. |
| `status` | ENUM | `em_andamento`, `pendente`, `concluido`. |
| `recommended_items` | JSONB | **Snapshot:** Quais lentes/produtos a IA ou iVision sugeriram. |
| `panic_reason` | TEXT | Motivo registrado via botão de resposta rápida. |
| `outcome_status` | ENUM | `venda_fechada`, `cliente_em_pesquisa`, `perdido_preco`, `perdido_produto`, `perdido_prazo`. |
| `exported_venda_id` | FK | Link com a venda gerada (o Token de conversão). |

### Observação sobre status vs outcome_status
Se a equipe preferir simplificar, é possível usar **apenas um campo** (`status`) com valores finais como:
`em_andamento`, `pendente`, `venda_fechada`, `perdido_preco`, `perdido_produto`, `perdido_prazo`, `cliente_em_pesquisa`.
Se mantiver dois campos, o `outcome_status` só deve existir quando o `status` for `concluido`.

### D. Gestão de Desfechos (O Fechamento do Ciclo)
Para que o mural não fique entulhado e as métricas sejam reais, o consultor deve definir um **Desfecho** para cada avaliação:
1. **Conversão Total:** Ao transformar em venda, o sistema marca o sucesso automaticamente via Trigger.
2. **Pendente (Retenção):** O cliente sai da loja mas prometeu voltar (ex: "Vou falar com o cônjuge"). O card continua no mural por 3 dias para retomada.
3. **Venda Perdida (Qualificação):** Se o cliente desiste, o consultor deve marcar o motivo (Preço, Produto, Prazo). Isso remove o card do mural e move os dados para o Relatório Gerencial de Perdas.

### O Link de Conversão (Token Flow)
1. Ao clicar em **"Ir para Venda"**, o sistema redireciona o consultor para a tela de PDV levando o ID da avaliação:  
   `URL: /loja/[id]/vendas/nova?evaluation_id=[session_id]`
2. A tela de venda "consome" este ID e mantém o vínculo.
3. **Trigger de Banco de Dados:** Quando o status da `venda` mudar para `Paga/Fechada`, o banco automaticamente localiza o `evaluation_id` vinculado e altera seu status para `concluido`.

---

## 4. Lógica de "Snapshot" (Auditabilidade)
Para medir a "qualidade" da conversão, o sistema deve registrar a **sugestão original** separada do que foi de fato vendido.
- **Snapshot Recomendado:** Gerado pela IA/iVision no momento da proposta.
- **Registro Real:** O que consta nos `venda_itens` da OS resultante.
- **Métrica de Auditoria:** Comparação entre o ticket sugerido e o ticket realizado.

### 4.1. Snapshots múltiplos e baseline por consenso (v1)
Se a IA gerar múltiplas sugestões ao longo do atendimento (ex.: 9 sugestões em momentos diferentes), a avaliação não deve depender de uma única opção.  
Nesta primeira versão, o **baseline comercial** será calculado por **consenso dos atributos sugeridos**.

#### Regras do baseline (v1)
- **Coletar todos os snapshots** gerados no atendimento.
- **Extrair atributos normalizados** de cada sugestão:
  - categoria (ex.: progressiva, visão simples, ocupacional)
  - tratamentos embutidos (ex.: fotossensível, antirreflexo, blue control)
  - posicionamento (entrada/intermediário/premium)
  - material/índice quando for relevante
- **Baseline por maioria simples**:
  - um atributo entra no baseline se aparecer na **maioria das sugestões**.
  - se não houver maioria, o atributo fica **indefinido** (não entra no baseline).

#### Comparação com a venda real
A venda é comparada com esse baseline por **aderência de atributos**:
- Se a venda respeita o atributo dominante → ponto positivo.
- Se a venda contradiz o atributo dominante → ponto negativo.
- Se o atributo ficou indefinido → não pontua.

**Resultado esperado:** o consultor não é penalizado por uma sugestão isolada da IA.  
Ele é avaliado pela tendência do que foi sugerido de forma consistente.

---

## 5. Gatilhos de Salvamento (Auto-Save)
Os salvamentos automáticos ocorrem via **Debounce** (2s após o término da edição) nos seguintes campos:
- Término da importação de PDF.
- Mudança nos campos de grau esférico/cilíndrico.
- Seleção de uma opção de lente sugerida pela IA.
- Clique em qualquer resposta rápida de retenção.

---

## 6. Exemplo de Jornada de Dados
1. **10:00:** Consultor João loga e seleciona o Cliente Maria. (Nada salvo ainda).
2. **10:02:** João digita a receita de Maria. **[AUTO-SAVE: ID 450 criado, status: em_andamento]**.
3. **10:05:** João gera recomendação da IA. **[AUTO-SAVE: ID 450 atualizado com lenses recomendadas + snapshot]**.
4. **10:10:** Maria diz que "vai pensar". João clica em "Vou Pesquisar". **[AUTO-SAVE: ID 450 atualizado com status pendente e motivo pesquisa]**.
5. **10:15:** João consegue convencê-la e clica em "Ir para Venda". Redireciona com o Token 450.
6. **10:30:** Venda concluída no caixa. **[DATABASE TRIGGER: ID 450 marcado como concluído + outcome_status=venda_fechada]**.

---
> **Nota de Planejamento:** Este fluxo deve ser implementado de forma a não interromper o uso offline (se houver) e deve garantir que falhas de rede no salvamento automático não bloqueiem o uso da interface pelo consultor.
