# Proposta futura: IAra durante a espera do atendimento humano

## Objetivo

Permitir que a IAra continue ajudando o cliente com dúvidas simples enquanto um funcionário da ótica assume o atendimento, sem substituir o alerta do Radar Operacional nem alterar o fluxo atual antes de uma decisão da equipe.

## Exemplo de fluxo

1. O cliente pergunta: “Oi, que horas vocês fecham?”
2. O sistema consulta o horário da loja no banco de dados.
3. A IA responde, por exemplo: “Hoje fechamos às 18h.”
4. O cliente pergunta: “Estou com uma coceira no olho. Vocês fazem teste de visão?”
5. O sistema identifica que o assunto precisa da equipe e cria uma pendência no Radar Operacional.
6. A IA responde:

   > Vou chamar nossa equipe para te atender.
   >
   > Enquanto isso, sou a IAra, assistente virtual da ótica. Posso responder dúvidas rápidas sobre óculos, lentes e óculos de sol. Se preferir falar diretamente com nossa equipe, não precisa responder esta mensagem.

7. Enquanto a pendência estiver aberta, a IA pode responder dúvidas educativas e gerais.
8. Quando um funcionário assumir a conversa, a IA deixa de responder automaticamente.

## Novo estado sugerido

Adicionar um estado intermediário, separado do handoff silencioso atual:

`human_handoff_pending_ai_available`

Esse estado significa:

- existe uma pendência para atendimento humano;
- o cliente continua visível no Radar Operacional;
- a IA pode responder somente dentro de um escopo seguro;
- o atendimento humano pode assumir e encerrar a participação da IA.

## O que a IA pode responder

- dúvidas gerais sobre óculos;
- diferenças básicas entre tipos de lentes;
- proteção UV;
- cuidados e limpeza;
- informações educativas sobre óculos de sol;
- explicações simples sobre adaptação e uso, sem diagnóstico;
- informações gerais já aprovadas pela ótica.

As respostas devem ser curtas, simpáticas e objetivas.

## O que deve continuar com o funcionário

A IA deve encaminhar ou manter a pendência para assuntos como:

- preços, descontos e negociações;
- estoque e disponibilidade de produtos;
- receita, diagnóstico ou sintomas;
- teste de visão e serviços específicos da loja;
- garantia, troca ou reclamação;
- prazos especiais ou promessas comerciais;
- qualquer situação em que a confiança da IA seja baixa.

Resposta sugerida nesses casos:

> Essa informação precisa ser confirmada pela nossa equipe. Seu atendimento já está sinalizado no Radar Operacional para que possam te responder.

## Comportamento do Radar Operacional

O radar deve continuar mostrando a pendência enquanto o atendimento humano não for assumido.

Sugestão de informações exibidas:

- cliente;
- telefone;
- assunto que gerou o encaminhamento;
- tempo aguardando atendimento;
- quantidade de mensagens trocadas com a IAra;
- indicador de que a IA ainda está disponível.

Quando o funcionário assumir, a conversa deve sair do modo `human_handoff_pending_ai_available` e entrar no atendimento humano normal.

## Regras de segurança

- A IA não deve diagnosticar sintomas.
- A IA não deve recomendar lentes específicas como decisão clínica.
- A IA não deve inventar preços, estoque, horários ou serviços.
- Horários, localização e dados da loja devem continuar vindo do banco.
- A IA deve encaminhar quando não tiver confiança suficiente.
- Deve existir uma forma clara de pedir atendimento humano.
- O limite de mensagens deve evitar conversas longas sem ação da equipe.

## Benefício esperado para a ótica

Esse fluxo pode reduzir a sensação de abandono enquanto os funcionários estão ocupados, sem retirar do Radar os clientes que precisam de atendimento.

Ele também pode diminuir interrupções causadas por dúvidas repetitivas, deixando a equipe concentrada nos casos que realmente exigem intervenção humana.

## Perguntas para validar com a equipe

- Os clientes gostariam de receber respostas educativas enquanto aguardam?
- Quais dúvidas simples aparecem com mais frequência?
- Em quais assuntos a IA nunca deveria responder?
- Quanto tempo o cliente costuma esperar até um funcionário assumir?
- O aviso da IAra parece útil ou pode parecer impessoal?
- O Radar precisa destacar esse tipo de pendência de forma diferente?
- A equipe prefere assumir manualmente ou deixar a IA disponível por alguns minutos?

## Decisão pendente

Esta é uma proposta futura. O fluxo atual de atendimento e handoff não deve ser alterado até que a equipe da ótica valide a ideia, o tom das mensagens e os limites de atuação da IAra.
