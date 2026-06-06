# Portabilidade NF-e - Gestao Otica Pro

## Base
Origem: `G:\projetos\autoeletrica`

Documentos de referencia:
- `NFE_PORTABILIDADE_GRADUAL.md`
- `NFE_IMPLEMENTACAO_COMPLETA.md`

Branch de trabalho:
- `feature/nfe-portabilidade-autoeletrica`

## Decisao
Portar a NF-e de forma gradual e local, sem criar API fiscal central agora.

O objetivo inicial na otica e habilitar NF-e modelo 55 em homologacao sem quebrar o fiscal existente de NFC-e.

Regra importante:
- NF-e nao precisa estar ligada a uma venda.
- A tela deve permitir emissao avulsa/manual.
- Importar uma venda e apenas um atalho para preencher destinatario, itens e valores.
- A UI deve ficar proxima da tela original da autoeletrica para facilitar copiar funcionalidades futuras.

## Diferencas de Dominio
- Autoeletrica usa `organization_id` como eixo principal.
- Otica usa `stores.id` como loja e `stores.tenant_id` como `organization_id` nas tabelas fiscais.
- Autoeletrica usa OS, pecas e servicos.
- Otica usa vendas, `venda_itens`, clientes e produtos/lentes.
- O modulo fiscal da otica precisa continuar respeitando `module_fiscal_enabled`.

## Camadas a Portar
- Token Nuvem Fiscal com cache.
- Rota de PDF/XML fiscal com suporte a `NFe`.
- Sequencia atomica de NF-e por tenant, serie e ambiente.
- Serie padrao de NF-e em `stores.nfe_serie`.
- Tipos e helpers de XML NF-e.
- Actions de banco para NF-e, clonagem e leitura de itens.
- Actions de emissao NF-e.
- Tela `/dashboard/loja/[storeId]/fiscal/nfe`.
- Entrada no painel fiscal respeitando o modulo fiscal.

## Ordem de Implementacao
1. Preparar infraestrutura compartilhada.
2. Criar migrations de NF-e na otica.
3. Portar helpers de XML/tipos.
4. Portar actions de banco fiscal adaptadas para `storeId`.
5. Portar emissao de venda simples em homologacao.
6. Criar tela inicial de NF-e na area fiscal da loja.
7. Integrar download XML/DANFE na lista fiscal.
8. Expandir para clonagem, devolucao, remessa/retorno e operacao assistida.

## Checklist Inicial
- [x] Criar branch dedicada.
- [x] Atualizar token Nuvem Fiscal com cache.
- [x] Preparar print/download para `NFe`.
- [x] Criar migration `nfe_sequences` e `stores.nfe_serie`.
- [x] Rodar `npx tsc --noEmit`.
- [x] Portar helpers `nfe_xml` e tipos.
- [x] Portar leitura/clonagem basica de NF-e em `fiscal-db.actions`.
- [x] Criar action minima de NF-e venda homologacao.
- [x] Criar tela inicial de NF-e em homologacao.

## Status da Action NF-e

Arquivo criado:
- `src/lib/actions/fiscal-nfe.actions.ts`

Escopo atual:
- Emite apenas em homologacao.
- Usa `stores.tenant_id` como `organization_id`.
- Respeita o modulo fiscal da loja.
- Permite NF-e avulsa/manual sem venda.
- Quando uma venda e informada, busca venda fechada, cliente, itens e pagamentos.
- Valida dados fiscais minimos da loja.
- Exige CPF/CNPJ e endereco completo do destinatario, incluindo codigo IBGE do municipio.
- Valida NCM dos produtos.
- Usa `get_next_nfe_number` para numeracao atomica.
- Registra a NF-e em `fiscal_invoices` com `tipo_documento = NFe`.
- Atualiza status autorizado, rejeitado, processamento ou erro conforme resposta da Nuvem Fiscal.

Proxima pendencia:
- Criar consulta/atualizacao de status especifica para NF-e quando a Nuvem Fiscal deixar a nota em processamento.
- Rodar `migration_nfe_customer_fiscal_fields.sql` para persistir codigo IBGE e IE no cadastro de clientes.

## Reavaliacao Depois da Primeira Autorizacao

Marco alcancado em homologacao:
- Uma NF-e modelo 55 de venda simples foi autorizada para a Forster.
- O fluxo confirmou credenciais, certificado, responsavel tecnico, CSRT, sequencia, participante, item, transmissao e DANFE basicos.
- A rejeicao 974 foi resolvida no cadastro da SEFAZ-PR ao incluir e autorizar a finalidade `EMISSOR NF-e` para o sistema MBOTICA.

