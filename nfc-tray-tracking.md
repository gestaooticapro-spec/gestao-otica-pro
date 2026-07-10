# Plano de Implementação: Rastreamento de Bandejas via NFC (Digital Twin)

## Visão Geral
A funcionalidade permite o acompanhamento do ciclo de vida das Ordens de Serviço (OS) através de etiquetas NFC físicas coladas nas bandejas do laboratório. 
A bandeja atua como um "gêmeo digital" da OS temporariamente. 
O acesso é feito via URL pública estática gravada na Tag NFC, e a **autenticação é baseada puramente na posse física** da bandeja. Isso possibilita fluxos de integração B2B no futuro, onde laboratórios terceirizados poderão ler a tag e atualizar o status de recebimento sem precisarem de login no Gestão Ótica Pro.

## Tipo de Projeto
**WEB** (Focado em interface Mobile PWA/Touch-friendly)

## Critérios de Sucesso
1. Ler uma tag NFC e abrir a rota específica de "Leitura de Bandeja".
2. Capacidade de vincular uma "Bandeja Vazia" a uma OS ativa.
3. Se a bandeja tiver uma OS vinculada, mostrar de forma contextual a "Próxima Ação" baseada no status (ex: Botão gigante "Confirmar Recebimento de Lente").
4. A tela de NFC não exige login e não possui menus ou elementos da retaguarda do sistema, sendo 100% isolada para evitar exposição de dados indevidos.

## Stack Tecnológico
- **Frontend:** Next.js (App Router), Tailwind CSS.
- **Roteamento:** Rota dinâmica de fácil acesso: `/nfc/[storeId]/bandeja/[trayId]`.
- **Hardware Integrado:** Etiquetas NFC comuns gravadas via app externo com as URLs fixas do sistema.

## Estrutura de Arquivos
- `src/app/nfc/layout.tsx`: Layout isolado do sistema principal, sem sidebars. Focado em mobile.
- `src/app/nfc/[storeId]/bandeja/[trayId]/page.tsx`: Tela de ação contextual da bandeja.
- `src/lib/actions/nfc.actions.ts`: Server Actions para realizar o vínculo e as trocas de status.
- `src/components/nfc/...`: Componentes de UI específicos (ex: botões gigantes de ação).

## Detalhamento de Tarefas

- `[ ]` **Task 1: Modelagem e Banco de Dados**
  - **Agent:** `database-architect`
  - **Skills:** `database-design`
  - **Priority:** P0
  - **Dependencies:** None
  - **INPUT:** Estrutura atual de Lojas (Stores) e OS.
  - **OUTPUT:** Criação da tabela `Trays` (Bandejas) com colunas `id`, `store_id`, `current_os_id` (nulo se vazia) e timestamps.
  - **VERIFY:** Confirmar que o Prisma/Drizzle schema aceita a criação da bandeja sem quebrar relações.

- `[ ]` **Task 2: Tela Especial Mobile (Layout Limpo)**
  - **Agent:** `frontend-specialist`
  - **Skills:** `mobile-design`, `tailwind-patterns`
  - **Priority:** P1
  - **Dependencies:** Task 1
  - **INPUT:** Novo layout `/nfc/layout.tsx`.
  - **OUTPUT:** Uma tela minimalista, com texto legível à distância e botões de grande alvo de toque (Touch Target mínimo 48x48px).
  - **VERIFY:** Abrir a rota no navegador simulando um celular e checar a ergonomia com o polegar.

- `[ ]` **Task 3: Lógica Contextual e Server Actions**
  - **Agent:** `backend-specialist`
  - **Skills:** `api-patterns`
  - **Priority:** P1
  - **Dependencies:** Task 1, Task 2
  - **INPUT:** Interações na tela `/nfc/...`
  - **OUTPUT:** Lógica que avalia: Se `current_os_id` é nulo -> mostra formulário para atrelar número da OS. Se não for nulo -> consulta a OS, analisa o Status atual e renderiza o botão correto de "Avançar Status".
  - **VERIFY:** Clicar no botão na interface e verificar se o histórico da OS ganhou um novo registro com o timestamp correto.

## ✅ Fase X: Verificação Final (Scripts Obrigatórios)
- [ ] Segurança: Validar se a rota `/nfc/` não expõe dados sensíveis de outras lojas (vazamento de dados) - `security_scan.py`.
- [ ] UX Audit: Verificar contraste e tamanho dos botões - `ux_audit.py`.
- [ ] Build & Lint: Código totalmente tipado, compilando sem erros no `npm run build`.
