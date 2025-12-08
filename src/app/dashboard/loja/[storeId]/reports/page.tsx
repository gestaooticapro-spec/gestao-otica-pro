'use client'; 
import { useParams } from 'next/navigation';

export default function PlaceholderPage() {
    const params = useParams();
    const storeId = params.storeId;
    
    return (
        <div className="p-10">
            <h1 className="text-3xl font-bold">Página de Destino: {storeId}</h1>
            <p className="mt-4 text-gray-600">Conteúdo em construção.</p>
        </div>
    );
}