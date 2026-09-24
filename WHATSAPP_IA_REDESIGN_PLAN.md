# Redesign da IA de atendimento no WhatsApp

## Status do documento

Este documento inicia um redesign do atendimento automático no WhatsApp.

Ele não é uma continuação obrigatória de `customer-status.ts`, da branch
`feature/whatsapp-ai-tools-experimental` ou dos fluxos de IA já existentes.
Esses materiais podem ser consultados como referência histórica, mas nenhuma
decisão antiga deve ser preservada apenas porque já foi implementada.

O plano será alterado conforme analisarmos conversas reais e validarmos a
experiência desejada.

## Objetivo inicial

Criar uma interação nova para responder a uma chamada do cliente de forma
coerente com o assunto em andamento.

O primeiro problema a resolver é simples de descrever:

> O cliente manda uma mensagem que continua uma conversa anterior, mas a IA
> responde como se tivesse recebido uma pergunta isolada ou escolhe outro
> assunto por causa dos bloqueios e desvios do fluxo antigo.

A primeira versão do redesign deve permitir que a IA receba uma janela curta
da conversa, aproximadamente as 10 últimas mensagens relevantes, e decida a
resposta considerando esse contexto.

## Princípios provisórios

- A conversa é a unidade principal, não uma mensagem isolada.
- O contexto recente deve ser enviado de forma explícita para a IA.
- A IA deve distinguir mensagens do cliente e respostas da ótica.
- O contexto não deve ser reconstruído apenas a partir de `preview`, intenção
  anterior ou estado resumido.
- Fluxos antigos, menus heurísticos e bloqueios existentes não devem decidir
  silenciosamente o resultado antes da nova interação ser definida.
- A IA não pode inventar dados operacionais; quando precisar de fatos da loja,
  deverá consultar fontes do sistema.
- O handoff humano será uma decisão do novo fluxo, e não uma barreira herdada
  automaticamente do roteador antigo.
- Toda decisão importante deverá ser observável para permitir entender por que
  a IA respondeu daquela maneira.

## Análise das conversas reais

Antes de fechar a lista de intenções e ferramentas, precisamos observar por que
os clientes realmente chamam a ótica.

### Fontes disponíveis no banco

O histórico operacional está distribuído principalmente em:

- `whatsapp_inbound_messages`: mensagens recebidas, telefone, loja, horário do
  provedor, texto e payload original;
- `whatsapp_outbound_messages`: respostas automáticas, mensagens manuais,
  tipo, status, vínculo com o inbound e payload operacional;
- `whatsapp_conversation_states`: estado atual e metadados resumidos da
  conversa;
- `whatsapp_ai_logs`: registros técnicos de chamadas de IA, que ajudam a
  diagnosticar o comportamento, mas não substituem o histórico textual.

### O que devemos extrair

A análise não deve começar perguntando apenas qual foi a intenção classificada
pela IA. Devemos identificar o motivo prático da chamada, por exemplo:

- saber se os óculos ficaram prontos;
- perguntar sobre prazo ou retirada;
- enviar receita, foto ou comprovante;
- pedir Pix ou informação de parcela;
- responder a uma cobrança ou lembrete;
- perguntar horário, endereço ou funcionamento;
- pedir orçamento ou preço;
- relatar problema, adaptação, garantia ou troca;
- continuar uma conversa iniciada pela ótica;
- pedir atendimento humano;
- enviar uma mensagem curta que só faz sentido com o contexto anterior.

Também devemos observar:

- quantas mensagens normalmente formam uma chamada;
- quantas mensagens são enviadas em sequência pelo cliente;
- quantos casos mudam de assunto dentro da mesma conversa;
- em que ponto a equipe humana assume;
- quais respostas automáticas parecem encerrar ou desviar o assunto;
- quais expressões vagas dependem diretamente das mensagens anteriores;
- quais chamadas começam por uma mensagem da ótica, como pós-venda ou
  cobrança;
- quais assuntos aparecem com maior frequência por loja.

## Taxonomia inicial dos motivos de chamada

Com base na lembrança inicial da operação, estes são os grupos que devem
orientar a primeira análise e o primeiro desenho de comportamento:

1. **Teste visual, avaliação de grau ou consulta**
   - entender se a loja oferece o serviço;
   - informar que a equipe precisa confirmar disponibilidade, preço e agenda;
   - não diagnosticar nem interpretar sintomas ou receita;
   - encaminhar para atendimento humano quando houver necessidade clínica ou
     agendamento real.

### Fluxo definido inicialmente

Exemplo de entrada:

```text
Cliente: Olá
Cliente: Tudo bem?
Cliente: Olha só. Vocês fazem exame de vista aí?
```

A IA deve entender que as duas primeiras mensagens são uma saudação e que a
terceira contém o motivo real da chamada. Ela não deve responder com um menu,
pedir que o cliente repita a pergunta ou tentar diagnosticar a necessidade.

Resposta inicial recomendada:

> Vou chamar um atendente para confirmar essa informação para você. Só um
> momento, por favor.

O sentido operacional dessa resposta é:

- reconhecer a pergunta;
- não inventar se a loja oferece exame, teste visual ou avaliação de grau;
- criar ou manter a pendência para atendimento humano;
- preservar a pergunta original para o funcionário;
- evitar uma promessa rígida de tempo.

Uma versão mais direta também é aceitável:

> Vou encaminhar sua pergunta para a nossa equipe confirmar para você.

Não recomendamos usar “em 1 minuto” ou “só 1 minuto” como regra fixa. Se a
loja realmente trabalhar com esse tempo e quiser assumi-lo como compromisso,
isso poderá ser uma configuração específica; por padrão, a IA deve informar
que está chamando a equipe sem criar um prazo que o sistema não controla.

### Quando a pergunta pode ser respondida sem handoff

Se a loja tiver uma configuração confirmada dizendo apenas que oferece ou não
oferece determinado serviço, a IA poderá responder esse fato objetivo. Mesmo
nesse caso, deve encaminhar para humano quando o cliente perguntar sobre:

- disponibilidade de horário;
- preço ou condição;
- agendamento;
- interpretação de grau ou receita;
- sintomas ou diagnóstico;
- qual exame ou avaliação seria adequado.

Exemplo de resposta objetiva quando houver configuração confiável:

> Sim, a loja oferece esse serviço. Vou chamar a equipe para confirmar os
> horários e orientar você.

Assim, a IA pode responder o fato simples, mas deixa a parte operacional e
clínica com a equipe.

2. **Horário e funcionamento da loja**
   - informar se a loja está aberta ou fechada;
   - responder o horário do dia e o próximo período de atendimento;
   - usar a configuração da loja, incluindo exceções, quando essa informação
     estiver disponível.

### Fluxo desejado para perguntas sobre horário

O sistema deve calcular fatos objetivos antes de chamar a IA:

- data e hora local da loja;
- fuso horário;
- se a loja está aberta neste momento;
- horário de abertura e fechamento do período atual;
- intervalo, se houver;
- motivo do fechamento, quando conhecido;
- próximo horário de abertura;
- exceções, feriados ou abertura especial.

A IA não deve receber apenas um texto fixo como “abre às 8h e fecha às 18h”.
Ela deve receber os fatos calculados e a pergunta completa do cliente. Assim,
pode responder com naturalidade sem inventar o estado atual.

O mesmo fato pode exigir respostas diferentes conforme a intenção da mensagem:

#### “Vocês estão abertos?”

É uma pergunta direta sobre o estado atual. A resposta deve informar se a
loja está aberta, com o horário relevante, de forma acolhedora.

Exemplos:

> Sim! Estamos abertos agora e atendemos até as 18h. Pode ficar à vontade
> para vir.

ou:

> No momento estamos fechados, mas abrimos amanhã às 8h. Será um prazer
> atender vocês.

#### “Posso ir aí agora?”

É uma pergunta prática sobre a possibilidade de ir naquele momento. A resposta
deve ser mais orientadora, sem parecer uma autorização burocrática.

Exemplos:

> Pode sim! Estamos atendendo agora. Se você vier até as 18h, nossa equipe
> estará à disposição.

ou:

> Pode vir, sim, a partir das 8h. Agora a loja está fechada e esse será o
> próximo horário de atendimento.

Se houver necessidade de agendamento, lotação ou disponibilidade específica de
um serviço, a IA não deve presumir que estar aberto significa que há vaga.

#### “Vou levar meu pai aí agora.”

É um aviso de intenção, não uma pergunta literal. A IA deve reconhecer a
intenção e responder de maneira receptiva, mas sem confirmar algo que não sabe.

Exemplos:

> Perfeito! Estamos atendendo agora e vamos receber vocês até as 18h.

ou, se estiver fechado:

> Perfeito! No momento estamos fechados. Nosso próximo atendimento começa
> amanhã às 8h; podem vir a partir desse horário.

Se a frase estiver relacionada ao exame de vista, avaliação de grau ou outro
serviço que exija confirmação, a resposta deve preservar o aviso e encaminhar
o detalhe para a equipe:

> Perfeito! Estamos atendendo agora. Vou pedir para a equipe confirmar a
> disponibilidade do atendimento para vocês.

### Regra de tom

A informação de horário deve ser clara, mas não pode soar como uma tabela
seca. A resposta deve, conforme o caso:

- começar reconhecendo a pergunta ou intenção;
- dizer a situação atual;
- informar o próximo passo útil;
- usar o horário apenas na medida necessária;
- evitar repetir toda a grade semanal quando o cliente só quer saber se pode ir
  agora.

O texto final deve continuar curto. “Amigável” não significa acrescentar
informações que o cliente não pediu.

### Regra obrigatória para o encaminhamento humano

Quando a IA não puder concluir a resposta, o próximo passo padrão deve ser
chamar a equipe para continuar no mesmo WhatsApp. A IA não deve mandar o
cliente ligar, ir pessoalmente à loja ou procurar outro canal apenas porque a
resposta ficou fora do seu alcance.

### Identidade transparente da IAra

Sempre que a IA transferir ou solicitar atendimento humano, ela deve se
identificar claramente como uma assistente virtual. Essa não deve ser uma
opção ocasional de estilo: é uma regra de transparência do produto.

O padrão deve ser semelhante a:

> Como sou a IAra, uma assistente virtual, vou chamar um atendente para
> confirmar essa informação e continuar o atendimento com você por aqui.

A frase pode ser adaptada ao assunto, desde que preserve três elementos:

- identificação como IAra;
- identificação como assistente virtual;
- explicação do motivo pelo qual um atendente será chamado.

Exemplos:

- “Como sou a IAra, uma assistente virtual, vou chamar um atendente para
  confirmar a disponibilidade dessa peça.”
- “Eu sou a IAra, assistente virtual da ótica. Vou encaminhar sua reclamação
  para a equipe, que continuará o atendimento por aqui.”
- “Aqui é a IAra, assistente virtual. Vou pedir para um atendente confirmar os
  horários desse serviço para você.”

A identidade não deve aparecer como uma explicação longa ou artificial. Ela
deve ser curta, natural e integrada à resposta. Depois que o atendimento
humano assumir, a equipe poderá se apresentar normalmente.

Respostas proibidas como fallback automático:

- “Ligue para a loja para saber.”
- “Você precisa vir pessoalmente para descobrir.”
- “Entre em contato com um atendente.”, quando isso não explica que o
  atendimento será continuado na conversa atual.

Respostas preferidas:

- “Vou chamar a equipe para confirmar e continuar por aqui.”
- “Essa informação precisa ser confirmada por um atendente. Já vou encaminhar
  sua pergunta para a equipe.”
- “Vou pedir para a equipe verificar essa disponibilidade e responder você
  por aqui.”

Essa regra vale para catálogo, lentes, agenda, reclamações, comprovantes,
parcelas e qualquer outro caso em que a IA precise de intervenção humana. A
IA pode mencionar telefone ou visita somente se o cliente perguntar
explicitamente por esses canais ou se houver uma orientação específica da
loja para aquele caso.

### Pergunta sobre a grade completa

