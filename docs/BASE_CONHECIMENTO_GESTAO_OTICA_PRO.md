# Base de conhecimento do MB Optical

Referência para conhecer o produto, apoiar futuras peças de apresentação e orientar investigações sobre o uso do sistema. Levantamento realizado em 30/10/2026 a partir do README e do código local. A presença de uma função no código não comprova, por si só, que ela esteja publicada, configurada ou homologada em todas as lojas.

## Escopo e leitura da base

- O MB Optical acompanha a operação de uma ótica: atendimento, venda, ordem de serviço (OS), laboratório, entrega, financeiro, relacionamento e gestão.
- Esta base segue a jornada da loja e inclui recursos de apoio que participam dessa jornada. Páginas internas de criação de gabaritos, modelos de lentes e outras ferramentas que não pertencem ao fluxo da loja ficam fora do escopo.
- **As telas de venda consideradas operacionais são a venda expressa e a venda experimental.** Segundo o responsável pelo produto, a outra tela de venda não funciona; não usá-la como referência de funcionalidade ou como caminho de atendimento.
- Uma capacidade descrita aqui pode depender de módulo, configuração, perfil, integração, equipamento ou disponibilidade por loja. Os detalhes estão na seção **Configurações e disponibilidade** e também junto aos fluxos relevantes.
- A Neosmart é um produto e repositório separado. Este sistema mantém o backoffice e endpoints de integração; não apresentar a experiência da Neosmart como função nativa deste produto sem explicar a integração.
- Os possíveis diferenciais reunidos ao fim são pistas para a landing page. A comparação com concorrentes exige pesquisa específica antes de afirmar exclusividade ou superioridade.

Fontes gerais: `README.md`, `src/components/SideNav.tsx`, `src/components/operator-menu/OperatorMenuAtendimento.tsx`, `src/components/operator-menu/OperatorMenuLojaVazia.tsx`, `src/lib/store-modules.ts`.

## Visão da jornada

Uma jornada típica de óculos pode começar na busca ou cadastro do cliente, seguir pela venda experimental e pela OS, passar pelo laboratório e pela entrega, e continuar no pós-venda. Pagamentos, carnê e cobrança acompanham o compromisso financeiro em paralelo. A venda expressa atende uma jornada mais curta de produtos de balcão.

Essas etapas não são obrigatórias para toda venda: o caminho depende do que está sendo vendido e dos recursos da loja. O histórico permite voltar a vendas, receitas, ordens e informações financeiras relacionadas ao cliente.

## Guia prático para dúvidas de uso

### Como usar a ajuda por IA?

Na Central de Operações, abaixo de **Pontos de Atenção**, use **Não sabe como usar alguma função? Pergunte pra IA**. Escreva sua dúvida ou selecione uma das perguntas sugeridas. É possível continuar o assunto com outra pergunta enquanto a janela estiver aberta. Ao fechar ou escolher **Nova conversa**, o histórico dessa conversa é apagado.

As respostas usam esta base de conhecimento e as configurações da loja ativa. As páginas sugeridas podem aparecer como links; funções como recebimento de parcelas podem abrir a janela correspondente. O acesso continua sujeito às permissões e aos módulos da loja. A assistente orienta o uso; as operações e autorizações são realizadas pela pessoa nas telas próprias do sistema.

Esta seção descreve caminhos e procedimentos identificados no código local. Os nomes abaixo correspondem à Central de Operações com os cartões **Atendimento** e **Loja Vazia**; em uma navegação com barra lateral, os nomes equivalentes aparecem no mapa de destinos. Alguns botões só aparecem conforme o módulo, o papel do usuário, o estado da venda e a configuração da loja. Se a tela apresentada for diferente, confirme o que a pessoa está vendo antes de indicar o próximo passo.

Para uma futura assistente: explique o caminho e depois os passos; use apenas destinos confirmados nesta base e os dados da loja ativa. Não invente botões, permissões, resultados ou identificadores. Um link para uma página não autoriza o acesso: respeite os mesmos controles do sistema. Não peça senha ou PIN na conversa; a identificação deve ser feita somente na janela própria do sistema. A assistente não deve afirmar que registrou, enviou, recebeu ou confirmou uma operação que o usuário ainda precisa realizar.

### Mapa de páginas e atalhos

Os endereços abaixo são **modelos de rota**, não links prontos: `{storeId}` representa a loja ativa autorizada. Só construir um endereço de registro específico quando o sistema fornecer o identificador certo e verificar o acesso. Não substituir o identificador por um número adivinhado, nem criar um link direto para uma janela que não possui rota própria.

| Destino | Caminho pela Central ou pela barra lateral | Rota ou tipo de acesso | Condição relevante |
| --- | --- | --- | --- |
| Atendimento / Receituário | **Atendimento → Receituário**; na barra lateral, **Atendimento → Venda Óculos** | `/dashboard/loja/{storeId}/atendimento` | Selecionar cliente e vendedor antes de abrir a venda. |
| Venda rápida | **Atendimento → Venda Rápida** | `/dashboard/loja/{storeId}/pdv-express` | Módulo de venda rápida habilitado. |
| Parcelas no atendimento | **Atendimento → Parcelas**; na barra lateral, **Baixa Parcelas** | Abre um modal, sem página própria para essa ação. | Módulo de parcelamento e acesso permitido. |
| Entrega | **Atendimento → Entrega**; na barra lateral, **Entrega Óculos** | `/dashboard/loja/{storeId}/entrega` | Apresenta OSs prontas ainda não entregues. |
| Assistência | **Atendimento → Assistência** | `/dashboard/loja/{storeId}/assistencia` | Conforme o acesso da pessoa. |
| Clientes | **Atendimento → Clientes** | `/dashboard/loja/{storeId}/clientes` | Conforme o acesso da pessoa. |
| Busca | **Atendimento → Busca**; na barra lateral, **Busca Universal** | `/dashboard/loja/{storeId}/consultas` | Conforme o acesso da pessoa. |
| Dossiê | **Atendimento → Dossiê** | Busca em modal e abre o histórico do cliente selecionado. | Não há um endereço genérico para o histórico sem identificar o cliente. |
| Enviar Informação | **Atendimento → Enviar Informação**; na barra lateral, **Consulta Cliente** | Abre um modal, sem página própria para essa ação. | O envio por WhatsApp depende do canal e do contato. |
| Avaliação | **Atendimento → Avaliação** | `/dashboard/loja/{storeId}/avaliacao` | Análise pré-venda habilitada para a loja. |
| Tabela de Preços | **Atendimento → Tabela de Preços** | `/dashboard/loja/{storeId}/tabela-precos` | Tabelas globais habilitadas e catálogo disponível. |
| Laboratório | **Loja Vazia → Laboratório**; na barra lateral, **Rastrear Lentes** | `/dashboard/loja/{storeId}/laboratorio` | Conforme o acesso da pessoa. |
| Gaveta | **Loja Vazia → Gaveta**; na barra lateral, **Gaveta (Prontos)** | `/dashboard/loja/{storeId}/gaveta` | Consulta dos óculos prontos que aguardam retirada. |
| Histórico de vendas | **Loja Vazia → Histórico**; na barra lateral, **Histórico Vendas** | `/dashboard/loja/{storeId}/vendas?mode=historico` | Há filtros de período; o acesso depende do perfil. |
| Cobrança | **Loja Vazia → Cobrança** | `/dashboard/loja/{storeId}/cobranca` | Módulo de parcelamento e acesso permitido. |
| Consulta de parcelas | **Loja Vazia → Parcelamentos** | `/dashboard/loja/{storeId}/financeiro/parcelas` | Módulo de parcelamento e acesso permitido. É a consulta, distinta do modal de recebimento do Atendimento. |
| Pós-venda | **Loja Vazia → Pós-Venda** | `/dashboard/loja/{storeId}/pos-venda` | Módulo de pós-venda e acesso permitido. |
| Movimentações de estoque | **Loja Vazia → Movimentação**; na barra lateral, **Movimentações** | `/dashboard/loja/{storeId}/estoque/movimentacoes` | A confirmação de movimentação solicita identificação. |
| Produtos | **Loja Vazia → Cadastros**; na barra lateral, **Produtos & Preços** | `/dashboard/loja/{storeId}/cadastros` | Conforme o acesso da pessoa. |
| Importação XML | **Loja Vazia → XML**; na barra lateral, **Importar XML** | `/dashboard/loja/{storeId}/importacao` | Conforme o acesso da pessoa. |
| Etiquetas | **Loja Vazia → Etiquetas** | `/dashboard/loja/{storeId}/estoque/etiquetas` | Módulo de etiquetas e acesso permitido. |
| Livro caixa | **Loja Vazia → Caixa**; na barra lateral, **Livro Caixa** | `/dashboard/loja/{storeId}/financeiro/caixa` | Conforme o acesso da pessoa e a situação do caixa. |
| Contas a pagar | **Gerência → Contas a Pagar** | `/dashboard/loja/{storeId}/financeiro/contas` | Acesso gerencial. |
| Comissões | **Gerência → Comissões** | `/dashboard/loja/{storeId}/financeiro/comissoes` | Acesso gerencial. |
| Relatórios | **Gerência → Central de Relatórios** | `/dashboard/loja/{storeId}/reports` | Acesso gerencial; alguns relatórios dependem de módulos. |
| Configurações | **Gerência → Configuração** | `/dashboard/loja/{storeId}/config` | Acesso gerencial. |

Uma venda específica é aberta na rota `/dashboard/loja/{storeId}/vendas/{vendaId}/experimental` depois de identificada em uma busca, histórico ou outro fluxo válido. Nunca orientar pela antiga página de venda. As rotas da tabela foram conferidas em `src/components/SideNav.tsx`, `src/components/operator-menu/OperatorMenuAtendimento.tsx`, `src/components/operator-menu/OperatorMenuLojaVazia.tsx` e `src/components/manager-menu/ManagerLayout.tsx`.

