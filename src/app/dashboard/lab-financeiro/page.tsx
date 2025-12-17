'use client'

import { useState } from 'react';
import { 
  criarCarneLab, 
  excluirCarneLab, 
  renegociarParcelasLab, 
  investigarVendaLab 
} from '@/lib/actions/lab-carnes.actions';

export default function LabFinanceiroPage() {
  const [vendaIdInput, setVendaIdInput] = useState('');
  
  const [dados, setDados] = useState<{
    venda: any;
    carne: any;
    parcelas: any[];
  } | null>(null);

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ texto: string; tipo: 'erro' | 'sucesso' | 'aviso' } | null>(null);

  // Busca usando a função ADMIN do servidor
  const buscarDados = async () => {
    if (!vendaIdInput) return;

    setLoading(true);
    setMsg(null);
    setDados(null);

    try {
      const resultado = await investigarVendaLab(vendaIdInput);

      if (!resultado.success) {
        setMsg({ texto: resultado.message || 'Erro desconhecido', tipo: 'erro' });
        setLoading(false);
        return;
      }

      // CORREÇÃO 1: Verificamos se 'data' existe antes de usar
      if (resultado.data) {
        setDados(resultado.data);

        // DETECTOR DE ZUMBIS (Capa existe, parcelas vazias)
        if (resultado.data.carne && resultado.data.parcelas.length === 0) {
          setMsg({ 
            texto: 'ALERTA DE ZUMBI: Contrato existe (Capa), mas as parcelas sumiram.', 
            tipo: 'erro' 
          });
        }
      }

    } catch (error) {
      setMsg({ texto: 'Erro de comunicação.', tipo: 'erro' });
    } finally {
      setLoading(false);
    }
  };

  const handleCriar = async () => {
    if (!dados?.venda) return;
    setLoading(true);
    
    // Cria 3x fixo para teste
    const res = await criarCarneLab({
      // CORREÇÃO 2: Garantimos que nunca seja undefined usando || ''
      tenant_id: dados.venda.tenant_id || '', 
      venda_id: dados.venda.id,
      customer_id: dados.venda.customer_id,
      store_id: dados.venda.store_id,
      valor_total: dados.venda.valor_total,
      qtd_parcelas: 3, 
      data_primeiro_vencimento: new Date().toISOString().split('T')[0]
    });

    setMsg({ texto: res.message || 'Processado', tipo: res.success ? 'sucesso' : 'erro' });
    
    if (res.success) {
      await buscarDados();
    } else {
      setLoading(false);
    }
  };

  const handleExcluir = async () => {
    if (!dados?.carne) return;
    if (!confirm('Tem certeza? Isso apagará o contrato e todas as parcelas.')) return;

    setLoading(true);
    const res = await excluirCarneLab(dados.carne.id, dados.venda.id);
    
    setMsg({ texto: res.message || 'Processado', tipo: res.success ? 'sucesso' : 'erro' });
    await buscarDados(); 
  };

  const handleRenegociar = async () => {
    if (!dados?.carne) return;
    setLoading(true);

    const res = await renegociarParcelasLab(
        dados.carne.id, 
        5, 
        new Date().toISOString().split('T')[0]
    );

    setMsg({ texto: res.message || 'Processado', tipo: res.success ? 'sucesso' : 'erro' });
    await buscarDados();
  };

  return (
    <div className="p-8 bg-gray-50 min-h-screen font-sans text-gray-800">
      <header className="mb-8 border-b pb-4">
        <h1 className="text-3xl font-bold text-blue-900">🔬 Laboratório de Carnês (Admin Mode)</h1>
        <p className="text-gray-600 text-sm mt-1">
          Ambiente de teste e correção com permissões elevadas.
        </p>
      </header>
      
      {/* Busca */}
      <div className="flex gap-4 mb-8 bg-white p-4 rounded shadow-sm border border-gray-200">
        <input 
          type="text" 
          placeholder="ID da Venda (ex: 70)" 
          className="p-3 border rounded w-64 outline-none focus:border-blue-500"
          value={vendaIdInput}
          onChange={(e) => setVendaIdInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && buscarDados()}
        />
        <button 
          onClick={buscarDados} 
          disabled={loading}
          className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 disabled:opacity-50 font-bold transition"
        >
          {loading ? 'Carregando...' : 'Carregar Venda'}
        </button>
      </div>

      {/* Alertas */}
      {msg && (
        <div className={`p-4 mb-6 rounded border-l-4 ${
          msg.tipo === 'erro' ? 'bg-red-50 text-red-900 border-red-600' :
          msg.tipo === 'sucesso' ? 'bg-green-50 text-green-900 border-green-600' :
          'bg-yellow-50 text-yellow-900 border-yellow-500'
        }`}>
          <span className="font-bold block text-xs uppercase opacity-70 mb-1">{msg.tipo}</span>
          {msg.texto}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Painel ESQUERDO: Venda */}
        <div className="bg-white p-6 shadow rounded border border-gray-200">
          <h2 className="text-xl font-bold mb-4 border-b pb-2">📂 Dados da Venda</h2>
          
          {dados?.venda ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="bg-gray-50 p-3 rounded">
                  <span className="block text-gray-500 text-xs uppercase">ID da Venda</span>
                  <span className="font-mono font-bold text-xl">{dados.venda.id}</span>
                </div>
                <div className="bg-gray-50 p-3 rounded">
                  <span className="block text-gray-500 text-xs uppercase">Total</span>
                  <span className="font-bold text-green-700 text-lg">R$ {dados.venda.valor_total}</span>
                </div>
                <div className={`p-3 rounded ${!dados.venda.financiamento_id ? 'bg-red-50 text-red-700' : 'bg-blue-50 text-blue-700'}`}>
                  <span className="block text-xs uppercase opacity-70">Link Financiamento</span>
                  <span className="font-mono font-bold">
                    {dados.venda.financiamento_id ? `OK (ID: ${dados.venda.financiamento_id})` : 'NULL (Sem Vínculo)'}
                  </span>
                </div>
              </div>
              
              <div className="text-xs text-gray-400 mt-4 font-mono bg-gray-100 p-2 rounded">
                Tenant: {dados.venda.tenant_id}
              </div>
            </div>
          ) : (
            <div className="h-40 flex items-center justify-center text-gray-400 bg-gray-50 rounded border border-dashed">
              Aguardando busca...
            </div>
          )}
        </div>

        {/* Painel DIREITO: Carnê */}
        <div className="bg-white p-6 shadow rounded border-2 border-blue-50">
          <div className="flex justify-between items-center mb-4 border-b pb-2">
            <h2 className="text-xl font-bold text-blue-900">📑 Contrato & Parcelas</h2>
            
            <div className="space-x-2">
              {/* Botão CRIAR */}
              {dados?.venda && !dados?.carne && (
                <button 
                  onClick={handleCriar} 
                  disabled={loading}
                  className="text-sm bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded shadow transition font-bold"
                >
                  + Criar Teste (3x)
                </button>
              )}
              
              {/* Botões de MANUTENÇÃO */}
              {dados?.carne && (
                <>
                  <button 
                    onClick={handleRenegociar}
                    disabled={loading} 
                    className="text-sm bg-purple-600 hover:bg-purple-700 text-white px-3 py-2 rounded shadow transition"
                  >
                    Renegociar (5x)
                  </button>
                  <button 
                    onClick={handleExcluir}
                    disabled={loading} 
                    className="text-sm bg-red-600 hover:bg-red-700 text-white px-3 py-2 rounded shadow transition"
                  >
                    Excluir Tudo
                  </button>
                </>
              )}
            </div>
          </div>

          {dados?.carne ? (
            <div>
              <div className="grid grid-cols-3 gap-2 mb-4 text-sm bg-blue-50 p-3 rounded text-blue-900">
                <div>
                  <span className="block text-xs opacity-60">ID Contrato</span>
                  <span className="font-bold">{dados.carne.id}</span>
                </div>
                <div>
                  <span className="block text-xs opacity-60">Parcelas (Capa)</span>
                  <span className="font-bold">{dados.carne.quantidade_parcelas}</span>
                </div>
                <div>
                  <span className="block text-xs opacity-60">Total Financiado</span>
                  <span className="font-bold">R$ {dados.carne.valor_total_financiado}</span>
                </div>
              </div>

              <div className="overflow-hidden border rounded-lg mt-4">
                <table className="w-full text-sm">
                  <thead className="bg-gray-100 text-gray-600">
                    <tr>
                      <th className="p-3 text-left">#</th>
                      <th className="p-3 text-left">Vencimento</th>
                      <th className="p-3 text-left">Valor</th>
                      <th className="p-3 text-left">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {dados.parcelas.map((p) => (
                      <tr key={p.id} className="hover:bg-gray-50">
                        <td className="p-3 font-mono text-gray-500">{p.numero_parcela}</td>
                        <td className="p-3">{new Date(p.data_vencimento).toLocaleDateString()}</td>
                        <td className="p-3">R$ {p.valor_parcela}</td>
                        <td className="p-3">
                          <span className={`px-2 py-1 rounded text-xs font-bold ${
                            p.status === 'Pago' 
                              ? 'bg-green-100 text-green-700' 
                              : 'bg-orange-100 text-orange-700'
                          }`}>
                            {p.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                    
                    {dados.parcelas.length === 0 && (
                      <tr>
                        <td colSpan={4} className="p-8 text-center bg-red-50 text-red-600">
                          <p className="font-bold text-lg">⚠️ ERRO ZUMBI DETECTADO</p>
                          <p className="text-sm mt-1">Este contrato não possui parcelas.</p>
                          <p className="text-xs mt-2 text-gray-500">Clique em "Excluir Tudo" acima para corrigir.</p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
             <div className="h-40 flex flex-col items-center justify-center text-gray-400 italic bg-gray-50 rounded border border-dashed">
              <p>Nenhum contrato ativo.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}