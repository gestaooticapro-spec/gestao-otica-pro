'use client'

import { useState, useEffect } from 'react'
import { X, Save, AlertTriangle, User, Phone } from 'lucide-react'
import { updateCustomerCriticalData } from '@/lib/actions/customer.actions'
import { usePathname } from 'next/navigation'
import { maskPhone } from '@/lib/phone-mask'

// Helper de Máscaras
const masks = {
    cpf: (value: string) => {
        return value
            .replace(/\D/g, '')
            .replace(/(\d{3})(\d)/, '$1.$2')
            .replace(/(\d{3})(\d)/, '$1.$2')
            .replace(/(\d{3})(\d{1,2})/, '$1-$2')
            .replace(/(-\d{2})\d+?$/, '$1')
    },
    phone: (value: string, normalize = false) => maskPhone(value, normalize)
}

interface UpdateCpfModalProps {
    isOpen: boolean
    onClose: () => void
    onSuccess: () => void
    customerId: number
    customerName: string
    currentCpf?: string
    currentPhone?: string
}

export default function UpdateCpfModal({
    isOpen,
    onClose,
    onSuccess,
    customerId,
    customerName,
    currentCpf = '',
    currentPhone = ''
}: UpdateCpfModalProps) {
    const pathname = usePathname()
    const [cpf, setCpf] = useState('')
    const [phone, setPhone] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')

    // Reset state when modal opens
    useEffect(() => {
        if (isOpen) {
            setCpf(currentCpf ? masks.cpf(currentCpf) : '')
            setPhone(currentPhone ? masks.phone(currentPhone, true) : '')
            setError('')
            setLoading(false)
        }
    }, [isOpen, currentCpf, currentPhone])

    if (!isOpen) return null

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError('')
        setLoading(true)

        try {
            const res = await updateCustomerCriticalData(customerId, cpf, phone, pathname)
            if (res.success) {
                onSuccess() // This already closes the modal via FinanciamentoBox callback
            } else {
                setError(res.message)
            }
        } catch (err) {
            setError('Erro inesperado. Tente novamente.')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>

                <div className="bg-amber-50 px-6 py-4 border-b border-amber-100 flex justify-between items-center">
                    <h3 className="font-bold text-amber-900 flex items-center gap-2">
                        <AlertTriangle className="h-5 w-5 text-amber-600" />
                        Cadastro Incompleto
                    </h3>
                    <button onClick={onClose} type="button" className="p-1 rounded hover:bg-amber-200/50 text-amber-800 transition-colors">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <div className="p-6">
                    <p className="text-sm text-gray-600 mb-4 leading-relaxed">
                        Para gerar um parcelamento, é obrigatório que o cliente
                        <strong className="text-gray-900"> {customerName} </strong>
                        tenha CPF e Telefone cadastrados.
                    </p>

                    {error && (
                        <div className="mb-4 p-3 bg-red-50 border border-red-100 rounded-lg text-xs font-bold text-red-700 flex items-center gap-2">
                            <AlertTriangle className="h-4 w-4 shrink-0" />
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="block text-xs font-bold text-gray-700 mb-1 uppercase tracking-wide">CPF (Obrigatório)</label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                                    <User className="h-4 w-4" />
                                </div>
                                <input
                                    type="text"
                                    value={cpf}
                                    onChange={e => setCpf(masks.cpf(e.target.value))}
                                    placeholder="000.000.000-00"
                                    className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 font-bold text-gray-900 placeholder:font-normal transition-all"
                                    required
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-gray-700 mb-1 uppercase tracking-wide">Telefone Móvel</label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                                    <Phone className="h-4 w-4" />
                                </div>
                                <input
                                    type="text"
                                    value={phone}
                                    onChange={e => setPhone(masks.phone(e.target.value))}
                                    onBlur={e => setPhone(masks.phone(e.target.value, true))}
                                    placeholder="(99) 99999-9999 ou +595 9XX XXX XXX"
                                    className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 font-bold text-gray-900 placeholder:font-normal transition-all"
                                    required
                                />
                            </div>
                        </div>

                        <div className="pt-2">
                            <button
                                type="submit"
                                disabled={loading || cpf.length < 14}
                                className="w-full flex items-center justify-center gap-2 bg-amber-600 hover:bg-amber-700 text-white font-bold py-3 rounded-lg shadow-md hover:shadow-lg transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {loading ? 'Salvando...' : (
                                    <>
                                        <Save className="h-4 w-4" /> SALVAR E CONTINUAR
                                    </>
                                )}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    )
}