Esse marco valida apenas o nucleo da venda simples. Ele nao significa que a portabilidade completa esta proxima de producao.

Estado real da portabilidade:
- A UI possui cinco etapas, incluindo transporte, pagamento, totais e observacoes. Os campos completos estao editaveis inicialmente na operacao assistida.
- Venda, Bonificacao/Brinde/Doacao, Devolucao de compra, Remessa/Retorno e Transferencia possuem transmissao em homologacao. Devolucao de venda continua bloqueada; a operacao assistida foi implementada e aguarda teste fiscal.
- Os templates guiados ainda usam tributacao padrao; a operacao assistida permite origem, CSOSN, CEST/cBenef, IPI, PIS e COFINS por item.
- Busca de notas clonaveis e leitura de itens existem no backend, mas a clonagem ainda nao esta ligada a UI.
- A lista fiscal reconhece `NFe`, mas consulta automatica/manual de status ainda chama o fluxo de `NFCe`.
- A rota de XML/DANFE tem suporte inicial a `NFe`, mas recuperacao, persistencia e estados visuais ainda precisam de testes completos.
- A inutilizacao e o fechamento continuam exclusivos de `NFCe`.
- A operacao assistida possui auditoria fiscal por IA, validacoes deterministicas e confirmacao obrigatoria do usuario.
- Configuracoes fiscais por loja existem no banco/codigo, mas ainda nao possuem uma interface administrativa completa.

## Roteiro Renovado

### Bloco A - Fechar a Porta Minima de Venda
- [x] Autorizar uma venda simples interna em homologacao.
- [ ] Consultar e atualizar status de `NFe` sem reutilizar `consultarNFCe`.
- [ ] Integrar o polling da lista fiscal para `NFe`.
- [ ] Validar download e persistencia de XML autorizado.
- [ ] Validar download do DANFE/PDF pela rota local.
- [ ] Corrigir textos, filtros e compartilhamento que ainda tratam toda nota como NFC-e.
- [ ] Testar emissao manual e emissao preenchida por venda.
- [ ] Testar venda interna e interestadual.
- [ ] Testar formas de pagamento e arredondamento.
- [ ] Testar rejeicao, processamento, autorizacao e cancelamento sem regressao em NFC-e/NFS-e.

### Bloco B - Completar o Contrato da Tela
- [x] Adicionar a etapa `Transporte e observacoes`.
- [ ] Generalizar os campos de transporte e observacoes, hoje editaveis na operacao assistida, para os templates guiados que precisarem deles.
- [ ] Implementar `modFrete`, transportadora, veiculo e volumes.
- [ ] Implementar `indPres`, `indIntermed`, `indFinal` e intermediador.
- [ ] Expor frete, seguro, desconto e outras despesas.
- [ ] Implementar observacoes comerciais e fiscais.
- [ ] Validar e ratear corretamente valores acessorios nos itens.
- [ ] Separar `Validar NF-e` de `Emitir NF-e`.

### Bloco C - Completar Tributacao dos Itens
- [ ] Expor origem e CSOSN/CST por item.
- [ ] Implementar IPI tributado e nao tributado, incluindo `cEnq`.
- [ ] Implementar PIS e COFINS configuraveis.
- [ ] Suportar CEST e cBenef quando aplicavel.
- [ ] Bloquear CRT diferente de `1` ate existir motor para Regime Normal.
- [ ] Revisar regras e templates com contador antes de amplia-los.

### Bloco D - Clonagem Conservadora
- [ ] Ligar `searchCloneableNFeInvoicesAction` ao botao `Clonar nota`.
- [ ] Preencher participante, itens, parametros e observacoes como novo rascunho.
- [ ] Nunca copiar numero, chave, protocolo, status ou autorizacao.
- [ ] Reaplicar o template quando a operacao mudar depois da clonagem.

