# Torre e Tablet - Contexto de Produto e Arquitetura

## Objetivo deste documento

Este arquivo existe para preservar o contexto de tudo o que foi discutido sobre:

- o sistema de gestao da otica dentro deste projeto
- o modulo de simulacao e leitura visual em tablet
- a futura torre fisica com TV, camera e tela touch

A ideia e evitar misturar as duas iniciativas cedo demais e, ao mesmo tempo, garantir que o que for desenvolvido agora possa ser reaproveitado depois.

---

## Visao geral do problema

Existem duas frentes que fatalmente vao se unir no futuro, mas que hoje precisam ser tratadas separadamente:

1. **Sistema da otica**
- ERP / CRM / catalogo / recomendacao / atendimento / gestao operacional
- este projeto principal

2. **Projeto da torre**
- produto fisico de experiencia e medicao comportamental
- TV grande na frente do cliente
- camera dedicada
- fluxo de calibracao, alvo visual e analise de movimento de olhos vs cabeca

Hoje ainda nao existe a torre fisica pronta. Por isso, o desenvolvimento atual deve continuar em um modo de demonstracao no tablet, sem acoplar toda a arquitetura do sistema principal ao hardware futuro.

---

## Decisao principal

### O desenvolvimento no tablet continua valendo?

Sim.

O desenvolvimento no tablet e aproveitavel, desde que o projeto seja tratado em camadas.

### O que tende a ser reaproveitado depois na torre

- logica de sessao
- fluxo de calibracao
- algoritmo de heatmap
- logica de score "olhos vs cabeca"
- comparacao contra geometrias / campos de lente
- interpretacao final para o vendedor
- estrutura de dados da sessao e do token

### O que tende a mudar quando migrar para a torre

- hardware de captura
- camera
- posicionamento fisico
- numero de telas
- forma de exibir o alvo
- sincronizacao entre tela do cliente e tela do operador
- precisao da leitura

### Conclusao pratica

O tablet deve ser tratado como:

- **modo demonstracao**
- atrativo comercial para a otica
- experiencia simplificada, nao clinica

A torre deve ser tratada como:

- **modo profissional**
- plataforma dedicada de captura
- produto fisico mais robusto e preciso

---

## Objetivo funcional do experimento

O objetivo nao e diagnostico clinico.

O objetivo e gerar um **mapa de uso do campo visual da lente** baseado no comportamento do cliente ao acompanhar um alvo visual.

A partir disso, o sistema deve ajudar a responder:

- o cliente usa mais os olhos ou mais a cabeca?
- ele tende a centralizar o uso da lente?
- ele tende a explorar mais as bordas com os olhos?
- ele provavelmente ficara confortavel com um campo de visao mais estreito?
- ou precisara de uma lente com campo mais generoso?

---

## Interpretacao comportamental desejada

### Horizontal

No eixo horizontal, mover a cabeca costuma ser algo bom para progressivas:

- se o cliente gira a cabeca para esquerda e direita, ele leva a zona util da lente com ele
- isso reduz exigencia lateral extrema do campo

### Vertical

No eixo vertical, mover a cabeca pode ser ruim:

- se o cliente abaixa a cabeca para olhar perto, ele leva junto a zona de longe
- isso pode atrapalhar o uso correto do corredor e da zona de perto

### Implicacao no algoritmo

O mapa de calor nao deve tratar "cabeca" como algo sempre bom ou sempre ruim.

Ele deve distinguir:

- cabeca lateral = geralmente ajuda
- cabeca vertical = pode atrapalhar
- olhos laterais = aumentam exigencia de campo lateral
- olhos para baixo = podem indicar melhor uso de perto, dependendo do contexto

---

## Sobre o heatmap

### O que o heatmap precisa representar

O heatmap nao deve mostrar apenas "onde houve uso".

Idealmente ele deve refletir:

- onde o cliente exigiu o campo da lente
- como ele chegou ate essa area
- se chegou por olhos ou por compensacao de cabeca

### Risco de ambiguidade

Se a area inferior da lente estiver vermelha, isso pode significar duas coisas diferentes:

- bom: o cliente desceu os olhos para usar a zona de perto
- ruim: o cliente baixou a cabeca inteira para chegar la

Esses dois cenarios podem produzir zonas visualmente parecidas, mas com significado comportamental muito diferente.

### Direcao desejada para o produto

No futuro, o ideal e separar visualmente pelo menos duas leituras:

1. **Mapa de uso**
- onde a lente foi mais exigida

