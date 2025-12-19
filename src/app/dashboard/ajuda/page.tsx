'use client'
import { useState } from 'react';
import { Send, Bot, User } from 'lucide-react';

export default function AjudaPage() {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<{role: 'user' | 'ai', text: string}[]>([]);
  const [loading, setLoading] = useState(false);

  const handleSend = async () => {
    if (!input.trim()) return;
    
    const userMsg = input;
    setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/chat-tutorial', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMsg }),
      });
      
      const data = await res.json();
      setMessages(prev => [...prev, { role: 'ai', text: data.reply }]);
    } catch (error) {
      setMessages(prev => [...prev, { role: 'ai', text: "Erro ao conectar com o servidor." }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-100px)] max-w-4xl mx-auto p-4">
      <div className="bg-white p-4 rounded-xl shadow-sm border mb-4">
        <h1 className="font-bold text-xl flex items-center gap-2">
          <Bot className="text-blue-600" />
          Suporte Inteligente (IA)
        </h1>
        <p className="text-sm text-gray-500">Pergunte como usar o sistema. Eu li o código fonte!</p>
      </div>

      <div className="flex-1 overflow-y-auto space-y-4 mb-4 pr-2">
        {messages.map((m, i) => (
          <div key={i} className={`flex gap-3 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
            <div className={`p-2 rounded-full h-fit ${m.role === 'user' ? 'bg-blue-100' : 'bg-gray-100'}`}>
              {m.role === 'user' ? <User size={20} /> : <Bot size={20} />}
            </div>
            <div className={`p-3 rounded-2xl max-w-[80%] text-sm whitespace-pre-wrap ${
              m.role === 'user' ? 'bg-blue-600 text-white' : 'bg-gray-50 text-gray-800 border'
            }`}>
              {m.text}
            </div>
          </div>
        ))}
        {loading && <div className="text-center text-xs text-gray-400 animate-pulse">Lendo o código...</div>}
      </div>

      <div className="flex gap-2">
        <input 
          className="flex-1 border rounded-xl px-4 py-2 outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Ex: Como lanço uma venda rápida?"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSend()}
        />
        <button 
          onClick={handleSend}
          disabled={loading}
          className="bg-blue-600 text-white p-3 rounded-xl hover:bg-blue-700 disabled:opacity-50"
        >
          <Send size={20} />
        </button>
      </div>
    </div>
  );
}