Se o cliente perguntar “qual é o horário de vocês?”, “qual a grade da
semana?” ou algo equivalente, a IA poderá montar uma resposta adequada. Para
isso, a grade deve existir como dado estruturado do sistema, e não somente
como instrução escrita em um prompt.

O cadastro deve conseguir representar, no mínimo:

- horário de cada dia da semana;
- mais de um período no mesmo dia, como intervalo de almoço;
- dia fechado;
- feriado ou fechamento excepcional;
- abertura excepcional;
- fuso horário da loja.

O sistema fornece esses dados à IA, e a IA decide como apresentá-los de forma
legível e curta. Por exemplo:

> Nosso horário é de segunda a sexta, das 8h às 18h, e aos sábados, das 8h
> às 12h. Aos domingos não abrimos.

Se houver uma grade mais complexa, a resposta pode ser organizada por dia,
sem inventar simplificações:

> Na segunda, atendemos das 8h às 12h e das 13h30 às 18h. Na terça, das 9h
> às 18h. Aos sábados, das 8h às 12h.

Se o sistema não tiver uma grade estruturada ou houver conflito entre os dados,
a IA não deve tentar reconstruí-la sozinha. Deve informar que vai confirmar o
horário com a equipe ou usar uma resposta conservadora definida pelo produto.

Portanto, a divisão correta é:

- **sistema**: mantém a grade oficial e calcula o estado atual;
- **IA**: interpreta a pergunta e transforma os dados oficiais em uma resposta
  natural;
- **equipe**: confirma exceções que ainda não estejam cadastradas.

3. **Disponibilidade de uma peça ou produto**
   - identificar o produto mencionado;
   - consultar estoque ou disponibilidade real quando houver integração;
   - não prometer reserva, preço ou prazo sem confirmação do sistema ou da
     equipe.

### Fluxo quando não houver consulta ao catálogo

Se a IA não tiver acesso confiável ao catálogo, estoque ou disponibilidade
atual, ela não deve tentar responder se a loja possui determinada peça, lente
de contato ou lente de óculos.

Nesse caso, deve encaminhar a pergunta para um atendente e manter a conversa
no próprio WhatsApp:

> Vou chamar um atendente para confirmar a disponibilidade dessa peça para
> você. A equipe continua o atendimento por aqui.

Para lentes de contato e lentes de óculos, a IA também não deve escolher um
produto, indicar grau, sugerir uma lente específica ou afirmar que uma lente é
adequada sem os dados e a validação necessários.

Se futuramente houver integração com catálogo e estoque, a IA poderá consultar
esses dados. Mesmo assim, “parecido”, “serve para mim”, “qual é melhor” e
perguntas sobre grau podem exigir uma etapa humana, ainda que exista um item
semelhante cadastrado.

4. **Imagem ou PDF de Pix/comprovante**
   - receber e registrar o anexo;
   - identificar internamente se parece ser um comprovante;
   - nunca confirmar a baixa apenas pela leitura da imagem;
   - encaminhar para conferência humana, exibindo os dados extraídos apenas no
     painel interno quando isso for seguro.

### Fluxo inicial desejado para anexos

O fluxo atual de encaminhamento é uma boa base operacional para o primeiro
momento, mas a nova implementação não deve tratar o anexo como um bloqueio que
encerra a interação automaticamente.

A pausa curta entre mensagens vale para todos os fluxos. Portanto, se o cliente
enviar uma imagem e logo depois escrever “recebeu?”, o sistema deve aguardar o
silêncio final da janela e entregar à IAra uma única chamada contextual:

```text
Cliente: [imagem enviada]
Cliente: Recebeu?
```

A IAra pode responder:

> Sim, recebi. Eu sou a IAra, uma assistente virtual da ótica. Vou chamar um
> atendente para analisar o arquivo e continuar o atendimento por aqui.

Essa resposta consegue ser curta, humana e transparente sem confirmar que o
arquivo é um comprovante, sem confirmar uma baixa e sem fazer o cliente
repetir a pergunta.

## Handoff solicitado não é o mesmo que humano assumiu

Esta é uma decisão estrutural do redesign.

Hoje, quando a IA envia uma mensagem dizendo que vai chamar a equipe, o
sistema cria um bloqueio longo, como a pausa de 12 horas usada após um anexo.
Isso mistura dois acontecimentos diferentes:

1. a IA reconheceu que o assunto precisa de uma pessoa;
2. um funcionário realmente respondeu ou assumiu a conversa.

O primeiro acontecimento deve criar uma pendência visível para a equipe, mas
não deve bloquear automaticamente a IA. O segundo deve bloquear a IA para que
ela não atravesse o atendimento humano.

### Estados propostos

- `ai_active`: a IA pode interpretar e responder normalmente;
- `human_pending`: a equipe foi chamada ou existe uma pendência, mas nenhum
  funcionário assumiu a conversa; a IA continua recebendo contexto e pode
  responder conforme as regras do produto;
- `human_active`: um funcionário respondeu ou assumiu explicitamente; a IA não
  envia respostas automáticas;
- `human_released`: a equipe encerrou ou devolveu o atendimento para a IA;
  uma nova interação pode voltar para `ai_active`.

No exemplo do comprovante:

```text
Cliente: [imagem]
Cliente: Recebeu?
IAra: Sim, recebi. Sou a IAra, uma assistente virtual. Vou chamar um atendente
      para analisar o arquivo e continuar o atendimento por aqui.
```

Depois dessa resposta, o estado seria `human_pending`, e não `human_active`.
Se o cliente escrever “é um Pix da parcela de julho”, a nova interação recebe
o contexto e pode confirmar que essa informação foi registrada para a equipe,
sem declarar que a parcela foi baixada.

### O que realmente deve bloquear a IA

O bloqueio automático deve ocorrer somente quando houver evidência de que o
humano assumiu, por exemplo:

- mensagem enviada manualmente por um funcionário pelo sistema;
- funcionário clicou em “assumir atendimento”;
- outro evento operacional explícito marcou a conversa como humana.

O eco técnico de uma mensagem `fromMe` não deve ser aceito sozinho como prova,
porque mensagens automáticas, campanhas ou integrações também podem gerar
eventos de saída.

O bloqueio deve terminar apenas por uma ação clara de liberação ou por uma
regra de encerramento definida pela equipe. O simples decurso de 12 horas não
deve reativar a IA no meio de uma conversa humana.

### Onde a ideia precisa de cuidado

A ausência de bloqueio após um handoff pode causar problemas se não houver uma
forma confiável de detectar a resposta humana. Por isso, o redesign precisa
resolver:

- como o sistema diferencia saída automática de mensagem escrita pelo
  funcionário;
- como dois processos evitam responder ao mesmo tempo;
- como a equipe vê pendências em que ainda não respondeu;
- o que a IA pode dizer enquanto aguarda, para não prometer que o humano já
  está disponível;
- como uma reclamação, comprovante ou assunto sensível permanece sinalizado;
- como o cliente pode pedir explicitamente para não falar com a IA;
- como a conversa volta para a IA depois que o funcionário encerra o caso.

Portanto, a direção recomendada é: **sem bloqueio por simples solicitação de
humano; bloqueio somente após assunção humana confirmada**. A pendência
continua existindo para o Radar, mas pendência e bloqueio deixam de ser a mesma
coisa.

## Upgrade da central operacional do WhatsApp

A tela que imita o WhatsApp dentro do sistema deve participar do redesign. Ela
já concentra o histórico, os logs e os controles por número, mas a nova lógica
precisa torná-la uma central de atendimento, e não apenas uma tela técnica de
diagnóstico.

### Funções principais da nova tela

Para cada conversa, a equipe deve conseguir enxergar claramente:

- mensagens reais do cliente e da equipe;
- mensagens automáticas da IAra;
- anexos e confirmações de recebimento;
- assunto ativo e assuntos recentes;
- resumo das últimas mensagens usadas pela IA;
- estado atual: IA ativa, humano pendente, humano ativo ou atendimento
  liberado;
- motivo da pendência humana;
- se a equipe já assumiu ou ainda não respondeu;
- ferramentas consultadas e resultado operacional relevante.

### Controles operacionais

A tela deve permitir, de forma explícita:

- **Assumir atendimento**: muda para `human_active` e bloqueia a IA;
- **Liberar para IA**: encerra o atendimento humano e permite nova interação
  automática;
- **Humano sempre**: modo persistente para números que nunca devem receber
  resposta automática;
- **IA na próxima interação**: override temporário, se ainda for necessário;
- **Marcar pendência**: sinaliza a equipe sem bloquear automaticamente a IA;
- **Ver contexto**: mostra as mensagens recentes que fundamentaram a última
  decisão.

Os nomes dos controles precisam diferenciar “chamar humano” de “humano
assumiu”. Essa distinção deve ser visível no topo da conversa e não ficar
escondida em logs.

### Logs técnicos sem dominar a operação

Os logs continuam importantes para auditoria, mas devem ficar em um painel
secundário ou expansível. A equipe da loja não precisa interpretar provider,
tokens, payload bruto ou latência para responder ao cliente.

O painel técnico pode mostrar, quando necessário:

- decisão da IA;
- assunto ativo;
- confiança;
- mensagens enviadas como contexto;
- ferramentas chamadas;
- fatos retornados pelo sistema;
- motivo de handoff ou de bloqueio;
- identificação da mensagem humana que assumiu a conversa.

### Regra de segurança da interface

O sistema deve confirmar visualmente quando uma ação realmente bloqueou ou
liberou a IA. Não basta alterar um rótulo local da tela. O controle deve gerar
um evento persistido, com responsável e horário, para que o motor e a central
operacional tenham a mesma verdade.

### O que a nova IA deve receber sobre o anexo

A interação deve receber, conforme disponibilidade:

- indicação de que houve imagem, PDF ou outro documento;
- legenda ou texto enviado junto;
- mensagens seguintes agrupadas na mesma chamada;
- nome do arquivo e tipo MIME, quando existirem;
- resultado de uma leitura interna preliminar, se houver;
- memória recente da conversa;
- situação do atendimento humano.

O arquivo bruto só deve ser enviado a um modelo de visão quando isso fizer
parte de uma etapa autorizada, necessária e auditável. A confirmação “recebi”
deve depender do evento de recebimento do sistema, não da IA conseguir ler o
conteúdo.

### Limite da confirmação

“Recebi” significa apenas que o arquivo chegou ao sistema. Não significa:

- que o arquivo é um comprovante válido;
- que o valor foi identificado corretamente;
- que o pagamento foi localizado;
- que a parcela foi baixada;
- que a equipe já analisou o documento.

Depois da confirmação, a conversa deve ficar disponível para o atendente, mas
a IAra só deve responder mensagens seguintes se a nova interação deixar claro
que isso é seguro e útil. O comportamento não deve ser um silêncio obrigatório
herdado do fluxo antigo.

5. **Imagem de uma peça e pergunta sobre algo parecido**
   - separar a leitura visual da consulta de catálogo/estoque;
   - reconhecer que “parecido” é uma busca aproximada, não uma confirmação de
     identidade;
   - pedir uma informação complementar quando a imagem ou o pedido forem
     insuficientes;
   - encaminhar para a equipe quando depender de análise comercial ou de
     produto.

### Fluxo inicial compartilhado com anexos

Na primeira versão, esse ponto seguirá o mesmo caminho contextual definido para
imagem/PDF de comprovante. Ainda não vamos tentar resolver automaticamente a
busca visual nem consultar o catálogo.

Exemplo:

```text
Cliente: [imagem da peça]
Cliente: Vocês têm essa peça?
```

Depois da janela curta de agrupamento, a IAra deve entender que a imagem é o
objeto da pergunta e responder algo como:

> Eu sou a IAra, uma assistente virtual da ótica. Vou chamar um atendente para
> verificar se temos essa peça em nossa loja e continuar o atendimento por
> aqui.

O sistema deve registrar internamente:

- que houve uma imagem;
- a pergunta sobre disponibilidade;
- o contexto recente da conversa;
- a pendência para a equipe;
- a referência da imagem para o atendente.