### Como localizar ou cadastrar um cliente?

1. Para iniciar uma venda de óculos, abra **Atendimento → Receituário**. Na barra lateral, o nome é **Venda Óculos**. Em **Selecione o cliente**, digite nome, razão social, nome fantasia, CPF ou CNPJ. A busca fica na loja ativa e mostra até 50 cadastros. O campo diz “telefone”, mas o telefone não entra nessa busca.
2. Confira o nome e o CPF ou CNPJ antes de selecionar. Um aviso **Inadimplente** não impede a venda; ele só alerta sobre parcelas vencidas. **Restrição Interna** mostra a observação do cadastro.
3. Se for um cliente novo, use **Novo Cadastro**, informe nome completo e celular e escolha **Salvar e selecionar**. O cadastro rápido não abre a venda sozinho.
4. Depois da seleção, a tela mostra as duas vendas mais recentes, com paciente, produtos e receita quando existirem. Essa lista não abre a venda. **Raio-X** abre o histórico completo do cliente. O **Dossiê**, no menu Atendimento, também busca o cliente e abre esse histórico.
5. O dependente ou paciente não é escolhido nesta tela. Ele entra depois, na OS da venda experimental.

Para pesquisar sem começar uma venda, use **Atendimento → Busca** ou **Clientes**. A Busca procura na mesma loja por nome, CPF, telefone, código de barras, número da venda ou da OS. Uma venda encontrada abre a tela experimental; uma venda histórica importada abre a tela própria de histórico importado.

Fontes: `src/app/dashboard/loja/[storeId]/atendimento/page.tsx`, `src/components/modals/QuickCustomerModal.tsx`, `src/components/operator-menu/OperatorMenuAtendimento.tsx`.

### Como fazer uma venda rápida de balcão?

A venda rápida depende do módulo correspondente. Se **Venda Rápida** não aparecer, confirme a loja e peça ao responsável para verificar o módulo.

1. Abra **Atendimento → Venda Rápida**. Na barra lateral, o nome também é **Venda Rápida**.
2. Em **Vendedor Responsável**, selecione o vendedor. Sem vendedor, **Pagar agora** não abre o pagamento e a tela avisa para selecionar o vendedor. Com a cesta e o vendedor prontos, F2 também abre o pagamento.
3. Em **Adicionar Produto**, bipe ou digite o produto e selecione o resultado para a **Cesta de Compras**. O preço exibido pode ser ajustado. Cada item pode ser removido; **Limpar tudo** esvazia a cesta.
4. Confira **Total do Investimento** e escolha **Pagar agora**.

Na aba **Pagamento**:

- **Valor Pago** começa com o total da cesta e deve permanecer igual ao total. Valor superior é bloqueado, inclusive em dinheiro: se a venda é R$ 100 e o cliente entrega R$ 120, devolva R$ 20 e registre R$ 100. O campo registra o valor líquido, sem o troco devolvido.
- A forma inicial é **PIX Remoto**. Também podem aparecer **PIX na maquininha**, **Dinheiro**, **Cartão Débito** e **Cartão Crédito**. **Pix Sicredi** só aparece quando a loja tem essa integração. Esta aba não oferece cheque, transferência, boleto nem crédito em loja.
- **PIX Remoto** e as demais formas, exceto Pix Sicredi, registram o recebimento informado pela equipe. Não geram cobrança Pix integrada e não confirmam, por si sós, que o dinheiro foi transferido.
- A data dessa tela é o dia atual e não pode ser alterada. O campo **Observação / CPF**, quando preenchido, fica registrado na observação do pagamento.
- O seletor **Parcelas** dessa aba não é o carnê da loja. Confirmar a venda rápida também não gera o controle de parcelas de cartão ou cheque que o pagamento da venda experimental gera. Para carnê, use a aba **Carnê**. Para esse controle de cartão ou cheque, registre o pagamento na venda experimental.
- Escolha **Confirmar Pagamento** e informe o PIN na janela do sistema. Se o valor pago for inferior ao total da cesta, a conclusão é bloqueada antes de criar a venda, mesmo que falte apenas um centavo. Para pagamentos parciais, use a **Venda Experimental**. Na confirmação aceita, a Venda Expressa é gravada como **Fechada**, com saldo a receber zerado.
- **Pix Sicredi** usa **Gerar Pix da venda** e exige PIN. O valor precisa ser o total da cesta. O pagamento só entra na venda depois da confirmação do Sicredi. Enquanto o QR Code estiver pendente, **Cancelar Pix e voltar a venda** cancela a cobrança e a venda provisória e devolve o carrinho, desde que ainda não exista pagamento. Isso não é estorno de um pagamento já confirmado. Se o Pix já tiver sido pago, siga a mensagem da tela.

Depois da confirmação, a tela mostra **Venda Realizada**, pode abrir o recibo e oferece **Reimprimir Recibo** e **Nova Venda (Sair)**. **Emitir NFC-e** só aparece com o módulo fiscal. Essa tela concluída não remove o pagamento. O pagamento direto da venda rápida fica no cliente **Consumidor Final**.

A aba **Carnê** só aparece com o módulo de parcelamento. Ela pede o nome do cliente. Ao selecionar o cliente, a venda já é criada em aberto e a saída de estoque é registrada. Não inicie outra venda rápida para a mesma cesta. Se **Gerar Carnê** não abrir a autorização por PIN, pare e continue essa venda na tela experimental. Receber as parcelas depois é o fluxo **Atendimento → Parcelas**. Não lance esse recebimento outra vez como pagamento da venda.

Fontes: `src/components/vendas/PdvExpressInterface.tsx`, `src/components/modals/PaymentModal.tsx`, `src/lib/actions/vendas.actions.ts`.

### Como começar ou continuar uma venda de óculos?

1. Abra **Atendimento → Receituário**, selecione ou cadastre o cliente e escolha o **Vendedor**. A lista traz funcionários ativos da loja. O seletor só fica utilizável depois do cliente. **Iniciar nova venda** permanece desabilitado até os dois estarem selecionados.
2. Clique em **Iniciar nova venda**. A venda nasce **Em Aberto**, sem produtos, sem OS e sem saldo. O que segue para a tela experimental é o cliente e o vendedor escolhidos. O dependente, a receita e os produtos são lançados depois.
3. A tela experimental mostra **Produtos**, **Protocolo (OS)**, **Pagamentos**, **Observações** e **Parcelamento** quando o módulo está habilitado. A loja pode usar uma OS embutida ou várias fichas por venda; isso muda o botão da OS, não a abertura.
4. Em **Produtos → Novo Produto**, procure e selecione o item. Lente, armação, solar e tratamento devem usar a seleção do catálogo.

A nova venda não começa nestes casos:

- Sem cliente ou sem vendedor, o botão fica desabilitado.
- Se o cliente tem avaliação atualizada nos últimos 7 dias, ainda sem venda exportada e sem desfecho, a tela avisa e pergunta se deseja abrir **Avaliação**. Recusar o aviso não cria a venda. A avaliação pode estar no titular ou no responsável. O menu **Avaliação** só aparece quando o módulo está habilitado.
- Se a mensalidade da loja bloqueia novas vendas, a mensagem diz para consultar o aviso de cobrança. Não há outro caminho para iniciar.

Para continuar uma venda já criada, use **Atendimento → Busca** e abra o resultado em **Vendas**. **Loja Vazia → Histórico** abre a **Central de Vendas** no modo histórico; na barra lateral, o nome é **Histórico Vendas** e o acesso é de administração, gerência ou operação da loja. Vendedor e técnico usam a Busca. A venda normal abre na experimental. A venda histórica importada abre a tela de histórico importado. Nunca use a página antiga de venda. O dossiê das duas últimas compras no Receituário não é o caminho para retomar a venda.

Fontes: `src/app/dashboard/loja/[storeId]/atendimento/page.tsx`, `src/components/vendas/VendaInterfaceExperimental.tsx`, `src/components/vendas/AddItemFormExperimental.tsx`, `src/components/vendas/VendasListInterface.tsx`.

### Como incluir ou remover um produto na venda de óculos?

Na venda experimental aberta, use **Produtos → Novo Produto**.

1. Em **Descrição / Busca**, digite nome ou código e escolha o produto na lista. A lista mostra tipo, estoque quando existir e preço.
2. Confira o **Tipo**. As opções são **Lente**, **Armação**, **Solar**, **Tratamento**, **Serviço** e **Outro**.
3. Lente, armação, solar e tratamento precisam ser escolhidos na lista ou, no caso de lente, vir da tabela de preços quando essa carga estiver disponível. Serviço e outro podem ser descritos sem item de catálogo. Se a escolha obrigatória faltar, a tela avisa para selecionar um produto da lista.
4. Confira quantidade, unidade e valor. Com a loja em lentes por unidade, uma lente do catálogo da loja entra com quantidade 2, unidade travada e o campo **Valor do par**. Sem essa configuração, a lente começa como 1 par. O valor pode ser ajustado antes de incluir.
5. Use **Adicionar Item**. O produto só entra em venda **Em Aberto**.

Não há edição do produto depois de incluído. Para trocar, remova o item na lista, confirme a exclusão e inclua de novo. A remoção fica indisponível quando a venda está **Fechada**, **Cancelada** ou **Devolvida**. Venda histórica importada não usa essa inclusão.

### Como preencher uma OS, receita e medidas?

A loja usa um de dois modos. Olhe o botão de **Protocolo (OS)** antes de orientar:

- **Lançar OS** abre a ficha dentro da venda. **Criar OS** grava a primeira; **Salvar OS** atualiza a existente. Se já houver mais de uma OS, a ficha permite passar de uma para outra.
- **Nova OS** abre uma ficha separada. As OS já criadas aparecem em **Abrir OS**. O botão da ficha separada é **Salvar OS**.

A ficha só pode ser alterada enquanto a venda permite edição. Venda fechada, cancelada, devolvida ou histórica importada não segue esse lançamento.

1. Em **Paciente**, o padrão é **Titular**. Escolha um dependente já cadastrado ou inclua um paciente pelo botão ao lado. Em **Médico**, selecione o profissional ou inclua um novo. Os dois podem ficar sem escolha.
2. Em **Itens da Venda**, ligue **Lente OD**, **Lente OE** e **Armação** aos produtos já incluídos na venda. Uma lente já usada em outra OS da mesma venda não volta para OD ou OE. A mensagem pede para incluir outro par.
3. Em **Receita**, informe esférico, cilíndrico e eixo de OD e OE, e a adição quando houver. Esses campos não são obrigatórios para salvar.
4. Em **Medidas Técnicas**, informe DNP, altura e diâmetro de cada olho, e horizontal, vertical, diagonal e ponte da armação quando a loja precisar. Também não são obrigatórios para salvar. A ficha embutida não abre a ferramenta de foto; as medidas podem ser digitadas aqui. O tablet e a tela de medidas da armação são um apoio separado para a loja que os utiliza.
5. **Armação com cliente** e **OS enviada pra montagem no laboratório** são marcações opcionais da ficha embutida.
6. O **Protocolo** pode ser informado. Se ficar vazio e a loja tiver numeração local automática configurada, o número é gerado ao salvar. Se essa numeração estiver incompleta, a tela mostra o erro e a OS não é salva. Um número já usado por outra OS da loja também é recusado. Sem numeração automática, uma OS nova recebe o próprio identificador quando o protocolo fica vazio.

Na ficha separada, **Histórico** pode preencher a receita antiga depois da confirmação. A reserva de lente dessa ficha pede para salvar a OS antes. A ficha embutida não mostra esse histórico de receita. Se o botão visto não for **Lançar OS** nem **Nova OS**, não presuma o modo da loja.

Fontes: `src/components/vendas/VendaInterfaceExperimental.tsx`, `src/app/dashboard/loja/[storeId]/vendas/[vendaId]/os/ServiceOrderForm.tsx`, `src/components/config/ConfigInterface.tsx`.

### Como registrar um pagamento ou fazer um carnê na venda?

O saldo **A Receber** é o que ainda não foi coberto por pagamento direto ou pelo valor formalizado no carnê. **Pago / Sinal** soma somente os pagamentos diretos. Recebimento de parcela não entra nessa soma e não deve ser lançado de novo em **Novo Pagamento**.

Para um pagamento direto, a venda precisa estar aberta e **A Receber** precisa ser maior que zero. Abra **Pagamentos → Novo Pagamento**. O valor começa preenchido com **A Receber**; confira antes de confirmar. A forma inicial é **PIX Remoto**. As formas são **PIX Remoto**, **PIX na maquininha**, **Dinheiro**, **Cartão Débito**, **Cartão Crédito**, **Cheque-Pré**, **Transferência**, **Boleto** e **Crédito em Loja**. **Pix Sicredi** só aparece quando a loja tem essa integração.

O valor não pode superar **A Receber**, mesmo que a venda não tenha carnê. O limite é conferido novamente no servidor e no banco; se outra operação cobriu o saldo, atualize a venda antes de tentar novamente. Em dinheiro, informe somente o valor líquido, descontando o troco que foi devolvido ao cliente. O formulário não calcula troco nem guarda o valor bruto entregue.

- **PIX Remoto**, maquininha, dinheiro, cartões, cheque, transferência e boleto registram o recebimento informado pela equipe. Não geram cobrança integrada nem confirmam a transferência bancária.
- **Pix Sicredi** não usa **Autorizar e pagar**. O botão é **Gerar Pix da venda** ou, se já houver cobrança ativa, **Acompanhar Pix existente**. O QR Code ainda não baixa a venda; o pagamento entra somente depois da confirmação do Sicredi. Enquanto houver Pix aguardando, a própria seção **Pagamentos** mostra o aviso para acompanhar essa cobrança antes de registrar outra forma para o mesmo valor. Na janela **Pix da venda**, situação **Aguardando pagamento**, **Cancelar cobrança** pede PIN e cancela o QR Code. Isso não cancela a venda nem remove um pagamento já confirmado.
- O campo **Parcelas** só vale para **Cartão Crédito** e **Cheque-Pré**, de 1 a 12. Esse campo não é o carnê. O valor inteiro já reduz **A Receber**; as parcelas desse campo controlam o recebimento do cartão ou do cheque, com vencimentos de 30 em 30 dias.
- A data pode ser informada e começa no dia atual. A observação é opcional.
- **Crédito em Loja** exige saldo suficiente na carteira e na venda. O débito da carteira, o extrato e o pagamento são confirmados juntos. Repetir os mesmos dados no formulário aberto reutiliza a tentativa, sem cobrar novamente. Se a página foi fechada ou recarregada após uma resposta incerta, confira os pagamentos e o extrato antes de tentar outra vez. Sem carteira ou com saldo menor, o pagamento não é registrado.
- Nas outras formas, escolha **Autorizar e pagar** e informe o PIN na janela do sistema. O pagamento é registrado em seguida. O recibo fica em **Recibos**, na barra inferior. O envio do recibo por WhatsApp, no próprio pagamento, só aparece quando a automação da loja está habilitada.

Quando já existe carnê, o sistema recusa pagamento direto se a venda não está **Em Aberto**, se **A Receber** está zerado ou se o valor passa do saldo disponível. A mensagem pede para renegociar o carnê da venda em aberto antes de lançar o pagamento. Sem carnê, confira o valor: não lance acima de **A Receber**.

Se não houver carnê e o pagamento deixar **A Receber** zerado, a venda é fechada automaticamente. Não é preciso clicar em **Finalizar Venda**, e a lixeira do pagamento deixa de ficar disponível. Se houver carnê, quitar o saldo restante não fecha a venda sozinho: use **Finalizar Venda** quando o botão estiver liberado.

Para o carnê, a venda precisa estar aberta, o módulo de parcelamento precisa estar habilitado e ainda não pode existir carnê nessa venda. Só existe um carnê por venda.

1. Na venda experimental, abra **Parcelamento → Novo Parcelamento**. Se faltar CPF ou CNPJ, ou telefone, a tela pede para completar o cadastro antes de abrir o formulário.
2. O campo **Valor Total** começa com **A Receber**. Informe o **1º Vencimento**; a sugestão é o mesmo dia do mês seguinte. Escolha a quantidade, de 1 a 24.
3. Clique em **Calcular**. As parcelas seguintes vencem mês a mês. Os valores podem ser ajustados parcela a parcela. A soma precisa corresponder ao valor financiado; se não corresponder, a tela mostra **Soma inválida** e não confirma.
4. A observação desse formulário de criação pode ser preenchida. Escolha **Gerar Carnê**. Se faltar o documento ou o celular do cadastro, complete os dados na janela apresentada. Depois informe o PIN na janela **Autorizar Emissão**. O funcionário precisa estar ativo na loja.
5. Aguarde a confirmação. A tela abre a promissória para impressão. No carnê já emitido também existem **Imprimir Duplicata** e **Imprimir Carnê**.

Se o carnê cobrir todo o saldo, a venda é fechada automaticamente, mesmo com parcelas futuras abertas. Isso não significa que o cliente já pagou o carnê. Se o carnê for menor que o saldo, a venda permanece **Em Aberto** e a diferença continua em **A Receber**. Sem saber o valor financiado, não presuma qual dos dois aconteceu. Venda cancelada, venda histórica importada ou saldo zerado não geram esse carnê.

**Falta Destinar** substitui **Finalizar Venda** quando **A Receber** é maior que zero, mesmo que já exista carnê. Qualquer centavo pendente precisa ser coberto por pagamento direto ou pelo valor formalizado no carnê antes de fechar. Parcelas futuras ainda não pagas não impedem fechar quando o saldo da venda está coberto. Nunca recomende lançar um Pix direto adicional sobre um carnê que já cobre a venda.

### Como corrigir um pagamento direto?

A correção depende do que foi lançado errado. Não use o Livro Caixa para apagar o valor e não use **Reverter**: **Reverter** é o fluxo da parcela.