2. **Mapa de qualidade de uso**
- se o acesso aconteceu com estrategia boa ou com compensacao ruim

---

## Estado atual do MVP no projeto

Foi criado um laboratorio de mapa de calor ocular em:

- `src/app/dashboard/loja/[storeId]/lentes/mapa-calor/page.tsx`
- `src/components/catalog/GazeHeatmapLab.tsx`

### O que esse MVP faz hoje

- usa camera frontal no navegador
- mostra um alvo visual em movimento
- rastreia rosto, olhos e iris usando MediaPipe
- calcula uma heuristica de olhos vs cabeca
- gera um heatmap simplificado dentro de uma lente generica
- compara o resultado com dois perfis abstratos:
  - campo amplo
  - campo compacto

### Posicionamento correto desse MVP

Esse MVP deve ser entendido como:

- demonstracao comercial
- prova de conceito de UX e algoritmo
- laboratorio interno

Nao deve ser tratado ainda como a implementacao final da torre.

---

## Auditoria atual das quatro partes da torre

Atualizado em **2026-07-10**. A auditoria foi feita sobre a rota de medidas e sobre o laboratorio de heatmap existente na repo.

### 1. Operator UI - parcial, mas utilizavel para validacao

Implementado em:

- `src/components/medidas/TowerMeasurementLab.tsx`
- `src/app/dashboard/loja/[storeId]/torre/medidas/page.tsx`

O operador ja consegue:

- abrir a tela cliente em outra janela;
- carregar uma foto ou comandar a camera;
- trabalhar em duas etapas: frontal e perfil direito;
- alternar os quatro motores frontais existentes;
- arrastar pontos e fazer ajuste fino;
- visualizar DP, DNP, alturas, medidas A/B/D e diametros;
- visualizar distancia de vertice, pantoscopico e eixo 0 no perfil;
- inclinar manualmente o eixo 0 e ver o status das duas capturas.

Ainda falta:

- botao explicito de concluir e revisar a sessao;
- salvar frontal e perfil como uma unica sessao de medidas;
- separar esse componente em session engine, captura e apresentacao quando o fluxo estiver validado.

### 2. Display UI - prototipo funcional

O modo `?client=1` da mesma rota funciona como tela do cliente. Ele ja possui:

- video em tela cheia;
- comandos recebidos da tela do operador por `BroadcastChannel`;
- instrucao frontal e instrucao de perfil direito;
- indicacao visual de qual captura esta pronta;
- comando de iniciar, capturar, parar e tela cheia.

Ainda nao e uma UI final de TV: nao ha kiosk mode, identidade visual definitiva nem uma tela fisica separada. A sincronizacao atual e adequada para validar o fluxo no navegador.

### 3. Capture engine - parcial e dependente do navegador

O `TowerMeasurementLab` ja possui:

- `getUserMedia` para camera;
- `ImageCapture` quando suportado;
- fallback para captura de frame do video;
- upload de foto para teste sem camera;
- transporte da foto, dimensoes, landmarks e configuracao da camera para a tela do operador;
- suporte separado para foto frontal e perfil direito.

Ainda falta validar com a camera dedicada, padronizar resolucao/FOV e transformar o transporte atual em um adaptador de camera reutilizavel pela torre.

### 4. Analysis engine - dois niveis diferentes

Na medicao frontal, o sistema ja tem:

- MediaPipe para landmarks faciais;
- quatro presets de leitura de contorno;
- ancoragem heuristica em bordas, contrastes e reflexos;
- ajuste manual dos pontos;
- calculo das medidas frontais.

No perfil direito, o sistema esta deliberadamente assistido:

- sugere `C` a partir da iris quando disponivel;
- sugere `L1/L2` a frente da cornea;
- procura uma borda vertical com contraste, mas conserva o fallback quando a imagem e ambigua;
- permite ajuste manual do plano da lente;
- usa eixo 0 ajustavel e calcula distancia de vertice e pantoscopico em relacao a ele.

Existe tambem um analysis engine mais avancado no heatmap:

- `src/components/catalog/GazeHeatmapLab.tsx`;
- MediaPipe em tempo real;
- classificacao heuristica de olhos versus cabeca;
- heatmap, auditoria e comparacao de geometrias;
- persistencia por `tower_heatmap_sessions` atraves de `src/lib/actions/tower-heatmap.actions.ts`.

Esse heatmap nao deve ser contado como se ja fosse a analise das medidas frontais/laterais. Ele e um laboratorio separado, embora possa reaproveitar sessao, camera e infraestrutura no futuro.

