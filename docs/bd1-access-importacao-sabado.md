# Plano de importação do bd1.accdb para a loja 4

## Objetivo

Preparar uma importação segura, reproduzível e consultável dos dados do programa antigo de Access para a loja store_id = 4.

Depois da importação, a equipe deve conseguir localizar o cliente na busca normal, abrir o dossiê, consultar compras e receitas antigas, iniciar vendas novas para a mesma pessoa e enviar o último grau pelo fluxo de atendimento/WhatsApp. O histórico importado deve ficar separado dos efeitos operacionais atuais e a carga deve poder ser repetida sem duplicação.

Nenhuma importação foi executada durante a elaboração deste documento.

## Fonte e corte

Fonte analisada:

~~~text
F:\DOWNLOADS\bd1.accdb
~~~

O Access continuará sendo alimentado até sábado. Os números deste documento são uma fotografia intermediária. A carga definitiva deve usar uma cópia somente leitura feita após o último lançamento e o horário de corte combinado com a ótica.

A leitura foi feita via Microsoft ACE OLE DB em modo Read e não alterou o banco Access.

## Descoberta fundamental: Clientes é uma ficha de venda

Apesar do nome, a tabela Clientes não é um cadastro puro de pessoas. Cada registro funciona como uma ficha de compra e reúne:

- nome e contato do comprador;
- data;
- armação, lente e outros produtos em texto;
- valor total da compra;
- condições de pagamento;
- observações;
- receita usada na compra;
- dados auxiliares de relacionamento e estoque.

O programa antigo não tinha uma relação pai e filho adequada. Para lançar outra compra, a pessoa podia ser recadastrada e uma nova ficha ser preenchida. Por isso, nomes repetidos podem significar compras diferentes da mesma pessoa, e não necessariamente clientes duplicados.

O modelo correto no sistema novo é:

~~~text
várias fichas antigas de compra
             |
             +--> um cliente canônico, quando a identidade for confirmada
             |
             +--> várias vendas históricas
             |
             +--> uma receita histórica por ficha que possua grau
~~~

Nunca criar um cliente novo para cada linha de Clientes.

## Inventário confirmado

| Tabela | Registros | Interpretação |
|---|---:|---|
| Clientes | 12.034 | Fichas de compra com dados repetidos do cliente |
| Vendas | 4.318 | Controle auxiliar de modelo, quantidade e estoque |
| Modelos Receituário | 2.998 | Catálogo antigo |
| Modelos Solares | 3.596 | Catálogo antigo |
| Marcas Receituário | 80 | Marcas antigas |
| Marcas Solares | 89 | Marcas antigas |
| ASSISTÊNCIA | 129 | Assistências técnicas |
| Erros ao colar | 1 | Lixo operacional do Access |

Não foi encontrada uma tabela de parcelas neste arquivo. A tabela Vendas também não possui dados suficientes para reconstruir pagamentos ou parcelamentos.

## Fonte correta dos valores

A tabela Vendas não possui valor financeiro. Seus campos são código, cliente, data, modelo, tipo solar/receituário, quantidade e estoque.

O valor total está no campo Clientes.Valor. Na análise intermediária:

- 10.671 fichas tinham Valor maior que zero;
- 10.666 tinham valor e data;
- 10.667 tinham valor e nome;
- menor valor positivo: R$ 7,00;
- maior valor: R$ 9.000,00;
- soma dos valores positivos: aproximadamente R$ 8.261.440,00;
- média das fichas com valor positivo: aproximadamente R$ 774,20.

Esses números devem ser recalculados na cópia final. A tela antiga confirma a interpretação em reais, mas o importador deve validar a unidade no dry-run.

As fichas com valor positivo são candidatas fortes a vendas históricas. Fichas sem valor não devem ser apagadas: podem ser atendimentos incompletos ou fichas com informação somente textual.

Classificar cada ficha como:

1. venda com valor, data e nome;
2. venda com valor e data, mas sem nome;
3. ficha com produto ou observação, porém sem valor;
4. ficha sem dados comerciais suficientes;
5. quarentena para revisão.

O valor total da ficha pode ser gravado como valor histórico da venda. Isso não significa que a venda foi paga. Não transformar automaticamente o valor em pagamento, entrada de caixa ou saldo quitado.

## Produtos em texto

Exemplo observado:

~~~text
Armação: PAPARAZZI METAL FIO H. ACET -170,00
Lente: CR AR PERTO -160,00
Valor: R$ 330,00
Condições: A VISTA
~~~

O texto completo precisa ser preservado e consultável no histórico da venda.