- Para mudar somente a forma ou o parcelamento, com o valor certo, o Livro Caixa tem o lápis **Alterar forma de pagamento**. Ele pede o PIN de quem registrou o pagamento, quando esse responsável está gravado. A janela oferece **PIX Remoto**, **PIX na maquininha**, **Dinheiro**, **Cartão Débito**, **Cartão Crédito** e **Cheque-Pré**. Confira a quantidade de parcelas, inclusive ao manter a mesma forma. Cartão de crédito e cheque refazem os recebíveis pendentes; dinheiro, Pix manual e débito retiram essa agenda pendente. O valor e a data original do pagamento são preservados. Se já houver recebimento ou conciliação, a edição é bloqueada: procure o responsável financeiro. Crédito em Loja, Pix integrado e recebimentos de carnê exigem seus fluxos próprios. A alteração não movimenta dinheiro no banco ou operadora.
- Para remover o valor, abra a venda experimental. Em **Pagamentos**, passe o mouse sobre a linha **Entrada / pagamento direto** e use a lixeira **Estornar / Remover**. Confirme **Remover pagamento**. Não há PIN nessa confirmação. A remoção devolve o valor a **A Receber** e também remove os recebíveis de cartão ou cheque ligados àquele pagamento. Pagamento de parcela não aparece nessa lista e não pode ser removido por ela.
- A lixeira fica desabilitada com a venda **Fechada**, **Cancelada** ou **Devolvida**. A venda rápida confirmada já nasce fechada. **Reabrir**, quando aparecer, pede PIN do vendedor original ou de um gerente e só é oferecido no dia da criação ou até dois dias depois do fechamento. Reabrir também desfaz saídas de estoque e comissões daquele fechamento. Se o botão não aparecer, procure o responsável.
- Venda histórica importada não aceita essa remoção. Para **Crédito em Loja**, a confirmação informa que o valor será devolvido à carteira do cliente que pagou, mesmo se a venda mudou de titular. A remoção registra o estorno no extrato e recalcula o saldo da venda. Se a carteira original ou o débito não puderem ser conferidos, o sistema bloqueia a operação; procure o responsável para revisar o lançamento.
- Nas outras formas, a remoção exige venda **Em Aberto** e exclui o pagamento e seus recebíveis juntos, atualizando o saldo. Se qualquer etapa falhar, nenhuma dessas alterações é salva. O lançamento original fica preservado no histórico de auditoria. **Pix Sicredi** ou pagamento ligado à cobrança integrada exige revisão da conciliação; não use a lixeira para apagar esse recebimento. Remover um registro local não devolve dinheiro pelo banco ou cartão. Se a tela informar comissão pendente de revisão após a remoção, encaminhe esse acerto ao responsável.

O ícone de apagar do Livro Caixa vale para lançamento manual. No pagamento vindo da venda, essa tela não apaga o valor.

### Como fechar, cancelar ou reabrir a venda?

Na venda experimental aberta, a barra inferior oferece **Cancelar**, **Abandonada** e **Finalizar Venda** ou **Falta Destinar**.

- **Finalizar Venda** pede PIN na janela **Confirmar Fechamento**. Ele aparece quando não há saldo a receber; ter carnê não libera saldo ainda descoberto. O servidor confere novamente o saldo ao fechar. Um pagamento direto que zera o saldo sem carnê, ou um carnê que cobre o saldo, já fecha a venda sem esse clique.
- **Cancelar** pede confirmação e só aparece na venda aberta. Não é o caminho para apagar um pagamento isolado.
- **Abandonada** abre uma janela que pede o motivo e oferece **Devolver ao Estoque**, **Lançar como PERDA** ou **Nenhuma Ação** para a lente, antes de **Confirmar Abandono**. A venda fica cancelada. Também não serve para corrigir um pagamento.
- Com a venda **Fechada**, **Reabrir** segue as condições acima. **Devolução** aparece quando o status é **Fechada**, mas só conclui para venda integralmente quitada, sem carnê e não histórica. A janela inclui todos os itens e mostra o valor final, com desconto, que será devolvido em **Crédito em Loja**. Informe a condição de cada item e autorize pelo PIN. Devolução parcial, venda com carnê e estorno em dinheiro estão indisponíveis. Itens intactos com saída comprovada retornam ao estoque; defeitos não sofrem nova baixa. Itens sem produto cadastrado não geram entrada de estoque. Sobras exigem uma lente individual com variante original identificada. A venda fica **Devolvida** e não pode ser reaberta por esse fluxo. Comissões pendentes são estornadas; se houver comissão já paga, a confirmação avisa que é necessário acerto manual. O procedimento não cancela a nota fiscal nem devolve dinheiro pelo banco/cartão. Se houver Pix pendente ou registro antigo de devolução, siga a mensagem e peça revisão do histórico.
- Para devolver uma venda originada na **Venda Expressa**, abra a venda na **Venda Experimental**. Se o titular ainda for **Consumidor Final**, identifique o cliente titular antes de continuar: esse cadastro é compartilhado e não pode receber o crédito da devolução.
- **Recibos** permanece disponível para impressão dos pagamentos. **NFC-e** só aparece com o módulo fiscal.

Fontes: `README.md` — regra financeira; `src/components/vendas/VendaInterfaceExperimental.tsx`, `src/components/vendas/FinanciamentoBox.tsx`, `src/components/vendas/VendaActions.tsx`.

### Como renegociar o carnê ou receber uma entrada depois?

**Renegociar** fica no carnê já emitido, na seção **Parcelamento** da venda experimental. O botão não aparece em venda cancelada, em carnê histórico importado nem quando todas as parcelas estão pagas. Ele aparece em venda **Fechada** enquanto ainda houver saldo no carnê.

1. Escolha **Renegociar**. A tela pede confirmação e avisa que os recebimentos já feitos serão preservados. Se não houver saldo em aberto, a renegociação não começa.
2. O campo **Novo saldo parcelado** começa com o saldo ainda em aberto. Esse saldo desconta o que já foi recebido, transferido ou encerrado em renegociação anterior. Não inclui o dinheiro já pago.
3. Em venda **Em Aberto**, o valor pode ser reduzido, mas não aumentado e não zerado. A diferença volta para **A Receber**. Em venda **Fechada**, o campo fica bloqueado para redução: dá para mudar a quantidade e o primeiro vencimento, mantendo o mesmo saldo.
4. A quantidade vai de 1 a 24. O **1º Vencimento** define a sequência; as parcelas seguintes vencem mês a mês. Escolha **Calcular**. A soma precisa ser exatamente o novo saldo. Os valores individuais podem ser ajustados até a soma fechar.
5. Se necessário, preencha **Observação** com até 2000 caracteres. Escolha **Confirmar renegociação** e informe o PIN na janela **Autorizar renegociação**. O funcionário precisa estar ativo na loja. A observação fica no registro desse acordo junto ao autor e à data, preservando os acordos anteriores e a observação original do carnê. O texto é opcional. Se não for possível gravá-lo, a renegociação também não é confirmada.
6. A renegociação não recebe dinheiro. Se uma diferença voltou para a venda, receba esse valor uma única vez em **Novo Pagamento**, depois da confirmação. Não lance essa entrada antes nem uma segunda vez.

Uma parcela que já teve recebimento permanece no carnê, marcada como paga, e o saldo dela ainda em aberto passa para as novas parcelas. As parcelas sem recebimento são substituídas. Uma nova renegociação pode ser feita depois, sobre o saldo que continuar em aberto. O recebimento anterior deixa de oferecer **Reverter** depois da renegociação. Venda cancelada não pode ser renegociada.

Se já existe carnê e **A Receber** está positivo, a própria seção avisa para receber esse valor em **Novo pagamento**. Esse aviso é o saldo da venda, não uma nova cobrança do carnê.

Fontes: `README.md` — regra financeira; `src/components/vendas/FinanciamentoBox.tsx`, `src/lib/actions/vendas.actions.ts`.

**Exemplo de dúvida real:** “O cliente pediu a venda a prazo sem entrada. Gerei as parcelas e depois ele quis dar entrada. Como faço?”

**Orientação:** “Um carnê sem entrada que cobre o saldo inteiro deixa a venda **Fechada**. Nesse caso, **Renegociar** não reduz o valor e **Novo Pagamento** não registra a entrada. Não lance a entrada por cima do carnê. Se a venda ainda estiver **Em Aberto**, abra **Parcelamento → Renegociar**, reduza somente o saldo em aberto pelo valor da entrada, use **Calcular**, confira a soma e escolha **Confirmar renegociação**, com o PIN na janela do sistema. A diferença volta para **A Receber**. A renegociação não recebe o dinheiro. Quando o cliente pagar, registre esse valor uma única vez em **Novo Pagamento**. Por exemplo, um carnê de R$ 900 ainda em aberto, com entrada posterior de R$ 200, passa a ter R$ 700 parcelados. Se não souber o status, confira a venda antes de escolher um dos caminhos.”

### Como receber uma parcela?

Receber parcela não é pagamento direto da venda e não é contato de cobrança. O módulo de parcelamento precisa estar habilitado. O acesso à janela pode existir para o vendedor; a lista **Parcelamentos** e a tela **Cobrança** dependem do perfil.

1. Abra **Atendimento → Parcelas**. Na barra lateral, o acesso equivalente é **Baixa Parcelas**. Isso abre uma janela de busca, sem página própria.
2. Busque o cliente. A busca mostra quem tem parcela pendente; quem não tem pode não aparecer. Na lista de compras, localize a venda, confira vencimento, valor da parcela, o que já foi recebido, valores transferidos e **Valor a Receber**. Selecione a parcela pendente.
3. **Total Recebido** começa com o saldo da parcela. Distribua o valor em **Formas de recebimento**. A primeira forma sugerida é **PIX Remoto**; as opções são **PIX Remoto**, **PIX na maquininha**, **Dinheiro**, **Cartão Débito** e **Cartão Crédito**. **Adicionar forma** inclui outra linha, inicialmente em **Dinheiro**. A soma das formas precisa ser igual ao total recebido. Esta janela não oferece cheque, transferência, boleto, crédito em loja nem Pix Sicredi como forma manual.
4. A data do recebimento é o dia atual da tela e não é escolhida nesse formulário. Confira antes de confirmar.
5. Se a parcela estiver vencida na tela, aparece **Juros / Multa**. Informe só o que foi cobrado de verdade. Esse valor entra no **Total Recebido**, não abate o principal e não pode ser o total inteiro: precisa sobrar valor para abater a parcela.
6. Se o principal for menor que o saldo, escolha **Baixa parcial** para deixar o restante na mesma parcela ou, quando existir próxima parcela pendente, **Jogar para a próxima**. Essa segunda opção marca a parcela atual como paga e transfere o restante para a próxima, sem mudar o valor contratado. Sem próxima parcela, a opção fica indisponível.
7. Se o principal for maior que o saldo, o excedente abate as parcelas pendentes seguintes, na ordem. Não pode ultrapassar o saldo em aberto do carnê; se ultrapassar, o recebimento é recusado. Não registre esse excedente também como pagamento direto da venda.
8. Escolha **Receber** e informe o PIN de um funcionário ativo na janela **Autorizar Pagamento**. Aguarde **Pagamento Confirmado**. O recibo pode abrir na hora. A tela oferece **Reimprimir Recibo** e **Enviar recibo por WhatsApp**. O envio depende do canal e do telefone; a tentativa não prova que a mensagem chegou.

