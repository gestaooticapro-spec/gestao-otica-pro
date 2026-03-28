import os

# --- CONFIGURAÇÕES ---
PASTA_PROJETO = './'  # Onde o script está rodando
ARQUIVOS_RAIZ_IMPORTANTES = [
    'package.json', 'next.config.js', 'tailwind.config.ts', 
    'tailwind.config.js', 'tsconfig.json', '.env.example'
]
EXTENSOES_PERMITIDAS = ('.tsx', '.ts', '.js', '.jsx', '.json', '.css')
PASTAS_IGNORAR = ['node_modules', '.next', '.git', 'dist', 'build', '.vercel']

def gerar_bundle(nome_saida, pastas_alvo):
    with open(nome_saida, 'w', encoding='utf-8') as f_out:
        # 1. PEGAR ARQUIVOS DA RAIZ PRIMEIRO
        for arq in ARQUIVOS_RAIZ_IMPORTANTES:
            caminho = os.path.join(PASTA_PROJETO, arq)
            if os.path.exists(caminho):
                escrever_arquivo(f_out, caminho)

        # 2. PERCORRER PASTAS SELECIONADAS (ex: src)
        for pasta in pastas_alvo:
            caminho_pasta = os.path.join(PASTA_PROJETO, pasta)
            if not os.path.exists(caminho_pasta):
                continue

            for raiz, diretorios, arquivos in os.walk(caminho_pasta):
                # Ignora pastas proibidas
                diretorios[:] = [d for d in diretorios if d not in PASTAS_IGNORAR]

                for arquivo in arquivos:
                    if arquivo.endswith(EXTENSOES_PERMITIDAS):
                        caminho_completo = os.path.join(raiz, arquivo)
                        escrever_arquivo(f_out, caminho_completo)

def escrever_arquivo(f_out, caminho_completo):
    try:
        with open(caminho_completo, 'r', encoding='utf-8') as f_in:
            relativo = os.path.relpath(caminho_completo, PASTA_PROJETO)
            f_out.write(f"\n\n// ==========================================\n")
            f_out.write(f"// CAMINHO: {relativo}\n")
            f_out.write(f"// ==========================================\n\n")
            f_out.write(f_in.read())
            f_out.write("\n")
    except Exception as e:
        print(f"Erro ao ler {caminho_completo}: {e}")

# EXECUTAR
# Você pode criar um único arquivo ou manter sua lógica de partes
gerar_bundle('PROJETO_COMPLETO_IA.txt', ['src'])
print("Bundle gerado com sucesso! Agora é só arrastar para o AI Studio.")