# Instrucoes do projeto

## Contexto obrigatorio

- Antes de analisar, alterar ou concluir qualquer tarefa, leia o `README.md` por completo.
- Trate o `README.md` como a fonte de regras operacionais e de arquitetura do projeto.
- Preserve alteracoes locais preexistentes que nao pertencam a tarefa atual.

## Implementacoes e deploy

- Toda implementacao que gere deploy deve atualizar `src/lib/release-history.ts` na mesma entrega.
- Incremente somente o ultimo bloco da versao, salvo solicitacao expressa para alterar a linha minor. Exemplo: `1.02.01` para `1.02.02`.
- Insira a nova versao no inicio de `RELEASE_HISTORY`, com a data atual e uma lista objetiva das alteracoes.
- Mantenha somente os tres deploys mais recentes no historico.
- O que estiver registrado no historico deve corresponder ao que sera entregue no deploy.

## Validacao e entrega

- Execute a validacao adequada antes de concluir; para alteracoes TypeScript, execute `npm run typecheck`.
- Relate de forma objetiva os arquivos alterados, a validacao executada e qualquer pendencia real.
