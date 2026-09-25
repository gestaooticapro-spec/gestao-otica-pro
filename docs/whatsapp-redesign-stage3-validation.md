# Validação da etapa 3 do redesign do WhatsApp

A etapa 3 compara o resultado real do fluxo legado com a decisão que o
redesign registrou em sombra para o mesmo evento de entrada. A consulta é
somente leitura: não classifica novamente, não chama IA, não cria respostas e
não envia mensagens.

## Execução

```powershell
npm run check:whatsapp-redesign:stage3 -- --store-id=1 --limit=50
```

A saída contém somente contagens agregadas por resultado, par de resultados e
veredito, além do estado e da idade aproximada do turno mais recente. Ela não
expõe IDs, telefones, textos, respostas, payloads ou credenciais.

## Vereditos

- `aligned`: legado e redesign chegaram ao mesmo resultado operacional;
- `safety_aligned`: ambos encaminharam para atendimento humano, ainda que um
  deles tenha identificado especificamente um anexo;
- `divergent`: as decisões operacionais diferem e precisam ser avaliadas;
- `inconclusive`: o legado ainda estava pendente, falhou ou não deixou
  evidência suficiente.

Durante esta validação, a Loja 1 permaneceu em `shadow`, portanto o legado
continuou responsável pelas respostas.

## Resultado da Loja 1 — 24/09/2026

A etapa foi concluída após comparar 50 turnos reais (27 alinhados e 23
divergentes) e validar quatro conversas controladas. Horário e endereço
alinharam. Nos pedidos de atendente e mensagens com anexo, o redesign propôs
encaminhamento para a equipe na próxima abertura; o fluxo atual priorizou uma
resposta de horário. Essas diferenças confirmam a política prevista para o
redesign. A auditoria não enviou respostas e a Loja 1 permaneceu em `shadow`.

A etapa 4 foi autorizada em 24/09/2026. A implementação do piloto é acompanhada
em `WHATSAPP_IA_REDESIGN_IMPLEMENTATION_STEPS_TEMP.md`; a etapa 3 acima permanece
como registro da validação em sombra.
