# Planejamento: Sistema de Etiquetas (Pimaco A4)

Este documento registra a estratégia discutida para a futura implementação do módulo de etiquetas para a Ótica Prisma.

## 🎯 Objetivo
Permitir que o usuário gere etiquetas de produtos para colar em armações e lentes, utilizando folhas A4 adesivas (Padrão Pimaco ou similares) em impressoras jato de tinta/laser comuns.

## ⚙️ Fluxo de Trabalho (Fila de Impressão)
A opção escolhida foi a **Fila de Impressão Centralizada**, que funciona como um "carrinho" de etiquetas:

1. **Adição:** O usuário seleciona produtos no Catálogo ou nas Movimentações do dia e clica em "Adicionar à Fila de Etiquetas".
2. **Revisão:** Em uma tela específica, o usuário vê a lista de produtos acumulados e ajusta a quantidade de etiquetas para cada um.
3. **Configuração da Folha:**
   - Seleção do modelo da folha (ex: Pimaco 6180).
   - **Posição Inicial:** Permite definir em qual etiqueta da folha começar a imprimir (ex: se já usou 10 etiquetas da folha ontem, começa na posição 11 hoje para evitar desperdício).
4. **Geração:** O sistema gera um PDF ou visualização de impressão perfeitamente alinhada com as margens da folha A4.

## 🧩 Lógica de Impressão Sequencial
- O sistema preenche as etiquetas uma após a outra.
- **Exemplo:** 
  - Produto A (10 unidades) -> Etiquetas 1 a 10.
  - Produto B (2 unidades) -> Etiquetas 11 e 12.
  - A impressão continua na mesma folha até o fim da página ou da fila.

## 📋 Pré-requisitos para Início
Para configurar os tamanhos exatos, precisaremos das seguintes medidas do formulário que será adquirido:
- **Código do Fabricante** (ex: Pimaco 6180, 6182, etc).
- **Número de Colunas e Linhas** por folha.
- **Margens** (superior, inferior e lateral).
- **Largura e Altura** de cada etiqueta individual.

---
> [!TIP]
> **Dica de Economia:** Ao usar o campo "Posição Inicial", você nunca perde uma folha. Se a folha estiver pela metade, basta contar quantas etiquetas faltam e dizer ao sistema para começar dali.

> [!NOTE]
> Este plano será utilizado como base técnica assim que os testes com os formulários físicos começarem.
