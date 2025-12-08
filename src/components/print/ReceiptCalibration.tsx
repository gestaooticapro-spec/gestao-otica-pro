export function ReceiptCalibration() {
    // Gera linhas a cada 10mm para ajudar a medir
    const rulers = Array.from({ length: 15 }).map((_, i) => (i + 1) * 10)

    return (
        <div className="relative w-[210mm] h-[148mm] bg-white text-black font-sans text-[10px] overflow-hidden border border-gray-300">
            
            {/* Título de Ajuda */}
            <div className="absolute top-2 left-2 font-bold text-red-600">
                MODO CALIBRAGEM (Imprima em escala 100%)
            </div>

            {/* RÉGUA VERTICAL (Eixo Y) */}
            {rulers.map(mm => (
                <div key={`y-${mm}`} className="absolute left-0 w-full border-t border-gray-400 flex items-center" style={{ top: `${mm}mm` }}>
                    <span className="bg-white pr-1 text-xs font-bold">{mm}mm</span>
                </div>
            ))}

            {/* RÉGUA HORIZONTAL (Eixo X) - Apenas alguns pontos chave */}
            {[20, 40, 60, 80, 100, 120, 140, 160, 180, 200].map(mm => (
                <div key={`x-${mm}`} className="absolute top-0 h-full border-l border-gray-200" style={{ left: `${mm}mm` }}>
                    <span className="bg-white pt-1 text-[8px]">{mm}</span>
                </div>
            ))}

            {/* SIMULAÇÃO DOS DADOS (Alvos) */}
            {/* Aqui tento acertar onde seus campos estão. Se errar, você me diz o quanto errei. */}

            {/* 1. ALVO: NOME DO CLIENTE */}
            <div className="absolute top-[48mm] left-[35mm] border border-red-500 text-red-600 px-1 bg-white/50">
                ALVO: NOME CLIENTE (Top:48mm / Left:35mm)
            </div>

            {/* 2. ALVO: VALOR R$ */}
            <div className="absolute top-[60mm] left-[80mm] border border-blue-500 text-blue-600 px-1 bg-white/50">
                VALOR (Top:60mm)
            </div>

            {/* 3. ALVO: CHECKBOXES (Tentativa) */}
            <div className="absolute left-[142mm] border-l border-green-500 pl-1" style={{ top: '65mm', height: '40mm' }}>
                <div className="absolute top-0 -left-1">├ 65mm (Prestação)</div>
                <div className="absolute top-[7mm] -left-1">├ 72mm (À Vista)</div>
                <div className="absolute top-[14mm] -left-1">├ 79mm (Cheque)</div>
                <div className="absolute top-[21mm] -left-1">├ 86mm (Dinheiro)</div>
                <div className="absolute top-[28mm] -left-1">├ 93mm (Cartão)</div>
                <div className="absolute top-[35mm] -left-1">├ 100mm (Pix)</div>
            </div>

            {/* 4. ALVO: DATA */}
            <div className="absolute top-[60mm] left-[175mm] w-[30mm] border border-purple-500 text-purple-600 text-center bg-white/50">
                DATA
            </div>

        </div>
    )
}