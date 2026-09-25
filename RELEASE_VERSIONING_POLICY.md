# Politica de historico e versoes

Estas regras sao obrigatorias para qualquer alteracao em `src/lib/release-history.ts`.

## Autorizacao

**Trava obrigatoria e prevalente:** a frase exata **"mude a versao"**, escrita pelo usuario, e a senha exclusiva para qualquer mudanca de numero ou estado da versao. Sem ela, e proibido abrir/incrementar uma versao, alterar `PENDING_RELEASE_VERSION`, fechar/mover uma versao para `RELEASE_HISTORY` ou limpar a pendencia como fechamento. Esta trava prevalece sobre qualquer regra abaixo que possa ser entendida como autorizacao automatica. "Ready", deploy concluido, commit, push, validacao, "pode fazer" ou autorizacao generica nao substituem a frase.

- `PENDING_RELEASE_CHANGES` pode ser atualizado para descrever fielmente o trabalho pendente, mas isso nao autoriza alterar o numero/estado da versao nem fechar o registro.
- Nao inferir a senha pelo contexto: o usuario precisa escrever literalmente **"mude a versao"**.

- A autorizacao literal do usuario **"mude a versao"** e exigida para qualquer mudanca de numero/estado da versao, nao apenas para fechar o historico.
- Atualizar `PENDING_RELEASE_CHANGES` faz parte do trabalho normal de cada alteracao aprovada. `PENDING_RELEASE_VERSION` so pode ser alterado depois da senha literal.
- Confirmar deploy, publicar na `main`, fazer commit, validar localmente ou receber um "sim" para outra tarefa nao autoriza mover textos para `RELEASE_HISTORY`.
- Sem a senha, o numero da versao pendente e o numero/estado publicado devem permanecer inalterados, mesmo depois de deploy concluido.

## Conteudo permitido

- `PENDING_RELEASE_CHANGES` e `RELEASE_HISTORY` devem conter somente mudancas que o usuario final possa perceber.
- Nunca registrar detalhes internos de arquitetura, nomes de catalogos, familias, fornecedores, geometrias, implementacoes da Torre, prompts, chaves, infraestrutura ou diagnosticos tecnicos.
- Se uma mudanca tiver informacao interna, omitir essa informacao do historico mesmo que a implementacao seja publicada.
- Antes de fechar uma versao, mostrar ao usuario a lista completa dos textos e aguardar auditoria e autorizacao expressa.

## Fechamento autorizado

Somente depois de **"mude a versao"**:

1. inserir a versao pendente no inicio de `RELEASE_HISTORY`, com a data do deploy e os textos aprovados;
2. limpar `PENDING_RELEASE_VERSION` e `PENDING_RELEASE_CHANGES`;
3. preservar todo o historico anterior;
4. validar o arquivo e publicar a alteracao.

Antes desse comando, nao inserir a versao pendente em `RELEASE_HISTORY`. Durante esse periodo, e permitido e obrigatorio corrigir, incluir ou remover textos de `PENDING_RELEASE_CHANGES` para que eles correspondam ao que sera entregue.