### Bloco E - Operacoes Guiadas
- [x] Implementar Devolucao de compra baseada em NF-e de entrada importada e `NFref`.
- [ ] Autorizar e conferir uma Devolucao de compra em homologacao. Bloqueado no momento por falta de NF-e emitida contra o CNPJ de teste em homologacao.
- [x] Implementar Remessa para conserto em homologacao.
- [x] Autorizar e conferir Remessa para conserto em homologacao.
- [x] Implementar Remessa em garantia em homologacao.
- [x] Autorizar e conferir Remessa em garantia em homologacao.
- [x] Implementar Retorno de conserto com remessa autorizada e `NFref`.
- [x] Autorizar e conferir Retorno de conserto em homologacao.
- [x] Implementar Retorno de garantia com remessa autorizada e `NFref`.
- [x] Autorizar e conferir Retorno de garantia em homologacao.
- [x] Implementar Remessa para demonstracao com CFOP 5912/6912.
- [x] Implementar Retorno de demonstracao baseado em NF-e de entrada importada, `NFref` e CFOP 5913/6913.
- [ ] Autorizar e conferir separadamente Remessa e Retorno de demonstracao em homologacao.
- [x] Implementar Transferencia entre filiais com destino restrito a lojas do mesmo tenant.
- [x] Implementar Remessa para deposito com participante cadastrado e CFOP 5905/6905.
- [x] Implementar Retorno de deposito baseado em NF-e de entrada importada, `NFref` e CFOP 5906/6906.
- [ ] Autorizar e conferir separadamente os tres templates de transferencia em homologacao.
- [x] Implementar o template de Bonificacao, Brinde e Doacao.
- [ ] Autorizar e conferir em homologacao Bonificacao, Brinde e Doacao. Brinde interno validado; faltam Bonificacao, Doacao e CFOP 6910.
- [ ] Testar cada template isoladamente em homologacao.

### Bloco F - Outra Operacao Assistida
- [x] Portar action de auditoria fiscal por IA.
- [x] Implementar validacoes deterministicas antes da IA.
- [x] Permitir `NFref` opcional.
- [x] Exigir confirmacao e revisao do contador.
- [x] Manter esse fluxo restrito a homologacao.
- [ ] Testar uma operacao assistida completa e conferir XML/DANFE em homologacao.

### Bloco G - Operacao Fiscal e Fechamento
- [ ] Inutilizacao de numeracao para modelo `NFe`.
- [ ] Historico e comprovantes identificando corretamente o modelo.
- [ ] Incluir NF-e e inutilizacoes no fechamento/ZIP fiscal.
- [ ] Recuperar XML ausente e persistir no banco.
- [ ] Validar webhook de status para NF-e, NFC-e e NFS-e.

### Bloco H - Configuracao Multi-Loja
- [ ] Criar UI para serie NF-e por loja.
- [ ] Criar UI segura para RT/CSRT por loja quando necessario.
- [ ] Confirmar sequencia por `store_id`, serie e ambiente.
- [ ] Impedir que lojas do mesmo tenant compartilhem sequencia indevidamente.
- [ ] Documentar cadastro SEFAZ, certificado e autorizacao de uso por estabelecimento.

### Bloco I - Matriz de Homologacao
- [ ] Executar o checklist completo copiado da autoeletrica e adaptado para otica.
- [ ] Conferir XML e DANFE de cada operacao.
- [ ] Rodar TypeScript, lint e build.
- [ ] Fazer revisao de seguranca e isolamento multi-tenant.
- [ ] Criar commits locais por bloco funcional.

Producao fica fora do horizonte imediato. Ela so deve ser discutida depois dos blocos acima, validacao contabil dos templates e conferencia formal da serie/ultima numeracao real.

## Tela Inicial NF-e

Arquivo criado:
- `src/app/dashboard/loja/[storeId]/fiscal/nfe/page.tsx`

Escopo atual:
- Usa estrutura semelhante a autoeletrica: menu lateral de etapas, area central e resumo/validacoes na direita.
- Modo principal de NF-e avulsa/manual.
- Lista vendas fechadas elegiveis como importacao opcional dentro da etapa de operacao.
- Quando selecionada, carrega cliente, itens e pagamentos da venda.
- Exibe etapas de operacao, participante, itens e revisao.
- Na etapa participante, segue a UI original com abas `Buscar cadastro` e `Novo participante`.
- Participante selecionado/editado e salvo automaticamente no cadastro de clientes ao perder foco.
- Novo participante cria um novo cliente automaticamente no banco.
- Campo CEP vem antes do logradouro e consulta ViaCEP para preencher endereco e codigo IBGE.
- Valida CPF/CNPJ, endereco, codigo IBGE e itens antes de emitir.
- Chama `emitirNFeVendaHomologacao`.
- Inclui botao "Nova NF-e" no painel fiscal.

Operacoes exibidas mas ainda bloqueadas para transmissao:
- Devolucao de venda.
- Outra operacao / modo assistido.

## Cliente x Fornecedor

Estado atual do banco:
- `customers` guarda clientes.
- `suppliers` guarda fornecedores.
- Nao existe uma flag unica em `customers` indicando cliente/fornecedor.

Decisao deste MVP:
- NF-e de venda cria/atualiza `customers`.
- Operacoes futuras que envolvem fornecedor devem usar `suppliers` ou uma camada unificada de participantes, a ser definida quando portarmos devolucao/remessa/entrada.
