'use client'

import { useState, useEffect, useTransition } from 'react'
import { Loader2, Save, Clock, CalendarDays, Plus, Trash2, AlertTriangle, CheckCircle2, Coffee, CalendarX2 } from 'lucide-react'
import { getStoreProfile, saveStoreHoursConfig } from '@/lib/actions/store.actions'
import { StoreHoursConfig, StoreWeeklySchedule, StoreBreakWindow, StoreSpecialClosure, StoreSpecialOpening } from '@/lib/store-modules'

const DAYS_OF_WEEK = [
    'Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'
]

const DEFAULT_WEEKLY_SCHEDULE: Record<number, StoreWeeklySchedule> = {
    0: { is_open: false, open_time: '08:00', close_time: '18:00' },
    1: { is_open: true, open_time: '08:00', close_time: '18:00' },
    2: { is_open: true, open_time: '08:00', close_time: '18:00' },
    3: { is_open: true, open_time: '08:00', close_time: '18:00' },
    4: { is_open: true, open_time: '08:00', close_time: '18:00' },
    5: { is_open: true, open_time: '08:00', close_time: '18:00' },
    6: { is_open: true, open_time: '08:00', close_time: '12:00' },
}

const labelStyle = "block text-[10px] font-black text-slate-400 uppercase mb-1 tracking-[0.2em]"
const inputStyle = "block w-full rounded-lg border border-white/10 bg-black/20 shadow-inner text-slate-200 h-9 text-sm px-3 focus:ring-1 focus:ring-indigo-500/50 focus:border-indigo-500/50 font-bold outline-none backdrop-blur-sm"

