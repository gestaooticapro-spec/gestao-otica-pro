# Validação econômica da etapa 2 do WhatsApp

Este roteiro não publica código, não processa turnos, não chama a IA e não envia
mensagens. A Loja 1 pode continuar atendendo pelo fluxo legado.

## Comandos

No diretório do projeto:

```powershell
npm run check:whatsapp-redesign
```

O comando roda o typecheck e os testes determinísticos do redesign. A saída
precisa terminar com zero falhas. Para conferir um turno real já conhecido,
sem mostrar telefone ou conteúdo de mensagem:

```powershell
npm run check:whatsapp-redesign:db -- --turn-id=SEU_UUID --store-id=1
```

O segundo comando é opcional, exige as credenciais locais já configuradas e
faz apenas leituras. Não cole arquivos `.env`, credenciais nem conteúdo de
clientes ao pedir ajuda. Compartilhe apenas o resumo JSON sem dados pessoais
e o total de testes aprovados.

Para validar as funções já aplicadas no Supabase, abra o SQL Editor e execute
`supabase/tests/whatsapp_redesign_stage2_validation.sql`. O script escolhe um
canal existente da Loja 1, cria dados temporários numa transação, verifica os
resultados e termina com `ROLLBACK`. O resultado deve exibir
`VALIDACAO_ETAPA_2_OK`. Ele não chama IA nem envia mensagens.

## Estado da implementação

- As etapas 1 e 2 estão concluídas; a etapa 3 permanece pendente no checklist.
- A classificação em sombra e a proposta de resumo por turno já estão no código
  local, sem envio pelo redesign.
- O replay determinístico de turnos processados foi preparado para reconstruir
  assunto ativo, assuntos secundários e anexo, preservando campos de controle
  humano. Chegada fora de ordem e reexecução são cobertas por teste.
- A migration `20260923120000_whatsapp_redesign_shadow_summary.sql` implementa
  a finalização transacional do turno com replay ordenado para gravar o resumo;
  o usuário confirmou sua aplicação no Supabase.
- A migration `20260923130000_whatsapp_redesign_shadow_finalization_guard.sql`
  exige o marcador explícito `sendsMessage: false`. A verificação no Supabase
  confirmou a guarda e as permissões: `anon` e `authenticated` sem EXECUTE,
  `service_role` com EXECUTE.
- A saída humana confirmada registra um evento de assunção. A operação de
  liberação explícita existe no banco e no store, mas ainda não tem controle
  na Central. Handoff apenas proposto em sombra não vira pendência efetiva.
- O roteiro `supabase/tests/whatsapp_redesign_stage2_validation.sql` valida
  diretamente no banco a consolidação, a rejeição do marcador ausente,
  assunção/liberação humana, idempotência de evento e handoff confirmado. Ele
  cria fixtures temporárias na Loja 1 dentro de uma transação e termina em
  `ROLLBACK`; não chama IA nem envia mensagens. O usuário executou o roteiro no
  SQL Editor e recebeu `VALIDACAO_ETAPA_2_OK`, concluindo a validação da etapa
  2. A etapa 3 deverá comparar decisões em sombra sem trocar quem responde.
  Não publique o redesign para responder clientes com base apenas nos testes
  locais.

## Prompt para um modelo mais barato

> Leia `README.md`, `WHATSAPP_IA_REDESIGN_PLAN.md` e
> `WHATSAPP_IA_REDESIGN_IMPLEMENTATION_STEPS_TEMP.md`. Não altere a Loja 1,
> não faça deploy e não escreva no banco. Rode
> `npm run check:whatsapp-redesign`. Revise os testes do replay em
> `tests/whatsapp-conversation-redesign-contract.test.ts` e confirme se cobrem
> ordenação, reexecução, anexo e preservação da pausa humana. Informe somente
> falhas concretas, com arquivo e linha. A etapa 2 está validada; não altere o
> modo da Loja 1 nem inicie a etapa 3 sem autorização explícita do usuário.