Essa resposta não deve afirmar que a peça foi identificada, que existe um
modelo parecido, que há estoque ou que o preço é conhecido. A evolução futura
poderá adicionar consulta de catálogo e busca aproximada, mas isso não faz
parte deste primeiro fluxo.

6. **Status do óculos ou pedido**
   - localizar o cliente e o pedido quando possível;
   - informar o estágio real da OS;
   - diferenciar pronto, em laboratório, em montagem, aguardando algo ou sem
     localização suficiente;
   - não inventar prazo de conclusão ou retirada.

### O que já funciona no fluxo atual

O fluxo existente tem uma base útil: ele tenta localizar o cliente pelo número
de WhatsApp e, quando encontra uma OS aberta, consulta o estágio real e monta
uma resposta a partir dos dados da OS.

Quando não consegue localizar pelo telefone, ele pede um identificador, como
CPF, nome completo ou número do pedido. O problema principal não é a busca por
telefone; é o controle da conversa depois que a primeira busca falha.

Sem contexto suficiente, o sistema pode:

- pedir CPF novamente mesmo depois de o cliente já ter enviado o CPF;
- tratar a resposta do cliente como uma nova pergunta isolada;
- esquecer que estava tentando localizar uma OS;
- alternar entre menu, pedido de identificador e handoff;
- não explicar claramente o que foi encontrado ou por que não foi encontrado.

### Fluxo redesenhado

Exemplo inicial:

```text
Cliente: Meu óculos ficou pronto?
IAra: Vou verificar para você.
Sistema: não encontrou cadastro/OS vinculada a este WhatsApp.
IAra: Não localizei o pedido por este número. Você pode me enviar o CPF,
      nome completo do titular ou número do pedido?
Cliente: 123.456.789-00
```

Na última mensagem, o contexto informa que o número é um identificador para
localizar a OS. A IA não deve perguntar novamente o que o cliente deseja nem
oferecer o menu. Deve consultar diretamente o identificador recebido.

Se encontrar:

> Encontrei o pedido da Maria. Os óculos estão em montagem e, assim que essa
> etapa for concluída, a equipe poderá orientar a retirada.

Se não encontrar:

> Ainda não consegui localizar um pedido com esse CPF. Vou chamar um atendente
> para conferir os dados e continuar o atendimento por aqui.

Nesse segundo caso, a IA não deve repetir indefinidamente o mesmo pedido de
CPF. Ela pode oferecer uma alternativa uma única vez, como nome completo ou
número do pedido, se isso fizer sentido. Depois disso, deve encaminhar para a
equipe.

### Memória operacional mínima do fluxo de status

Além das últimas mensagens, a nova interação deve saber:

- que o assunto ativo é `order_status`;
- que a busca por telefone já foi feita;
- qual foi o resultado dessa busca;
- qual identificador foi solicitado;
- quais identificadores já foram recebidos;
- quantas tentativas de localização ocorreram;
- qual cliente, dependente ou OS já foi encontrado;
- qual pergunta continua pendente.

Isso evita a repetição e permite responder mensagens curtas como “esse aqui”,
“é da minha filha” ou “já mandei o CPF” sem reiniciar o fluxo.

### Regras de fluidez

- Não pedir CPF se o cliente acabou de enviar CPF.
- Não pedir novamente o objetivo da conversa depois de o cliente dizer que quer
  saber se o óculos está pronto.
- Não tratar uma falha de busca como falha de entendimento da pergunta.
- Não informar “não existe pedido” quando a conclusão correta é apenas “não
  localizei com os dados disponíveis”.
- Se houver mais de uma OS ou mais de um dependente, pedir uma confirmação
  específica, como nome da pessoa ou número do pedido.
- Se o cliente mudar para parcelas, produto ou reclamação, atualizar o assunto
  ativo e deixar de insistir na consulta da OS.
- Se a identificação falhar depois das tentativas previstas, a IAra deve se
  identificar e chamar a equipe, sem mandar o cliente ligar ou ir à loja.

7. **Parcelas ou débitos em aberto**
   - consultar somente dados financeiros que o sistema conseguir vincular com
     segurança ao cliente;
   - informar a existência de parcela, vencimento e valor quando permitido;
   - encaminhar negociação, desconto, contestação ou baixa de pagamento para a
     equipe.

### O que já existe no fluxo atual

O fluxo atual reconhece a intenção de consultar parcelas e tenta localizar
parcelas abertas pelo número de WhatsApp. Quando encontra um possível cadastro,
ele pode pedir o nome completo ou CPF do titular por segurança. Quando não
encontra nada ligado ao número, também solicita um identificador alternativo.

Depois que o cliente informa o identificador, o sistema tenta localizar as
parcelas e pode preparar dados internos para a equipe, como cliente, valor,
vencimento e parcela encontrada.

O fluxo atual também possui caminhos diferentes conforme a configuração e o
agente ativo: em alguns casos ele já coloca a conversa em handoff quando há
parcela localizada; em outros, entra em `waiting_identifier` e aguarda nome ou
CPF. Essa multiplicidade de caminhos pode fazer a IA repetir a solicitação ou
encaminhar antes de explicar claramente o que está acontecendo.

### Problema de fluidez a resolver

Sem contexto, uma conversa como esta pode se perder:

```text
Cliente: Ainda devo alguma parcela?
IAra: Vou verificar. Você pode me informar o CPF do titular?
Cliente: 123.456.789-00
```

O sistema precisa saber que o CPF é resposta à pergunta anterior. Não deve
voltar ao menu, perguntar novamente se o cliente quer consultar parcelas ou
pedir o CPF uma segunda vez.

### Fluxo redesenhado

#### 1. Consulta inicial pelo WhatsApp

```text
Cliente: Ainda devo alguma parcela?
```

A nova interação identifica `payment_status`, consulta o telefone e decide:

- se houver uma única correspondência segura, continua com esse cliente;
- se houver parcelas, mas for necessária confirmação de identidade, explica o
  motivo e pede um único identificador;
- se não houver correspondência, informa que não localizou parcela vinculada ao
  número, sem afirmar que a pessoa não possui nenhuma dívida.

Resposta possível quando precisa confirmar:

> Encontrei um cadastro com parcelas em aberto, mas preciso confirmar o
> titular por segurança. Você pode me enviar o nome completo ou o CPF?

Resposta possível quando nada foi localizado pelo telefone:

> Não localizei parcelas vinculadas a este WhatsApp. Se a compra estiver no
> nome de outra pessoa, me envie o nome completo ou o CPF do titular para eu
> tentar localizar.

#### 2. Identificador recebido

```text
Cliente: 123.456.789-00
```

A memória informa que o assunto é parcela e que o sistema estava aguardando um
identificador. A IA deve consultar diretamente o CPF, sem repetir a pergunta.

Se localizar:

> Encontrei duas parcelas em aberto para Maria. A próxima é de R$ 180,00 e
> vence em 10/10. Se você quiser negociar, contestar ou confirmar um
> pagamento, vou chamar um atendente para continuar por aqui.

Se a pergunta original era apenas “ainda devo alguma parcela?”, a IA pode
responder de modo mais curto:

> Sim. Encontrei duas parcelas em aberto para Maria; a próxima vence em
> 10/10. Sou a IAra, assistente virtual da ótica. Se precisar conferir um
> pagamento ou negociar, vou chamar um atendente para continuar por aqui.

Se não localizar:

> Ainda não consegui localizar parcelas com esse CPF. Vou chamar um atendente
> para conferir os dados e continuar o atendimento por aqui.

Depois de uma tentativa de identificador sem resultado, a IA pode oferecer uma
alternativa uma única vez, como nome completo. Não deve insistir em CPF
indefinidamente.

#### 3. Mudança de assunto

Se o cliente perguntar sobre a OS, enviar um comprovante ou fizer uma
reclamação durante a consulta financeira, o assunto ativo deve mudar. A IA
deve parar de pedir identificador financeiro e tratar a nova mensagem conforme
o fluxo correspondente, mantendo a informação da parcela na memória recente.

### Memória operacional mínima do fluxo financeiro

Além das últimas mensagens, a interação deve saber:

- que o assunto ativo é `payment_status`;
- se a busca pelo telefone já ocorreu;
- qual cliente ou titular foi encontrado;
- se a confirmação de identidade foi solicitada;
- qual CPF, nome ou outro identificador já foi recebido;
- quantas tentativas de identificação ocorreram;
- quais parcelas foram encontradas, sem transformar isso em baixa automática;
- se o cliente está perguntando sobre saldo, vencimento, Pix, comprovante ou
  negociação.

### Limites financeiros

- O número do WhatsApp, sozinho, não deve liberar valores de parcelas. Ele
  identifica o canal da conversa, mas não confirma necessariamente o titular
  da compra.
- A combinação do número que iniciou a conversa com um CPF informado pelo
  cliente pode liberar uma consulta objetiva, desde que o sistema encontre
  uma correspondência exata e única para a mesma loja.
- Com essa confirmação, a IA pode informar parcelas em aberto, valor e
  vencimento retornados pelo sistema, respeitando a política da loja.
- O CPF não deve ser repetido integralmente na resposta nem aparecer em logs
  desnecessários.
- Se o CPF não corresponder ao cliente ligado ao WhatsApp, houver mais de uma
  correspondência, a loja não estiver definida ou existir qualquer dúvida de
  identidade, a IA não deve revelar valores. Deve pedir uma confirmação
  adicional ou chamar um atendente.
- A IA não deve afirmar que uma parcela foi paga apenas porque o cliente disse
  que pagou ou enviou um comprovante.
- Baixa, contestação, desconto, renegociação e promessa de prazo ficam com a
  equipe.
- Se houver dúvida sobre qual titular ou compra está sendo consultado, a IA
  deve pedir esclarecimento ou chamar um atendente.
- Um lembrete disparado pelo programa é outro tipo de entrada e será definido
  futuramente; este fluxo trata a mensagem iniciada pelo cliente.

8. **Retomada de conversa parada**
   - usar as mensagens recentes para recuperar o assunto;
   - considerar a retomada uma condição transversal, e não uma intenção
     isolada;
   - se houver mais de um assunto possível, fazer uma pergunta curta;
   - não carregar indefinidamente uma conversa antiga como se ainda estivesse
     ativa.

### Tempo entre mensagens como contexto explícito

A passagem do tempo pode mudar o significado de uma mensagem, mas a IA não
deve depender apenas da sua capacidade de interpretar timestamps. O sistema
deve calcular e enviar metadados claros sobre o intervalo desde a última
mensagem e sobre o estado da conversa.

Exemplo:

```text
IAra: Como sou a IAra, uma assistente virtual, vou chamar um atendente para
      conversar com você por aqui.

[2 horas sem novas mensagens]

Cliente: Você acha que ainda demora muito?
```

Essa mensagem deve ser interpretada como continuação da pendência humana. A
IAra não deve iniciar um assunto novo nem responder como se não soubesse do que
o cliente está falando. Uma resposta adequada seria:

> Entendo. Ainda estou aguardando a equipe assumir o atendimento. Vou reforçar
> sua solicitação por aqui.

Como a IAra não controla o tempo real de resposta da equipe, ela não deve
prometer “vai demorar só mais alguns minutos”. O sistema pode informar à IA:

- horário da última mensagem da IAra;
- horário da nova mensagem do cliente;
- tempo decorrido entre as duas;
- estado atual (`human_pending`, `human_active` ou outro);
- se algum funcionário já visualizou, assumiu ou respondeu;
- se a pendência foi reforçada anteriormente;
- último assunto e pergunta que aguardava resposta.

### Faixas de retomada

As faixas de tempo são uma regra do sistema, não uma dedução livre da IA.
Como ponto de partida:

- poucos minutos: continuação direta da chamada;
- algumas horas: retomada da pendência recente, especialmente se houver
  `human_pending`;
- dia seguinte: ainda pode ser continuação se a pendência estiver aberta;
- depois do encerramento explícito ou de uma janela de retenção definida:
  começar uma nova chamada, usando a mensagem nova como foco.

