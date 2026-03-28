const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src/components/operator-menu/OperatorMenuAtendimento.tsx');
let content = fs.readFileSync(filePath, 'utf-8');

// 1. Add useRef to imports
if (!content.includes('useRef')) {
    content = content.replace("import { useState, useEffect }", "import { useState, useEffect, useRef }");
}

// 2. Add tooltip state and handlers before return (
const stateHookStr = [
    "    const [tooltip, setTooltip] = useState<{ visible: boolean, x: number, y: number, text: string }>({ visible: false, x: 0, y: 0, text: '' });",
    "    const hoverTimeout = useRef<NodeJS.Timeout | null>(null);",
    "",
    "    const handleHover = (e: React.MouseEvent, text: string) => {",
    "        const x = e.clientX;",
    "        const y = e.clientY;",
    "        if (hoverTimeout.current) clearTimeout(hoverTimeout.current);",
    "        hoverTimeout.current = setTimeout(() => {",
    "            setTooltip({ visible: true, x, y, text });",
    "        }, 1200);",
    "    };",
    "    const handleMove = (e: React.MouseEvent) => {",
    "        if (tooltip.visible) {",
    "            setTooltip(prev => ({ ...prev, x: e.clientX, y: e.clientY }));",
    "        }",
    "    };",
    "    const handleLeave = () => {",
    "        if (hoverTimeout.current) clearTimeout(hoverTimeout.current);",
    "        setTooltip(prev => ({ ...prev, visible: false }));",
    "    };",
    "",
    "    return ("
].join('\\n');

if (!content.includes("const [tooltip, setTooltip]")) {
    content = content.replace("    return (", stateHookStr);
}

// 3. Add Tooltip DOM before closing </div >
const tooltipDomStr = [
    "            {/* Tooltip personalizado */}",
    "            {tooltip.visible && (",
    "                <div",
    "                    className=\\"fixed z-[100] bg-slate-900 text-slate-200 text-xs leading-relaxed px-4 py-3 rounded-xl shadow-[0_0_30px_rgba(0,0,0,1)] border border-slate-700 pointer-events-none max-w-[280px] transition-opacity duration-150 backdrop-blur-md font-medium\\"",
    "                    style={{ left: tooltip.x + 15, top: tooltip.y + 15 }}",
    "                >",
    "                    {tooltip.text}",
    "                </div>",
    "            )}",
    "        </div >",
    "    );",
    "}"
].join('\\n');

if (!content.includes("Tooltip personalizado")) {
    content = content.replace("        </div >\\n    );\\n}", tooltipDomStr);
}

// 4. Transform buttons
const buttonMap = {
    '/dashboard/loja/\\${storeId}/atendimento': "Fluxo tradicional para clientes que trouxeram prescrição do oftalmologista. Venda de armação, lentes, tratamentos e serviços laboratoriais.",
    '/dashboard/loja/\\${storeId}/pdv-express': "Venda expressa sem laboratório/receitas. Ideal para óculos de sol, lentes de contato avulsas sob medida prévia, líquidos e acessórios de balcão.",
    '/dashboard/loja/\\${storeId}/entrega': "Finalização do ciclo de vendas. Localize o serviço pronto na gaveta, confira eixos/tratamentos, recolha assinaturas e registre a satisfação final.",
    '/dashboard/loja/\\${storeId}/assistencia': "Entrada de serviços de manutenção geral na ótica: alinhamentos, troca de plaquetas, parafusos, soldas, curativos e consertos gerais.",
    '/dashboard/loja/\\${storeId}/clientes': "Criação de nova ficha de paciente, atualização de número de celular/endereço e consulta geral à documentação cadastrada e receitas.",
    '/dashboard/loja/\\${storeId}/consultas': "Pesquisa centralizada de tudo o que acontece na ótica. Procure por nome, CPF, número da ordem de serviço, produto ou telefone e o sistema encontra."
};

const dossieRegex = /onClick=\\{\\(\\)\\s=>\\ssetIsSearchOpen\\(true\\)\\}\\s+className="group/g;
const dossieRepl = 'onClick={() => setIsSearchOpen(true)}\\n                                    onMouseEnter={(e) => handleHover(e, "Inicie um atendimento completo baseado no histórico do cliente. Veja compras anteriores, dados de visão (receita/DNP), preferências e ofereça uma consultoria super personalizada.")}\\n                                    onMouseMove={handleMove}\\n                                    onMouseLeave={handleLeave}\\n                                    className="group';
content = content.replace(dossieRegex, dossieRepl);

const parcelasRegex = /onClick=\\{\\(\\)\\s=>\\sopenParcelaModal\\(\\)\\}\\s+className="group/g;
const parcelasRepl = 'onClick={() => openParcelaModal()}\\n                                onMouseEnter={(e) => handleHover(e, "Recebimento local para clientes com crediário/boleto e vendas com pagamentos em aberto.")}\\n                                onMouseMove={handleMove}\\n                                onMouseLeave={handleLeave}\\n                                className="group';
content = content.replace(parcelasRegex, parcelasRepl);

const wppRegex = /onClick=\\{\\(\\)\\s=>\\sopenCustomerHistoryModal\\(\\)\\}\\s+className="group/g;
const wppRepl = 'onClick={() => openCustomerHistoryModal()}\\n                            onMouseEnter={(e) => handleHover(e, "Canal rápido para iniciar conversa via WhatsApp usando modelos padronizados.")}\\n                            onMouseMove={handleMove}\\n                            onMouseLeave={handleLeave}\\n                            className="group';
content = content.replace(wppRegex, wppRepl);

for (const [route, text] of Object.entries(buttonMap)) {
    // Escape special regex chars in route
    const routeRegexEscaped = route.replace(/\\$/g, '\\\\$').replace(/\\{/g, '\\\\{').replace(/\\}/g, '\\\\}');
    const regex = new RegExp('onClick=\\{\\(\\)\\s=>\\sonNavigate\\(`' + routeRegexEscaped + '`\\)\\}\\s+className="group', 'g');
    
    // Replacement string
    const repl = 'onClick={() => onNavigate(`' + route.replace(/\\\\/g, '') + '`)}\\n                                    onMouseEnter={(e) => handleHover(e, "' + text + '")}\\n                                    onMouseMove={handleMove}\\n                                    onMouseLeave={handleLeave}\\n                                    className="group';
    
    content = content.replace(regex, repl);
}

fs.writeFileSync(filePath, content, 'utf-8');
console.log("Successfully patched OperatorMenuAtendimento.tsx!");
