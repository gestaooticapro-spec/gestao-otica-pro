const fs = require('fs');

let content = fs.readFileSync('src/components/evaluation/EvaluationInterface.tsx', 'utf8');
const lines = content.split('\n');

const startLine = 1577; // 0-indexed, so line 1578
const endLine = 1670;   // 0-indexed, so line 1671

const newBlock = `                  <div className="grid grid-cols-12 gap-4">
                    {/* SUBSECTION 1: HISTÓRICO E ÓCULOS ATUAL */}
                    <div className="col-span-12">
                      <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2 pb-2 border-b border-white/5">
                        Histórico e Óculos Atual
                      </h4>
                    </div>
                    <div className="col-span-12 md:col-span-4">
                      <label className={labelStyle}>Marca atual</label>
                      <input
                        value={form.marcaAtual}
                        onChange={(e) => handleFormChange('marcaAtual', e.target.value)}
                        className={inputStyle}
                        placeholder="Ex: Hoya, Zeiss, Essilor"
                      />
                    </div>
                    <div className="col-span-12 md:col-span-4">
                      <label className={labelStyle}>Tipo da lente atual</label>
                      <select
                        value={form.tipoLenteAtual}
                        onChange={(e) => handleFormChange('tipoLenteAtual', e.target.value)}
                        className={selectStyle}
                      >
                        <option value="nao_informado">Não informado</option>
                        <option value="visao_simples">Visão simples</option>
                        <option value="multifocal">Multifocal / progressiva</option>
                        <option value="ocupacional">Ocupacional</option>
                        <option value="bifocal">Bifocal</option>
                      </select>
                    </div>
                    <div className="col-span-12 md:col-span-4">
                      <label className={labelStyle}>Usa multifocal hoje?</label>
                      <select
                        value={form.usaMultifocalHoje}
                        onChange={(e) => handleFormChange('usaMultifocalHoje', e.target.value)}
                        className={selectStyle}
                      >
                        <option value="nao_informado">Não informado</option>
                        <option value="sim">Sim</option>
                        <option value="nao">Não</option>
                      </select>
                    </div>
                    <div className="col-span-12 md:col-span-4">
                      <label className={labelStyle}>Adaptação com lentes anteriores</label>
                      <select
                        value={form.dificuldadeAdaptacao}
                        onChange={(e) => handleFormChange('dificuldadeAdaptacao', e.target.value)}
                        className={selectStyle}
                      >
                        <option value="nao_informado">Não informado</option>
                        <option value="baixa">Boa adaptação</option>
                        <option value="media">Alguma dificuldade</option>
                        <option value="alta">Muita dificuldade</option>
                      </select>
                    </div>
                    <div className="col-span-12 md:col-span-4">
                      <label className={labelStyle}>Trocas recentes de lente</label>
                      <select
                        value={form.historicoTrocasRecentes}
                        onChange={(e) => handleFormChange('historicoTrocasRecentes', e.target.value)}
                        className={selectStyle}
                      >
                        <option value="nao_informado">Não informado</option>
                        <option value="nenhuma">Nenhuma recente</option>
                        <option value="uma">Uma troca recente</option>
                        <option value="varias">Várias trocas / retrabalho</option>
                      </select>
                    </div>

                    {/* SUBSECTION 2: OBJETIVOS E PREFERÊNCIAS */}
                    <div className="col-span-12 mt-4">
                      <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2 pb-2 border-b border-white/5">
                        Objetivos e Preferências
                      </h4>
                    </div>
                    <div className="col-span-12 md:col-span-4">
                      <label className={labelStyle}>Prioridade principal</label>
                      <select
                        value={form.prioridadePrincipal}
                        onChange={(e) => handleFormChange('prioridadePrincipal', e.target.value)}
                        className={selectStyle}
                      >
                        <option value="equilibrio">Equilíbrio geral</option>
                        <option value="economia">Melhor custo-benefício</option>
                        <option value="adaptacao">Adaptação mais fácil</option>
                        <option value="resistencia">Mais resistência</option>
                        <option value="controle_miopia">Controle de miopia</option>
                        <option value="premium">Desempenho premium</option>
                      </select>
                    </div>
                    <div className="col-span-12 md:col-span-4">
                      <label className={labelStyle}>Principal incômodo atual</label>
                      <select
                        value={form.principalIncomodoAtual}
                        onChange={(e) => handleFormChange('principalIncomodoAtual', e.target.value)}
                        className={selectStyle}
                      >
                        <option value="nao_informado">Não informado</option>
                        <option value="nenhum">Nenhum específico</option>
                        <option value="perto">Não enxerga bem de perto</option>
                        <option value="longe">Não enxerga bem de longe</option>
                        <option value="intermediario">Intermediário / computador</option>
                        <option value="peso_espessura">Peso / espessura</option>
                        <option value="reflexo">Reflexo / brilho</option>
                        <option value="adaptacao">Dificuldade de adaptação</option>
                        <option value="preco">Preço</option>
                      </select>
                    </div>
                    <div className="col-span-12 md:col-span-4">
                      <label className={labelStyle}>Objetivo desta compra</label>
                      <select
                        value={form.objetivoCompra}
                        onChange={(e) => handleFormChange('objetivoCompra', e.target.value)}
                        className={selectStyle}
                      >
                        <option value="nao_informado">Não informado</option>
                        <option value="primeira_multifocal">Primeira multifocal</option>
                        <option value="upgrade">Upgrade de lente</option>
                        <option value="resolver_queixa">Resolver queixa específica</option>
                        <option value="economizar">Economizar</option>
                        <option value="trocar_marca">Trocar marca/laboratório</option>
                      </select>
                    </div>
                    <div className="col-span-12 md:col-span-4">
                      <label className={labelStyle}>Faixa de orçamento</label>
                      <select
                        value={form.faixaOrcamento}
                        onChange={(e) => handleFormChange('faixaOrcamento', e.target.value)}
                        className={selectStyle}
                      >
                        <option value="nao_informado">Não informado</option>
                        <option value="ate_800">Até 800</option>
                        <option value="800_2000">800 a 2.000</option>
                        <option value="2000_5000">2.000 a 5.000</option>
                        <option value="acima_5000">Acima de 5.000</option>
                      </select>
                    </div>
                    <div className="col-span-12 md:col-span-4">
                      <label className={labelStyle}>Orçamento alvo</label>
                      <input
                        value={form.budgetTarget}
                        onChange={(e) => handleFormChange('budgetTarget', e.target.value)}
                        className={inputStyle}
                        placeholder="Ex: até 2500"
                      />
                    </div>
                    <div className="col-span-12 md:col-span-4">
                      <label className={labelStyle}>Importância de estética/finura</label>
                      <select
                        value={form.importanciaEstetica}
                        onChange={(e) => handleFormChange('importanciaEstetica', e.target.value)}
                        className={selectStyle}
                      >
                        <option value="nao_informado">Não informado</option>
                        <option value="baixa">Baixa</option>
                        <option value="media">Média</option>
                        <option value="alta">Alta</option>
                      </select>
                    </div>
                    <div className="col-span-12 md:col-span-4">
                      <label className={labelStyle}>Importância de resistência</label>
                      <select
                        value={form.importanciaResistencia}
                        onChange={(e) => handleFormChange('importanciaResistencia', e.target.value)}
                        className={selectStyle}
                      >
                        <option value="nao_informado">Não informado</option>
                        <option value="baixa">Baixa</option>
                        <option value="media">Média</option>
                        <option value="alta">Alta</option>
                      </select>
                    </div>
                    <div className="col-span-12 md:col-span-4">
                      <label className={labelStyle}>Prefere Transitions?</label>
                      <select
                        value={form.prefereTransitions}
                        onChange={(e) => handleFormChange('prefereTransitions', e.target.value)}
                        className={selectStyle}
                      >
                        <option value="nao_informado">Não informado</option>
                        <option value="sim">Sim</option>
                        <option value="nao">Não</option>
                      </select>
                    </div>
                    <div className="col-span-12 md:col-span-4">
                      <label className={labelStyle}>Prefere Blue/UV?</label>
                      <select
                        value={form.prefereBlueUv}
                        onChange={(e) => handleFormChange('prefereBlueUv', e.target.value)}
                        className={selectStyle}
                      >
                        <option value="nao_informado">Não informado</option>
                        <option value="sim">Sim</option>
                        <option value="nao">Não</option>
                      </select>
                    </div>
                    <div className="col-span-12 md:col-span-4">
                      <label className={labelStyle}>Aceita opção premium?</label>
                      <select
                        value={form.aceitaPremium}
                        onChange={(e) => handleFormChange('aceitaPremium', e.target.value)}
                        className={selectStyle}
                      >
                        <option value="nao_informado">Não informado</option>
                        <option value="sim">Sim</option>
                        <option value="nao">Não</option>
                      </select>
                    </div>

                    {/* SUBSECTION 3: SINTOMAS E COMPORTAMENTOS */}
                    <div className="col-span-12 mt-4">
                      <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2 pb-2 border-b border-white/5">
                        Sintomas e Comportamentos
                      </h4>
                    </div>
                    <div className="col-span-12 md:col-span-4">
                      <label className={labelStyle}>Dificuldade para dirigir à noite</label>
                      <select
                        value={form.queixaDirigirNoite}
                        onChange={(e) => handleFormChange('queixaDirigirNoite', e.target.value)}
                        className={selectStyle}
                      >
                        <option value="nao">Não</option>
                        <option value="sim">Sim</option>
                      </select>
                    </div>
                    <div className="col-span-12 md:col-span-4">
                      <label className={labelStyle}>Sensibilidade à luz</label>
                      <select
                        value={form.queixaSensibilidadeLuz}
                        onChange={(e) => handleFormChange('queixaSensibilidadeLuz', e.target.value)}
                        className={selectStyle}
                      >
                        <option value="nao">Não</option>
                        <option value="sim">Sim</option>
                      </select>
                    </div>
                    <div className="col-span-12 md:col-span-4">
                      <label className={labelStyle}>Quebra óculos com frequência</label>
                      <select
                        value={form.queixaQuebraOculos}
                        onChange={(e) => handleFormChange('queixaQuebraOculos', e.target.value)}
                        className={selectStyle}
                      >
                        <option value="nao">Não</option>
                        <option value="sim">Sim</option>
                      </select>
                    </div>
                    <div className="col-span-12 md:col-span-4">
                      <label className={labelStyle}>Criança muito ativa</label>
                      <select
                        value={form.queixaCriancaAtiva}
                        onChange={(e) => handleFormChange('queixaCriancaAtiva', e.target.value)}
                        className={selectStyle}
                      >
                        <option value="nao">Não</option>
                        <option value="sim">Sim</option>
                      </select>
                    </div>
                    <div className="col-span-12 md:col-span-4">
                      <label className={labelStyle}>Grau aumentando rápido</label>
                      <select
                        value={form.queixaProgressaoRapida}
                        onChange={(e) => handleFormChange('queixaProgressaoRapida', e.target.value)}
                        className={selectStyle}
                      >
                        <option value="nao">Não</option>
                        <option value="sim">Sim</option>
                      </select>
                    </div>

                    {/* SUBSECTION 4: OBSERVAÇÕES ADICIONAIS */}
                    <div className="col-span-12 mt-4">
                      <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2 pb-2 border-b border-white/5">
                        Observações Adicionais
                      </h4>
                    </div>
                    <div className="col-span-12">
                      <label className={labelStyle}>Observações do consultor</label>
                      <textarea
                        value={form.observacoesConsultor}
                        onChange={(e) => handleFormChange('observacoesConsultor', e.target.value)}
                        className="block min-h-[92px] w-full rounded-xl border border-white/20 bg-slate-900/60 shadow-inner text-slate-100 px-3 py-3 text-sm font-bold placeholder:font-normal placeholder:text-slate-500 outline-none focus:ring-1 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all disabled:opacity-50"
                        placeholder="Ex: cliente muito sensível a preço, já devolveu multifocal, quer lente mais fina, compara muito com concorrente..."
                      />
                    </div>
                  </div>`;

lines.splice(startLine, endLine - startLine + 1, newBlock);
fs.writeFileSync('src/components/evaluation/EvaluationInterface.tsx', lines.join('\n'));
console.log('Restored');
