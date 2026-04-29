'use client'

import { useState, useTransition, useEffect } from 'react'
import { X, Save, Loader2, User, Phone, MapPin, CreditCard, Edit3 } from 'lucide-react'
import { updateCustomerQuickInfo } from '@/lib/actions/customer.actions'
import { Database } from '@/lib/database.types'

type Customer = Database['public']['Tables']['customers']['Row']

interface Props {
    isOpen: boolean
    onClose: () => void
    customer: Customer
    storeId: number
}

const field = "w-full h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
const label = "block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1"

export default function CustomerQuickInfoModal({ isOpen, onClose, customer, storeId }: Props) {
    const [editing, setEditing] = useState(false)
    const [isPending, startTransition] = useTransition()
    const [errorMsg, setErrorMsg] = useState<string | null>(null)
    const [successMsg, setSuccessMsg] = useState<string | null>(null)

    const [name, setName] = useState('')
    const [cpf, setCpf] = useState('')
    const [phone, setPhone] = useState('')
    const [rua, setRua] = useState('')
    const [numero, setNumero] = useState('')
    const [bairro, setBairro] = useState('')
    const [cidade, setCidade] = useState('')
    const [uf, setUf] = useState('')
    const [cep, setCep] = useState('')

    useEffect(() => {
        if (isOpen) {
            setEditing(false)
            setErrorMsg(null)
            setSuccessMsg(null)
            setName(customer.full_name ?? '')
            setCpf(formatCpf(customer.cpf ?? ''))
            setPhone(customer.fone_movel ?? '')
            setRua(customer.rua ?? '')
            setNumero(customer.numero?.toString() ?? '')
            setBairro(customer.bairro ?? '')
            setCidade(customer.cidade ?? '')
            setUf(customer.uf ?? '')
            setCep(formatCep(customer.cep?.toString() ?? ''))
        }
    }, [isOpen, customer])

    if (!isOpen) return null

    function formatCpf(v: string) {
        const d = v.replace(/\D/g, '').substring(0, 11)
        return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
            .replace(/(\d{3})(\d{3})(\d{3})/, '$1.$2.$3')
            .replace(/(\d{3})(\d{3})/, '$1.$2')
    }

    function formatCep(v: string) {
        const d = v.replace(/\D/g, '').substring(0, 8)
        return d.replace(/(\d{5})(\d)/, '$1-$2')
    }

    const handleSave = () => {
        setErrorMsg(null)
        setSuccessMsg(null)
        startTransition(async () => {
            const res = await updateCustomerQuickInfo(customer.id, storeId, {
                full_name: name,
                cpf,
                fone_movel: phone,
                rua,
                numero,
                bairro,
                cidade,
                uf,
                cep,
            })
            if (res.success) {
                setSuccessMsg(res.message)
                setEditing(false)
            } else {
                setErrorMsg(res.message)
            }
        })
    }

    const enderecoFormatado = [
        customer.rua && `${customer.rua}${customer.numero ? ', ' + customer.numero : ''}`,
        customer.bairro,
        customer.cidade && customer.uf ? `${customer.cidade} / ${customer.uf}` : (customer.cidade || customer.uf),
        customer.cep ? `CEP ${customer.cep}` : null,
    ].filter(Boolean).join(' — ')

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">

                {/* Header */}
                <div className="bg-blue-600 px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-white">
                        <User className="h-5 w-5 opacity-80" />
                        <span className="font-black text-lg tracking-tight">{customer.full_name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        {!editing && (
                            <button
                                onClick={() => setEditing(true)}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-white text-xs font-bold transition-colors"
                            >
                                <Edit3 className="h-3.5 w-3.5" /> Editar
                            </button>
                        )}
                        <button onClick={onClose} className="p-1.5 hover:bg-white/20 rounded-lg text-white transition-colors">
                            <X className="h-5 w-5" />
                        </button>
                    </div>
                </div>

                <div className="p-6 space-y-5">

                    {/* Nome */}
                    <div>
                        <label className={label}>
                            <span className="flex items-center gap-1"><User className="h-3 w-3" /> Nome Completo</span>
                        </label>
                        <input
                            value={name}
                            onChange={e => setName(e.target.value)}
                            disabled={!editing}
                            className={field}
                        />
                    </div>

                    {/* CPF + Celular */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className={label}>
                                <span className="flex items-center gap-1"><CreditCard className="h-3 w-3" /> CPF</span>
                            </label>
                            <input
                                value={cpf}
                                onChange={e => setCpf(formatCpf(e.target.value))}
                                disabled={!editing}
                                placeholder="000.000.000-00"
                                className={field}
                            />
                        </div>
                        <div>
                            <label className={label}>
                                <span className="flex items-center gap-1"><Phone className="h-3 w-3" /> Celular / WhatsApp</span>
                            </label>
                            <input
                                value={phone}
                                onChange={e => setPhone(e.target.value)}
                                disabled={!editing}
                                placeholder="(99) 99999-9999 ou +595..."
                                className={field}
                            />
                        </div>
                    </div>

                    {/* Endereço */}
                    <div>
                        <label className={label}>
                            <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> Endereço</span>
                        </label>
                        {!editing ? (
                            <p className="text-sm text-gray-700 bg-gray-50 rounded-lg px-3 py-2.5 min-h-[40px]">
                                {enderecoFormatado || <span className="text-gray-400 italic">Não informado</span>}
                            </p>
                        ) : (
                            <div className="space-y-2">
                                <div className="grid grid-cols-3 gap-2">
                                    <div className="col-span-2">
                                        <input value={rua} onChange={e => setRua(e.target.value)} placeholder="Rua / Av." className={field} />
                                    </div>
                                    <div>
                                        <input value={numero} onChange={e => setNumero(e.target.value)} placeholder="Nº" className={field} />
                                    </div>
                                </div>
                                <input value={bairro} onChange={e => setBairro(e.target.value)} placeholder="Bairro" className={field} />
                                <div className="grid grid-cols-3 gap-2">
                                    <div className="col-span-2">
                                        <input value={cidade} onChange={e => setCidade(e.target.value)} placeholder="Cidade" className={field} />
                                    </div>
                                    <div>
                                        <input value={uf} onChange={e => setUf(e.target.value)} placeholder="UF" maxLength={2} className={field} />
                                    </div>
                                </div>
                                <input
                                    value={cep}
                                    onChange={e => setCep(formatCep(e.target.value))}
                                    placeholder="00000-000"
                                    className={field}
                                />
                            </div>
                        )}
                    </div>

                    {/* Feedback */}
                    {errorMsg && (
                        <p className="text-sm text-red-600 font-medium bg-red-50 border border-red-100 px-3 py-2 rounded-lg">{errorMsg}</p>
                    )}
                    {successMsg && (
                        <p className="text-sm text-emerald-700 font-medium bg-emerald-50 border border-emerald-100 px-3 py-2 rounded-lg">{successMsg}</p>
                    )}

                    {/* Ações */}
                    {editing && (
                        <div className="flex gap-2 pt-1">
                            <button
                                onClick={() => { setEditing(false); setErrorMsg(null) }}
                                className="flex-1 h-10 rounded-lg border border-gray-200 text-gray-600 text-sm font-bold hover:bg-gray-50 transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={isPending}
                                className="flex-1 h-10 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-60 transition-colors"
                            >
                                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                                Salvar
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