É possível tentar extrair os valores individuais. No exemplo, a soma de R$ 170,00 e R$ 160,00 confere com o total de R$ 330,00. Essa extração deve ser opcional:

- guardar sempre o texto original;
- tratar o hífen como separador somente quando o padrão indicar isso;
- não assumir que todo número após hífen é preço;
- respeitar o formato brasileiro;
- comparar a soma extraída com o total;
- marcar como confirmado somente quando houver compatibilidade;
- mandar divergências e descrições ambíguas para revisão;
- nunca usar a extração para alterar estoque, caixa, comissão ou pagamentos.

No primeiro carregamento, é aceitável criar um item textual com a descrição original. A estruturação de armação, lente e tratamento pode ser feita depois.

## Receitas históricas

A receita fica dentro da ficha de compra. Foram encontradas:

- 9.358 fichas com algum campo de receita;
- 8.655 fichas com receita e valor positivo.

Os campos incluem longe, perto, esfera, cilindro, eixo, adição, DP e altura.

Cada ficha com grau deve virar um snapshot histórico em customer_prescription_history. A receita não deve ser sobrescrita por outra. Usar a data da ficha como data da receita quando ela for plausível.

Não transformar DP ou altura únicos em valores separados por olho sem regra clínica confirmada. Preservar os valores brutos no payload original. Divergências entre campos equivalentes devem ir para revisão.

Quando possível, vincular a receita à venda histórica correspondente e ao cliente canônico.

## Reconciliação de clientes

O cliente deve ser criado ou localizado uma única vez por pessoa. Cada ficha antiga deve apontar para esse cliente depois da reconciliação.

A fonte possui nome, telefones, endereço, bairro, cidade, estado, CEP, e-mail, data de nascimento e observações. Não foi encontrado CPF na estrutura analisada.

Usar evidências combinadas, nesta ordem:

1. nome normalizado mais telefone;
2. nome normalizado mais data de nascimento;
3. nome normalizado mais telefone e cidade/endereço;
4. confirmação manual;
5. criação de novo cliente quando não houver candidato confiável.

Nome sozinho nunca confirma identidade. Telefone sozinho também não.

Classificar cada correspondência como:

- match_claro;
- match_provavel;
- cliente_novo_provavel;
- homonimo_ou_conflito;
- dados_insuficientes;
- revisao_manual.

Foram observados 303 grupos de nomes repetidos após normalização, totalizando 629 registros. Há grupos com várias receitas e datas diferentes. Isso é compatível com várias compras do mesmo cliente, mas não prova identidade.

Não deduplicar fichas de venda entre si. Consolidar a pessoa e preservar cada compra.

## Destino recomendado

### Clientes

Usar public.customers com store_id = 4 para o cadastro consultável no sistema. Não apagar dados que já existam. Complementar campos vazios e mandar conflitos para revisão.

### Vendas históricas

Usar o mecanismo de venda histórica já existente:

- is_historical_import = true;
- import_source_system identificando o Access;
- import_source_record_key baseado no código estável da ficha;
- valor_total igual ao valor da ficha, quando validado;
- historical_entry_amount somente quando houver valor recebido comprovado; não assumir isso para este Access;
- observação com o texto original quando necessário;
- status histórico sem efeitos operacionais.

Cada venda deve aparecer no histórico e no dossiê, mas não deve movimentar vendas atuais.

### Itens

Quando o parsing for confiável, gravar itens em venda_itens com descrição e valor histórico. Caso contrário, criar um item textual do tipo Outro, preservando a descrição integral.

Não usar o catálogo atual para inventar o produto vendido no passado.

### Receitas

Usar customer_prescription_history com:

- origem identificando o Access;
- código da ficha como chave de origem;
- data plausível em prescription_date;
- campos clínicos normalizados somente quando seguros;
- source_payload com os dados brutos;
- customer_id resolvido;
- vínculo com a venda histórica quando disponível;
- service_description com o contexto de produto/serviço.

### Idempotência

A segunda execução do mesmo lote deve inserir zero registros novos.

Não usar nome, data ou valor como chave. Usar o identificador da fonte, o código original da ficha e um migration_batch_id estável. O vínculo de cliente e a venda precisam ser auditáveis pelo código do Access.

## Dossiê e atendimento

O dossiê busca vendas pelo customer_id. Portanto, o cliente legado precisa entrar em public.customers da loja 4, e não somente em uma tabela isolada.

Depois da carga:

- a busca normal encontrará o cliente;
- o dossiê mostrará vendas históricas e novas;
- a venda histórica terá identificação própria;
- valor, data, itens e observações aparecerão;
- receitas aparecerão no histórico de graus;
- o botão Enviar Informação poderá gerar a mensagem da receita;
- o cliente poderá ser selecionado em um novo atendimento.

