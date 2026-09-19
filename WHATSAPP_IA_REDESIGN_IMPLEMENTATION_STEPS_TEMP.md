# Checklist temporario da implementacao do redesign da IA do WhatsApp

Este arquivo acompanha somente a execucao das seis etapas restantes. Ele deve
ser removido quando a etapa 6 estiver concluida e o estado final estiver
registrado no `WHATSAPP_IA_REDESIGN_PLAN.md`.

## Regra de atualizacao

- a etapa em execucao recebe `EM ANDAMENTO`;
- uma etapa concluida permanece sem risco enquanto nenhuma etapa nova tiver
  comecado;
- ao iniciar a etapa seguinte, a etapa anterior deve ser riscada e marcada como
  concluida;
- uma etapa so pode ser considerada concluida depois das validacoes previstas.

## Etapas

1. **EM ANDAMENTO — Processar turnos em sombra.** Ler memoria e turno, obter a
   classificacao estruturada da IA, produzir a decisao canonica do sistema e
   registrar classificacao, motivo, contexto e resposta proposta sem enviar
   mensagem ao cliente.
2. **PENDENTE — Consolidar memoria e controle humano.** Atualizar assunto,
   pendencias, anexos, handoff e pausa humana renovavel de duas horas.
3. **PENDENTE — Validar decisoes em sombra.** Comparar redesign e legado na
   Loja 1 com conversas reais e cenarios de teste, sem trocar quem responde.
4. **PENDENTE — Ativar respostas seguras no piloto.** Liberar horario,
   endereco/mapa e Pix oficial somente na Loja 1, com reversao simples.
5. **PENDENTE — Implementar fluxos sensiveis.** Tratar OS/retirada, parcelas,
   anexos/comprovantes, produtos, exame de vista, reclamacao, troca e garantia.
6. **PENDENTE — Operacao completa e migracao.** Exibir contexto e decisoes na
   Central, integrar disparos automaticos, migrar loja por loja e aposentar o
   roteador legado quando a equivalencia estiver comprovada.

## Historico

- 18/09/2026: etapa 1 iniciada com processamento exclusivamente em sombra.