Para consultar sem receber, use **Loja Vazia → Parcelamentos**. A busca aceita nome do cliente ou número da venda. Os filtros incluem **Todas**, **Pendentes**, **Atrasadas** e **Pagas**, além de período de vencimento e de pagamento. Essa página não substitui a janela de recebimento.

**PIX Remoto** registra o recebimento informado. Não gera QR Code e não confirma a transferência. A cobrança Pix integrada só existe com Pix Sicredi. Antes de receber de novo o mesmo valor, confira se já há cobrança Pix e o estado dela.

Para cancelar uma cobrança Pix pendente de parcela: abra **Atendimento → Parcelas**, busque o cliente, localize a parcela e abra a cobrança existente. Na janela **Pix da parcela**, se a situação for **Aguardando pagamento**, escolha **Cancelar / alterar valor** e autorize com PIN. Se estiver **Pago e baixado** ou **Pago — baixa pendente**, siga a tela e não cancele como se ainda estivesse em aberto. Cancelar QR Code pendente não usa **Reverter**. Sem Pix Sicredi, não oriente esse cancelamento.

Fontes: `src/components/operator-menu/OperatorMenuAtendimento.tsx`, `src/components/modals/ParcelaSearchModal.tsx`, `src/components/modals/PixInstallmentChargeModal.tsx`, `src/lib/actions/pix-installment.actions.ts`, `src/components/financeiro/ParcelasInterface.tsx`.

### Como saber onde estão os óculos e atualizar o laboratório?

O quadro de laboratório não aparece para todos os perfis. Na barra lateral, **Rastrear Lentes** está disponível para administração, gerência, operação e técnico. O vendedor acompanha a retirada por **Entrega Óculos** e **Gaveta (Prontos)**.

1. Abra **Loja Vazia → Laboratório**. Na barra lateral, o nome é **Rastrear Lentes**.
2. Busque por OS, protocolo, cliente ou dependente. As colunas são **Falta Pedir**, **Lentes Pedidas**, **Lentes Chegaram** e **Óculos Montado**.
3. Arraste o cartão para avançar ou voltar a etapa, ou clique nele para editar o acompanhamento. Confira os dados antes de salvar.
4. **Avisar no WhatsApp** pode aparecer quando a lente chegou ou o óculos está montado, se houver telefone e canal. Mover o cartão não prova que a mensagem foi enviada.

A bandeja NFC não é obrigatória. Ela só existe quando a loja tem tag e um aparelho que leia NFC. A leitura abre a tela daquele envelope. Sem sessão, a tela pede **Entrar no sistema**. Envelope vazio pede o número da OS e **Vincular OS**. Depois, a tela faz uma pergunta por vez, com **Sim** ou **Não**: chegada da lente, montagem no laboratório quando a OS foi enviada para lá, chegada do óculos à loja e óculos pronto. Confirme o número da OS mostrado antes de responder. Sem tag ou sem aparelho compatível, use o quadro de laboratório.

Fontes: `src/app/dashboard/loja/[storeId]/laboratorio/page.tsx`, `src/app/nfc/[storeId]/bandeja/[trayId]/NfcTrayClient.tsx`.

### Como confirmar a entrega dos óculos?

1. Abra **Atendimento → Entrega**. Na barra lateral, o nome é **Entrega Óculos**. Busque por OS, protocolo, cliente ou dependente.
2. A lista mostra OS montadas e ainda não entregues, da loja atual, cuja venda não está cancelada nem devolvida. Confira paciente e situação da venda.
3. Se o botão for **Ir para Fechamento**, a venda ainda está **Em Aberto**. Esse botão abre a venda experimental para o fechamento. Ele não confirma a entrega.
4. Se o botão for **Confirmar Entrega**, a janela mostra laboratório, data em que a lente chegou, data da montagem e **Entregue Cliente**. A data de entrega começa com o momento atual e pode ser conferida. Não há PIN nessa confirmação. Aguarde **Entrega confirmada**. A entrega também libera o envelope NFC vinculado, quando existir.

Se a OS não aparecer, ela pode não estar montada, já ter sido entregue, estar em outra loja ou pertencer a venda cancelada ou devolvida. **Loja Vazia → Gaveta**, na barra lateral **Gaveta (Prontos)**, lista os mesmos prontos aguardando retirada e mostra há quantos dias estão prontos. A gaveta não confirma a entrega. Se estiver vazia e houver óculos físicos, confira se a OS foi marcada como montada. O aviso de WhatsApp da gaveta ou da entrega depende de telefone e canal e não substitui **Confirmar Entrega**.

Fontes: `src/app/dashboard/loja/[storeId]/entrega/page.tsx`, `src/app/dashboard/loja/[storeId]/gaveta/page.tsx`.

### Como acompanhar a adaptação no pós-venda?

O pós-venda só aparece com o módulo habilitado. Na barra lateral, **Pós-Venda** está para administração, gerência, operação e vendedor. O técnico não tem esse menu.

1. Abra **Loja Vazia → Pós-Venda**. Em **Fila de Adaptação**, busque pelo nome e selecione a pessoa.
2. Confira titular, paciente, situação da venda e o histórico de contatos. **Ver Detalhes / Receita** mostra os dados da venda. O saldo exibido não recebe pagamento.
3. **Enviar Mensagem** monta um texto sobre a adaptação e tenta o WhatsApp. Sem telefone, a tela avisa **Telefone não cadastrado** e oferece **Sem fone** para cadastrar. Com telefone, o envio usa o canal da loja ou abre o WhatsApp externo. A mensagem de sucesso da tela não prova que o cliente leu. Registrar o contato é outra ação.
4. Escolha **WhatsApp**, **Ligação** ou **Presencial**, descreva **O que foi conversado?** e use **Salvar Contato**. Sem esse texto, o contato não salva.
5. Para encerrar, dê uma nota nas estrelas. **Concluir e arquivar** fica desabilitado sem nota. Sem um contato já salvo, a tela pede para salvar uma interação primeiro. As considerações finais são opcionais.

A fila é o acompanhamento manual. Mensagens automáticas de pós-venda só existem se a loja tiver essa automação configurada. Regras extras da Loja 1 não valem para as outras lojas. Estar na fila não significa que uma mensagem automática foi enviada.

Fontes: `src/components/pos-venda/PostSalesInterface.tsx`, `README.md` — continuidade do pós-venda.

### Como abrir e acompanhar uma assistência?

**Assistência** está no atendimento e na barra lateral para administração, gerência, operação, vendedor e técnico.

1. Escolha **Nova Assistência**, busque o cliente e selecione um produto da compra ou **Produto Não Cadastrado / Externo**.
2. Descreva o defeito e escolha a modalidade. A tela explica o efeito: **Padrão** deixa o produto para análise; **Garantida** o cliente leva o produto e a loja pede outro ao fornecedor; **Imediata** informa que baixa o estoque da loja agora. Não há prazo de garantia calculado nessa tela. Confira o texto antes de **Abrir ticket**.
3. O quadro tem **Triagem / Análise**, **Em Tratativa**, **Aguardando Peça**, **Pronto / Retirada** e **Logística Reversa**. As ações pedem confirmação: **Iniciar**, **Solicitado**, **Chegou**, **Entregue** e **Finalizar**. No **Padrão**, a retirada conclui o caso. Nas outras modalidades, a retirada vai para logística reversa e só depois **Finalizar** conclui. **Histórico / Chat** mostra os registros.
4. **Rastreio WhatsApp** envia o link público de acompanhamento. Sem telefone, a tela avisa **Cliente sem telefone**. O envio depende do canal. A tentativa não prova que o cliente abriu o link.

**Atendimento → Enviar Informação**, na barra **Consulta Cliente**, é outra consulta: pode enviar resumo financeiro ou receita por WhatsApp. Não é o link de garantia da assistência. Sem telefone, o envio não segue. Quando a tela diz que a imagem foi enviada pelo WhatsApp da loja, isso confirma o aceite do canal, não a leitura pelo cliente. Se abrir o WhatsApp externo, a mensagem ainda depende do envio manual.

### Como consultar cobranças e registrar um contato?

A tela **Cobrança** acompanha clientes com parcelas em atraso. Ela não recebe parcela e não reduz a dívida.

1. Abra **Loja Vazia → Cobrança**. O módulo de parcelamento e o perfil precisam permitir o acesso.
2. Use as abas **Cobrar** e **Já Cobrados**. A busca é pelo nome do cliente. Os filtros **Com SPC** e **Sem SPC** restringem a lista. Confira o total mostrado.
3. Abra a pessoa e confira a dívida e o histórico. **Whatsapp** só segue quando há telefone; sem telefone, a tela avisa. O envio usa o canal da loja quando disponível e pode abrir o WhatsApp externo. Nenhum dos dois recebe a parcela nem prova, sozinho, que o cliente leu a mensagem.
4. Em **Registrar Contato**, escolha **Whatsapp**, **Ligação** ou **Presencial**. Se houver mais de uma venda, selecione qual está sendo cobrada. Escolha o operador, escreva o resumo e use **Registrar Ação**. Sem resumo ou sem operador, a ação não confirma.
5. **Lembrar em** é opcional. Uma data futura leva o cliente para a aba **Já Cobrados**. Isso é um lembrete de revisão, não uma promessa que quite parcela e não é recebimento.