O tempo, sozinho, nunca deve apagar uma pendência humana ativa nem reativar a
IA durante `human_active`. Ele serve para dar contexto à resposta e ajudar o
sistema a decidir se a conversa ainda está viva.

### Contexto temporal em toda interação

Toda chamada enviada à nova IAra deve conter um resumo temporal calculado pelo
sistema. Isso não significa enviar timestamps brutos de todas as mensagens em
todas as chamadas. Significa entregar os sinais necessários para a IA não
precisar adivinhar se está diante de uma continuação ou de uma retomada.

Estrutura provisória:

```json
{
  "temporal_context": {
    "current_message_at": "2026-09-17T15:00:00-03:00",
    "last_relevant_message_at": "2026-09-17T13:00:00-03:00",
    "elapsed_since_last_relevant_message_minutes": 120,
    "current_turn_started_at": "2026-09-17T14:59:40-03:00",
    "aggregation_window_closed": true,
    "conversation_phase": "human_pending"
  }
}
```

O sistema pode enviar também uma classificação derivada, sem obrigar a IA a
calcular sozinha:

- `continuous_turn`: mensagens agrupadas na mesma chamada;
- `recent_continuation`: resposta depois de uma pausa curta;
- `pending_followup`: retomada de uma pendência ainda aberta;
- `new_conversation_candidate`: mensagem depois de período longo ou
  encerramento explícito.

Essa classificação é uma orientação do sistema, não uma decisão irrevogável.
A IA ainda deve comparar o sinal temporal com as 10 mensagens recentes e com
o assunto ativo. Uma mensagem que parece nova pode continuar uma pendência
humana; uma mensagem enviada poucos minutos depois pode iniciar outro assunto.

9. **Reclamação, adaptação, troca ou garantia**
   - reconhecer o problema e acolher o cliente;
   - preservar o assunto e os detalhes importantes na entrega para humano;
   - não diagnosticar, prometer solução, prazo, troca ou garantia;
   - manter o caso visível para a equipe.

### Reclamação não é qualquer mensagem com “ruim” ou “problema”

A IA não deve classificar uma mensagem como reclamação apenas porque aparecem
palavras negativas. Ela precisa entender o objetivo da pessoa e o contexto da
frase.

Exemplo ambíguo:

```text
Cliente: Preciso ir na ótica. O óculos do meu filho está muito ruim.
```

Essa mensagem pode significar:

- reclamação sobre um óculos comprado ou ajustado pela ótica;
- necessidade de comprar outro óculos;
- pedido de avaliação de grau;
- desejo de levar o filho para conversar com a equipe;
- problema de adaptação ou desconforto.

O trecho “preciso ir na ótica” indica intenção de visita, mas não esclarece por
si só se existe reclamação sobre um serviço prestado. A IA não deve disparar
automaticamente uma resposta de reclamação sem confirmar o sentido.

### Pergunta de esclarecimento

Quando não houver contexto suficiente, a IAra deve fazer uma pergunta curta,
acolhedora e específica:

> Entendi. Você quer trazer seu filho para avaliarmos esse óculos ou está
> relatando um problema com um atendimento/serviço que fizemos?

Outra opção, quando a intenção de compra parecer mais provável, é:

> Entendi. Você quer vir à ótica para ver outro óculos para ele ou precisa de
> ajuda com algum problema em um serviço que fizemos?

Essa pergunta evita encaminhar uma compra como reclamação e também evita
ignorar uma possível reclamação real.

### Desambiguação com consulta ao histórico

Antes de concluir que a mensagem é uma reclamação, o sistema pode consultar se
existe uma compra ou OS recente vinculada ao cliente que está conversando. O
resultado deve ser usado para formular uma pergunta de confirmação, não para a
IA inventar o problema.

Quando houver uma correspondência segura e recente:

> Vi que existe uma compra recente vinculada ao seu cadastro. É desse óculos
> que estamos falando?

Depois que o cliente confirmar, a IA pode perguntar:

> Entendi. Ele está com algum problema ou dificuldade de adaptação?

Quando não houver compra recente localizada:

> Não localizei uma compra recente vinculada a este WhatsApp. Esse óculos é
> recente ou você gostaria de ver outro modelo para ele?

Se o contexto já disser claramente que o óculos é do filho, a pergunta pode ser
mais específica. Caso contrário, a IA não deve concluir que o produto é do
filho, que é recente ou que existe dificuldade de adaptação.

Essa consulta deve respeitar a mesma proteção de dados do fluxo financeiro:

- o número do WhatsApp não deve, sozinho, liberar detalhes comerciais;
- a resposta deve evitar marca, valor, data completa ou descrição desnecessária
  da compra;
- quando a identidade não estiver suficientemente confirmada, usar uma frase
  neutra, como “posso confirmar se estamos falando de uma compra recente?”;
- a consulta deve ser limitada ao necessário para decidir entre reclamação,
  visita ou compra.

### Indicadores de reclamação real

O contexto favorece reclamação quando o cliente menciona:

- algo comprado ou feito na ótica que apresentou problema;
- lente, armação ou montagem que ficou diferente do esperado;
- dor, desconforto ou dificuldade de adaptação após receber o produto;
- cobrança indevida, atraso, erro, troca, garantia ou atendimento ruim;
- pedido de correção, solução, explicação ou reparo de algo já realizado.

Mesmo nesses casos, a IAra deve acolher e encaminhar sem diagnosticar ou
prometer resultado.

### Indicadores de visita ou compra

O contexto favorece visita/compra quando o cliente fala em:

- levar alguém à loja;
- ver outro modelo;
- comprar uma peça nova;
- consultar opções;
- fazer avaliação antes de decidir;
- conhecer preços ou disponibilidade.

Se houver dúvida entre compra e reclamação, a pergunta de esclarecimento é
preferível a um handoff automático com texto inadequado.

### Troca e garantia

Troca e garantia devem ser tratadas como encaminhamento humano. A IAra pode
reconhecer o pedido, acolher o cliente e organizar o contexto, mas não deve
decidir se o caso está dentro da política da loja.

Exemplo:

```text
Cliente: Preciso trocar meu óculos.
```

Resposta inicial:

> Eu sou a IAra, uma assistente virtual da ótica. Vou chamar um atendente para
> entender o pedido de troca e continuar o atendimento com você por aqui.

Para garantia:

> Eu sou a IAra, uma assistente virtual da ótica. Vou encaminhar seu pedido de
> garantia para a equipe verificar o caso e continuar o atendimento por aqui.

Se a mensagem já trouxer dados úteis, a IA deve preservá-los para a equipe:

- pessoa relacionada à compra, quando informada;
- produto ou óculos mencionado;
- problema relatado;
- data aproximada ou referência da compra, se o cliente forneceu;
- se o cliente quer troca, reparo, avaliação ou apenas orientação.

Se faltar informação essencial, a IA pode fazer uma pergunta curta, mas não
deve transformar isso em uma investigação longa. Por exemplo:

> Entendi. É sobre um óculos comprado recentemente na nossa loja?

Depois disso, a equipe decide elegibilidade, prazo, defeito, adaptação,
documentos necessários, troca, reparo ou garantia. A IA não deve prometer que a
troca será aceita, que a garantia cobre o problema ou que haverá solução em
determinado prazo.

### Complementos que devem ficar previstos

A lista cobre bem o núcleo lembrado pela operação. Para não deixar lacunas no
contrato da nova interação, também devemos prever, mesmo que não sejam
prioridade da primeira análise:

- endereço e localização da loja;
- pedido explícito para falar com uma pessoa;
- envio de receita ou outro documento que não seja comprovante de Pix;
- saudação, agradecimento, confirmação curta e mensagem sem assunto claro;
- pedido de preço, orçamento ou negociação;
- retirada, prazo e agendamento, quando forem diferentes de uma simples
  consulta de status.

### Endereço, mapa e chave Pix

Dois pedidos objetivos podem ser respondidos automaticamente, desde que a
loja tenha os dados oficiais cadastrados:

- “Você consegue me mandar o mapa da ótica?”;
- “Pode me mandar a chave Pix?”

O sistema deve fornecer à IAra:

- nome da loja;
- endereço oficial;
- link de mapa ou localização;
- chave Pix cadastrada;
- nome do recebedor e, se necessário, instrução de conferência.

### Origem atual da chave Pix

Na UI atual, a chave é cadastrada em:

- rota: `/dashboard/loja/[storeId]/config`;
- componente: `src/components/config/ConfigInterface.tsx`;
- seção visual: **Configuração Pix**;
- campo do formulário: `pix_key`;
- campo complementar: `pix_city`.

O salvamento é feito por `updateStoreProfile` em
`src/lib/actions/store.actions.ts`, e o valor fica no perfil da loja, na
coluna `stores.pix_key`. O fluxo de atendimento já carrega essa coluna no
perfil usado por `src/lib/whatsapp/customer-status.ts` e possui uma função para
montar a mensagem da chave Pix.

Portanto, o redesign deve reutilizar `stores.pix_key` como fonte oficial, sem
criar uma segunda chave dentro do prompt ou em uma configuração paralela do
WhatsApp. Antes de enviar, o sistema deve confirmar que a chave existe e está
associada à loja correta.

A IAra deve apenas escolher uma resposta natural e inserir os dados fornecidos
pelo sistema. Ela nunca deve inventar, completar ou substituir uma chave Pix,
endereço ou link de mapa.

Exemplo para localização:

> Claro! Estamos em [endereço]. Você pode abrir a localização por aqui:
> [link do mapa]

Exemplo para Pix:

> Claro! A chave Pix da ótica é: [chave]. Antes de confirmar, confira se o
> destinatário aparece como [nome cadastrado da loja]. Se quiser, também posso
> chamar a equipe para confirmar o valor ou a parcela.

Enviar a chave Pix não significa confirmar uma dívida ou uma parcela. Se o
cliente perguntar quanto deve, contestar um valor, enviar comprovante ou pedir
negociação, a conversa deve seguir o fluxo financeiro correspondente e, quando
necessário, chamar um atendente.

Se a chave estiver ausente, vencida, conflitante ou não configurada para a loja,
a IAra deve informar que vai chamar a equipe para confirmar, sem enviar um dado
incerto.

### Validação dos complementos

Ficou definido para o redesign:

- preço ou orçamento: sempre chamar um atendente;
- receita: seguir o mesmo fluxo contextual de imagem/PDF;
- retirada: reutilizar o fluxo de status da OS;
- pedido direto de atendente: encaminhar imediatamente;
- saudação: responder apenas depois do encerramento da janela de agrupamento,
  evitando respostas separadas para “olá” e “tudo bem?”;
- endereço, mapa e Pix: responder automaticamente quando os dados oficiais
  estiverem cadastrados;
- áudio, vídeo, localização ou arquivo ilegível: confirmar recebimento e
  chamar um atendente.

### Origem do link de mapa

Não existe hoje um campo separado de mapa na configuração da loja. O fluxo
atual monta o link automaticamente a partir do endereço estruturado da loja:

- `street`;
- `number`;
- `neighborhood`;
- `city`;
- `state`.

O link é gerado como uma busca do endereço no Google Maps. Portanto, para o
redesign inicial não é necessário criar um novo campo: basta manter o endereço
da loja correto e completo. Um campo específico como `map_url` só será útil no
futuro se a loja precisar apontar para um estabelecimento com endereço
ambíguo, múltiplas unidades ou uma localização personalizada.

Esses complementos não precisam virar fluxos completos agora. Eles precisam
existir como estados possíveis para que a IA não force uma mensagem nova para
um dos nove grupos principais.

### Fora do primeiro recorte

As chamadas iniciadas pelo próprio programa ficarão documentadas em uma etapa
posterior. Isso inclui, por exemplo:

- lembrete de parcela;
- cobrança;
- pós-venda;
- aviso de óculos pronto;
- outras mensagens proativas da loja.

Esses fluxos poderão reutilizar a memória e as regras da resposta ao cliente,
mas terão uma entrada diferente: a chamada começa por um evento do sistema e
não por uma mensagem inbound.

## Pós-venda: regras atuais que serão preservadas

