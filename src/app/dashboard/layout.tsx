// Caminho: src/app/dashboard/layout.tsx
import React from 'react';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
// CORREÇÃO: Ajuste do caminho para minúsculo para coincidir com o nome real do arquivo e evitar erro no Linux/Vercel
import Header from '@/components/header';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createClient();
  
  // 1. Apenas faz a checagem de autenticação no nível mais alto.
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return redirect('/login');
  }

  // Se o usuário está logado, apenas renderiza o Header e passa o controle
  // para o layout aninhado (children).

  return (
    <>
      <Header />
      
      {/* Container Principal: Header é compensado por pt-16 */}
      <div className="flex flex-1 pt-16">
        {/* O CHILDREN (a rota filha) será responsável por renderizar a SideNav (se for uma rota de loja) */}
        {children}
      </div>
    </>
  );
}