O código atual do envio de receitas trabalha com até cinco receitas mais recentes. Se a regra final for enviar somente a última, isso deverá ser ajustado e testado separadamente.

Guardar a descrição somente em source_payload preserva a auditoria, mas não garante exibição. Para o dossiê, a informação visível deve ir também para:

- venda_itens.descricao;
- vendas.obs_geral;
- customer_prescription_history.service_description.

## Regras negativas

Não:

- importar diretamente para vendas operacionais;
- considerar Vendas como fonte financeira;
- criar um cliente por linha de Clientes;
- mesclar somente por nome;
- inventar pagamentos, parcelas ou valor pago;
- criar parcela por causa do texto Condições;
- atribuir receita por semelhança vaga;
- apagar fichas sem valor;
- perder o texto original;
- inventar produtos estruturados;
- gerar estoque, caixa, comissão, fiscal, NFC-e, laboratório ou WhatsApp automático;
- executar ensaio contra produção.

## Procedimento seguro no Docker

### 1. Cópia final

- receber a cópia após o corte de sábado;
- preservar o original;
- calcular hash e registrar data/hora;
- usar uma cópia somente leitura no ensaio.

### 2. Manifesto

Antes de qualquer inserção, gerar:

- contagem por tabela;
- intervalo e anomalias de datas;
- fichas com e sem valor;
- fichas com e sem nome;
- fichas com produtos;
- fichas com receita;
- fichas sem cliente resolvido;
- códigos inválidos;
- classificação de identidade;
- vendas e receitas candidatas;
- itens extraídos e itens em revisão.

O manifesto pode conter dados pessoais e deve ficar fora do Git.

### 3. Dry-run

O dry-run deve ler, normalizar e mapear tudo sem inserir. Deve gerar:

- clientes criados, vinculados e em revisão;
- vendas candidatas e rejeitadas;
- receitas vinculadas e sem cliente;
- descrições e valores extraídos;
- conflitos de identidade;
- totais financeiros informativos;
- previsão de inserções.

Executar o dry-run duas vezes e comparar os resultados.

### 4. PostgreSQL descartável

No Docker:

- aplicar o schema em banco descartável;
- carregar somente no banco de ensaio;
- verificar que clientes canônicos não são criados por ficha;
- verificar venda e receita por código de origem;
- verificar vendas históricas no dossiê;
- verificar que históricos não entram nos totais operacionais;
- executar novamente para comprovar idempotência.

### 5. Teste funcional

Testar:

1. cliente com várias fichas;
2. dossiê com várias compras;
3. valor, data, descrição e observação;
4. mais de uma receita no histórico;
5. nova venda para cliente importado;
6. botão Enviar Informação;
7. seleção da receita mais recente;
8. ausência de telefone;
9. ausência de valor;
10. venda histórica sem efeitos de caixa, estoque ou comissão.

### 6. Aprovação

Antes da produção, revisar amostras de:

- clientes com várias compras;
- fichas com receita;
- vendas com descrição e valor;
- fichas sem valor;
- homônimos;
- telefones compartilhados;
- datas anômalas;
- itens extraídos;
- segunda execução idempotente.

## Critérios de aceite

A carga estará pronta quando:

- o arquivo final estiver identificado por hash;
- o dry-run estiver salvo e revisado;
- clientes não tiverem sido criados por nome ambíguo;
- nenhuma ficha estiver perdida sem classificação;
- valores e descrições estiverem preservados;
- receitas estiverem vinculadas ou em revisão;
- o dossiê mostrar as compras importadas;
- o histórico de graus mostrar as receitas;
- o envio encontrar a receita;
- nenhum efeito operacional indevido ocorrer;
- a segunda execução não duplicar dados;
- todas as exceções estiverem documentadas.

## Resumo obrigatório para a IA executora

1. Clientes é ficha de venda, não cadastro puro.
2. O valor está em Clientes.Valor.
3. Vendas não é a fonte financeira.
4. Uma pessoa pode ter várias fichas.
5. Consolidar a pessoa e preservar cada ficha como venda histórica.
6. Cada ficha com grau vira snapshot de receita.
7. Preservar sempre as descrições textuais.
8. Extrair preços somente quando houver confiança.
9. Não inventar pagamentos ou parcelas.
10. Usar store_id = 4.
11. Rodar manifesto e dry-run.
12. Ensaiar no Docker.
13. Executar duas vezes para provar idempotência.
14. Só carregar produção depois da revisão das amostras.