**Negativar SPC**, **Remover SPC**, **Externa** e **Perdido** mudam a classificação do cliente e podem tirá-lo da lista. Também não recebem parcela. Para baixar a dívida, use **Atendimento → Parcelas**.

Fontes: `src/components/cobranca/CobrancaInterface.tsx`, `src/components/modals/ParcelaSearchModal.tsx`.

### Como consultar produtos e registrar uma movimentação de estoque?

Essas telas ficam com administração, gerência, operação e técnico. O vendedor não tem esse menu.

1. Para consultar produtos e preços, abra **Loja Vazia → Cadastros**. Na barra lateral, o nome é **Produtos & Preços**. A busca é por item. Produto com grade exige a variante correspondente. Esta consulta não inclui páginas internas de gabarito ou modelo de lente.
2. Para lançar ou rever movimento, abra **Loja Vazia → Movimentação**. Na barra lateral, o nome é **Movimentações**. Escolha **Nova Movimentação**.
3. Busque por nome, código de barras ou referência e selecione o produto. Se ele tiver grade, selecione a variante. Sem a variante, **Confirmar Movimentação** fica desabilitado.
4. O **Tipo de Movimento** pode ser **Entrada (Compra/Retorno)**, **Saída (Venda/Baixa)**, **Perda / Quebra**, **Brinde / Cortesia** ou **Ajuste de Inventário**. Informe a quantidade. O motivo pode ficar em branco e recebe um texto padrão. **Venda Vinculada** só deve ser preenchida com o número da venda correspondente.
5. Escolha **Confirmar Movimentação** e informe o PIN na janela **Autorizar Movimentação**. Aguarde a confirmação antes de olhar o saldo de novo.

**Lente de Aproveitamento** é opcional. Se o eixo estiver preenchido, a sugestão na OS exige o mesmo eixo. A lente de aproveitamento não substitui o lançamento do produto.

**Importar XML** lê um arquivo XML ou consulta uma NF-e pela chave, no CNPJ fiscal da loja. Também está disponível para o técnico. Conferir a nota não é, por si só, a movimentação de estoque.

**Etiquetas** só aparece com o módulo de etiquetas habilitado, para os mesmos perfis do estoque. Sem o módulo, não oriente a impressão.

Fontes: `src/app/dashboard/loja/[storeId]/estoque/movimentacoes/_components/StockMovementModalClientWrapper.tsx`, `src/app/dashboard/loja/[storeId]/estoque/movimentacoes/_components/StockMovementForm.tsx`, `src/components/operator-menu/OperatorMenuLojaVazia.tsx`.

### Onde consultar caixa, relatórios e configurações?

- **Livro Caixa:** abra **Loja Vazia → Caixa** ou **Livro Caixa** na barra lateral. O acesso é de administração, gerência ou operação. A tela oferece lançamento manual e atualização; confira tipo, valor e descrição antes de confirmar. Apagar ou editar valor vale para lançamento manual. Um pagamento vindo da venda pode ter a forma alterada pelo lápis **Alterar forma de pagamento**, com PIN, mas não é apagado ali. Não use o Livro Caixa para remover pagamento direto, reverter parcela nem substituir uma movimentação de estoque.
- **Contas a pagar** e **Comissões** ficam em **Gerência** e só aparecem para administração e gerência. Não descreva o cálculo da comissão sem a configuração da loja.
- **Relatórios:** abra **Gerência → Central de Relatórios**. O acesso é de administração e gerência. Escolha a visão e o período. Alguns relatórios dependem de módulo. O resultado mostra o que está registrado, não uma previsão.
- **Configurações:** abra **Gerência → Configuração**, também só para administração e gerência. As abas são **Dados da Loja**, **WhatsApp**, **Horários**, **Recursos**, **Equipe & Acesso** e **Senhas**. Confirme a loja antes de salvar. Vendedor, técnico e operação não alteram essa tela.
- **Módulos ou opções ausentes:** o perfil pode esconder o menu. Com acesso à configuração, **Recursos** liga fiscal, parcelamento, pós-venda, avaliação, tabelas globais, venda rápida e etiquetas. WhatsApp, Pix e fiscal ainda dependem do serviço configurado. Sem o menu, peça ao responsável. Não invente outro caminho.

Fontes: `src/components/financeiro/CaixaInterface.tsx`, `src/app/dashboard/loja/[storeId]/reports/page.tsx`, `src/components/config/ConfigInterface.tsx`, `src/lib/store-modules.ts`.

### Recebi uma parcela errada. Como corrigir?

1. Em **Loja Vazia → Parcelamentos**, pesquise o cliente, localize a venda e confira a parcela e o recebimento. Também é possível localizar a venda pela **Busca**, abrir a venda experimental e consultar suas parcelas em **Parcelamento**.
2. Se o recebimento tiver a ação **Reverter**, escolha essa ação junto à parcela. Confira o valor, a data, a forma de pagamento e a quantidade de parcelas afetadas na janela **Reverter quitação**.
3. Informe o motivo da correção com pelo menos cinco caracteres e escolha **Autorizar com PIN de gerente**. Um gerente ativo da loja deve autorizar com seu PIN na janela do sistema; nunca informe o PIN na conversa com a IA.
4. Aguarde a confirmação, confira novamente o saldo e, se necessário, registre o recebimento correto pelo fluxo de parcelas.

A reversão desfaz os efeitos daquela operação inteira, inclusive baixa parcial, juros, abatimento das parcelas seguintes e transferência para a próxima. O PIN é de um gerente ativo, na janela **Autorizar reversão**. O Livro Caixa não reverte parcela.

Em cada carnê, **Reverter** aparece na parcela de origem do recebimento concluído mais recente que ainda pode ser desfeito, mesmo se a parcela continuar parcial. Se houve um recebimento mais novo no mesmo carnê, a tela ou o sistema pedem para reverter esse mais recente antes. Recebimentos antigos sem o histórico da operação não mostram a ação. Uma renegociação feita depois também impede reverter o recebimento anterior. Se o botão não aparecer, não improvise pelo Livro Caixa nem refaça o acordo por conta própria.

Fontes: `src/components/financeiro/ParcelasInterface.tsx`, `src/components/financeiro/ReverseInstallmentReceiptModal.tsx`, `src/components/vendas/FinanciamentoBox.tsx`, `src/lib/actions/parcelas.actions.ts`.

### Dúvidas e situações frequentes

- **“Não vejo Venda Rápida, Parcelas, Pós-Venda ou Avaliação.”** A opção pode depender do módulo da loja e do perfil. Confira a loja ativa e peça ao responsável para verificar a configuração e o acesso.
- **“Iniciar nova venda está desabilitado.”** Selecione o cliente e um vendedor ativo. Se o botão estiver liberado e a venda não abrir, leia o aviso: avaliação aberta nos últimos 7 dias pede para continuar em **Avaliação**; bloqueio de mensalidade pede para regularizar a loja. Pendência financeira do cliente não desabilita o botão.
- **“Não consigo finalizar a venda.”** Confira **A Receber** e se já existe carnê. **Falta Destinar** aparece quando há saldo e ainda não existe carnê. Se já existe carnê, **Finalizar Venda** pode continuar disponível; confira o saldo antes de fechar. Um pagamento direto sem carnê que zera o saldo, ou um carnê que cobre o saldo, fecha a venda sem esse botão. Confira também se há cobrança Pix em andamento e siga a autorização exigida.
- **“Lancei o pagamento direto errado.”** Não procure a reversão no Livro Caixa. Com a venda aberta, use a lixeira **Estornar / Remover** em **Pagamentos**. Se a venda já fechou, **Reabrir** só aparece dentro do prazo e para o vendedor original ou um gerente. Se o botão não existir, procure o responsável.
- **“O cliente pagou a parcela. Lanço também na venda?”** Não. O recebimento da parcela permanece no carnê. Lançar o mesmo valor em **Novo Pagamento** cobra o cliente outra vez.
- **“Registrei o contato ou a data de lembrete. A parcela foi recebida?”** Não. Cobrança, WhatsApp, SPC e **Lembrar em** não baixam parcela. O recebimento é feito em **Atendimento → Parcelas**.
- **“O cliente pagou mais que a parcela.”** O excedente abate as parcelas pendentes seguintes. Se passar do saldo em aberto do carnê, o recebimento é recusado. Não lance a diferença de novo na venda.
- **“O carnê não abre ou não gera.”** Confira se o módulo está ativo, se o cliente tem CPF ou CNPJ e telefone e se os dados do parcelamento foram calculados. A soma das parcelas deve corresponder ao total. Leia a mensagem da tela e corrija o dado indicado.
- **“A venda está fechada, mas ainda existem parcelas.”** A venda pode estar fechada porque o saldo foi formalizado no carnê. As parcelas continuam sendo acompanhadas e recebidas no fluxo de carnê; o fechamento da venda não é quitação de todas elas.
- **“Não consigo reabrir uma venda.”** A ação depende das regras de prazo, do estado da venda e da identificação autorizada. A interface verifica o vendedor original ou um gerente. Consulte a mensagem apresentada e procure a gerência quando necessário.
- **“A OS não aparece em Entrega.”** A lista só mostra OS montada, ainda não entregue, da loja atual e de venda que não está cancelada nem devolvida. Confira a coluna **Óculos Montado** no laboratório, quando o perfil tiver esse quadro, e a **Gaveta**.
- **“A entrega pede fechamento.”** **Ir para Fechamento** significa que a venda está **Em Aberto**. Abra a venda experimental e conclua o fechamento. A entrega só é confirmada quando o botão for **Confirmar Entrega**.
- **“O recibo ou WhatsApp não funcionou.”** Confira a mensagem de erro e o recurso utilizado. Impressão depende do navegador e da impressora; envio depende do canal e dos dados de contato. Não afirme que um envio chegou ao cliente apenas porque houve uma tentativa.
- **“O Pix ou a nota está pendente.”** Acompanhe o estado exibido na própria tela e procure a pessoa responsável pela operação ou configuração. Não registre outro pagamento para o mesmo compromisso sem conferir a cobrança existente; uma tentativa fiscal não equivale a nota autorizada.
- **“Não encontro uma função ou a tela difere.”** Pergunte se a pessoa está na Central com cartões ou na barra lateral, qual loja está ativa e o nome que aparece na tela. Nunca recomende contornar permissões ou usar credenciais de outra pessoa.

