# Instrucoes do projeto

## Contexto obrigatorio

- Antes de analisar, alterar ou concluir qualquer tarefa, leia o `README.md` por completo.
- Trate o `README.md` como a fonte de regras operacionais e de arquitetura do projeto.
- Preserve alteracoes locais preexistentes que nao pertencam a tarefa atual.

## Implementacoes e deploy

**Autorizacao de versao:** a frase exata **"mude a versao"**, escrita pelo usuario, e obrigatoria antes de qualquer alteracao de numero/estado de versao, inclusive abrir/incrementar `PENDING_RELEASE_VERSION` ou mover/fechar um registro em `RELEASE_HISTORY`. Sem essa frase, nao execute essas operacoes, mesmo se um deploy estiver Ready ou concluido. Essa regra prevalece sobre qualquer instrucao abaixo; atualizar apenas `PENDING_RELEASE_CHANGES` nao autoriza mudar a versao.

- A primeira implementacao depois de um deploy registra a mudanca em `PENDING_RELEASE_CHANGES`; nao abra nem altere o numero em `PENDING_RELEASE_VERSION` sem a frase literal do usuario **"mude a versao"**.
- Se uma implementacao pendente for removida, revertida ou substituida antes do deploy, remova ou corrija seu registro em `PENDING_RELEASE_CHANGES`; a lista deve descrever somente o que sera entregue.
- Qualquer incremento ou mudanca de numero/estado da versao exige que o usuario escreva exatamente **"mude a versao"**. Deploy concluido ou "Ready" nao substitui essa autorizacao.
- Somente depois dessa frase e de um deploy concluido, mova o registro autorizado para `RELEASE_HISTORY`; nao feche nem limpe a pendencia por inferencia.
- Preserve todo o historico de deploys. O modal carrega inicialmente tres versoes e revela as anteriores progressivamente.
- O que estiver registrado em `PENDING_RELEASE_CHANGES` deve corresponder ao que sera entregue no proximo deploy.

## Validacao e entrega

- Execute a validacao adequada antes de concluir; para alteracoes TypeScript, execute `npm run typecheck`.
- Relate de forma objetiva os arquivos alterados, a validacao executada e qualquer pendencia real.
