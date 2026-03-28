import os

file_path = "src/components/operator-menu/OperatorMenuAtendimento.tsx"

with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

def repl(target, replace_with):
    global content
    if target in content:
        content = content.replace(target, replace_with)
    else:
        print(f"Target not found: {target.strip()[:60]}...")

# 1. State
state_target = """    const { openParcelaModal, openCustomerHistoryModal } = useModals();
    const { preference } = useBackgroundPreference();
    const [isSearchOpen, setIsSearchOpen] = useState(false);

    return ("""

state_replace = """    const { openParcelaModal, openCustomerHistoryModal } = useModals();
    const { preference } = useBackgroundPreference();
    const [isSearchOpen, setIsSearchOpen] = useState(false);

    const [tooltip, setTooltip] = useState<{ visible: boolean, x: number, y: number, text: string }>({ visible: false, x: 0, y: 0, text: '' });
    const hoverTimeout = useRef<NodeJS.Timeout | null>(null);

    const handleHover = (e: React.MouseEvent, text: string) => {
        const x = e.clientX;
        const y = e.clientY;
        if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
        hoverTimeout.current = setTimeout(() => {
            setTooltip({ visible: true, x, y, text });
        }, 1200);
    };
    const handleMove = (e: React.MouseEvent) => {
        if (tooltip.visible) {
            setTooltip(prev => ({ ...prev, x: e.clientX, y: e.clientY }));
        }
    };
    const handleLeave = () => {
        if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
        setTooltip(prev => ({ ...prev, visible: false }));
    };

    return ("""

repl(state_target, state_replace)

# 2. Imports
import_target = "import { useState, useEffect } from 'react';"
import_replace = "import { useState, useEffect, useRef } from 'react';"
repl(import_target, import_replace)

# 3. Tooltip DOM
dom_target = """        </div >
    );
}"""
dom_replace = """            {/* Tooltip personalizado */}
            {tooltip.visible && (
                <div
                    className="fixed z-[100] bg-slate-900 text-slate-200 text-xs leading-relaxed px-4 py-3 rounded-xl shadow-[0_0_30px_rgba(0,0,0,1)] border border-slate-700 pointer-events-none max-w-[280px] transition-opacity duration-150 backdrop-blur-md font-medium"
                    style={{ left: tooltip.x + 15, top: tooltip.y + 15 }}
                >
                    {tooltip.text}
                </div>
            )}
        </div >
    );
}"""
repl(dom_target, dom_replace)

# 4. Buttons
buttons = {
    "onClick={() => setIsSearchOpen(true)}": "Inicie um atendimento completo baseado no histórico do cliente. Veja compras anteriores, dados de visão (receita/DNP), preferências e ofereça uma consultoria super personalizada.",
    "onClick={() => onNavigate(`/dashboard/loja/${storeId}/atendimento`)}": "Fluxo tradicional para clientes que trouxeram prescrição do oftalmologista. Venda de armação, lentes oftálmicas, tratamentos e serviços laboratoriais.",
    "onClick={() => onNavigate(`/dashboard/loja/${storeId}/pdv-express`)}": "Venda expressa avulsa. Ideal para óculos de sol, caixa de lentes de contato, líquidos e acessórios diversos de prateleira.",
    "onClick={() => onNavigate(`/dashboard/loja/${storeId}/entrega`)}": "Finalização e entrega do óculos pronto. Localize o serviço na gaveta, confira eixos/tratamentos, conclua pagamentos e resgate as assinaturas.",
    "onClick={() => openParcelaModal()}": "Recebimento local financeiro para clientes com crediário próprio ou que deixaram carnês/boletos com pagamentos em aberto.",
    "onClick={() => onNavigate(`/dashboard/loja/${storeId}/assistencia`)}": "Entrada técnica de serviços na ótica: alinhamentos, consertos gerais, troca de plaquetas, parafusos, soldas e ajustes corretivos.",
    "onClick={() => onNavigate(`/dashboard/loja/${storeId}/clientes`)}": "Criação de nova ficha de paciente, atualização direta de número de celular/endereço e consulta minuciosa à documentação de receitas.",
    "onClick={() => onNavigate(`/dashboard/loja/${storeId}/consultas`)}": "O olho de Thundera. Pesquisa central para localizar instantaneamente qualquer cliente por Nome, CPF, Telefone ou número de OS.",
    "onClick={() => openCustomerHistoryModal()}": "Acesso rápido e integrado para iniciar uma conversa ativa com qualquer cliente via WhatsApp Web usando mensagens padronizadas."
}

for click_code, tooltip_text in buttons.items():
    button_target = f"""                                    {click_code}
                                    className="group"""
    
    button_replace = f"""                                    {click_code}
                                    onMouseEnter={{(e) => handleHover(e, "{tooltip_text}")}}
                                    onMouseMove={{handleMove}}
                                    onMouseLeave={{handleLeave}}
                                    className="group"""
    
    repl(button_target, button_replace)

    # Some use fewer indentations (e.g. 28 spaces instead of 36)
    button_target2 = f"""                            {click_code}
                            className="group"""
    
    button_replace2 = f"""                            {click_code}
                            onMouseEnter={{(e) => handleHover(e, "{tooltip_text}")}}
                            onMouseMove={{handleMove}}
                            onMouseLeave={{handleLeave}}
                            className="group"""
    repl(button_target2, button_replace2)

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)

print("Patching complete.")
