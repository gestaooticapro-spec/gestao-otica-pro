export default function PrintLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-white text-black font-sans print:bg-white print:text-black">
      {/* Removemos o SideNav e Header aqui. É uma página 'crua'. */}
      {children}
    </div>
  )
}