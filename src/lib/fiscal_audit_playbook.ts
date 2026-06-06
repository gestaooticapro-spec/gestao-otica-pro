export type FiscalPlaybookCategory =
    | "natureza_cfop"
    | "natureza_observacao"
    | "csosn_regime"
    | "frete_inconsistente"
    | "finalidade_tipo_nf"
    | "sem_cobranca_pagamento"
    | "geral";

type PlaybookEntry = {
    category: FiscalPlaybookCategory;
    keywords: string[];
    problem: string;
    impact: string;
    solutionA: string;
    solutionB: string;
    confirmWithAccountant: string;
};

export type PlaybookResolution = {
    category: FiscalPlaybookCategory;
    problem: string;
    impact: string;
    solutionA: string;
    solutionB: string;
    confirmWithAccountant: string;
};

const PLAYBOOK: PlaybookEntry[] = [
    {
        category: "natureza_cfop",
        keywords: ["natureza", "cfop", "incompat", "incoer"],
        problem: "Natureza da operacao e CFOP estao incoerentes.",
        impact: "A nota pode ser rejeitada ou classificada com tributacao incorreta.",
        solutionA: "Se a intencao for venda: use natureza de venda e CFOP de venda, como 5102/6102.",
        solutionB: "Se a intencao for remessa para demonstracao: use natureza de remessa e CFOP 5912/6912.",
        confirmWithAccountant: "Confirmar se a finalidade real da operacao e venda ou remessa para demonstracao.",
    },
    {
        category: "natureza_observacao",
        keywords: ["natureza", "observa", "infcpl", "contradit"],
        problem: "Natureza da operacao e observacao complementar se contradizem.",
        impact: "Pode gerar interpretacao fiscal errada e questionamento em auditoria.",
        solutionA: "Manter a natureza atual e reescrever a observacao para o mesmo contexto.",
        solutionB: "Manter a observacao atual e ajustar a natureza para refletir a finalidade real.",
        confirmWithAccountant: "Validar o texto fiscal minimo obrigatorio para esta operacao.",
    },
    {
        category: "csosn_regime",
        keywords: ["csosn", "cst", "regime", "simples nacional", "crt"],
        problem: "CSOSN/CST pode estar incompativel com o regime tributario.",
        impact: "Risco de tributacao errada e rejeicao na autorizacao.",
        solutionA: "Confirmar CRT da empresa e ajustar CSOSN/CST conforme a operacao.",
        solutionB: "Se houver duvida, manter a nota em revisao ate definicao contabil.",
        confirmWithAccountant: "Confirmar CSOSN/CST correto para regime e finalidade desta nota.",
    },
    {
        category: "frete_inconsistente",
        keywords: ["frete", "modfrete", "transport", "transportador"],
        problem: "Dados de frete/transporte estao incoerentes entre si.",
        impact: "A nota pode ficar inconsistente para transporte e fiscalizacao.",
        solutionA: "Sem transporte: usar modFrete 9 e remover dados de transportadora.",
        solutionB: "Com transporte: definir modFrete correto e completar dados obrigatorios.",
        confirmWithAccountant: "Confirmar regra de frete para esta natureza e destino da operacao.",
    },
    {
        category: "finalidade_tipo_nf",
        keywords: ["finalidade", "tpnf", "entrada", "saida"],
        problem: "Finalidade e tipo da NF-e podem nao refletir a operacao real.",
        impact: "Enquadramento fiscal incorreto e risco de rejeicao.",
        solutionA: "Ajustar finalidade da NF-e para normal/devolucao/ajuste/complementar conforme o caso.",
        solutionB: "Revisar tpNF, entrada ou saida, para coerencia com natureza e CFOP.",
        confirmWithAccountant: "Confirmar finalidade legal correta antes da emissao.",
    },
    {
        category: "sem_cobranca_pagamento",
        keywords: ["sem cobranca", "pagamento", "meio_pagamento", "brinde", "bonificacao", "doacao"],
        problem: "Indicacao de cobranca/pagamento pode divergir da finalidade da operacao.",
        impact: "Risco de enquadramento como venda quando deveria ser sem cobranca.",
        solutionA: "Operacao sem cobranca: manter meio de pagamento neutro e observacao fiscal explicita.",
        solutionB: "Operacao com cobranca: ajustar natureza/CFOP/condicao para cenario de venda.",
        confirmWithAccountant: "Confirmar tratamento contabil para cobranca x sem cobranca.",
    },
];

const FALLBACK: PlaybookResolution = {
    category: "geral",
    problem: "Ha inconsistencias fiscais que exigem revisao antes da emissao.",
    impact: "Risco de rejeicao ou emissao com classificacao fiscal incorreta.",
    solutionA: "Manter a finalidade atual e alinhar natureza, CFOP e observacoes.",
    solutionB: "Se a finalidade estiver errada, trocar a finalidade e revisar todos os campos fiscais relacionados.",
    confirmWithAccountant: "Confirmar classificacao fiscal final antes de emitir.",
};

function normalize(text: string) {
    return String(text || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
}

export function resolvePlaybook(texts: string[]): PlaybookResolution {
    const corpus = normalize(texts.filter(Boolean).join(" "));
    let best: PlaybookEntry | null = null;
    let bestScore = 0;

    for (const entry of PLAYBOOK) {
        let score = 0;
        for (const keyword of entry.keywords) {
            if (corpus.includes(normalize(keyword))) score += 1;
        }
        if (score > bestScore) {
            bestScore = score;
            best = entry;
        }
    }

    if (!best || bestScore === 0) return FALLBACK;

    return {
        category: best.category,
        problem: best.problem,
        impact: best.impact,
        solutionA: best.solutionA,
        solutionB: best.solutionB,
        confirmWithAccountant: best.confirmWithAccountant,
    };
}
