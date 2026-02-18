# Design System 2.0: Dark Glassmorphism & Harmonia Visual

Documento de referência para a padronização visual da aplicação, focando no estilo "Dark Glassmorphism" e na harmonia de cores para ações.

## 1. Filosofia Visual (Dark Glassmorphism)
O objetivo é criar uma interface moderna, profunda e elegante, utilizando camadas translúcidas sobre um fundo escuro e rico.

### Base da Tela (Background)
Toda tela deve seguir esta estrutura de camadas para garantir profundidade:

*   **Cor Base:** `bg-slate-950`
*   **Imagem de Fundo:** Imagem texturizada (ex: `/dashboard.jpg`) com baixa opacidade (`opacity-40`) e blur (`blur-[2px]`).
*   **Overlay Gradiente:** Um gradiente para suavizar a imagem e garantir contraste (`bg-gradient-to-b from-slate-950/50 via-slate-950/70 to-slate-950/95`).

### Containers (Glass)
Elementos que agrupa conteúdo (Cards, Tabelas, Paineis) devem parecer vidro fumê:

*   **Background:** `bg-white/5` ou `bg-slate-900/40`.
*   **Borda:** `border border-white/10` (fina e sutil).
*   **Efeito:** `backdrop-blur-md` (desfoque do que está atrás).
*   **Sombra:** `shadow-xl` (para separar do fundo).
*   **Arredondamento:** `rounded-xl` ou `rounded-2xl`.

## 2. Padronização de Cores (Ações & Feedback)
Para manter a harmonia cognitiva, as cores têm significados estritos. Não misture.

### 🟣 Primária / Navegação / Marca: INDIGO
Use para elementos estruturais, navegação, abas ativas e identidade principal.

*   **Cores:** `text-indigo-400`, `bg-indigo-500/20`, `border-indigo-500/30`.
*   **Exemplos:** Ícones do Menu, Botões de "Ver Detalhes", Links, Títulos de Seção.

### 🟢 Confirmação / Sucesso / Positivo: EMERALD
Use para ações que finalizam, salvam, adicionam ou indicam status positivo (Pago, Entregue).

*   **Cores:** `text-emerald-400`, `bg-emerald-600/20`, `border-emerald-500/50`.
*   **Exemplos:** Botão "Salvar", Botão "Adicionar Item", Status "Pago", Mensagens de Sucesso.

### 🟠 Atenção / Edição / Pendente: AMBER
Use para ações de modificação, alertas não-críticos ou status transitórios.

*   **Cores:** `text-amber-300`, `bg-amber-500/20`, `border-amber-500/30`.
*   **Exemplos:** Botão "Editar", Status "Pendente", Alertas de Estoque Baixo, Abas de "Novos".

### 🔴 Destrutivo / Cancelar / Erro: RED / ROSE
Use para ações perigosas, remoção ou erros.

*   **Cores:** `text-red-400` ou `rose-400`, `bg-red-500/10`.
*   **Exemplos:** Botão "Excluir", Botão "Sair", Mensagens de Erro, Status "Vencido".

### ⚪ Neutro / Secundário: SLATE / WHITE
Use para ações secundárias, cancelamento seguro ou informações gerais.

*   **Cores:** `text-slate-400`, `bg-white/5`, `hover:bg-white/10`.
*   **Exemplos:** Botão "Voltar", Botão "Cancelar" (sem risco), Textos descritivos.

## 3. Padrões de Telas (Guideline)
Como aplicar o estilo em diferentes tipos de interface.

### A. Telas de Listagem (Tabelas)
*   **Header da Tabela:** Deve ser opaco para não misturar com o conteúdo ao rolar.
    *   Use: `bg-[#0f172a] shadow-md sticky top-0 z-20`.
*   **Linhas:**
    *   Hover: `hover:bg-white/5 transition-colors`.
    *   Bordas entre linhas: `divide-y divide-white/5`.
*   **Texto:**
    *   Cabeçalho: `text-[10px] text-slate-400 uppercase font-bold tracking-wider`.
    *   Células: `text-sm text-slate-200`.

### B. Telas de Formulário / Edição
*   **Inputs:**
    *   Bg: `bg-slate-900/50`.
    *   Borda: `border border-white/10`.
    *   Foco: `focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50`.
    *   Placeholder: `placeholder:text-slate-600`.
*   **Labels:** `text-sm font-medium text-slate-300`.

### C. Modais / Dialogs
*   **Overlay:** `bg-black/80 backdrop-blur-sm` (Escurece bem o fundo para focar no modal).
*   **Painel:** Segue o padrão Glass (`bg-slate-900` com borda `white/10`).
*   **Header do Modal:** Título claro (`text-lg font-bold text-slate-100`) com botão de fechar (X) discreto.

## 4. Tipografia
*   **Fonte:** Inter (Padrão do Tailwind).
*   **Títulos:** Geralmente `font-bold text-slate-100`.
*   **Subtítulos:** `text-slate-400 text-sm`.
*   **Valores Monetários:** `font-mono` ou `font-bold` com cor de destaque (ex: `text-emerald-400` para receitas).

Use este guia para garantir que todas as novas telas ou refatorações mantenham a consistência visual "Premium" da aplicação.