O pós-venda será a primeira chamada iniciada pelo sistema a ser redesenhada.
O redesign não pretende abandonar sua operação atual. As seguintes regras
continuam válidas como baseline:

- o acompanhamento só acontece quando o módulo de pós-venda da loja está
  ativo;
- a loja continua podendo ativar ou desativar o pós-venda automático;
- o primeiro contato continua sendo programado depois da entrega do óculos;
- o prazo configurável continua existindo, com padrão atual de 7 dias após a
  entrega;
- o texto inicial continua configurável pela loja e pode usar nome do cliente,
  titular, paciente e quantidade de dias;
- o envio continua restrito ao horário comercial e aos horários disponíveis do
  serviço;
- uma mesma OS não deve receber o primeiro follow-up automático mais de uma
  vez;
- OSs relacionadas do mesmo cliente podem continuar sendo agrupadas quando
  representarem a mesma retirada/beneficiário;
- vendas canceladas ou devolvidas continuam fora do disparo;
- o cliente continua podendo optar por não receber acompanhamentos de
  pós-venda;
- o sistema continua registrando o follow-up, o envio, a OS, o cliente e as
  interações no histórico de pós-venda;
- a nota de satisfação continua sendo de 1 a 5;
- uma nota clara continua podendo concluir o acompanhamento automaticamente;
- reclamações, adaptação ruim, pedido de atendente e baixa confiança continuam
  sendo encaminhados para a equipe;
- o pós-venda continua vinculado à OS e ao registro de `post_sales`, sem criar
  uma avaliação solta fora do histórico operacional.

### O que muda sem alterar essas regras

O que será novo é a forma de conduzir a conversa depois do disparo:

- a mensagem será escrita pela IAra, com identificação transparente;
- a espera de agrupamento continuará valendo antes de cada resposta;
- a IAra receberá as mensagens recentes, o tempo decorrido e a etapa do
  pós-venda;
- ela poderá entender mudança de assunto sem perder o vínculo com o
  acompanhamento;
- um pedido de humano criará pendência, mas não bloqueará automaticamente a
  IAra;
- o bloqueio só ocorrerá quando a equipe assumir a conversa;
- a resposta de reclamação não será disparada apenas por palavras negativas;
- a conclusão automática por ausência de resposta continua preservada, porque
  essa regra já foi amplamente discutida e ajuda mais do que atrapalha;
- depois do prazo atual de contexto, a ausência de resposta pode concluir o
  acompanhamento com nota 3;
- se houver registro de resposta positiva sem nota numérica, o acompanhamento
  pode ser concluído com nota 4;
- qualquer sinal de reclamação, adaptação ruim, handoff ou dúvida relevante
  mantém o caso para análise humana, sem aplicar nota automática.

## Lembrete automático de parcela: baseline e redesign

O outro fluxo de saída automática é o lembrete de vencimento de parcela.

### Regras atuais a preservar

- a automação pode ser ativada ou desativada por loja;
- o prazo antes do vencimento continua configurável, com padrão atual de 2
  dias;
- a parcela precisa estar pendente e possuir saldo em aberto no momento do
  envio;
- parcelas quitadas, indisponíveis ou vinculadas a venda cancelada são
  retiradas da fila;
- cada parcela deve gerar no máximo um lembrete por canal;
- o envio ocorre em horário comercial, com fila espaçada;
- clientes em `Humano sempre` não recebem o lembrete automático;
- o cliente pode responder `PARAR` para deixar de receber lembretes;
- `VOLTAR` ou `REATIVAR` pode reativar os lembretes;
- a fila, o outbound, o status de envio e o erro continuam sendo registrados;
- depois do envio, o contexto da parcela fica disponível para as próximas
  mensagens, atualmente por 48 horas.

### O que deve mudar na nova IAra

O disparo inicial deve ser tratado como início de uma conversa, não como uma
mensagem isolada. A nova interação deve receber:

- parcela e vencimento que motivaram o lembrete;
- cliente e beneficiário relacionados, sem expor dados além do necessário;
- saldo atual consultado antes do envio;
- template efetivamente enviado;
- horário do disparo;
- janela temporal desde o lembrete;
- memória das mensagens que vierem depois.

Depois do disparo, a pausa de agrupamento de mensagens vale normalmente. A
IAra deve interpretar, por exemplo:

- “ok” ou “tudo bem” como confirmação simples;
- “qual o valor?” como pedido financeiro que exige confirmação adequada;
- “me manda o Pix” como pedido da chave oficial da loja;
- “já paguei” como declaração que não confirma baixa;
- envio de comprovante como fluxo de anexo;
- reclamação ou contestação como handoff humano;
- mudança para OS, produto ou outro assunto como mudança de rumo.

O lembrete enviado não bloqueia a IAra. Ele apenas cria contexto. Um pedido de
humano deixa a conversa em `human_pending`; o bloqueio só acontece quando um
funcionário assumir.

### Cliente em dia e mensagem de reconhecimento

É possível personalizar a conversa para reconhecer que o cliente está em dia,
mas isso deve ser uma conclusão do sistema financeiro, não uma inferência da
IA. Para o lembrete inicial, a consulta deve verificar atraso, e não exigir
que o cliente esteja sem parcelas futuras abertas.

O cliente só pode ser tratado como `em_dia` quando:

- estiver identificado de forma confiável, preferencialmente pelo `customer_id`
  já associado ao lembrete;
- não existir parcela vencida e não paga vinculada a esse cliente na loja;
- a parcela que motivará o lembrete estiver válida e atualizada;
- a consulta tiver sido feita antes do envio;
- não houver erro, resultado incompleto ou ambiguidade na consulta.

Parcelas futuras abertas não impedem o reconhecimento de que o cliente está em
dia. Já uma parcela vencida e não paga impede a parabenização. Se o cliente
apenas afirmar “já paguei” ou enviar um comprovante durante a conversa, isso não
deve alterar automaticamente o status financeiro: a baixa precisa estar
registrada ou ser confirmada pelo atendente/sistema.

Com a consulta confirmada, a IAra pode responder de forma breve e humana,
reconhecendo que não há atraso. A frase só deve ser usada quando o resultado
for positivo e atual; em caso de falha, a IAra deve chamar a equipe para
confirmar, sem criar uma conclusão financeira.

Essa verificação é uma consulta simples por identificador do cliente, com filtro
por loja e situação da parcela. Portanto, não representa um fluxo pesado de IA.
O cuidado principal é fazê-la no momento correto e registrar no contexto/auditoria
o horário da consulta e a quantidade de parcelas abertas, sem expor dados
financeiros desnecessários.

### Correção: mensagem inicial do lembrete

A mensagem automática de lembrete deve ser decidida antes do envio, com base
em uma consulta financeira atualizada. Isso é diferente da conversa que poderá
acontecer depois que o cliente responder.

Nesse contexto, “cliente em dia” não significa que não existam parcelas
futuras abertas. Significa que não há parcela vencida e não paga. O cliente
pode estar em dia e ainda possuir várias parcelas futuras pendentes.

O sistema deve consultar, antes de montar o envio:

- se existe parcela vencida em aberto;
- qual parcela motivará o lembrete;
- vencimento, número da parcela e paciente/titular;
- se a venda ou o carnê está válido;
- se o cliente está autorizado a receber lembretes.

Para esse primeiro contato, não é necessário chamar a IA para inventar a
redação. É mais seguro selecionar um de dois modelos aprovados e preencher
variáveis vindas do sistema:

- cliente sem atraso: uma saudação que reconhece os pagamentos em dia e, em
  seguida, lembra a próxima parcela;
- cliente com atraso: um lembrete neutro, sem parabenização, informando a
  parcela que motivou o contato.

Mesmo quando o sistema encontrar atraso, essa informação não deve ser exposta
nessa primeira mensagem. O texto externo continua limitado ao lembrete do
próximo vencimento. O status de atraso serve somente para impedir a saudação de
parabéns e orientar o contexto interno da conversa.

Exemplo para cliente em dia: “Olá! É muito bom ter você como nosso cliente.
Parabéns por manter suas parcelas em dia. Aproveitando, lembramos que no dia
19 vence a segunda parcela dos óculos do João. Se você já pagou, desconsidere
esta mensagem. Sou a IAra, assistente virtual da ótica. Esta é uma mensagem
automática. Se não quiser mais receber lembretes, responda apenas PARAR.”

Exemplo para cliente com atraso: “Olá! Sou a IAra, assistente virtual da
ótica. Estou passando para lembrar que no dia 19 vence a segunda parcela dos
óculos do João. Se você já pagou, desconsidere esta mensagem. Esta é uma
mensagem automática. Se não quiser mais receber lembretes, responda apenas
PARAR.”

A IAra entra principalmente na etapa seguinte: interpretar a resposta,
preservar o contexto do lembrete, responder dúvidas, receber comprovantes,
identificar mudança de assunto e encaminhar para um humano quando necessário.
Se a loja quiser variações de tom no futuro, elas também devem partir de
modelos aprovados e de fatos estruturados, não de liberdade para a IA criar
informações financeiras.

O telefone do WhatsApp não deve ser tratado como confirmação suficiente para
expor valores detalhados. Como o lembrete já identifica a parcela, a primeira
mensagem deve preferir informar a existência e o vencimento, sem incluir o
valor, salvo se a política da loja autorizar esse formato.

Se o cliente pedir o valor, o sistema deve exigir a confirmação definida para
consultas financeiras — número do WhatsApp mais CPF correspondente, ou
encaminhamento para a equipe — antes de revelar o valor.

Enviar a chave Pix oficial pode ser automático quando ela estiver cadastrada,
mas isso não confirma saldo, pagamento ou baixa da parcela.

### Forma segura de analisar

A análise deve usar dados agregados e amostras anonimizadas sempre que
possível. Não devemos copiar segredos, credenciais, documentos ou dados
desnecessários para arquivos do projeto.

Para cada conversa analisada, o relatório deve preservar apenas:

- identificador técnico da conversa ou telefone mascarado;
- loja;
- período aproximado;
- sequência de mensagens necessária para entender o caso;
- motivo provável da chamada;
- resultado: respondido, aguardando humano, sem resposta ou falha;
- observação sobre o que a IA deveria ter entendido.

## Primeiro fluxo: responder uma chamada do cliente

### Definição provisória de chamada

Uma chamada começa quando chega uma ou mais mensagens do cliente e termina
quando ocorre uma destas situações:

- a IA respondeu e o cliente encerrou ou ficou sem responder;
- a IA respondeu e a conversa mudou de assunto;
- o funcionário assumiu o atendimento;
- a IA não conseguiu responder e entregou o caso para humano;
- a janela de inatividade definida pelo produto expirou.

Essa definição ainda será ajustada com base nas conversas reais.

### Agrupamento antes da resposta

O redesign deve manter a espera curta que já existe antes de chamar a IA.
Quando o cliente envia mensagens em sequência, o serviço aguarda o silêncio
final da janela e envia as mensagens juntas para a interação.

Exemplo:

```text
Cliente: Olá
Cliente: Tudo bem?
Cliente: Vocês fazem exame de vista aí?
```

Em vez de responder três vezes, o sistema deve esperar e entregar esse bloco
à IA como uma única entrada. A janela atual é de aproximadamente 20 segundos
e reinicia a cada nova mensagem recebida do mesmo cliente.

Essa espera tem uma função diferente da memória de 10 mensagens:

- **agregação**: evita respostas imediatas enquanto o cliente ainda está
  digitando uma mesma chamada;
- **memória**: permite interpretar a conversa recente depois que a chamada foi
  recebida e processada.

As duas camadas devem ser mantidas. A agregação reduz respostas fragmentadas,
enquanto a memória permite entender mudanças de assunto e referências a
mensagens anteriores.

O agrupamento deve ser aplicado a todos os fluxos, inclusive anexos, pedido
explícito de atendente e mensagens que chegam durante uma conversa já ativa.
Depois da janela, a nova IA decide se deve responder, confirmar o recebimento,
consultar uma ferramenta ou chamar um humano. Não devemos herdar do roteador
antigo um silêncio automático apenas porque a entrada contém um anexo.

