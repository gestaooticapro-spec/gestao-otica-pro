'use client'

import { useState, useTransition } from 'react'
import { X, Save, Loader2, UserPlus, Phone } from 'lucide-react'
import { createQuickCustomer } from '@/lib/actions/customer.actions'
import { Database } from '@/lib/database.types'

type Customer = Database['public']['Tables']['customers']['Row']

interface Props {
    isOpen: boolean
    onClose: () => void
    onSuccess: (customer: Customer) => void
    storeId: number
    initialName: string
}

export default function QuickCustomerModal({ isOpen, onClose, onSuccess, storeId, initialName }: Props) {
    const [name, setName] = useState(initialName)
    const [phone, setPhone] = useState('')
    const [isPending, startTransition] = useTransition()
    const [errorMsg, setErrorMsg] = useState<string | null>(null)

    // Mascara simples de telefone
    const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        let v = e.target.value.replace(/\D/g, '')
        v = v.replace(/^(\d{2})(\d)/g, '($1) $2')
        v = v.replace(/(\d)(\d{4})$/, '$1-$2')
        setPhone(v.substring(0, 15))
    }

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        if (name.length < 3 || phone.length < 10) {
            setErrorMsg("Preencha nome e telefone corretamente.")
            return
        }

        const formData = new FormData()
        formData.append('store_id', storeId.toString())
        formData.append('full_name', name)
        formData.append('fone_movel', phone)

        startTransition(async () => {
            const res = await createQuickCustomer(formData)
            if (res.success && res.data) {
                onSuccess(res.data)
                onClose()
            } else {
                setErrorMsg(res.message)
            }
        })
    }

    if (!isOpen) return null

    // Estilo dos Inputs (Branco destacado com sombra)
    const inputStyle = "w-full h-11 rounded-lg border-0 bg-white shadow-sm focus:ring-2 focus:ring-blue-500 text-blue-900 font-bold placeholder-slate-400 transition-all px-4"
    // Estilo dos Labels
    const labelStyle = "block text-xs font-bold text-slate-600 uppercase mb-1.5 tracking-wider flex items-center gap-1"

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
                
                {/* Cabeçalho */}
                <div className="bg-blue-50 px-6 py-4 border-b border-blue-100 flex justify-between items-center">
                    <h3 className="font-black text-xl text-blue-900 flex items-center gap-2">
                        <UserPlus className="h-6 w-6 text-blue-600" /> Cadastro Rápido
                    </h3>
                    <button onClick={onClose} className="p-1 hover:bg-blue-100 rounded-full text-blue-400 hover:text-blue-600 transition-colors">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* Corpo do Formulário com Fundo Colorido */}
                <form onSubmit={handleSubmit} className="p-6 space-y-5 bg-slate-100">
                    <p className="text-sm font-medium text-slate-500 mb-2 leading-relaxed">
                        Cadastre apenas o essencial para não perder a venda. Você pode completar os dados depois.
                    </p>
                    
                    <div>
                        <label className={labelStyle}>Nome Completo</label>
                        <input 
                            type="text" 
                            value={name} 
                            onChange={e => setName(e.target.value)} 
                            className={inputStyle}
                            placeholder="Ex: João da Silva"
                            autoFocus
                        />
                    </div>

                    <div>
                        <label className={labelStyle}>
                            <Phone className="h-3.5 w-3.5" /> Celular / WhatsApp
                        </label>
                        <input 
                            type="text" 
                            value={phone} 
                            onChange={handlePhoneChange} 
                            placeholder="(00) 90000-0000"
                            className={inputStyle}
                        />
                    </div>

                    {errorMsg && (
                        <div className="p-3 bg-red-50 text-red-700 text-sm font-bold rounded-lg border border-red-100 flex items-center gap-2">
                            <X className="h-4 w-4" /> {errorMsg}
                        </div>
                    )}

                    <button 
                        type="submit" 
                        disabled={isPending}
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold text-lg py-3.5 rounded-xl shadow-lg shadow-blue-200 flex items-center justify-center gap-2 disabled:opacity-50 transition-all active:scale-95 mt-4"
                    >
                        {isPending ? <Loader2 className="h-6 w-6 animate-spin" /> : <Save className="h-6 w-6" />}
                        SALVAR E SELECIONAR
                    </button>
                </form>
            </div>
        </div>
    )
}