As orientações acima foram conferidas por leitura de código e documentação; não são uma homologação interativa de todos os perfis, configurações, integrações ou ambientes. Se a base não confirmar uma etapa, diga que é necessário conferi-la na tela ou com o responsável.

## 1. Início do atendimento e cliente

- No menu **Atendimento**, a equipe encontra entradas para venda de óculos, venda rápida, entrega, recebimento de parcelas, assistência, clientes e busca universal. Os botões apresentados variam conforme o módulo e o perfil.
- Em **Venda Óculos**, a equipe busca ou cadastra o cliente, seleciona o vendedor e inicia a venda. A tela mostra só as duas vendas mais recentes; essa lista não abre a venda. O histórico completo fica no **Raio-X** ou no **Dossiê**.
- A criação da venda encaminha para a tela **experimental**. Pode haver aviso de avaliação recente em aberto, conforme as regras daquele fluxo.
- A busca universal oferece consulta por dados como nome, CPF, telefone ou número de OS e dá acesso aos registros encontrados. O cadastro e o histórico do cliente apoiam a continuidade do atendimento.
- O atalho **Dossiê** inicia a consulta do histórico do cliente, incluindo compras anteriores e dados de visão disponíveis, como receita e DNP.

Fontes: `src/components/operator-menu/OperatorMenuAtendimento.tsx`, `src/app/dashboard/loja/[storeId]/atendimento/page.tsx`, `src/components/consultas/BuscaUniversal.tsx`, `src/components/history/CustomerHistoryPage.tsx`.

### Avaliação e tabela de lentes na loja

- Quando a análise pré-venda está habilitada, o menu oferece **Avaliação** para registrar análises e manter histórico por titular ou dependente. O fluxo oferece importação de PDF do iVision e, quando os dados e o catálogo ativo permitem, comparação da indicação importada com sugestões geradas com apoio de IA.
- A equipe pode aplicar uma indicação e iniciar venda/OS pelo fluxo da avaliação. A existência da interface não garante que um catálogo esteja ativo ou que uma sugestão esteja disponível para todo caso; a avaliação apoia a equipe e não substitui a prescrição profissional.
- Com tabelas globais habilitadas e catálogo disponível, a loja pode consultar ofertas, tratamentos e preços. Uma oferta pode ser encaminhada para uma venda experimental nova ou aberta.
- Esta seção trata das telas de atendimento existentes neste sistema. A experiência da Neosmart continua pertencendo ao produto separado, conforme o README.

Fontes: `src/app/dashboard/loja/[storeId]/avaliacao/page.tsx`, `src/components/evaluation/EvaluationInterface.tsx`, `src/app/dashboard/loja/[storeId]/tabela-precos/page.tsx`, `src/components/catalog/CatalogLensSaleActions.tsx`.

## 2. Venda expressa: atendimento de balcão

- A **Venda Rápida / PDV Express** permite selecionar o vendedor, buscar produtos, montar a cesta, ajustar preço, remover itens e seguir para o pagamento. A interface oferece busca compatível com código de barras e atalho de teclado para finalizar.
- A aba **Pagamento** registra o valor e a forma recebidos. A forma inicial é **PIX Remoto**; Pix Sicredi só aparece com a integração da loja. A confirmação sem Pix pendente grava a venda fechada e sem saldo. O seletor de parcelas dessa aba não é o carnê e não gera o controle de cartão ou cheque da venda experimental.
- A confirmação pede PIN. O fluxo abre o recibo e, com o módulo fiscal, oferece NFC-e. A tela concluída não remove o pagamento.
- Com parcelamento ativo, a aba **Carnê** identifica o cliente pelo nome. Essa seleção já cria a venda e registra a saída de estoque. **Gerar Carnê** usa os dados do cliente selecionado: se faltar CPF/CNPJ ou celular, complete o cadastro e depois informe o PIN. Se precisar sair, o X ou **Continuar na Venda Experimental** abre a mesma venda e limpa a cesta da Expressa; não inicie outra venda para os mesmos itens. Se houver erro de rede e não for possível confirmar a criação, confira a lista de vendas antes de repetir. Se o carnê cobrir o total, a venda fecha. As parcelas continuam sendo recebidas no fluxo de carnê, sem novo pagamento direto.

**Valor para a apresentação:** uma venda de balcão tem uma entrada própria, sem exigir que toda compra seja contada como uma venda de óculos com ficha técnica.

Fontes: `src/app/dashboard/loja/[storeId]/pdv-express/page.tsx`, `src/components/vendas/PdvExpressInterface.tsx`, `src/components/modals/PaymentModal.tsx`, `src/lib/actions/vendas.actions.ts`.

## 3. Venda experimental: venda de óculos e OS

Na venda experimental, a equipe trabalha com o cliente e o vendedor vinculados à venda, produtos, pagamentos, parcelamento, observações e protocolo/OS. A interface reúne a situação financeira e a linha do tempo da venda.

### Produtos e registro financeiro

- A inclusão de itens pesquisa o catálogo da loja. O formulário contempla lentes, armações, solares, tratamentos, serviços e outros itens; os tipos de produto que exigem cadastro devem ser selecionados entre as sugestões.
- O modo de venda de lentes por unidade pode representar um par como duas unidades físicas mantendo o preço comercial do par. É uma configuração da loja.
- A equipe registra pagamentos diretos em **Novo Pagamento** e, com o módulo e os dados do cliente, formaliza o carnê. **A Receber** não inclui pagamento de parcela. A lixeira remove somente pagamento direto e só com a venda aberta. Os recibos ficam no botão **Recibos**.
- Sem carnê, zerar **A Receber** fecha a venda. Um carnê que cobre o saldo também fecha. **Falta Destinar** só bloqueia o fechamento quando há saldo e não há carnê. Cancelar, abandonar, reabrir e devolver seguem os botões e as condições da própria venda.
- O botão de NFC-e depende do módulo fiscal; emissão e resultado dependem também da configuração e do serviço fiscal. A presença do botão não comprova autorização de uma nota.

### Receita, paciente e medidas

- A OS associa informações da venda ao paciente, que pode ser o titular ou um dependente, e ao profissional responsável pela receita quando informado.
- A ficha contempla dados como esférico, cilíndrico, eixo e adição, além de medidas como DNP, altura, diâmetro e dimensões da armação. A consulta de receita anterior fica na ficha separada, pelo botão **Histórico**, não na ficha embutida.
- A OS pode relacionar lentes dos olhos direito e esquerdo e armação aos itens da venda. A ficha técnica também oferece consulta e reserva de lentes em estoque no fluxo correspondente.
- A loja pode trabalhar com **uma OS embutida na venda experimental** ou com **várias fichas técnicas por venda**. Isso altera a forma de preencher e navegar, não transforma a tela antiga de venda em uma opção funcional.
- A ficha permite gerar o protocolo impresso. A numeração local automática é opcional e específica da loja.

Fontes: `src/app/dashboard/loja/[storeId]/vendas/[vendaId]/experimental/page.tsx`, `src/components/vendas/VendaInterfaceExperimental.tsx`, `src/components/vendas/AddItemFormExperimental.tsx`, `src/components/vendas/VendaActions.tsx`, `src/app/dashboard/loja/[storeId]/vendas/[vendaId]/os/ServiceOrderForm.tsx`, `src/components/config/ConfigInterface.tsx`.

## 4. Medidas e apoio à confecção

- O acesso de tablet apresenta OSs pendentes de laboratório e indica registros com ou sem medidas. A partir de uma OS, a equipe pode abrir o fluxo de medidas da armação; a tela também oferece fazer medidas antes e informar a OS depois.
- O fluxo de medidas pode trabalhar com foto e salvar dados vinculados à OS. A página da OS permite consultar a foto registrada quando disponível.
- O tablet também oferece acesso à tabela de preços; a disponibilidade do catálogo e das tabelas deve ser conferida na configuração da loja.
- A existência dessas telas não significa que a captura automática ou cada integração de medição esteja disponível em todos os aparelhos e lojas.

Fontes: `src/app/tablet/[storeId]/page.tsx`, `src/app/tablet/[storeId]/os/page.tsx`, `src/app/medidas-armacao/page.tsx`, `src/lib/actions/medidas.actions.ts`, `src/app/dashboard/loja/[storeId]/vendas/[vendaId]/os/OSPhotoViewer.tsx`.

## 5. Laboratório, bandeja e entrega

### Laboratório

O painel de laboratório organiza as OSs abertas nas etapas **Falta Pedir**, **Lentes Pedidas**, **Lentes Chegaram** e **Óculos Montado**. A equipe pode avançar ou retornar etapas arrastando os cartões ou editar o acompanhamento. O painel apresenta informações da ordem e o tempo na etapa.

O fluxo também possui ações de contato por WhatsApp, sujeitas a canal e configuração. Elas devem ser descritas conforme a ação efetivamente usada; não presumir que toda mudança de etapa envia mensagem automaticamente.

### Bandeja com NFC

A bandeja NFC só existe com tag e aparelho compatível. A leitura identifica o envelope, vincula a OS quando ele está vazio e pede confirmação de chegada, montagem e pronto. Sem esses recursos, o acompanhamento é o quadro de laboratório.

