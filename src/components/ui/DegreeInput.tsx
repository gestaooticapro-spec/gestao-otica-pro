'use client'

import React from 'react'

interface DegreeInputProps {
    name?: string
    value: string
    onChange: (val: string) => void
    placeholder?: string
    className?: string
}

export function DegreeInput({ name, value, onChange, placeholder, className }: DegreeInputProps) {
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        let raw = e.target.value.replace(/\D/g, '')
        if (!raw) {
            onChange('')
            return
        }
        const val = parseInt(raw, 10) / 100
        const isNegative = value.includes('-')
        const formatted = val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        const finalValue = isNegative ? `-${formatted}` : `+${formatted}`
        onChange(finalValue)
    }

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === '-') {
            e.preventDefault()
            if (!value.includes('-')) {
                const cleanValue = value.replace('+', '').replace('-', '')
                onChange(cleanValue ? `-${cleanValue}` : '-')
            }
        }
        if (e.key === '+') {
            e.preventDefault()
            if (value.includes('-')) {
                onChange(value.replace('-', '+'))
            } else if (!value.includes('+')) {
                onChange(`+${value}`)
            }
        }
    }

    const isNegative = value.includes('-')
    const isPositive = value.includes('+')
    const textColor = isNegative ? 'text-rose-400' : isPositive ? 'text-emerald-400' : 'text-slate-200'

    return (
        <input
            name={name}
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            className={`${className} ${textColor}`}
            placeholder={placeholder || "0,00"}
            autoComplete="off"
        />
    )
}
