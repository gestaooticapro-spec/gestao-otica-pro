// ARQUIVO: src/components/cadastros/ImportacaoLentesInterface.tsx
'use client'

import { useState, useTransition, useRef } from 'react'
import { UploadCloud, FileText, ArrowRight, Save, Loader2, CheckCircle, Calculator } from 'lucide-react'
import { processarImportacaoLentes, type LenteImportada } from '@/lib/actions/import.actions'

// Parser simples de CSV
const parseCSV = (text: string) => {
    const lines = text.split('\n').filter(l => l.trim() !== '')
    const headers = lines[0].split(';').map(h => h.trim().replace(/"/g, ''))
    
    const separator = headers.length > 1 ? ';' : ','
    const finalHeaders = lines[0].split(separator).map(h => h.trim().replace(/"/g, ''))

    const data = lines.slice(1).map(line => {
        const regex = new RegExp(`(?:${separator}|\\r?\\n|^)(?:"([^"]*)"|([^"${separator}\\r\\n]*))`, 'gi');
        const row: string[] = []
        let matches
        while ((matches = regex.exec(line)) !== null) {
            if (matches[1] !== undefined || matches[2] !== undefined) {
                 row.push((matches[1] || matches[2] || '').trim())
            }
        }
        if (row.length > finalHeaders.length) row.shift() 
        return row
    })
    return { headers: finalHeaders, data }
}

const formatMoney = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export default function ImportacaoLentesInterface({ storeId }: { storeId: number }) {
    const [step, setStep] = useState(1)
    const [csvData, setCsvData] = useState<{ headers: string[], data: string[][] } | null>(null)
    const [fileName, setFileName] = useState('')
    const [isDragging, setIsDragging] = useState(false)
    
    const [mapping, setMapping] = useState({
        nome: -1,
        linha: -1,
        material: -1,
        tipo: -1,
        valor: -1
    })

    const [config, setConfig] = useState({
        marcaPadrao: '',
        tipoTabela: 'venda' as 'venda' | 'custo',
        fator: 40,
        isPar: true
    })

    const [previewItens, setPreviewItens] = useState<LenteImportada[]>([])
    const [isSaving, startTransition] = useTransition()
    const [result, setResult] = useState<any>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)

    const processFile = (file: File) => {
        if (file) {
            setFileName(file.name)
            const reader = new FileReader()
            reader.onload = (evt) => {
                const text = evt.target?.result as string
                const parsed = parseCSV(text)
                setCsvData(parsed)
                setStep(2)
            }
            reader.readAsText(file)
        }
    }

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (file) processFile(file)
    }

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setIsDragging(true)
    }

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setIsDragging(false)
    }

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setIsDragging(false)
        
        const file = e.dataTransfer.files?.[0]
        if (file && file.name.toLowerCase().endsWith('.csv')) {
            processFile(file)
        } else {
            alert('Por favor, solte um arquivo CSV válido.')
        }
    }

    const handleGeneratePreview = () => {
        if (!csvData) return
        if (mapping.valor === -1 || mapping.nome === -1) {
            alert("É obrigatório mapear pelo menos a coluna de Nome e Valor.")
            return
        }
        if (!config.marcaPadrao) {
            alert("Digite a marca padrão para estas lentes.")
            return
        }

        const itensProcessados: LenteImportada[] = []

        csvData.data.forEach(row => {
            const nomeRaw = row[mapping.nome] || ''
            const linhaRaw = mapping.linha > -1 ? row[mapping.linha] : ''
            const matRaw = mapping.material > -1 ? row[mapping.material] : ''
            const tipoRaw = mapping.tipo > -1 ? row[mapping.tipo] : 'Visão Simples'
            
            let valorRawStr = row[mapping.valor] || '0'
            valorRawStr = valorRawStr.replace(/[R$\s.]/g, '').replace(',', '.')
            let valorBase = parseFloat(valorRawStr) || 0

            if (config.isPar) {
                valorBase = valorBase / 2
            }

            let custoFinal = 0
            let vendaFinal = 0

            if (config.tipoTabela === 'venda') {
                vendaFinal = valorBase
                custoFinal = valorBase * (config.fator / 100)
            } else {
                custoFinal = valorBase
                vendaFinal = valorBase * config.fator
            }

            const partesNome = [config.marcaPadrao, linhaRaw, nomeRaw, matRaw].filter(Boolean)
            const nomeCompleto = [...new Set(partesNome)].join(' ')

            if (nomeRaw && valorBase > 0) {
                itensProcessados.push({
                    nome_completo: nomeCompleto,
                    marca: config.marcaPadrao,
                    linha: linhaRaw || '-',
                    material: matRaw || '-',
                    tipo_lente: tipoRaw,
                    preco_custo: parseFloat(custoFinal.toFixed(2)),
                    preco_venda: parseFloat(vendaFinal.toFixed(2)),
                    detalhes: {}
                })
            }
        })

        setPreviewItens(itensProcessados)
        setStep(3)
    }

    const handleConfirm = () => {
        startTransition(async () => {
            const res = await processarImportacaoLentes(storeId, previewItens)
            setResult(res)
            setStep(4)
        })
    }

    if (step === 4 && result) {
        return (
            <div className="flex flex-col items-center justify-center h-full space-y-6 animate-in zoom-in">
                <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center text-green-600">
                    <CheckCircle className="h-10 w-10" />
                </div>
                <h2 className="text-2xl font-bold text-gray-800">Importação Concluída!</h2>
                <div className="bg-white p-6 rounded-lg shadow border border-gray-200 w-full max-w-md text-sm">
                    <div className="flex justify-between py-2 border-b">
                        <span>Lentes Processadas:</span>
                        <strong>{result.processed}</strong>
                    </div>
                    <div className="flex justify-between py-2 border-b text-green-600">
                        <span>Novas Criadas:</span>
                        <strong>{result.created}</strong>
                    </div>
                    <div className="flex justify-between py-2 border-b text-blue-600">
                        <span>Preços Atualizados:</span>
                        <strong>{result.updated}</strong>
                    </div>
                    {result.errors.length > 0 && (
                        <div className="mt-4 p-3 bg-red-50 text-red-700 rounded text-xs">
                            <strong>Erros ({result.errors.length}):</strong>
                            <ul className="list-disc pl-4 mt-1">
                                {result.errors.slice(0, 5).map((e: string, i: number) => <li key={i}>{e}</li>)}
                            </ul>
                        </div>
                    )}
                </div>
                <button onClick={() => window.location.href = `/dashboard/loja/${storeId}/cadastros`} className="bg-gray-800 text-white px-6 py-3 rounded-lg font-bold hover:bg-black">
                    Ir para Catálogo
                </button>
            </div>
        )
    }

    return (
        <div className="flex flex-col h-full bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            
            <div className="bg-gray-50 p-4 border-b border-gray-200 flex justify-between items-center">
                <h1 className="font-bold text-lg text-gray-700 flex items-center gap-2">
                    <FileText className="h-5 w-5 text-blue-600" /> Importador de Lentes (CSV)
                </h1>
                <div className="flex gap-2">
                    <StepBadge num={1} active={step===1} label="Arquivo" />
                    <StepBadge num={2} active={step===2} label="Mapeamento" />
                    <StepBadge num={3} active={step===3} label="Confirmação" />
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
                
                {step === 1 && (
                    <div 
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        className={`h-full flex flex-col items-center justify-center border-2 border-dashed rounded-xl p-10 transition-all duration-200
                          ${isDragging ? 'border-blue-500 bg-blue-50 scale-[1.01]' : 'border-gray-300 bg-gray-50/50 hover:bg-blue-50'}
                        `}
                    >
                        <div className={`p-4 rounded-full mb-4 transition-transform ${isDragging ? 'bg-blue-200 scale-110' : 'bg-transparent'}`}>
                            <UploadCloud className={`h-16 w-16 ${isDragging ? 'text-blue-600' : 'text-gray-300'}`} />
                        </div>
                        
                        <label className="cursor-pointer text-center">
                            <span className="text-lg font-bold text-gray-700 block mb-2">
                                {isDragging ? 'Pode soltar o arquivo!' : 'Arraste e solte aqui'}
                            </span>
                            <span className="block text-sm text-gray-500 mb-4">ou</span>
                            <span className="bg-blue-600 text-white px-6 py-3 rounded-lg font-bold hover:bg-blue-700 shadow-md inline-block">
                                Selecionar Arquivo CSV
                            </span>
                            <input 
                                ref={fileInputRef}
                                type="file" 
                                accept=".csv" 
                                className="hidden" 
                                onChange={handleFileChange} 
                            />
                        </label>
                        <p className="mt-6 text-sm text-gray-400">
                            Recomendado: Arquivo separado por ponto-e-vírgula (;) ou vírgula.
                        </p>
                    </div>
                )}

                {step === 2 && csvData && (
                    <div className="space-y-8 animate-in slide-in-from-right-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
                                <h3 className="font-bold text-gray-800 mb-4 border-b pb-2">1. O que é cada coluna?</h3>
                                <div className="space-y-3">
                                    <MappingSelect 
                                        label="Tratamento (Obrigatório)" 
                                        value={mapping.nome} 
                                        onChange={(v: string) => setMapping({...mapping, nome: parseInt(v)})} 
                                        options={csvData.headers} 
                                    />
                                    <MappingSelect 
                                        label="Coluna de Valor (Obrigatório)" 
                                        value={mapping.valor} 
                                        onChange={(v: string) => setMapping({...mapping, valor: parseInt(v)})} 
                                        options={csvData.headers} 
                                    />
                                    <MappingSelect 
                                        label="Linha (Ex: Varilux)" 
                                        value={mapping.linha} 
                                        onChange={(v: string) => setMapping({...mapping, linha: parseInt(v)})} 
                                        options={csvData.headers} 
                                    />
                                    <MappingSelect 
                                        label="Material" 
                                        value={mapping.material} 
                                        onChange={(v: string) => setMapping({...mapping, material: parseInt(v)})} 
                                        options={csvData.headers} 
                                    />
                                    <MappingSelect 
                                        label="Tipo (Multifocal/Visão)" 
                                        value={mapping.tipo} 
                                        onChange={(v: string) => setMapping({...mapping, tipo: parseInt(v)})} 
                                        options={csvData.headers} 
                                    />
                                </div>
                            </div>

                            <div className="bg-blue-50 p-5 rounded-xl border border-blue-100 shadow-sm">
                                <h3 className="font-bold text-blue-900 mb-4 border-b border-blue-200 pb-2 flex items-center gap-2">
                                     <Calculator className="h-4 w-4" /> 2. Regras de Preço
                                </h3>
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Marca Padrão</label>
                                        <input type="text" value={config.marcaPadrao} onChange={e => setConfig({...config, marcaPadrao: e.target.value})} className="w-full rounded border-gray-300 h-9 px-2" placeholder="Ex: Hoya" />
                                    </div>
                                    <div className="flex items-center gap-2 bg-white p-2 rounded border border-gray-200">
                                        <input type="checkbox" checked={config.isPar} onChange={e => setConfig({...config, isPar: e.target.checked})} className="rounded text-blue-600 focus:ring-blue-500" />
                                        <span className="text-sm font-medium text-gray-700">Tabela é por PAR (Dividir valor por 2)</span>
                                    </div>
                                    <div className="border-t border-blue-200 pt-3">
                                        <p className="text-sm font-bold text-blue-800 mb-2">O valor no CSV é:</p>
                                        <div className="flex gap-4 mb-3">
                                            <label className="flex items-center gap-2 cursor-pointer">
                                                <input type="radio" name="tipoTabela" checked={config.tipoTabela === 'venda'} onChange={() => setConfig({...config, tipoTabela: 'venda'})} />
                                                <span className="text-sm">Preço de Venda</span>
                                            </label>
                                            <label className="flex items-center gap-2 cursor-pointer">
                                                <input type="radio" name="tipoTabela" checked={config.tipoTabela === 'custo'} onChange={() => setConfig({...config, tipoTabela: 'custo'})} />
                                                <span className="text-sm">Preço de Custo</span>
                                            </label>
                                        </div>
                                        {config.tipoTabela === 'venda' ? (
                                            <div>
                                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Margem de Custo (%)</label>
                                                <div className="flex items-center gap-2">
                                                    <input type="number" value={config.fator} onChange={e => setConfig({...config, fator: parseFloat(e.target.value)})} className="w-24 rounded border-gray-300 h-9 px-2 text-right" />
                                                    <span className="text-xs text-gray-500">Ex: Se venda é 100 e margem 40%, custo será 40.</span>
                                                </div>
                                            </div>
                                        ) : (
                                            <div>
                                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Markup (Multiplicador)</label>
                                                <div className="flex items-center gap-2">
                                                    <input type="number" value={config.fator} onChange={e => setConfig({...config, fator: parseFloat(e.target.value)})} className="w-24 rounded border-gray-300 h-9 px-2 text-right" />
                                                    <span className="text-xs text-gray-500">Ex: Se custo é 100 e markup 2.5, venda será 250.</span>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="flex justify-end pt-4">
                            <button onClick={handleGeneratePreview} className="bg-blue-600 text-white px-8 py-3 rounded-lg font-bold hover:bg-blue-700 shadow-md flex items-center gap-2">
                                Gerar Prévia <ArrowRight className="h-5 w-5" />
                            </button>
                        </div>
                    </div>
                )}

                {step === 3 && (
                    <div className="flex flex-col h-full animate-in slide-in-from-bottom-4">
                        <div className="mb-4 flex justify-between items-center">
                            <h3 className="font-bold text-gray-800">Confira os dados antes de importar ({previewItens.length} itens)</h3>
                            <button onClick={handleConfirm} disabled={isSaving} className="bg-green-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-green-700 shadow-md flex items-center gap-2 disabled:opacity-50">
                                {isSaving ? <Loader2 className="h-5 w-5 animate-spin"/> : <Save className="h-5 w-5" />}
                                Confirmar Importação
                            </button>
                        </div>
                        <div className="flex-1 overflow-auto border border-gray-300 rounded-lg">
                            <table className="w-full text-left text-sm">
                                <thead className="bg-gray-100 text-gray-600 font-bold uppercase text-xs sticky top-0">
                                    <tr>
                                        <th className="p-3 border-b">Nome Gerado</th>
                                        <th className="p-3 border-b">Marca</th>
                                        <th className="p-3 border-b">Linha</th>
                                        <th className="p-3 border-b">Material</th>
                                        <th className="p-3 border-b text-right bg-blue-50">Custo (Unit)</th>
                                        <th className="p-3 border-b text-right bg-green-50">Venda (Unit)</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {previewItens.map((item, i) => (
                                        <tr key={i} className="hover:bg-gray-50">
                                            <td className="p-3 font-medium text-gray-800">{item.nome_completo}</td>
                                            <td className="p-3 text-gray-500">{item.marca}</td>
                                            <td className="p-3 text-gray-500">{item.linha}</td>
                                            <td className="p-3 text-gray-500">{item.material}</td>
                                            <td className="p-3 text-right bg-blue-50/30 text-blue-800 font-mono">{formatMoney(item.preco_custo)}</td>
                                            <td className="p-3 text-right bg-green-50/30 text-green-800 font-bold font-mono">{formatMoney(item.preco_venda)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <div className="mt-4">
                            <button onClick={() => setStep(2)} className="text-gray-500 hover:text-gray-800 underline text-sm">Voltar e ajustar regras</button>
                        </div>
                    </div>
                )}

            </div>
        </div>
    )
}

function StepBadge({ num, active, label }: { num: number, active: boolean, label: string }) {
    return (
        <div className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold ${active ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'}`}>
            <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] ${active ? 'bg-white text-blue-600' : 'bg-gray-400 text-white'}`}>{num}</span>
            {label}
        </div>
    )
}

function MappingSelect({ label, value, onChange, options }: any) {
    return (
        <div className="flex flex-col">
            <label className="text-xs font-bold text-gray-600 mb-1">{label}</label>
            <select value={value} onChange={e => onChange(e.target.value)} className="rounded border-gray-300 text-sm h-9">
                <option value={-1}>-- Ignorar / Não tem --</option>
                {options.map((opt: string, i: number) => (
                    <option key={i} value={i}>{opt}</option>
                ))}
            </select>
        </div>
    )
}