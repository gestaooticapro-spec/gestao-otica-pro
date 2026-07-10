# Tutorial Guiado no Dashboard

## Objetivo

Adicionar um botao discreto de `Tutorial` na home da loja (`/dashboard/loja/[storeId]`) para guiar o usuario em fluxos reais do sistema, com foco inicial em tarefas como:

- `Quero lancar uma venda`
- `Quero cadastrar um cliente`
- `Quero finalizar uma entrega`

O comportamento esperado e:

1. O usuario abre o tutorial.
2. Escolhe o que quer fazer.
3. O sistema conduz passo a passo.
4. Cada etapa destaca um elemento real da interface.
5. O texto explica a proxima acao em linguagem simples.
6. O tutorial pode atravessar mais de uma tela quando necessario.

## Exemplo de fluxo

Roteiro inicial sugerido:

1. `Quero lancar uma venda`
2. Sistema: `Voce ja cadastrou seu cliente?`
3. Se `nao`, destacar o acesso de `Clientes`
4. Texto: `Clique aqui para cadastrarmos o novo cliente`
5. Depois do cadastro, orientar o retorno para `Atendimento`
6. Destacar os proximos campos e botoes ate chegar na venda

## Decisao tecnica principal

O tutorial nao deve depender de coordenadas fixas na tela.

Em vez de salvar a seta em um ponto absoluto, cada etapa deve apontar para um elemento real da interface, por exemplo:

- `data-tutorial="menu-clientes"`
- `data-tutorial="botao-novo-cliente"`
- `data-tutorial="botao-atendimento"`

Assim, a posicao do destaque, da seta e do balao e calculada em tempo real no dispositivo atual.

## Por que nao usar calibracao por coordenada fixa

Salvar `x/y` manualmente tende a quebrar quando mudar:

- tamanho da janela
- zoom do navegador
- resolucao
- menu aberto ou fechado
- desktop vs tablet
- futuras mudancas de layout

Se existir uma tela de calibracao no futuro, ela deve servir apenas para ajuste relativo, como:

- lado preferido do balao
- offset fino da seta
- alinhamento visual

Nao deve ser a fonte principal da ancoragem.

## Arquitetura sugerida

### 1. Motor de tutorial

Criar uma camada central responsavel por:

- carregar roteiros
- controlar passo atual
- abrir/fechar tutorial
- avancar/voltar
- persistir progresso se necessario

### 2. Passos baseados em seletor estavel

Cada passo deve referenciar um alvo estavel da UI, por exemplo:

- `target: "menu-clientes"`
- `target: "botao-novo-cliente"`
- `target: "campo-busca-cliente"`

Esses alvos seriam ligados a atributos `data-tutorial`.

### 3. Overlay visual

Camada visual com:

- escurecimento do fundo
- destaque do elemento alvo
- seta ou marcador
- balao de instrucao
- acoes `proximo`, `voltar`, `fechar`

### 4. Tutorial multi-tela

Alguns roteiros vao precisar navegar entre paginas.

Exemplo:

- dashboard
- clientes
- atendimento
- venda

Para isso, cada etapa pode opcionalmente definir:

- rota esperada
- alvo esperado
- texto da instrucao
- condicao para seguir

### 5. Roteiros editaveis

Os roteiros devem nascer como configuracao, nao hardcoded no JSX.

Exemplo de estrutura futura:

```ts
type TutorialStep = {
  id: string
  route: string
  target?: string
  title: string
  body: string
  placement?: 'top' | 'bottom' | 'left' | 'right'
  nextRoute?: string
}
```

Isso permite que o roteiro seja montado a partir das instrucoes funcionais passadas pelo negocio.

## MVP sugerido

Primeira versao pequena e segura:

1. Botao discreto `Tutorial` na home da loja
2. Modal com 2 ou 3 opcoes de fluxo
3. Primeiro roteiro: `Quero lancar uma venda`
4. Tutorial entre dashboard, clientes e atendimento
5. Destaque visual simples, sem calibrador
6. Alvos definidos por `data-tutorial`

## Cuidados importantes

- O tutorial deve respeitar modulos habilitados por loja.
- O tutorial deve respeitar perfil do usuario.
- Se o alvo nao existir na tela, o sistema precisa mostrar fallback claro.
- O tutorial deve sobreviver bem a pequenas mudancas de layout.
- O texto precisa usar vocabulario operacional da loja.

## Possiveis evolucoes

- salvar progresso por usuario
- marcar tutoriais concluidos
- biblioteca de roteiros por area
- modo `aprender fazendo`
- pequeno painel administrativo para editar textos e ordem dos passos
- calibrador assistido para ajuste fino visual

## Conclusao

A ideia e viavel dentro do stack atual.

O caminho robusto e construir um tutorial guiado ancorado em elementos reais da interface, e nao em posicoes fixas da tela. Isso permite suportar melhor desktop, tablet e futuras mudancas de layout sem retrabalho grande.