### Entrega

Em **Entrega Óculos**, a equipe localiza a OS e acompanha a retirada. A tela permite chegar à venda experimental relacionada quando necessário. A área **Gaveta (Prontos)** ajuda a consultar óculos prontos que aguardam retirada.

Fontes: `src/app/dashboard/loja/[storeId]/laboratorio/page.tsx`, `src/lib/actions/lab.actions.ts`, `src/app/nfc/[storeId]/bandeja/[trayId]/NfcTrayClient.tsx`, `src/lib/actions/nfc.actions.ts`, `src/app/dashboard/loja/[storeId]/entrega/page.tsx`, `src/app/dashboard/loja/[storeId]/gaveta/page.tsx`.

## 6. Recebimentos, carnê e cobrança

- O recebimento de parcelas pode ser iniciado no Atendimento. A busca localiza o cliente e suas parcelas; o fluxo contempla baixa parcial, recibo e envio do comprovante por WhatsApp quando o canal estiver disponível.
- A consulta de parcelas acompanha vencimentos, valores e situação. A cobrança reúne clientes em atraso e registra contato. **Lembrar em** é um lembrete de revisão, não um recebimento e não quita a parcela.
- A loja pode disponibilizar cobrança Pix integrada para vendas e parcelas quando o provedor e as condições correspondentes estiverem configurados. As demais formas podem representar o registro de um recebimento informado pela equipe; não presumir processamento de cartão ou transferência bancária pelo sistema.
- **Regra da venda e do carnê:** o saldo **A Receber** corresponde ao que ainda não foi coberto por pagamento direto ou pelo valor formalizado no carnê. Uma venda integralmente financiada fica sem saldo e é fechada, enquanto as parcelas futuras permanecem em aberto. Pagamentos posteriores das parcelas pertencem ao carnê e não devem ser lançados de novo como pagamento direto. O Livro Caixa não apaga nenhum desses recebimentos.
- Em venda **Em Aberto**, a renegociação pode reduzir o saldo ainda não recebido. A diferença volta para **A Receber** e só vira recebimento quando for lançada uma vez em **Novo Pagamento**. Em venda **Fechada**, a renegociação redistribui o mesmo saldo e não o reduz. Recebimentos anteriores permanecem no carnê. Uma renegociação posterior impede **Reverter** o recebimento anterior.

Fontes: `README.md` — regra financeira; `src/components/modals/ParcelaSearchModal.tsx`, `src/components/financeiro/ParcelasInterface.tsx`, `src/components/cobranca/CobrancaInterface.tsx`, `src/components/vendas/FinanciamentoBox.tsx`, `src/lib/actions/pix-sale.actions.ts`, `src/lib/actions/pix-installment.actions.ts`.

## 7. Pós-venda, WhatsApp e assistência

### Adaptação e relacionamento

- O pós-venda manual fica na fila de adaptação, com contato, nota e arquivamento. A automação de WhatsApp é configuração da loja e não se presume pelo fato de o caso estar na fila. Regras da Loja 1 não se estendem às demais.
- Avisos manuais de laboratório, entrega, gaveta, pós-venda, assistência e consulta de cliente dependem de telefone e canal. O texto de sucesso da tela não equivale à leitura pelo cliente.
- O atendimento humano é parte do fluxo: a automação deve respeitar pausas e encaminhamentos. Ela não deve ser apresentada como resposta irrestrita a qualquer pergunta.
- Alguns comportamentos conversacionais descritos no README são específicos do piloto da **Loja 1**. Não presumir que estejam habilitados ou operem da mesma forma nas demais lojas.

### Assistência e garantia

- A assistência acompanha triagem, tratativa, espera de peça, retirada e logística reversa. **Padrão**, **Garantida** e **Imediata** mudam o caminho e o texto de efeito mostrado na abertura. Não há cálculo de prazo de garantia nessa tela.
- O link de acompanhamento sai pelo botão de rastreio, se houver telefone e canal. A consulta **Enviar Informação** manda resumo financeiro ou receita, não esse link.

Fontes: `README.md` — WhatsApp e continuidade do pós-venda; `src/components/pos-venda/PostSalesInterface.tsx`, `src/components/assistencia/AssistanceKanban.tsx`, `src/app/rastreio/[token]/page.tsx`, `src/lib/whatsapp/`, `services/whatsapp-automation/README.md`.

## 8. Estoque, apoio à operação e gestão

- **Produtos e preços:** consulta e manutenção do catálogo usado nas vendas, incluindo armações, lentes e outros produtos. A busca e os itens disponíveis dependem do cadastro da loja e das tabelas habilitadas.
- **Estoque:** movimentações de entrada, saída, perda, brinde e ajuste, com variante quando o produto tem grade. A importação de XML confere a nota fiscal; ela não substitui a movimentação. Etiquetas dependem do módulo.
- **Histórico e consulta:** lista de vendas, acesso à venda experimental, histórico do cliente e busca por identificadores ajudam a retomar o atendimento. Vendas históricas importadas possuem tela própria; não presumir que tenham todos os vínculos de uma venda criada no sistema.
- **Financeiro da loja:** livro caixa, contas a pagar, comissões e consultas de parcelas apoiam a gestão, observados os papéis e as configurações da loja.
- **Relatórios:** a central inclui visões de vendas, caixa e banco, parcelamento, cobrança, produtos e estoque, movimento operacional, clientes, pós-venda e médicos. Alguns relatórios dependem do módulo correspondente; a leitura reflete os dados registrados e o período escolhido.
- **Fiscal:** o menu e os fluxos de nota são condicionados ao módulo e à integração fiscal. O repositório também descreve operações em piloto; não afirmar que todas as lojas emitem todos os tipos de documento ou que uma nota foi autorizada apenas porque houve uma tentativa de envio.

Fontes: `src/components/operator-menu/OperatorMenuLojaVazia.tsx`, `src/components/SideNav.tsx`, `src/app/dashboard/loja/[storeId]/importacao/page.tsx`, `src/app/dashboard/loja/[storeId]/estoque/movimentacoes/page.tsx`, `src/components/vendas/VendasListInterface.tsx`, `src/components/history/HistoricalImportedSalePage.tsx`, `src/app/dashboard/loja/[storeId]/reports/page.tsx`, `src/components/manager-menu/ManagerLayout.tsx`.

## Configurações e disponibilidade por loja

O sistema trabalha com contexto de loja. Configurações e módulos podem mudar o que aparece e o comportamento de um fluxo; permissões também variam por perfil. A lista abaixo é um guia para futuras consultas, não um retrato das configurações reais de cada loja.

| Recurso ou configuração | Efeito no atendimento e na gestão |
| --- | --- |
| Venda rápida | Pode habilitar ou ocultar a entrada do PDV Express. |
| Parcelamento | Controla acesso a funções de carnê, parcelas, cobrança e relatórios relacionados. |
| Pós-venda | Controla a entrada e relatórios relacionados ao acompanhamento. |
| Fiscal | Controla a apresentação do módulo; a operação efetiva também depende da integração e da configuração fiscal. |
| Avaliação e tabelas globais | Dependem da ativação e das configurações aplicáveis. A avaliação e a consulta de tabela não devem ser descritas como universais. |
| Etiquetas | Controla a função de geração e impressão de etiquetas de estoque. |
| Modelo de OS | Permite OS única embutida ou várias fichas por venda. |
| Lentes em unidades | Define como o par é representado em unidades físicas na venda. |
| Data de entrega e protocolo local | A loja pode habilitar a data de entrega e a numeração local sequencial de protocolo. |
| Recibos e OS impressos | O formato de impressão é configurável. |
| Comissões | A loja configura taxas e o momento de geração das comissões. |
| Pix | O provedor é configurado por loja; a geração de cobrança integrada exige o provedor correspondente e sua configuração. |
| WhatsApp | Canal, automações, tipos de acompanhamento e horários dependem da configuração e dos serviços necessários. Há regras específicas de piloto. |

Fontes: `src/lib/store-modules.ts`, `src/lib/store-modules.server.ts`, `src/components/config/ConfigInterface.tsx`, `src/components/config/WhatsAppChannelPanel.tsx`, `src/components/SideNav.tsx`.

## Pontos para explorar na futura landing page

Estes temas são oportunidades de posicionamento identificadas no produto; não são afirmações de exclusividade frente a outros sistemas.

1. **A jornada de uma ótica conectada:** da venda de óculos e seus dados técnicos até laboratório, entrega, recebimentos e acompanhamento de adaptação.
2. **A venda entende o produto óptico:** paciente ou dependente, receita, lentes por olho, armação, medidas e OS ligados ao atendimento.
3. **Do balcão à venda de óculos:** a venda expressa e a experimental atendem situações diferentes da rotina.
4. **A OS continua depois da venda:** laboratório por etapas, apoio por tablet, bandeja com NFC e consulta de óculos prontos, conforme recursos disponíveis.
5. **Financeiro ligado ao compromisso correto:** pagamentos diretos, carnê, parcelas, cobrança e recibos, respeitando a diferença entre venda e recebimento futuro.
6. **Relacionamento após a entrega:** pós-venda de adaptação, assistência, garantia e automações de WhatsApp configuráveis, com participação da equipe.
7. **Uma operação por loja:** módulos, parâmetros e acessos podem ser ajustados ao contexto de cada unidade.
8. **Apoio à escolha de lentes:** avaliação pré-venda, histórico e consulta de ofertas podem apoiar o atendimento nas lojas que habilitam esses recursos e possuem catálogo disponível.

Antes de usar qualquer ponto como promessa comercial, confirmar o estado publicado e configurado para o público da landing. Comparações diretas com outros produtos exigem verificar as funções atuais de cada concorrente.