### Entrada da nova interação

A nova interação deverá receber, no mínimo:

- mensagem atual do cliente;
- até 10 mensagens recentes da mesma conversa, em ordem cronológica;
- indicação de quem enviou cada mensagem;
- horário relativo ou absoluto de cada mensagem;
- nome da loja e configurações relevantes;
- dados objetivos já conhecidos do cliente, quando seguros;
- ferramentas disponíveis para consultar dados atuais;
- sinal de que um humano assumiu ou encerrou o atendimento.

A janela de 10 mensagens é um ponto de partida, não uma promessa de que
sempre serão exatamente 10. Mensagens duplicadas, eventos técnicos e payloads
sem conteúdo devem ser filtrados sem apagar o contexto útil.

### Saída esperada

A IA deverá produzir uma decisão estruturada, ainda a ser refinada, contendo:

```json
{
  "understanding": "resumo curto do que o cliente está tentando resolver",
  "topic": "tema identificado",
  "needs_tool": true,
  "tool_calls": [],
  "reply_text": null,
  "needs_human": false,
  "confidence": 0.0
}
```

A resposta final poderá ser direta quando não depender de informação interna.
Quando depender de pedido, parcela, horário, endereço ou outro fato atual, a
IA deverá consultar uma ferramenta e só então redigir a resposta.

### Regras provisórias para continuidade

- Uma mensagem como “quero sim”, “e o outro?”, “pode mandar” ou “já ficou
  pronto?” deve ser interpretada junto com a janela recente.
- Se houver dois assuntos recentes, a IA deve preferir o assunto da última
  pergunta explícita ou pedir uma confirmação curta.
- Uma resposta da ótica que contenha uma pergunta aberta deve ser considerada
  parte importante do contexto.
- Mensagens do cliente não devem ser misturadas com respostas do sistema ou
  anotações técnicas.
- O contexto recente não autoriza a IA a inventar uma informação que não esteja
  nas mensagens ou nas ferramentas.
- Se o contexto for insuficiente, a IA deve fazer uma pergunta objetiva antes
  de encaminhar, quando isso for seguro.
- Se houver reclamação, sintoma, negociação, garantia ou outro assunto que
  exija decisão humana, a IA deve explicar o próximo passo sem perder o tema
  original da conversa.

## Mudança de rumo durante a conversa

Este é um requisito central do redesign.

Uma conversa pode começar com uma pergunta sobre o status de uma OS e depois
mudar para uma parcela, um comprovante, um produto ou uma reclamação. A IA não
deve permanecer presa à primeira intenção identificada.

### Exemplo

```text
Cliente: Quero saber se o óculos da Maria ficou pronto.
Ótica: O pedido ainda está em montagem.
Cliente: Entendi. E a parcela deste mês, ainda está aberta?
```

Na última mensagem, o assunto ativo mudou de `status_da_os` para
`parcela_em_aberto`. A resposta correta precisa considerar a conversa anterior
para saber que “deste mês” se refere ao cliente e à relação já estabelecida,
mas deve consultar o domínio financeiro em vez de continuar falando da OS.

### O que a memória resolve

A janela recente permite que a IA:

- entenda pronomes e referências curtas, como “deste mês”, “o outro” e “já
  ficou pronto?”;
- saiba quem é a pessoa ou pedido mencionado anteriormente;
- reconheça que a última mensagem responde ou muda uma pergunta da ótica;
- preserve informações úteis sem exigir que o cliente repita tudo;
- diferencie uma continuação do assunto de uma nova pergunta.

### O que a memória não resolve sozinha

Além de carregar as mensagens, a nova interação precisa:

- identificar o assunto dominante de cada mensagem;
- reconhecer quando o cliente introduziu um novo assunto;
- manter os assuntos anteriores disponíveis sem tratá-los como ativos;
- escolher o domínio correto para a próxima ação;
- atualizar o `active_topic` depois de cada turno;
- pedir confirmação quando existirem dois assuntos igualmente prováveis.

Portanto, não devemos persistir apenas uma intenção fixa como
`last_intent = order_status`. O contexto precisa representar uma conversa com
assunto ativo e assuntos recentes, por exemplo:

```json
{
  "active_topic": "installment_status",
  "previous_topics": ["order_status"],
  "known_references": {
    "customer_name": "Maria",
    "service_order_subject": "óculos da Maria"
  },
  "open_question": null
}
```

Esse objeto é um resumo operacional auxiliar. Ele não substitui as mensagens
recentes, que continuam sendo a fonte principal para a IA interpretar a
mudança de rumo.

### Regra de atualização do assunto

Em cada nova mensagem, a IA deve escolher uma destas situações:

- `continue_topic`: continua o assunto ativo;
- `change_topic`: muda para outro assunto identificável;
- `parallel_topic`: abre um segundo assunto sem encerrar o primeiro;
- `unclear_topic`: não há contexto suficiente para decidir.

Quando houver `change_topic`, o novo assunto passa a ser o foco da resposta,
mas o assunto anterior continua disponível na janela de memória. Quando houver
`parallel_topic`, a IA deve responder o que for mais urgente ou pedir ao
cliente que escolha a prioridade.

### Regra de segurança

Memória não deve virar uma autorização para adivinhar. Se “ela”, “isso”, “o
valor” ou outra referência puder apontar para mais de um assunto, a IA deve
fazer uma pergunta curta e específica.

## Questões ainda abertas do redesign

- quais ferramentas serão disponibilizadas na primeira versão;
- quais assuntos podem ser respondidos sem ferramenta;
- qual será a lista de respostas permitidas em `human_pending`;
- qual será o protocolo final para detectar e registrar uma assunção humana;
- como cada loja poderá configurar tom e limites sem alterar regras de segurança;
- quais dados históricos serão suficientes para validar o primeiro fluxo.

## Próxima etapa

1. Criar uma consulta somente leitura ou exportação controlada do histórico.
2. Montar uma amostra de conversas reais por loja e por período.
3. Classificar manualmente o motivo da chamada e o resultado esperado.
4. Identificar os cinco a dez padrões mais frequentes.
5. Revisar este documento com esses padrões.
6. Validar os contratos já aprovados em simulação antes do primeiro envio real.

## Inventário do sistema atual para reaproveitamento deliberado

O sistema atual contém capacidades operacionais que podem ser reaproveitadas,
mas nenhuma delas entra automaticamente no motor novo apenas por existir hoje.
Cada item abaixo deve ser confirmado como parte do redesign, adaptado ou
descartado por decisão explícita.

### Transporte, recebimento e duplicidade

- mensagens de grupos não entram no atendimento automático;
- mensagens enviadas pela própria loja (`fromMe`) não devem voltar para a IA
  como se fossem mensagens do cliente;
- mensagens humanas enviadas pelo celular da loja precisam ser espelhadas no
  histórico e marcar a conversa como assumida pela equipe;
- cada mensagem deve ser deduplicada pelo `provider_message_id`;
- uma falha depois da criação do outbound não pode gerar uma segunda resposta;
- respostas pendentes precisam ser recuperadas e entregues sem duplicação;
- webhooks atrasados devem ser reconciliados com a Evolution, em vez de serem
  processados cegamente como mensagens novas;
- números equivalentes do WhatsApp, com ou sem nono dígito, devem representar a
  mesma conversa, estado, controle e cliente;
- o canal só deve processar mensagens quando estiver ativo e conectado;
- grupos, status da própria loja e eventos que não representam uma chamada do
  cliente devem seguir pipelines separados.

### Tempo, agrupamento e estado

Os tempos atuais não são uma única regra de “12 horas”. São prazos diferentes
para situações diferentes e devem ser substituídos por políticas nomeadas:

- cerca de 20 segundos para agrupar mensagens consecutivas antes de chamar a
  IA;
- 12 horas de pausa após um handoff automático em alguns fluxos atuais;
- 1 hora de pausa para atividade humana ou bloqueios operacionais comuns;
- 2 horas após anexo, conforme o fluxo de anexo atual;
- 48 horas de contexto para determinados handoffs do agente experimental;
- 2 horas de sessão curta da IA;
- 30 minutos para menu aguardando escolha;
- 20 minutos para identificação de cliente/CPF/número;
- 1 hora de silêncio após resposta de status;
- 2 horas para evitar repetição do mesmo status;
- até 7 dias de memória persistente específica do pós-venda.

O redesign deve registrar o motivo de cada prazo e não transportar um número
genérico de horas para todos os casos. A janela de aproximadamente 10 mensagens
é memória de contexto; não substitui expiração de estado, handoff, opt-out ou
controle persistente.

### Handoff, humano e controles por cliente

- `force_human` é um controle persistente por número e deve vencer qualquer
  classificação da IA;
- o pedido de humano feito pela IA não é igual à resposta humana da equipe;
- o redesign deve distinguir `human_pending`, `human_active` e `human_released`;
- o prazo de 12 horas não deve ser mantido como bloqueio cego, mas o equivalente
  funcional de proteção precisa existir enquanto a equipe ainda pode assumir o
  caso;
- uma resposta real do operador deve bloquear a IA até liberação clara;
- o controle `IA` é temporário e consumível na próxima chamada relevante, não um
  modo permanente;
- quando a IA fizer handoff durante esse override temporário, o controle deve
  voltar para automático;
- o radar precisa mostrar clientes em `force_human`, pendências humanas, anexos
  aguardando equipe e estados que exigem revisão;
- o contexto de sessão da IA deve ser encerrado ou separado quando houver
  assunção humana, para não misturar memória automática com conversa do operador;
- uma mensagem do cliente durante uma pausa humana deve ser silenciada ou
  encaminhada conforme o estado, nunca reativar a IA por acidente.

#### Prazo do bloqueio após interação humana

O bloqueio depois que um funcionário responde não pode ser infinito e também
não deve depender de liberação manual obrigatória. A regra recomendada para o
redesign é:

- cada mensagem real enviada por um funcionário inicia ou renova o estado
  `human_active`;
- o prazo é contado a partir da última atividade humana, não do primeiro pedido
  de atendente nem do primeiro handoff da IA;
- durante `human_active`, novas mensagens do cliente são registradas e não
  reativam a IA nem renovam o prazo;
- quando o prazo de inatividade humana expirar, o estado passa para
  `human_released` ou `auto` automaticamente;
- a próxima mensagem do cliente pode então iniciar uma nova interação da IA,
  recebendo a memória recente e a indicação de que houve atendimento humano;
- `force_human` continua sendo a única exceção persistente e exige alteração
  manual do operador.

O fim do bloqueio não apaga a continuidade. Ele apenas muda quem pode
responder. A memória deve preservar, dentro da janela recente e do resumo
estruturado:

- o assunto que levou ao atendimento humano;
- o que o cliente perguntou ou relatou;
- o que o funcionário respondeu, quando essa mensagem estiver disponível;
- que o caso já passou por atendimento humano, sem exigir que a IA determine
  se o problema foi resolvido;
- a última atividade humana e o tempo decorrido desde ela.

Assim, se o funcionário respondeu pela manhã e o cliente voltar duas horas e um
minuto depois perguntando “resolveram o problema?”, a IAra não deve tratar isso
como uma conversa nova, nem tentar concluir se o problema foi resolvido. Ela
deve reconhecer que o cliente está retomando um caso já encaminhado e chamar
novamente um funcionário, por exemplo: “Entendi, você está retomando aquele
assunto. Como sou a IAra, uma assistente virtual, vou chamar novamente um
atendente para continuar esse atendimento.”

A memória serve para impedir que a IAra responda de forma aleatória, repita
perguntas ou invente uma solução. Ela não transforma fatos incompletos de uma
conversa humana em confirmação operacional.

Decisão aprovada: o novo desenho usará uma janela curta de 2 horas
após a última mensagem humana, preferencialmente contada dentro do horário de
atendimento da loja. Assim, uma resposta do funcionário pela manhã protege a
continuidade imediata da conversa, mas uma nova chamada à tarde pode voltar para
a IA se a equipe não tiver continuado o atendimento. Esse valor não é o antigo
bloqueio fixo de 12 horas: ele é renovável pela atividade do funcionário, não
começa quando a IA faz o handoff e não impede a loja de manter um número em
`force_human` quando o caso exigir acompanhamento manual. O prazo deve ficar
nomeado e configurável para ser ajustado depois de observar as conversas reais.