export default function StoreHoursPanel({ storeId }: { storeId: number }) {
    const [config, setConfig] = useState<StoreHoursConfig | null>(null)
    const [loading, setLoading] = useState(true)
    const [isSaving, startTransition] = useTransition()
    const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)

    useEffect(() => {
        getStoreProfile(storeId).then(res => {
            if (res) {
                const settings = res.settings as any
                if (settings?.store_hours) {
                    setConfig(settings.store_hours as StoreHoursConfig)
                } else {
                    setConfig({
                        timezone: 'America/Sao_Paulo',
                        weekly_schedule: DEFAULT_WEEKLY_SCHEDULE,
                        break_windows: [],
                        special_closures: [],
                        special_openings: []
                    })
                }
            }
            setLoading(false)
        })
    }, [storeId])

    if (loading) {
        return <div className="p-6 text-center"><Loader2 className="animate-spin h-6 w-6 text-indigo-400 mx-auto" /></div>
    }

    if (!config) return null

    const handleSave = () => {
        setMessage(null)
        startTransition(async () => {
            const res = await saveStoreHoursConfig(storeId, config)
            if (res.success) {
                setMessage({ kind: 'success', text: res.message })
            } else {
                setMessage({ kind: 'error', text: res.message })
            }
        })
    }

    const updateWeeklySchedule = (day: number, field: keyof StoreWeeklySchedule, value: any) => {
        setConfig(prev => {
            if (!prev) return prev
            return {
                ...prev,
                weekly_schedule: {
                    ...prev.weekly_schedule,
                    [day]: {
                        ...prev.weekly_schedule[day],
                        [field]: value
                    }
                }
            }
        })
    }

    const addBreakWindow = () => {
        setConfig(prev => {
            if (!prev) return prev
            return {
                ...prev,
                break_windows: [
                    ...prev.break_windows,
                    { id: crypto.randomUUID(), start_time: '12:00', end_time: '13:00', days: [1, 2, 3, 4, 5], reason: 'Almoço' }
                ]
            }
        })
    }

    const updateBreakWindow = (id: string, field: keyof StoreBreakWindow, value: any) => {
        setConfig(prev => {
            if (!prev) return prev
            return {
                ...prev,
                break_windows: prev.break_windows.map(bw => bw.id === id ? { ...bw, [field]: value } : bw)
            }
        })
    }

    const removeBreakWindow = (id: string) => {
        setConfig(prev => {
            if (!prev) return prev
            return { ...prev, break_windows: prev.break_windows.filter(bw => bw.id !== id) }
        })
    }

    const addSpecialClosure = () => {
        setConfig(prev => {
            if (!prev) return prev
            return {
                ...prev,
                special_closures: [
                    ...prev.special_closures,
                    { id: crypto.randomUUID(), date: new Date().toISOString().split('T')[0], reason: 'Feriado' }
                ]
            }
        })
    }

    const updateSpecialClosure = (id: string, field: keyof StoreSpecialClosure, value: any) => {
        setConfig(prev => {
            if (!prev) return prev
            return {
                ...prev,
                special_closures: prev.special_closures.map(sc => sc.id === id ? { ...sc, [field]: value } : sc)
            }
        })
    }

    const removeSpecialClosure = (id: string) => {
        setConfig(prev => {
            if (!prev) return prev
            return { ...prev, special_closures: prev.special_closures.filter(sc => sc.id !== id) }
        })
    }

    return (
        <div className="mx-auto max-w-4xl animate-in fade-in space-y-6">
            <div className="relative overflow-hidden rounded-2xl border border-indigo-400/20 bg-gradient-to-br from-indigo-950/80 via-slate-950/90 to-blue-950/70 p-6 shadow-2xl">
                <div className="absolute -right-16 -top-20 h-56 w-56 rounded-full bg-indigo-400/10 blur-3xl" />
                <div className="relative flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div>
                        <div className="flex items-center gap-3">
                            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-indigo-300/20 bg-indigo-400/15">
                                <Clock className="h-6 w-6 text-indigo-300" />
                            </div>
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-[0.25em] text-indigo-300/70">Agenda Operacional</p>
                                <h2 className="text-xl font-black text-white">Horário de Funcionamento</h2>
                            </div>
                        </div>
                        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-slate-300">
                            Configure os horários de atendimento da loja. Estas configurações alimentam a automação do WhatsApp IA e outras partes do sistema.
                        </p>
                    </div>
                </div>
            </div>

            {/* HORÁRIO SEMANAL */}
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6 shadow-xl backdrop-blur-xl">
                <div className="flex items-center gap-3 border-b border-white/10 pb-4 mb-4">
                    <CalendarDays className="h-5 w-5 text-emerald-400" />
                    <div>
                        <h3 className="text-sm font-black text-white">Horário Padrão Semanal</h3>
                        <p className="text-xs text-slate-400 mt-1">Defina os dias em que a loja está regularmente aberta e a janela de operação.</p>
                    </div>
                </div>

                <div className="space-y-3">
                    {DAYS_OF_WEEK.map((dayName, index) => {
                        const dayConfig = config.weekly_schedule[index]
                        if (!dayConfig) return null

                        return (
                            <div key={index} className="flex items-center gap-4 rounded-xl border border-white/10 bg-black/20 p-4 transition-colors hover:bg-white/5">
                                <div className="w-40 flex items-center gap-3">
                                    <input
                                        type="checkbox"
                                        checked={dayConfig.is_open}
                                        onChange={(e) => updateWeeklySchedule(index, 'is_open', e.target.checked)}
                                        className="h-5 w-5 rounded border-white/20 bg-slate-900 text-emerald-500 focus:ring-emerald-500"
                                    />
                                    <span className={`text-sm font-bold ${dayConfig.is_open ? 'text-white' : 'text-slate-500'}`}>
                                        {dayName}
                                    </span>
                                </div>
                                
                                {dayConfig.is_open ? (
                                    <div className="flex flex-1 items-center gap-3">
                                        <div className="flex-1 max-w-32">
                                            <input 
                                                type="time" 
                                                value={dayConfig.open_time}
                                                onChange={(e) => updateWeeklySchedule(index, 'open_time', e.target.value)}
                                                className={inputStyle} 
                                            />
                                        </div>
                                        <span className="text-xs font-bold text-slate-500">até</span>
                                        <div className="flex-1 max-w-32">
                                            <input 
                                                type="time" 
                                                value={dayConfig.close_time}
                                                onChange={(e) => updateWeeklySchedule(index, 'close_time', e.target.value)}
                                                className={inputStyle} 
                                            />
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex-1">
                                        <span className="text-xs font-black uppercase tracking-wider text-rose-400/50 bg-rose-400/10 px-3 py-1 rounded-lg">Fechado</span>
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>
            </div>

            {/* INTERVALOS / ALMOÇO */}
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6 shadow-xl backdrop-blur-xl">
                <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-4">
                    <div className="flex items-center gap-3">
                        <Coffee className="h-5 w-5 text-amber-400" />
                        <div>
                            <h3 className="text-sm font-black text-white">Intervalos Recorrentes (Almoço)</h3>
                            <p className="text-xs text-slate-400 mt-1">Adicione janelas de fechamento no meio do expediente padrão.</p>
                        </div>
                    </div>
                    <button
                        onClick={addBreakWindow}
                        className="inline-flex h-9 items-center gap-2 rounded-lg border border-amber-400/30 bg-amber-400/10 px-4 text-xs font-black uppercase tracking-wider text-amber-300 transition hover:bg-amber-400/20"
                    >
                        <Plus className="h-4 w-4" /> Adicionar
                    </button>
                </div>

                <div className="space-y-3">
                    {config.break_windows.length === 0 ? (
                        <p className="text-sm text-slate-500 text-center py-6 italic">A loja não possui horários de intervalo registrados (direto).</p>
                    ) : config.break_windows.map(bw => (
                        <div key={bw.id} className="flex flex-wrap md:flex-nowrap items-center gap-4 rounded-xl border border-amber-400/10 bg-black/20 p-4">
                            <div className="w-full md:w-auto flex-1">
                                <label className={labelStyle}>Motivo</label>
                                <input 
                                    value={bw.reason || ''} 
                                    onChange={e => updateBreakWindow(bw.id, 'reason', e.target.value)}
                                    className={inputStyle} 
                                    placeholder="Ex: Almoço"
                                />
                            </div>
                            <div className="w-24">
                                <label className={labelStyle}>Início</label>
                                <input 
                                    type="time" 
                                    value={bw.start_time} 
                                    onChange={e => updateBreakWindow(bw.id, 'start_time', e.target.value)}
                                    className={inputStyle} 
                                />
                            </div>
                            <div className="w-24">
                                <label className={labelStyle}>Fim</label>
                                <input 
                                    type="time" 
                                    value={bw.end_time} 
                                    onChange={e => updateBreakWindow(bw.id, 'end_time', e.target.value)}
                                    className={inputStyle} 
                                />
                            </div>
                            <div className="w-full mt-2 md:mt-0 flex justify-end md:w-auto md:ml-4">
                                <button
                                    onClick={() => removeBreakWindow(bw.id)}
                                    className="p-2 text-rose-400/70 hover:text-rose-400 hover:bg-rose-400/10 rounded-lg transition"
                                >
                                    <Trash2 className="h-5 w-5" />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* FECHAMENTOS EXCEPCIONAIS */}
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6 shadow-xl backdrop-blur-xl">
                <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-4">
                    <div className="flex items-center gap-3">
                        <CalendarX2 className="h-5 w-5 text-rose-400" />
                        <div>
                            <h3 className="text-sm font-black text-white">Fechamentos Excepcionais (Feriados)</h3>
                            <p className="text-xs text-slate-400 mt-1">Dias onde a loja normalmente estaria aberta, mas estará fechada o dia todo.</p>
                        </div>
                    </div>
                    <button
                        onClick={addSpecialClosure}
                        className="inline-flex h-9 items-center gap-2 rounded-lg border border-rose-400/30 bg-rose-400/10 px-4 text-xs font-black uppercase tracking-wider text-rose-300 transition hover:bg-rose-400/20"
                    >
                        <Plus className="h-4 w-4" /> Adicionar
                    </button>
                </div>

                <div className="space-y-3">
                    {config.special_closures.length === 0 ? (
                        <p className="text-sm text-slate-500 text-center py-6 italic">Nenhum fechamento excepcional cadastrado.</p>
                    ) : config.special_closures.map(sc => (
                        <div key={sc.id} className="flex items-center gap-4 rounded-xl border border-rose-400/10 bg-black/20 p-4">
                            <div className="w-40">
                                <label className={labelStyle}>Data</label>
                                <input 
                                    type="date" 
                                    value={sc.date} 
                                    onChange={e => updateSpecialClosure(sc.id, 'date', e.target.value)}
                                    className={inputStyle} 
                                />
                            </div>
                            <div className="flex-1">
                                <label className={labelStyle}>Motivo</label>
                                <input 
                                    value={sc.reason} 
                                    onChange={e => updateSpecialClosure(sc.id, 'reason', e.target.value)}
                                    className={inputStyle} 
                                    placeholder="Ex: Feriado Nacional"
                                />
                            </div>
                            <div className="ml-4">
                                <button
                                    onClick={() => removeSpecialClosure(sc.id)}
                                    className="p-2 text-rose-400/70 hover:text-rose-400 hover:bg-rose-400/10 rounded-lg transition"
                                >
                                    <Trash2 className="h-5 w-5" />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Ações / Feedback */}
            <div className="flex items-center justify-between pb-10">
                <div className="flex-1">
                    {message && (
                        <div className={`inline-flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-bold ${
                            message.kind === 'success'
                                ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200'
                                : 'border-red-400/20 bg-red-400/10 text-red-200'
                        }`}>
                            {message.kind === 'success' ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                            {message.text}
                        </div>
                    )}
                </div>
                <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white px-8 py-3 rounded-xl font-bold shadow-lg shadow-indigo-500/20 flex items-center gap-2 disabled:opacity-50 border border-white/10 transition-colors"
                >
                    {isSaving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
                    SALVAR AGENDA OPERACIONAL
                </button>
            </div>
        </div>
    )
}