### Leitura geral do estado

As quatro partes ja estao em andamento, mas em graus diferentes:

- Operator UI: **mais avancada na rota de medidas**;
- Display UI: **funcional como prototipo de segunda tela**;
- Capture engine: **funcional no navegador, ainda nao validada no hardware final**;
- Analysis engine: **frontal validada por iteracao, lateral assistida e heatmap separado**.

O que ainda nao existe e a separacao arquitetural final em quatro modulos. Fazer essa separacao agora aumentaria o risco sem termos ainda o teste da camera e da tela fisica. A prioridade deve ser validar a experiencia completa no navegador e so depois extrair os modulos que realmente permanecerem estaveis.

### Proximo passo recomendado

Como o gabarito e a camera dedicada nao estao disponiveis neste momento, o proximo passo nao deve ser uma nova tentativa de automatizar a borda lateral. O caminho recomendado e:

1. Validar no stack o fluxo de duas telas: abrir cliente, capturar frontal, mudar para perfil direito, capturar e retornar ao operador.
2. Confirmar que upload de foto reproduz o mesmo fluxo quando a camera nao esta disponivel.
3. Fazer uma revisao de UX com o funcionario: entender se ele sabe qual etapa esta ativa, qual ponto deve arrastar e quando as duas fotos estao prontas.
4. Quando o gabarito existir, substituir R1/R2 pela leitura de escala e eixo do gabarito.
5. Somente depois criar persistencia da sessao de medidas e separar os quatro engines em arquivos proprios.

---

## Problemas ja identificados no MVP de tablet

### 1. Campo visual pequeno induz comportamento artificial

Quando a tela util ficou pequena, o cliente era induzido a mover mais os olhos e menos a cabeca de forma pouco natural.

Aprendizado:

- o alvo precisa ocupar area grande da tela
- a excursao lateral e vertical precisa ser ampla
- a distancia do dispositivo precisa ser padronizada

### 2. Heatmap inicialmente compacto demais

Foi observado que:

- mesmo mexendo so os olhos
- o heatmap permanecia centralizado demais

Aprendizado:

- nao basta usar apenas a leitura relativa da iris
- o algoritmo precisa considerar tambem o alvo exibido na tela e a ausencia de movimento de cabeca
- pouca cabeca + muito olho deve espalhar mais o calor

### 3. Eixo horizontal e vertical nao podem ser tratados iguais

Aprendizado:

- movimento lateral e vertical possuem significados diferentes para lente progressiva
- essa distincao precisa entrar no modelo de interpretacao futura

---

## Conceito de produto para a torre

O desenho atual mais promissor ficou assim:

- um **PC dedicado**
- uma **TV 32"**
- uma **tela touch separada** para operador
- uma **camera dedicada** em cima da TV, centralizada, na altura aproximada dos olhos

### Papel de cada dispositivo

#### TV

- tela do cliente
- exibe o alvo visual
- no futuro pode exibir instrucoes minimas

#### Tela touch

- interface do operador
- iniciar sessao
- calibrar
- acompanhar status
- salvar token / resultado

#### Camera

- captura rosto e olhos
- mede cabeca, olhos e comportamento de seguimento

#### PC dedicado

- roda tudo localmente
- processa camera
- gera alvo
- envia imagem para a TV por HDMI
- opera com baixa latencia

---

## Decisao de arquitetura para a torre

### Melhor decisao atual

Usar **PC dedicado** como cerebro da torre.

### Motivos

- camera e processamento no mesmo lugar
- TV vira apenas monitor
- menor latencia
- menos pontos de falha
- nao depende de rede para exibir alvo
- facilita kiosk mode
- facilita offline + sincronizacao posterior

### O que isso resolve

Se o PC estiver ligado na TV por HDMI, nao existe a necessidade de "enviar o ponto para a TV" por rede.

O proprio software roda no PC e renderiza a experiencia diretamente na tela da TV.

---

## Configuracao de hardware considerada

### Setup em estudo

- PC dedicado
- TV 32"
- monitor touch como segunda tela
- distancia do cliente: **60 cm**, com marcacao no chao
- camera prevista: algo na linha **SVPRO Global Shutter USB 1200p 90fps**

### Avaliacao dessa configuracao

Essa configuracao e boa e faz sentido para o produto futuro porque:

- duas telas separam cliente e operador
- camera centralizada em cima da TV reduz erro de paralaxe comparado a camera lateral
- global shutter ajuda bastante em estabilidade e leitura de movimento
- marcacao no chao reduz variacao de distancia

### Cuidados importantes

- confirmar o fps real da camera na resolucao efetiva usada
- validar FOV da lente para enquadrar bem o rosto a 60 cm
- garantir iluminacao frontal consistente
- padronizar altura do cliente o maximo possivel

---

## Estrategia de software recomendada

### Hoje

Continuar com o modulo de tablet como:

- MVP comercial
- prova de conceito
- laboratorio de algoritmo

### Depois

Criar um modo de torre com separacao explicita entre:

1. **Operator UI**
- roda na tela touch

2. **Display UI**
- roda na TV

3. **Capture engine**
- le a camera

4. **Analysis engine**
- calcula calibracao, heatmap e scores

### Torre como ambiente isolado

A tela da Torre nao e uma tela reduzida do Hub Gerencial nem do dashboard da
loja. Ela e o ponto de entrada do equipamento dedicado e deve funcionar como
um ambiente proprio de operador.

- nao exibir header, menu ou navegacao do backoffice;
- nao oferecer caminhos visuais para Hub Gerencial ou dashboard da loja;
- manter apenas a navegacao necessaria para a experiencia da Torre;
- no navegador, a entrada de desenvolvimento deve ficar fora de `/dashboard`
  (atualmente `/torre/[storeId]`); no Electron, a loja sera resolvida pela
  configuracao do dispositivo.

O sistema de gestao continua sendo o backoffice que consulta ou recebe os
resultados. Ele nao deve ser a moldura visual da experiencia de Torre.

### Ideia de organizacao conceitual

Separar em camadas:

- `session engine`
- `capture adapter`
- `display adapter`
- `heatmap engine`
- `result interpreter`

Isso permite reaproveitar o "cerebro" do sistema entre tablet e torre.

---

## Modo demonstracao vs modo profissional

### Modo demonstracao (tablet)

Objetivo:

- encantar o cliente
- demonstrar conceito
- gerar conversa comercial
- sugerir comportamento visual

Nao promete:

- precisao fisica alta
- leitura profissional dedicada

### Modo profissional (torre)

Objetivo:

- experiencia robusta
- captura padronizada
- melhor confiabilidade
- resultado mais consistente para decisao comercial

---

## Sobre deploy e contexto seguro

### Vercel

Para uso geral via navegador, a Vercel resolve a parte de HTTPS.

### Torre / PC dedicado

Para a torre, o melhor caminho tende a ser:

- software rodando localmente no PC dedicado
- TV ligada por HDMI
- camera conectada ao mesmo PC

Isso tambem facilita usar:

- `localhost`
- kiosk mode
- funcionamento offline

---

## Decisao de produto atual

### Nao misturar cedo demais

Neste momento, o caminho correto e:

- nao fundir arquitetura de torre dentro do sistema principal cedo demais
- manter a iniciativa da torre como um modulo ou trilha separada
- continuar evoluindo o MVP de tablet como ferramenta comercial

### O que isso significa na pratica

Hoje:

- desenvolver e testar no tablet
- melhorar algoritmo e narrativa comercial
- validar valor percebido

Depois:

- migrar o mesmo nucleo logico para a torre
- trocar somente os adaptadores de hardware e interface

---

## Perguntas que seguem em aberto para o futuro

Quando a torre entrar em fase de implementacao real, ainda sera necessario definir:

- especificacao final do PC dedicado
- modelo exato da camera
- resolucao e orientacao final da TV
- como sera o kiosk mode
- se o software sera PWA, app desktop empacotado ou browser local controlado
- estrategia de sincronizacao / armazenamento dos tokens
- formato final do resultado mostrado ao vendedor

---

## Resumo executivo

### O que ja esta claro

- o tablet nao foi tempo perdido
- o desenvolvimento atual pode ser reaproveitado
- o produto final da torre deve ter PC dedicado
- o sistema principal e o produto da torre precisam continuar conceitualmente separados por enquanto

### Direcao correta

- seguir evoluindo o **modo demonstracao no tablet**
- preservar o codigo de forma modular
- adiar o acoplamento forte com a torre ate existir hardware real

### Regra de ouro

Tudo o que for feito agora deve responder a esta pergunta:

> "Isso faz parte do cerebro reaproveitavel do produto, ou e apenas detalhe do hardware atual?"

Se for "cerebro", vale investir.
Se for detalhe temporario do tablet, deve ficar isolado.