### Anexos e comprovantes

- imagem, PDF, áudio, vídeo, localização, figurinha ou arquivo ilegível devem
  ser classificados pelo tipo antes da IA textual;
- o recebimento do arquivo não significa que ele foi validado, que é um Pix,
  que o pagamento foi localizado ou que a parcela foi baixada;
- o primeiro anexo deve gerar uma única confirmação/handoff, sem respostas
  repetidas para “recebeu?”;
- comprovantes podem ter extração interna de dados, mas não geram baixa
  automática;
- o atalho interno de parcela só pode aparecer quando houver correspondência
  exata e única por telefone + valor;
- se houver mais de uma parcela compatível, o sistema não pode escolher a mais
  provável;
- base64 e conteúdo sensível não devem ser persistidos em logs comuns;
- texto posterior a anexo deve herdar o contexto do arquivo, respeitando a
  agregação, sem cair em status, preço ou menu genérico.

### Pós-venda e agrupamento de OSs

- o pós-venda só deve ser criado para OS entregue, válida e não cancelada ou
  devolvida;
- uma OS não pode receber o mesmo primeiro acompanhamento mais de uma vez;
- OSs do mesmo cliente só podem ser agrupadas quando o beneficiário for o mesmo
  e as entregas estiverem na mesma venda ou dentro da janela atual de 14 dias;
- o agrupamento deve ter uma OS representativa e guardar todas as OSs cobertas;
- o agrupamento não pode ser transitivo indefinidamente: a primeira OS ancora a
  janela e evita juntar entregas distantes por encadeamento;
- a mensagem deve adaptar singular/plural e cliente/paciente quando houver mais
  de um par de óculos;
- o follow-up deve continuar ligado aos registros de `post_sales` e às
  interações de cada OS coberta;
- o encerramento sem resposta deve respeitar a análise das interações: resposta
  positiva sem nota pode virar nota 4, ausência pode virar nota 3, mas reclamação,
  adaptação ruim, dúvida ou handoff preservam o atendimento humano;
- nota numérica só deve ser aceita na etapa de avaliação, inclusive formatos
  como “nota 5”, “5 estrelas” e “5/5”, sem capturar números soltos em frases.

### Parcelas, lembretes e preferências

- a fila deve ser revalidada no momento do envio, porque a parcela pode ter sido
  paga depois do agendamento;
- a configuração geral, o módulo financeiro, o canal conectado, o telefone e
  o opt-out devem ser revalidados antes do disparo;
- a rotina atual considera o prazo configurado e também o alvo de um dia antes;
  essa decisão precisa ser explicitada no redesign;
- a unicidade deve impedir dois lembretes para a mesma parcela no mesmo canal;
- o cliente pode cancelar e reativar lembretes, e o comando só deve valer para
  lembretes de parcelas quando houver esse contexto;
- “em dia” significa sem parcela vencida e não paga, mesmo que existam parcelas
  futuras;
- o texto inicial deve ser montado por modelos controlados, com ou sem parabéns,
  e não por invenção livre da IA;
- valor detalhado exige a confirmação financeira definida no plano;
- chave Pix é dado oficial da loja e não confirma pagamento ou baixa;
- falha de envio, envio pendente e envio confirmado precisam permanecer
  diferentes para permitir reconciliação segura.

### Horário, status e exceções

- horário deve ser calculado pela agenda estruturada da loja, incluindo intervalo,
  feriado, fechamento excepcional, abertura excepcional e fuso;
- estar fora do expediente não bloqueia a IAra nem transforma a conversa em
  silêncio: respostas que podem ser dadas com fatos confirmados, como horário,
  endereço, mapa e outras capacidades automáticas, continuam normalmente;
- o horário modifica apenas o encaminhamento humano. Se a decisão depender de
  funcionário enquanto a loja estiver fechada, a IAra deve se identificar,
  informar o encaminhamento e explicar que a equipe continuará o atendimento
  quando a loja abrir, citando o próximo horário calculado pela agenda;
- o encaminhamento fica registrado como `human_pending`, mas o fechamento da
  loja não cria `human_active`, não inicia a pausa de duas horas e não impede
  novas respostas automáticas seguras antes da abertura;
- se o próximo horário não puder ser calculado, o sistema não pode inventar um
  prazo: deve usar uma resposta conservadora e registrar a falha operacional;
- status publicado pela própria loja tem contexto e validade próprios; uma
  reação ao status pode iniciar outro fluxo, mas a publicação em si não é uma
  chamada do cliente;
- respostas repetidas para o mesmo status podem ser silenciadas por uma janela
  própria, sem impedir mudança de assunto.

### Retenção e operação

- logs de IA, mensagens e estados expirados precisam de retenção diferente;
- faxina não pode apagar conversas vivas, `force_human`, handoff ativo ou anexo
  aguardando atendimento;
- o modal operacional deve mostrar rota, silêncio, handoff, confiança, provider,
  estado, dados internos de comprovante e motivo da decisão;
- simulação deve usar o mesmo motor, mas não gravar inbound/outbound reais;
- o envio real do operador deve assumir a conversa explicitamente, sem depender
  apenas do eco `fromMe` da Evolution;
- provider indisponível, JSON inválido e timeout devem cair em resposta
  conservadora ou handoff, sem quebrar o webhook nem repetir o envio.

Este inventário serve como fonte de ideias e riscos conhecidos do sistema atual.
O checklist obrigatório do redesign será formado somente depois que cada item
receber uma decisão explícita: `reaproveitar`, `adaptar` ou `não levar`.

### Matriz de reaproveitamento e testes obrigatórios

| Capacidade atual | Tratamento desejado ou decisão necessária no redesign | Teste obrigatório |
|---|---|---|
| Agregação de mensagens consecutivas | Aguardar cerca de 20 segundos, reiniciando o prazo a cada nova mensagem do mesmo número | “Olá”, “tudo bem?” e a pergunta principal geram uma única interação |
| Deduplicação por mensagem do provedor | Usar `provider_message_id` como chave idempotente | O mesmo webhook repetido não gera segunda resposta |
| Recuperação de resposta pendente | Reentregar outbound já criado quando o envio foi interrompido | Falha após criar outbound não duplica a mensagem |
| Reconciliação de webhook perdido | Consultar mensagens recentes do canal e processar somente as ausentes | Mensagem recebida durante indisponibilidade do webhook é recuperada |
| Normalização de telefone | Unificar formatos equivalentes, inclusive nono dígito | O mesmo cliente não recebe dois estados por variação do número |
| Canais e conexão | Processar apenas canal ativo e conectado | Canal desligado não agenda nem responde mensagens |
| Mensagens `fromMe` | Registrar mensagem humana no histórico sem tratá-la como inbound do cliente | Envio pelo celular da loja aparece como humano e não dispara IA |
| Grupos do WhatsApp | Ignorar grupos no atendimento individual | Mensagem em grupo não cria conversa automática |
| `force_human` | Manter bloqueio persistente até alteração manual | Cliente em Humano nunca recebe resposta da IA |
| `force_ai` | Tratar IA como override temporário e consumível | Depois da próxima chamada, o controle volta ao automático |
| Handoff da IA | Usar `human_pending` sem bloquear indefinidamente | “Recebeu?” após handoff mantém o contexto e recebe resposta adequada |
| Resposta humana | Usar `human_active` com prazo renovável pela última mensagem do funcionário | Nova mensagem humana renova o prazo; cliente sozinho não renova |
| Expiração do humano | Após a janela de inatividade, liberar a IA sem apagar a memória | Retomada após a expiração não começa do zero |
| Memória contextual | Preservar mensagens recentes, resumo, assunto, tempo e participação humana | “Resolveram o problema?” retoma o caso sem alucinar uma solução |
| Janela curta da IA | Usar aproximadamente 10 mensagens como contexto, sem substituir estados operacionais | Mudança de assunto dentro da janela é identificada corretamente |
| Anexos | Registrar tipo, contexto e confirmação única; não resolver automaticamente | Imagem/PDF seguido de “recebeu?” não gera resposta aleatória |
| Áudio, vídeo, localização e arquivo ilegível | Confirmar recebimento e encaminhar conforme o tipo | Esses formatos não entram em resposta comercial automática |
| Comprovante | Extrair dados internamente, sem dar baixa automática | Comprovante não altera parcela sem ação humana/sistema financeiro |
| Match de comprovante | Exibir atalho interno somente em correspondência única por telefone + valor | Ambiguidade não escolhe parcela provável |
| Pós-venda por OS | Manter vínculo com OS, `post_sales` e interações | Atendimento concluído permanece auditável na OS correta |
| Agrupamento de OSs | Agrupar mesmo cliente e beneficiário na mesma venda ou janela de 14 dias | Duas OSs relacionadas geram um follow-up agrupado |
| Âncora do agrupamento | Não permitir agrupamento transitivo indefinido | Entregas em 0, 13 e 26 dias não viram um único grupo |
| Duplicidade de pós-venda | Uma OS coberta não recebe novo primeiro follow-up | Reexecução do job não cria segundo envio |
| Cancelamento de pós-venda | Excluir venda cancelada/devolvida e pós-venda já concluído | OS cancelada antes do disparo é removida da fila |
| Avaliação de pós-venda | Aceitar nota clara de 1 a 5 apenas na etapa correta | “Nota 5”, “5 estrelas” e “5/5” são aceitos; números soltos não |
| Encerramento automático | Manter nota 3 sem resposta, nota 4 para positivo sem número e humano para dúvida/reclamação | Cada resultado encerra ou preserva o caso corretamente |
| Lembrete de parcela | Revalidar parcela, saldo, venda, canal e preferências antes do envio | Parcela paga após agendamento é cancelada, não enviada |
| Unicidade de lembrete | No máximo um lembrete por parcela e canal | Execuções simultâneas não duplicam o aviso |
| Cliente em dia | Consultar atraso internamente; parabenizar apenas sem vencida não paga | Parcelas futuras não impedem “em dia”; atraso impede o parabéns |
| Mensagem financeira inicial | Usar modelo controlado, sem invenção de valor ou pendência | Lembrete informa apenas o próximo vencimento definido |
| Valor de parcela | Exigir confirmação financeira adequada ou humano | Número do WhatsApp sozinho não libera valor detalhado |
| Pix | Enviar somente chave oficial cadastrada | Chave Pix não confirma pagamento ou baixa |
| `PARAR`/`VOLTAR` | Manter escopo correto e registrar preferência | Cancelar e reativar lembretes funciona sem afetar conversa comum |
| Horário da loja | Reutilizar agenda, intervalo, feriado e exceções | “Posso ir agora?” recebe resposta baseada na situação real |
| Fora do expediente | Manter respostas automáticas normais e adaptar somente o handoff para o próximo horário real de abertura | Endereço/horário continuam respondidos; handoff fechado informa quando a loja abre e não cria `human_active` |
| Status do WhatsApp | Separar publicação, reação e conversa comum | Reação a Status usa contexto; publicação da loja não vira chamada |
| Repetição de status | Silenciar repetição dentro da janela própria, permitindo novo assunto | Pergunta repetida é silenciada, mudança de tema é processada |
| Retenção | Limpar somente dados expirados e não protegidos | Faxina não apaga `force_human`, handoff ativo ou anexo pendente |
| IA indisponível | Usar resposta canônica conservadora ou handoff | Timeout, JSON inválido e falha de provider não quebram o fluxo |
| Auditoria | Registrar inbound, decisão, IA, outbound, rota, motivo e estado | Cada resposta automática pode ser reconstruída no modal |
| Simulação | Reutilizar decisão sem gravar conversa real | Simulação não envia nem polui inbound/outbound reais |

Esta matriz deve acompanhar cada etapa do desenvolvimento. Um item só pode ser
marcado como implementado quando o teste correspondente existir e passar.

