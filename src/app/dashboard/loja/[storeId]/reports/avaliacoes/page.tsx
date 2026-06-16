import Link from 'next/link'
import type { ElementType } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  ArrowLeft,
  Calendar,
  ClipboardCheck,
  CircleDollarSign,
  Clock,
  LineChart,
  TrendingDown,
  TrendingUp,
  Users,
} from 'lucide-react'
import { getEmployeeEvaluationReport } from '@/lib/actions/reports.actions'

function formatMoney(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatPercent(value: number) {
  return `${value.toFixed(1).replace('.', ',')}%`
}

function formatNumber(value: number) {
  return value.toLocaleString('pt-BR')
}

function defaultPeriod() {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), 1)
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  }
}

function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
  tone,
}: {
  label: string
  value: string
  hint: string
  icon: ElementType
  tone: string
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 shadow-xl backdrop-blur-md">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${tone}`}>
          <Icon className="h-5 w-5" />
        </div>
        <span className="text-right text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
          {label}
        </span>
      </div>
      <p className="text-3xl font-black tracking-tight text-white">{value}</p>
      <p className="mt-2 text-xs font-semibold leading-relaxed text-slate-400">{hint}</p>
    </div>
  )
}

export default async function AvaliacoesFuncionariosPage({
  params,
  searchParams,
}: {
  params: { storeId: string }
  searchParams: { inicio?: string; fim?: string; employeeId?: string }
}) {
  const storeId = Number(params.storeId)
  const period = defaultPeriod()
  const dataInicio = searchParams.inicio || period.start
  const dataFim = searchParams.fim || period.end
  const report = await getEmployeeEvaluationReport(storeId, dataInicio, dataFim)
  const selectedEmployeeId = searchParams.employeeId ? Number(searchParams.employeeId) : null
  const selectedEmployee = selectedEmployeeId != null
    ? report.employees.find((employee) => employee.employeeId === selectedEmployeeId) || null
    : null
  const supabaseAdmin = createAdminClient()
  const { data: employees } = await supabaseAdmin
    .from('employees')
    .select('id, full_name')
    .eq('store_id', storeId)
    .eq('is_active', true)
    .order('full_name')
  const employeeOptions = (employees || []) as Array<{ id: number; full_name: string }>

  const totals = report.totals

  return (
    <div className="flex min-h-full flex-col bg-slate-950 text-slate-100">
      <div className="border-b border-white/10 bg-slate-950/95 px-4 py-3 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <Link
              href={`/dashboard/loja/${storeId}/reports`}
              className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-bold text-slate-400 transition-colors hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar
            </Link>
            <div>
              <h1 className="flex items-center gap-2 text-xl font-black text-white">
                <ClipboardCheck className="h-5 w-5 text-emerald-300" />
                Avaliação da Equipe
              </h1>
              <p className="mt-1 text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
                Conversão de avaliações ópticas
              </p>
            </div>
          </div>

          <form className="flex flex-wrap items-center gap-2">
            <div className="flex items-center rounded-xl border border-white/10 bg-white/5 px-3 py-2">
              <Calendar className="mr-2 h-4 w-4 text-slate-400" />
              <input
                name="inicio"
                type="date"
                defaultValue={dataInicio}
                className="bg-transparent text-xs font-bold text-slate-200 outline-none [color-scheme:dark]"
              />
              <span className="mx-2 text-slate-500">até</span>
              <input
                name="fim"
                type="date"
                defaultValue={dataFim}
                className="bg-transparent text-xs font-bold text-slate-200 outline-none [color-scheme:dark]"
              />
            </div>
            <select
              name="employeeId"
              defaultValue={selectedEmployeeId != null ? String(selectedEmployeeId) : ''}
              className="rounded-xl border border-emerald-500/20 bg-slate-900 px-3 py-2 text-xs font-bold text-white shadow-inner outline-none transition-colors focus:border-emerald-400/50"
            >
              <option value="" className="bg-slate-900 text-white">
                Visão geral
              </option>
              {employeeOptions.map((employee) => (
                <option key={employee.id} value={employee.id} className="bg-slate-900 text-white">
                  {employee.full_name}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-black uppercase tracking-[0.14em] text-white shadow-lg shadow-emerald-500/20 transition-colors hover:bg-emerald-500"
            >
              Filtrar
            </button>
            {selectedEmployee && (
              <Link
                href={`/dashboard/loja/${storeId}/reports/avaliacoes?inicio=${dataInicio}&fim=${dataFim}`}
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-black uppercase tracking-[0.14em] text-slate-300 transition-colors hover:text-white"
              >
                Limpar funcionário
              </Link>
            )}
          </form>
        </div>
      </div>

      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 p-4 lg:p-6">
        {selectedEmployee && (
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-5 py-4 text-sm text-emerald-100">
            <strong className="font-black">Recorte individual ativo:</strong> {selectedEmployee.employeeName}.
            <span className="ml-2 text-emerald-200/80">
              A visão geral do período continua abaixo, e o painel individual aparece em seguida.
            </span>
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            label="Avaliações"
            value={formatNumber(totals.evaluations)}
            hint="Atendimentos ópticos registrados no período."
            icon={ClipboardCheck}
            tone="bg-emerald-500/15 text-emerald-300"
          />
          <KpiCard
            label="Vinculadas"
            value={formatPercent(totals.linkedRate)}
            hint={`${formatNumber(totals.linkedSales)} avaliações chegaram a uma venda/OS vinculada.`}
            icon={LineChart}
            tone="bg-cyan-500/15 text-cyan-300"
          />
          <KpiCard
            label="Fechamento"
            value={formatPercent(totals.conversionRate)}
            hint={`${formatNumber(totals.closedSales)} vendas fechadas a partir de avaliação.`}
            icon={CircleDollarSign}
            tone="bg-amber-500/15 text-amber-300"
          />
          <KpiCard
            label="Retomadas"
            value={formatNumber(totals.openRecent)}
            hint="Avaliações abertas e recentes, ainda dentro da janela de 7 dias."
            icon={Clock}
            tone="bg-indigo-500/15 text-indigo-300"
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur-md">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Movimento comercial</p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-black/20 p-4">
                <p className="text-xs font-bold text-slate-400">Em pesquisa</p>
                <p className="mt-2 text-2xl font-black text-white">{formatNumber(totals.research)}</p>
              </div>
              <div className="rounded-xl bg-black/20 p-4">
                <p className="text-xs font-bold text-slate-400">Perdidas</p>
                <p className="mt-2 text-2xl font-black text-white">{formatNumber(totals.lost)}</p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur-md">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Sugestão versus venda</p>
            <div className="mt-4 grid grid-cols-3 gap-3">
              <div className="rounded-xl bg-emerald-500/10 p-4 text-emerald-200">
                <TrendingUp className="mb-2 h-4 w-4" />
                <p className="text-xl font-black">{formatNumber(totals.upgrade)}</p>
                <p className="text-[10px] font-bold uppercase">Upgrade</p>
              </div>
              <div className="rounded-xl bg-slate-500/10 p-4 text-slate-200">
                <Users className="mb-2 h-4 w-4" />
                <p className="text-xl font-black">{formatNumber(totals.sameRange)}</p>
                <p className="text-[10px] font-bold uppercase">Mesmo nível</p>
              </div>
              <div className="rounded-xl bg-rose-500/10 p-4 text-rose-200">
                <TrendingDown className="mb-2 h-4 w-4" />
                <p className="text-xl font-black">{formatNumber(totals.downgrade)}</p>
                <p className="text-[10px] font-bold uppercase">Downgrade</p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur-md">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Ticket e ajuste</p>
            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between rounded-xl bg-black/20 p-4">
                <span className="text-xs font-bold text-slate-400">Ticket médio fechado</span>
                <strong className="text-sm text-white">{formatMoney(totals.averageSoldTicket)}</strong>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-black/20 p-4">
                <span className="text-xs font-bold text-slate-400">Delta médio lente</span>
                <strong className={totals.averageDelta >= 0 ? 'text-sm text-emerald-300' : 'text-sm text-rose-300'}>
                  {formatMoney(totals.averageDelta)}
                </strong>
              </div>
            </div>
          </div>
        </div>

        {selectedEmployee && (
          <>
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-black uppercase tracking-[0.16em] text-white">
                  Leitura Individual
                </h2>
                <p className="mt-1 text-xs font-semibold text-slate-400">
                  Indicadores de {selectedEmployee.employeeName} no mesmo período.
                </p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <KpiCard
                label="Avaliações"
                value={formatNumber(selectedEmployee.evaluations)}
                hint="Avaliações registradas por este funcionário."
                icon={ClipboardCheck}
                tone="bg-emerald-500/15 text-emerald-300"
              />
              <KpiCard
                label="Vinculadas"
                value={formatPercent(selectedEmployee.linkedRate)}
                hint={`${formatNumber(selectedEmployee.linkedSales)} avaliações seguiram para venda/OS.`}
                icon={LineChart}
                tone="bg-cyan-500/15 text-cyan-300"
              />
              <KpiCard
                label="Fechamento"
                value={formatPercent(selectedEmployee.conversionRate)}
                hint={`${formatNumber(selectedEmployee.closedSales)} vendas fechadas no recorte.`}
                icon={CircleDollarSign}
                tone="bg-amber-500/15 text-amber-300"
              />
              <KpiCard
                label="Retomadas"
                value={formatNumber(selectedEmployee.openRecent)}
                hint="Avaliações abertas deste funcionário ainda na janela de 7 dias."
                icon={Clock}
                tone="bg-indigo-500/15 text-indigo-300"
              />
            </div>
          </>
        )}

        <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-md">
          <div className="border-b border-white/10 px-5 py-4">
            <h2 className="text-sm font-black uppercase tracking-[0.16em] text-white">Por funcionário</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="bg-black/20 text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
                <tr>
                  <th className="px-5 py-3">Funcionário</th>
                  <th className="px-4 py-3 text-right">Avaliações</th>
                  <th className="px-4 py-3 text-right">Vinculadas</th>
                  <th className="px-4 py-3 text-right">Fechadas</th>
                  <th className="px-4 py-3 text-right">Conv.</th>
                  <th className="px-4 py-3 text-right">Abertas 7d</th>
                  <th className="px-4 py-3 text-right">Pesquisa</th>
                  <th className="px-4 py-3 text-right">Perdidas</th>
                  <th className="px-4 py-3 text-right">Up</th>
                  <th className="px-4 py-3 text-right">Down</th>
                  <th className="px-5 py-3 text-right">Ticket médio</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {report.employees.length === 0 ? (
                  <tr>
                    <td className="px-5 py-10 text-center text-slate-400" colSpan={11}>
                      Nenhuma avaliação encontrada no período.
                    </td>
                  </tr>
                ) : (
                  report.employees.map((employee) => (
                    <tr
                      key={employee.employeeId ?? 'none'}
                      className={`text-slate-300 hover:bg-white/[0.03] ${
                        selectedEmployee?.employeeId === employee.employeeId ? 'bg-emerald-500/10' : ''
                      }`}
                    >
                      <td className="px-5 py-4 font-black text-white">{employee.employeeName}</td>
                      <td className="px-4 py-4 text-right">{formatNumber(employee.evaluations)}</td>
                      <td className="px-4 py-4 text-right">{formatNumber(employee.linkedSales)}</td>
                      <td className="px-4 py-4 text-right">{formatNumber(employee.closedSales)}</td>
                      <td className="px-4 py-4 text-right font-bold text-emerald-300">{formatPercent(employee.conversionRate)}</td>
                      <td className="px-4 py-4 text-right">{formatNumber(employee.openRecent)}</td>
                      <td className="px-4 py-4 text-right">{formatNumber(employee.research)}</td>
                      <td className="px-4 py-4 text-right">{formatNumber(employee.lost)}</td>
                      <td className="px-4 py-4 text-right text-emerald-300">{formatNumber(employee.upgrade)}</td>
                      <td className="px-4 py-4 text-right text-rose-300">{formatNumber(employee.downgrade)}</td>
                      <td className="px-5 py-4 text-right font-bold text-white">{formatMoney(employee.averageSoldTicket)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  )
}
