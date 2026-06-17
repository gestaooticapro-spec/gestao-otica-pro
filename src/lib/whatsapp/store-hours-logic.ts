import { StoreHoursConfig, StoreWeeklySchedule, StoreBreakWindow } from '@/lib/store-modules'
import { toZonedTime, format } from 'date-fns-tz'
import { addDays } from 'date-fns'

export type StoreHoursFacts = {
    is_open_now: boolean
    is_exceptional_closure: boolean
    exceptional_closure_reason?: string
    today_schedule: string
    next_open_schedule: string
    full_weekly_schedule: string
}

const DAYS_MAP = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado']

function formatWeeklySchedule(config: StoreHoursConfig): string {
    const parts: string[] = []
    for (let i = 0; i < 7; i++) {
        const day = config.weekly_schedule[i]
        if (day) {
            if (day.is_open) {
                parts.push(`${DAYS_MAP[i]}: ${day.open_time} às ${day.close_time}`)
            } else {
                parts.push(`${DAYS_MAP[i]}: Fechado`)
            }
        }
    }
    return parts.join(' | ')
}

function parseTime(timeStr: string): number {
    const [h, m] = timeStr.split(':').map(Number)
    return h * 60 + m
}

export function evaluateStoreHours(config: StoreHoursConfig, referenceDateInput: Date = new Date()): StoreHoursFacts {
    const tz = config.timezone || 'America/Sao_Paulo'
    const referenceDate = toZonedTime(referenceDateInput, tz)
    
    const currentDateStr = format(referenceDate, 'yyyy-MM-dd', { timeZone: tz })
    const currentDayOfWeek = referenceDate.getDay()
    const currentTimeMinutes = referenceDate.getHours() * 60 + referenceDate.getMinutes()

    const fullWeeklySchedule = formatWeeklySchedule(config)

    let isExceptionalClosure = false
    let exceptionalClosureReason = ''
    let todayScheduleStr = ''
    let isOpenNow = false

    // 1. Check special closures
    const specialClosure = config.special_closures.find(c => c.date === currentDateStr)
    if (specialClosure) {
        isExceptionalClosure = true
        exceptionalClosureReason = specialClosure.reason
        todayScheduleStr = 'Fechado excepcionalmente'
        isOpenNow = false
    } else {
        // 2. Check special openings
        const specialOpening = config.special_openings.find(o => o.date === currentDateStr)
        if (specialOpening) {
            todayScheduleStr = `${specialOpening.open_time} às ${specialOpening.close_time}`
            const openMins = parseTime(specialOpening.open_time)
            const closeMins = parseTime(specialOpening.close_time)
            if (currentTimeMinutes >= openMins && currentTimeMinutes <= closeMins) {
                isOpenNow = true
            }
        } else {
            // 3. Regular weekly schedule
            const dayConfig = config.weekly_schedule[currentDayOfWeek]
            if (!dayConfig || !dayConfig.is_open) {
                todayScheduleStr = 'Fechado'
                isOpenNow = false
            } else {
                const openMins = parseTime(dayConfig.open_time)
                const closeMins = parseTime(dayConfig.close_time)
                todayScheduleStr = `${dayConfig.open_time} às ${dayConfig.close_time}`

                if (currentTimeMinutes >= openMins && currentTimeMinutes <= closeMins) {
                    isOpenNow = true

                    // 4. Check break windows
                    const breaksToday = config.break_windows.filter(bw => bw.days.includes(currentDayOfWeek))
                    for (const bw of breaksToday) {
                        const bwStart = parseTime(bw.start_time)
                        const bwEnd = parseTime(bw.end_time)
                        if (currentTimeMinutes >= bwStart && currentTimeMinutes < bwEnd) {
                            isOpenNow = false
                            isExceptionalClosure = true // Internally treat break as exception to explain "Almoço"
                            exceptionalClosureReason = bw.reason || 'Intervalo'
                            break
                        }
                    }
                } else {
                    isOpenNow = false
                }
            }
        }
    }

    // 5. Calculate next open schedule (simple approach for V1: iterate days to find next open day if closed today)
    // Se estiver aberto agora, não precisa avisar quando abre.
    // Se estiver fechado, vamos procurar o próximo dia que abre ou se abre mais tarde hoje.
    let nextOpenScheduleStr = ''
    
    // EXCEPTIONAL global auto-reply for lunch (or maybe we do? A global auto-reply for lunch is good: "Estamos no almoço, voltamos X").
    let finalIsExceptionalClosure = isExceptionalClosure
    if (exceptionalClosureReason === 'Intervalo' || exceptionalClosureReason.toLowerCase().includes('almo')) {
        finalIsExceptionalClosure = false // Lunch is part of normal routine, just closed.
    }

    if (!isOpenNow) {
        // Check if opens later today
        if (!finalIsExceptionalClosure) {
             // Let's re-eval if it's a break or before open time
             const dayConfig = config.weekly_schedule[currentDayOfWeek]
             if (dayConfig && dayConfig.is_open) {
                 const openMins = parseTime(dayConfig.open_time)
                 if (currentTimeMinutes < openMins) {
                     nextOpenScheduleStr = `Hoje às ${dayConfig.open_time}`
                 } else {
                     const breaksToday = config.break_windows.filter(bw => bw.days.includes(currentDayOfWeek))
                     for (const bw of breaksToday) {
                         const bwStart = parseTime(bw.start_time)
                         const bwEnd = parseTime(bw.end_time)
                         if (currentTimeMinutes >= bwStart && currentTimeMinutes < bwEnd) {
                             nextOpenScheduleStr = `Hoje às ${bw.end_time}`
                             break
                         }
                     }
                 }
             }
        }

        // If not opening later today, look forward up to 7 days
        if (!nextOpenScheduleStr) {
            for (let i = 1; i <= 7; i++) {
                const futureDate = addDays(referenceDate, i)
                const futureDateStr = format(futureDate, 'yyyy-MM-dd', { timeZone: tz })
                const futureDayOfWeek = futureDate.getDay()

                const futureSpecialClosure = config.special_closures.find(c => c.date === futureDateStr)
                if (futureSpecialClosure) continue

                const futureSpecialOpening = config.special_openings.find(o => o.date === futureDateStr)
                if (futureSpecialOpening) {
                    const dayName = i === 1 ? 'Amanhã' : DAYS_MAP[futureDayOfWeek]
                    nextOpenScheduleStr = `${dayName} às ${futureSpecialOpening.open_time}`
                    break
                }

                const futureDayConfig = config.weekly_schedule[futureDayOfWeek]
                if (futureDayConfig && futureDayConfig.is_open) {
                    const dayName = i === 1 ? 'Amanhã' : DAYS_MAP[futureDayOfWeek]
                    nextOpenScheduleStr = `${dayName} às ${futureDayConfig.open_time}`
                    break
                }
            }
        }
    }

    return {
        is_open_now: isOpenNow,
        is_exceptional_closure: finalIsExceptionalClosure,
        exceptional_closure_reason: isExceptionalClosure ? exceptionalClosureReason : undefined,
        today_schedule: todayScheduleStr,
        next_open_schedule: nextOpenScheduleStr,
        full_weekly_schedule: fullWeeklySchedule
    }
}