## Decisões técnicas aprovadas

### Memória: opção B

A memória será composta por:

- resumo estruturado da conversa;
- últimas 10 mensagens literais, incluindo cliente, IA e funcionário;
- assunto ativo, fase, pendência, participação humana, anexos e tempo decorrido.

O resumo evita que a IA precise reconstruir toda a situação a cada mensagem. As
10 mensagens preservam o texto real, o tom e detalhes que não cabem em campos
estruturados. A expiração de um bloqueio humano não apaga essa memória.

### Estados: opção C

O redesign usará estados independentes, e não um único estado gigante. A
conversa terá dimensões separadas para:

- `active_topic`;
- `conversation_phase`;
- `human_control`;
- `attachment_status`;
- `pending_action`;
- prazos e horários relevantes.

Isso permite mudar de assunto sem destruir o contexto anterior e evita criar um
estado novo para cada combinação de assunto, anexo e atendimento humano.

### Contrato da IA: opção C com humanização

A IA devolverá classificação estruturada, incluindo intenção, confiança,
mudança de assunto, pedido de humano, anexo e entidades reconhecidas. O sistema
continuará responsável pela decisão operacional e produzirá uma resposta
canônica baseada somente em fatos confirmados.

Uma etapa opcional de humanização poderá transformar a resposta canônica em um
texto mais natural. O humanizador deverá preservar fatos, decisão, política de
segurança, identificação da IAra e necessidade de handoff. Ele não poderá criar
preços, prazos, confirmações, soluções ou promessas que não estejam na resposta
canônica.

Fluxo aprovado:

```text
mensagem + memória
  → classificação estruturada da IA
  → decisão operacional do sistema
  → resposta canônica
  → humanização controlada
  → envio e registro
```

### Expediente como modificador do handoff

O expediente não é uma autorização geral para a IA responder. Depois que o
sistema produzir a decisão operacional, a agenda da loja será aplicada assim:

- decisão sem funcionário: permanece inalterada, mesmo com a loja fechada;
- `human_handoff` ou `repeat_handoff` com a loja aberta: encaminhamento imediato;
- `human_handoff` ou `repeat_handoff` com a loja fechada: encaminhamento marcado
  como `when_store_opens`, com `nextOpenSchedule` obrigatório;
- o humanizador deve preservar a identificação da IAra, a necessidade de
  funcionário e o horário de retomada, sem prometer atendimento antes da abertura.

Exemplo canônico fora do expediente:

> Sou a IAra, uma assistente virtual. Vou encaminhar sua pergunta para um
> atendente. Como a loja está fechada agora, um funcionário continuará com você
> quando ela abrir, amanhã às 8h.

Essa regra vale também para retomadas, anexos, reclamações, disponibilidade de
produto e qualquer outro fluxo cuja conclusão dependa de uma pessoa.

## Decisão de arquitetura após a análise

O código novo deverá nascer isolado do roteador legado, com uma interface que
receba a chamada completa e devolva uma decisão estruturada. A integração com
os fluxos atuais só deverá acontecer depois que o comportamento puder ser
testado em simulação, sem enviar mensagens reais.

## Estado da implementação

### Fundação isolada — concluída em 18/09/2026

- contratos estritos para memória, estados independentes, classificação da IA,
  decisão do sistema e humanização controlada;
- regra testada de bloqueio humano por 2 horas, sem apagar o contexto ao liberar
  a IA, e preservação do modo `force_human`;
- memória persistente própria do redesign, separada do estado temporário legado;
- armazenamento literal e idempotente de cada mensagem de cliente, IA ou
  funcionário, sem guardar conteúdo binário/base64;
- janela carregada com as 10 mensagens literais mais recentes em ordem
  cronológica;
- turno de processamento relacionado às mensagens individuais por ID, sem
  substituir as falas originais por um texto concatenado;
- adaptador de ingestão em modo sombra para copiar mensagens recebidas e saídas
  confirmadas, distinguindo cliente, IA e funcionário;
- mensagens agrupadas pelo serviço atual são novamente separadas antes de entrar
  na memória, preservando cada `provider_message_id`;
- ativação explícita por loja por meio de `whatsapp_automation.ai_redesign.mode`,
  com `legacy` como padrão seguro;
- falhas de leitura ou gravação do redesign não interrompem nem alteram a resposta
  produzida pelo fluxo legado;
- ao final da espera atual, o banco cria o turno `ready` e todos os vínculos com
  suas mensagens na mesma transação;
- a chave do turno é idempotente: repetir o webhook devolve o mesmo turno, mas
  reutilizar a chave com outro conjunto de mensagens é rejeitado;
- o limite de 10 mensagens vale para a memória enviada à IA, não para o turno:
  um agrupamento válido preserva até 50 mensagens originais para auditoria.
- o contrato da decisão distingue handoff durante o expediente de handoff para
  a próxima abertura; respostas que não dependem de funcionário permanecem
  disponíveis fora do horário.
- a leitura do modo `legacy`/`shadow`/`redesign` usa cache curto por loja e
  compartilha consultas simultâneas, reduzindo o custo do espelhamento sem
  atrasar indefinidamente uma alteração operacional de modo.
- horários `timestamptz` retornados pelo banco são normalizados para UTC antes
  de validar a memória e criar o turno; isso preserva a captura fail-open sem
  perder o turno por diferença de formato (`+00:00` versus `Z`).

Esta fundação já possui pontos de captura no webhook e na confirmação de envio,
mas permanece inativa enquanto a loja estiver em `legacy`. Mesmo quando uma loja
for colocada em `shadow`, o fluxo atual continuará sendo o único responsável por
atender clientes; o redesign apenas registrará contexto até sua validação.

A validação real posterior na Loja 1 confirmou a captura de uma janela agregada:
três mensagens foram preservadas individualmente, em ordem, e geraram um turno
`ready` com os três vínculos e a espera de 20 segundos. Nenhuma resposta foi
enviada pelo redesign, pois a loja permanece em `shadow`.

Também foi validada a captura de uma resposta automática do legado como saída
`assistant`: o sistema escolheu a resposta canônica de horário a partir da agenda
da loja e a IA legada apenas a humanizou sob a política de não acrescentar fatos.
O redesign registrou a saída confirmada sem participar dessa decisão ou envio.

Por fim, uma mensagem enviada manualmente pela Central foi registrada como saída
`human` com tipo `operator_manual`. A captura sombra já distingue, em conversa
real, cliente, resposta automática e funcionário.

### Processamento de turnos em sombra — iniciado em 18/09/2026

- foi criado um classificador exclusivo do redesign, com saída estrita para
  intenção, confiança, relação com o assunto anterior, pedido de humano, anexo e
  entidades; ele não pode escrever a resposta ao cliente;
- o sistema produz separadamente a decisão operacional, a resposta canônica e o
  motivo da decisão usando somente fatos oficiais da loja;
- a agenda estruturada modifica apenas decisões de handoff; horário e endereço
  podem ser propostos normalmente fora do expediente;
- turnos `ready` da loja em `shadow` são reivindicados de forma condicional para
  evitar processamento simultâneo e recebem `processed` ou `failed` com
  diagnóstico no `metadata`;
- o contexto da decisão termina no fechamento do turno, impedindo que a resposta
  posterior do sistema legado seja apresentada ao novo classificador como se já
  fizesse parte da conversa;
- a rota interna de processamento exige segredo operacional e registra
  explicitamente `sendsMessage: false`; esta etapa não cria outbound, não chama
  o provedor de envio e não altera quem atende o cliente;
- o processador foi publicado e executado sobre três turnos reais da Loja 1:
  dois foram classificados como `store_hours` e receberam a proposta
  `answer_store_hours`; um foi classificado como `vision_exam`, com confiança de
  0,98, e recebeu a proposta `human_handoff`;
- os três turnos terminaram em `processed`, sem falha e com
  `sendsMessage: false`;
- após a pausa do piloto, a Loja 1 voltou para `legacy`. Mesmo que uma conversa
  antiga ainda esteja marcada como `shadow`, o processador consulta o modo
  atual configurado para a loja antes de chamar a IA; se não estiver em
  `shadow`, libera o turno sem classificá-lo nem alterá-lo para `failed`.
- em 23/09/2026, a Loja 1 voltou a `shadow` para validar mudança de assunto e
  anexo sem trocar o responsável pelas respostas. O decisor local passou a
  priorizar pedido de atendente, anexo e baixa confiança antes de propor
  respostas de horário ou endereço.
- a primeira pergunta real sobre horário nessa retomada foi capturada e
  processada como `store_hours`/`answer_store_hours`, sem envio pelo redesign.
  O legado registrou o inbound como ignorado porque o número estava em
  `human_pause` após mensagem enviada pelo celular da loja. A memória nova
  ainda não refletia essa atividade anterior; sua sincronização pertence à
  etapa 2.
- a pergunta real sobre endereço e a foto com legenda foram processadas como
  turnos distintos, respectivamente `store_location`/`change_topic` com proposta
  de resposta oficial e `attachment`/`change_topic` com proposta de handoff;
  ambos sem falhas e sem envio pelo redesign;
- em três turnos reais, o legado gravou saídas depois do fechamento do turno e
  antes de seu processamento em sombra. O contexto carregado para cada turno
  continha somente mensagens até o respectivo fechamento. Com isso, a etapa 1
  foi concluída e a etapa 2 foi iniciada;
- a primeira parte da etapa 2 calcula uma proposta pura de atualização de
  assunto ativo, assuntos secundários e anexo recebido. Ela ainda não persiste
  o resumo nem transforma uma proposta de handoff em pendência real: isso exige
  distinguir decisão simulada, mensagem enviada e assunção humana confirmada.
- o carregamento do turno passou a buscar a última saída capturada como `human`
  até o fechamento, inclusive quando ela saiu da janela de 10 mensagens. A
  pausa renovável de duas horas é reconstruída apenas com essa evidência; o
  instante do fechamento governa o controle humano e a avaliação da agenda.
  A proposta de resumo fica no metadata do turno. A pausa legada de origem
  comprovadamente manual também é reconciliada quando seu registro ainda
  existe e já estava ativo no instante do turno. A validação local com os
  turnos reais da Loja 1 passou a recuperar `human_active`, sem alterar o
  estado legado. Ainda não há escrita no resumo canônico nem recuperação de
  eventos antigos já removidos da tabela; decisões simuladas não criam
  pendência humana real.
- o replay determinístico de turnos processados foi preparado para reconstruir
  assunto ativo, assuntos secundários e anexo mesmo quando o processamento
  ocorre fora de ordem ou é repetido. Ele preserva os campos de controle humano
  recebidos e ainda não escreve em `whatsapp_conversation_memory.summary`.
  Um roteiro de validação local e somente leitura ficou em
  `docs/whatsapp-redesign-stage2-validation.md`.
- em 23/09/2026, foi preparada localmente a persistência transacional do
  resumo derivado de turnos em sombra. O banco serializa a finalização por
  conversa e reconstitui assuntos e anexos em ordem cronológica, preservando
  controle humano e pendências reais. Uma tabela separada registra eventos
  confirmados de assunção, liberação e handoff enviado; a captura de saída
  humana confirmada registra sua assunção. Ao processar um turno antigo, o
  contexto é reconstruído até o fechamento do turno. Typecheck e testes locais
  passaram; a aplicação e a validação funcional no banco são acompanhadas no
  registro de 23/09/2026 abaixo.
- Em 23/09/2026, o usuário aplicou no Supabase a migration de resumo/eventos e
  a migration corretiva da guarda `sendsMessage`; a consulta no banco confirmou
  a definição atualizada e permissões restritas a `service_role`. Typecheck e
  42 testes determinísticos locais passaram. Foi preparado um roteiro SQL
  transacional com rollback para validar no banco consolidação, eventos de
  assunção/liberação/handoff e idempotência. O usuário executou o roteiro e
  recebeu `VALIDACAO_ETAPA_2_OK`; os fixtures foram revertidos, sem chamada de
  IA ou envio de mensagem. Etapa 2 concluída; etapa 3 pendente.
