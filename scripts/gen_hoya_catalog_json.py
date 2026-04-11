#!/usr/bin/env python3
"""
Gera extração estrutural do catálogo HOYA em JSON auditável.
Fonte: .tabelas/hoya-bm-20251113011825405.pdf
Baseado em extração word-level via pdfplumber com mapeamento de coordenadas x,y.
"""
import json
import csv

def p(s):
    """Converte preço string (separador de milhar .) para inteiro BRL."""
    if not s or s in ('em_breve', None):
        return None
    try:
        return int(str(s).replace('.', ''))
    except:
        return None

def row(cor, tratamento, grades, precos_raw, flags=None):
    r = {"cor": cor, "tratamento": tratamento}
    for i, (g, praw) in enumerate(zip(grades, precos_raw), 1):
        r[f"grade_col{i}"] = g
        if praw == 'em_breve':
            r[f"preco_col{i}"] = None
            r[f"preco_col{i}_status"] = "EM_BREVE"
        else:
            r[f"preco_col{i}"] = p(str(praw)) if praw is not None else None
    if flags:
        r["notas"] = flags
    return r

def family(nome, pagina, tier, categoria, materiais, confianca, nota_mat, itens, info=None):
    fam = {
        "nome": nome,
        "pagina_pdf": pagina,
        "tier": tier,
        "categoria": categoria,
        "colunas_materiais": {f"col{i+1}": m for i, m in enumerate(materiais)},
        "confianca_material": confianca,
        "nota_material": nota_mat,
        "precos": itens
    }
    if info:
        fam["info_adicional"] = info
    return fam

def write_audit_csv(path, payload):
    fieldnames = [
        "familia", "pagina_pdf", "categoria", "tier", "cor", "tratamento", "notas",
        "material_col1", "grade_col1", "preco_col1", "status_col1",
        "material_col2", "grade_col2", "preco_col2", "status_col2",
        "material_col3", "grade_col3", "preco_col3", "status_col3",
        "material_col4", "grade_col4", "preco_col4", "status_col4",
        "material_col5", "grade_col5", "preco_col5", "status_col5",
        "material_col6", "grade_col6", "preco_col6", "status_col6",
    ]

    with open(path, "w", newline="", encoding="utf-8") as csvfile:
        writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
        writer.writeheader()

        for fam in payload["familias"]:
            materiais = fam.get("colunas_materiais", {})
            for item in fam.get("precos", []):
                row_out = {
                    "familia": fam["nome"],
                    "pagina_pdf": fam["pagina_pdf"],
                    "categoria": fam["categoria"],
                    "tier": fam["tier"],
                    "cor": item.get("cor"),
                    "tratamento": item.get("tratamento"),
                    "notas": " | ".join(item.get("notas", [])) if isinstance(item.get("notas"), list) else item.get("notas"),
                }
                for i in range(1, 7):
                    row_out[f"material_col{i}"] = materiais.get(f"col{i}")
                    row_out[f"grade_col{i}"] = item.get(f"grade_col{i}")
                    price = item.get(f"preco_col{i}")
                    row_out[f"preco_col{i}"] = f"{price:,}".replace(",", ".") if isinstance(price, int) else price
                    row_out[f"status_col{i}"] = item.get(f"preco_col{i}_status")
                writer.writerow(row_out)

data = {
    "laboratorio": "HOYA",
    "nome_tabela": "Tabela de Preços Sugeridos HOYA",
    "validade": "Dezembro 2025",
    "moeda": "BRL",
    "unidade": "par",
    "condicao_pagamento": "a_vista",
    "data_extracao": "2026-04-09",
    "metodo": "pdfplumber word-level (x,y coords) + mapeamento col por posição horizontal",
    "notas_gerais": [
        "Preços em BRL por par, à vista",
        "REGRA COLUNAS: esquerda=mais caro=maior índice de refração",
        "Tratamentos SEM Blue Control disponíveis no HOYALAB com mesmo preço do BC correspondente",
        "Sensity Dark e Sensity Fast disponíveis no HOYALAB com mesmo preço do Sensity 2",
        "EM_BREVE: disponibilidade futura - null comercialmente por ora",
        "OCR corrigido: 3449 (era '3449'), 6299 (era '6299'), 5949 (era '5949')",
        "1.74 incompatível com Sensity 2 fotocromática nas progressivas premium"
    ],
    "familias": []
}

# ---------- MiYOSMART ----------
data["familias"].append({
    "nome": "MiYOSMART",
    "pagina_pdf": 9,
    "tier": "Especial - Controle de Miopia",
    "categoria": "Lentes Especiais",
    "colunas_materiais": {"col1": "Prontas", "col2": "Surfacadas"},
    "confianca_material": "alta",
    "nota_material": "2 colunas por tipo de fabricacao, nao por material. Cil: -2.00 prontas / -4.00 surfacadas.",
    "info_adicional": {
        "cilindro_prontas": "-2.00", "cilindro_surfacadas": "-4.00",
        "diametro_surfacadas": "60-75mm", "prima_max": "3",
        "indicacao_clinica": "Controle progressao miopica"
    },
    "precos": [
        row("INCOLOR", "Antirreflexo MiYOSMART",
            ["-6.00 a 0.00", "-13.00 a 0.00"], [2099, 2099]),
        row("CHAMELEON", "Antirreflexo MiYOSMART",
            [None, "-10.00 a 0.00"], [None, 2099],
            ["CHAMELEON apenas surfacada"]),
        row("SUNBIRD", "Antirreflexo MiYOSMART",
            [None, "-10.00 a 0.00"], [None, 2099],
            ["SUNBIRD apenas surfacada"])
    ]
})

# ---------- NULUX iDENTITY V+ ----------
# pdf.pages[11] = PDF p.12
# EYAS 2.0 em col3 (x~274). Produto nome confirmado no topo direito da pagina.
# Grade ranges: col1=-20/+12*, col2=-15/+10, col3=-13/+8, col4=-13/+9, col5=-10/+10
# Atencao: col1 sem No-Risk BC; col5 sem Meiryo INCOLOR
# Sensity 2: EM BREVE col1 e col3; col2=disponivel, col4/col5 disponivel
# Sensity SHINE (Light Mirror): disponivel em col2, col4, col5
g_id_v = ["-20.00 a +12.00*", "-15.00 a +10.00", "-13.00 a +8.00", "-13.00 a +9.00", "-10.00 a +10.00"]
g_id_v_s2 = [None, "-15.00 a +10.00", None, "-13.00 a +9.00", "-10.00 a +10.00"]
data["familias"].append(family(
    "NULUX iDENTITY V+", 12, "Surfacada Bi-Asferica Individualizada",
    "Lentes de Visao Simples Surfacadas",
    ["1.74", "1.67", "1.60 (EYAS 2.0)", "1.59", "1.50"],
    "alta",
    "EYAS 2.0 confirmado col3 (x~274). Col1=1.74 sem No-Risk BC. Col5=1.50 sem Meiryo INCOLOR. Sensity 2 EM BREVE col1 e col3. Produto NOVIDADE com Sensity SHINE.",
    [
        row("INCOLOR", "Hi-Vision Meiryo", g_id_v, [4549, 4049, 3159, 2699, None],
            ["1.50 sem Meiryo INCOLOR"]),
        row("INCOLOR", "Hi-Vision LongLife BlueControl", g_id_v, [4349, 3849, 2959, 2499, 2149]),
        row("INCOLOR", "No-Risk BlueControl", g_id_v, [None, 3599, 2709, 2249, 1899],
            ["1.74 sem No-Risk BC"]),
        row("SENSITY 2", "Hi-Vision Meiryo", g_id_v_s2, [None, 5249, None, 3899, None],
            ["EM BREVE col1 (1.74) e col3 (1.60)", "col5 (1.50) sem Sensity Meiryo"]),
        row("SENSITY 2", "Hi-Vision LongLife BlueControl", g_id_v_s2, [None, 5049, None, 3699, 3349]),
        row("SENSITY 2", "No-Risk BlueControl", g_id_v_s2, [None, 4799, None, 3449, 3099]),
        row("SENSITY SHINE", "Light Mirror", g_id_v_s2, [None, 5449, None, 4099, 3749],
            ["Sensity SHINE = Light Mirror - produto NOVIDADE"]),
        row("COLORIDAS", "Hi-Vision Sun Pro", g_id_v, [4639, 3889, 2999, 2539, 2189])
    ]
))

# ---------- NULUX TrueForm ----------
g_tf = ["-10.00 a +8.00", "-10.00 a +8.00", "-10.00 a +6.00", "-10.00 a +8.00", "-10.00 a +8.00"]
data["familias"].append(family(
    "NULUX TrueForm", 13, "Surfacada Bi-Asferica TrueForm",
    "Lentes de Visao Simples Surfacadas",
    ["1.67 (EYNOA)", "1.60 (EYAS 2.0)", "1.59", "1.53 (PNX)", "1.50"],
    "alta",
    "Pagina 13 confirma as 5 colunas como EYNOA 1.67, EYAS 2.0 1.60, 1.59, PNX 1.53 e Organic 1.50. Nota do PDF: 1.67 sem Sensity 2.",
    [
        row("INCOLOR", "Hi-Vision Meiryo", g_tf, [3509, 2709, 'em_breve', 2249, 1899]),
        row("INCOLOR", "Hi-Vision LongLife BlueControl", g_tf, [3309, 2509, 'em_breve', 2049, 1699]),
        row("INCOLOR", "No-Risk BlueControl", g_tf, [3059, 2259, 1799, 1799, 1449]),
        row("INCOLOR", "Hi-Vision Hard", g_tf, [2439, 1639, 1179, 1179, 829]),
        row("SENSITY 2", "Hi-Vision Meiryo", g_tf, [4709, 'em_breve', 'em_breve', 3449, 3099],
            ["EM BREVE cols 2,3 Sensity 2", "3449=OCR corrigido"]),
        row("SENSITY 2", "Hi-Vision LongLife BlueControl", g_tf, [4509, 'em_breve', 'em_breve', 3249, 2899]),
        row("SENSITY 2", "No-Risk BlueControl", g_tf, [4259, 'em_breve', 'em_breve', 2999, 2649]),
        row("SENSITY 2", "Hi-Vision Hard", g_tf, [3639, 'em_breve', 'em_breve', 2379, 2029]),
        row("COLORIDAS", "Hi-Vision Sun Pro", g_tf, [3349, 2549, 'em_breve', 2089, 1739])
    ],
    {"cilindro": "-4.00 / 1.67 Sensity 2 termos Cil. -6.00", "diametro": "1.50/1.53/1.67 - 75mm | 1.59 - 77mm | 1.60 - 70mm", "marcacao": "(-)"}
))

# ---------- HILUX Esferiicas Surfacadas ----------
g_hs = ["-10.00 a +6.00", "-10.00 a +8.00", "-10.00 a +8.00"]
data["familias"].append(family(
    "HILUX Esfericas Surfacadas", 14, "Surfacada Esferica Padrao",
    "Lentes de Visao Simples Surfacadas",
    ["1.59", "1.53", "1.50"],
    "alta",
    "Pagina 14 informa diametros para 1.59, 1.53 e 1.50, compativeis com as 3 colunas da familia. PDF p.15 segue como continuacao nao extraida.",
    [
        row("INCOLOR", "Hi-Vision Meiryo", g_hs, [1949, 1949, 1599]),
        row("INCOLOR", "Hi-Vision LongLife BlueControl", g_hs, ['em_breve', 1749, 1399],
            ["EM BREVE col1 (1.59)"]),
        row("INCOLOR", "No-Risk BlueControl", g_hs, [1499, 1499, 1149]),
        row("INCOLOR", "Hi-Vision Hard", g_hs, [849, 849, 499]),
        row("SENSITY 2", "Hi-Vision Meiryo", g_hs, [None, 2949, 2599],
            ["Sem 1.67 com Sensity 2 - nota explícita PDF"]),
        row("SENSITY 2", "Hi-Vision LongLife BlueControl", g_hs, [None, 2749, 2399]),
        row("SENSITY 2", "No-Risk BlueControl", g_hs, [None, 2499, 2149]),
        row("SENSITY 2", "Hi-Vision Hard", g_hs, [None, 1849, 1499]),
        row("SENSITY ORIGINAL*", "Hi-Vision LongLife BlueControl", g_hs, [None, 2549, 2199],
            ["*Enquanto durarem estoques"]),
        row("SENSITY ORIGINAL*", "No-Risk BlueControl", g_hs, [None, 2299, 1949]),
        row("SENSITY ORIGINAL*", "Hi-Vision Hard", g_hs, [None, 1649, 1299]),
        row("COLORIDAS", "Hi-Vision Sun Pro", g_hs, [None, 1789, 1439])
    ],
    {"cilindro": "-4.00", "diametro": "1.50 e 1.53 - 75mm | 1.59 - 77mm", "marcacao": "(-) / LS"}
))

# ---------- HILUX Prontas Esfericas ----------
g_hp = ["-4.00 a +4.00", "-4.00 a +2.00", "-4.00 a +4.00"]
data["familias"].append(family(
    "HILUX Prontas Esfericas", 17, "Pronta Esferica",
    "Lentes de Visao Simples Prontas",
    ["1.59 (POLI)", "1.53 (PNX)", "1.50"],
    "alta",
    "Pagina 17 confirma as 3 colunas como POLI 1.59, PNX 1.53 e Organic 1.50. Meiryo ausente em col1.",
    [
        row("INCOLOR", "Hi-Vision Meiryo", g_hp, [None, 1099, 899]),
        row("INCOLOR", "Hi-Vision LongLife BlueControl", g_hp, [None, 999, 799]),
        row("INCOLOR", "Hi-Vision LongLife UVControl", g_hp, [None, 999, 799]),
        row("INCOLOR", "Hi-Vision LongLife", g_hp, [None, None, 799]),
        row("INCOLOR", "CleanExtra", g_hp, [None, None, 439]),
        row("INCOLOR", "Hi-Vision Aqua", g_hp, [349, 349, 219]),
        row("SENSITY 2", "Hi-Vision LongLife UVControl", g_hp, [None, 1699, 1099]),
        row("SENSITY ORIGINAL*", "CleanExtra", g_hp, [None, None, 599],
            ["*Enquanto durarem estoques"])
    ],
    {"cilindro": "-2.00", "diametro": "65mm/70mm", "marcacao": "(-)", "codigo_bloco": "LP"}
))

# ---------- Pentax ----------
g_pentax_blue = ["-6.00 a +6.00", "-4.00 a +4.00", "-4.00 a +4.00"]
g_pentax_photo = ["-6.00 a +6.00", None, None]
data["familias"].append(family(
    "Pentax", 19, "Pronta Asferica",
    "Lentes de Visao Simples Prontas",
    ["1.67", "1.59", "1.56"],
    "alta",
    "Pagina especifica de Pentax prontas. Blue em 3 colunas (1.67/1.59/1.56). Photo Grey apenas em 1.67.",
    [
        row("INCOLOR", "Pentax Blue", g_pentax_blue, [899, 559, 399]),
        row("FOTOSSENSIVEL", "Pentax Photo Grey", g_pentax_photo, [1019, None, None],
            ["Disponivel apenas em 1.67"])
    ],
    {
        "design": "Asferico",
        "cilindro": "ate -2.00",
        "diametro": "1.59/1.56 65/70mm | 1.67 65/70/75mm",
        "garantia_antirreflexo": "1 ano"
    }
))

# ---------- Hoyalux iD MySelf ----------
g_idm = ["-15.00 a +10.00", "-13.00 a +8.00", "-11.00 a +8.00", "-8.00 a +6.00", "-8.00 a +6.00"]
g_idm_s2 = [None, "-13.00 a +8.00", "-11.00 a +8.00", "-8.00 a +6.00", "-8.00 a +6.00"]
data["familias"].append(family(
    "Hoyalux iD MySelf", 22, "iD Premium+",
    "Lentes Progressivas",
    ["1.74", "1.67", "1.60 (EYAS 2.0)", "1.59", "1.50"],
    "alta",
    "EYAS 2.0 confirmado col3 (x~274). 5 colunas. Montagem 14-20mm.",
    [
        row("INCOLOR", "Hi-Vision Meiryo", g_idm, [14509, 13009, 11209, 10749, 10399]),
        row("INCOLOR", "Hi-Vision LongLife BlueControl", g_idm, [14309, 12809, 11009, 10549, 10199]),
        row("SENSITY 2", "Hi-Vision Meiryo", g_idm_s2, [None, 14409, 12609, 12149, 11799],
            ["1.74 incompatível com Sensity 2"]),
        row("SENSITY 2", "Hi-Vision LongLife BlueControl", g_idm_s2, [None, 14209, 12409, 11949, 11599]),
        row("COLORIDAS", "Hi-Vision Sun Pro", g_idm, [14599, 13099, 11299, 10839, 10489])
    ],
    {"montagem": "14/15/17/18/19/20mm"}
))

# ---------- Hoyalux iD [Premium+ produto 2 - id pendente] ----------
g_idp2 = ["-15.00 a +10.00", "-13.00 a +8.00", "-11.00 a +8.00", "-8.00 a +6.00", "-8.00 a +6.00"]
g_idp2_s2 = [None, "-13.00 a +8.00", "-11.00 a +8.00", "-8.00 a +6.00", "-8.00 a +6.00"]
data["familias"].append(family(
    "Hoyalux iD MyStyle V+", 23, "iD Premium+",
    "Lentes Progressivas",
    ["1.74", "1.67", "1.60 (EYAS 2.0)", "1.59", "1.50"],
    "alta",
    "Produto iD Premium+. Nome confirmado por auditoria visual do PDF: 'Hoyalux iD MyStyle V+'. Descricao: 'Individualizada para maior clareza e foco consistente'. Nome nao capturado pelo pdfplumber (elemento grafico). Precos ~4-5% abaixo do iD MySelf.",
    [
        row("INCOLOR", "Hi-Vision Meiryo", g_idp2, [14099, 12599, 10799, 10339, 9989]),
        row("INCOLOR", "Hi-Vision LongLife BlueControl", g_idp2, [13899, 12399, 10599, 10139, 9789]),
        row("SENSITY 2", "Hi-Vision Meiryo", g_idp2_s2, [None, 13999, 12199, 11739, 11389],
            ["1.74 incompatível com Sensity 2"]),
        row("SENSITY 2", "Hi-Vision LongLife BlueControl", g_idp2_s2, [None, 13799, 11999, 11539, 11189]),
        row("COLORIDAS", "Hi-Vision Sun Pro", g_idp2, [14189, 12689, 10889, 10429, 10079])
    ]
))

# ---------- Hoyalux iD LifeStyle 4 [variante A - p.24] ----------
g_ls4a_i = ["-13.00 a +8.00", "-12.00 a +8.00", "-10.00 a +8.00", "-8.00 a +6.00", "-8.00 a +6.00"]
g_ls4a_s2 = [None, "-12.00 a +8.00", "-10.00 a +8.00", "-8.00 a +6.00", "-8.00 a +6.00"]
g_ls4a_p = [None, "-12.00 a +8.00", "-10.00 a +8.00", "-8.00 a +5.50", "-8.00 a +5.00"]
data["familias"].append(family(
    "Hoyalux iD LifeStyle 4i", 24, "iD Premium",
    "Lentes Progressivas",
    ["1.74", "1.67", "1.60 (EYAS 2.0)", "1.59", "1.50"],
    "alta",
    "EYAS 2.0 confirmado col3. LifeStyle 4i = variante Indoor. Confirmado por auditoria visual PDF (p.24). Precos ligeiramente acima do LifeStyle 4 (p.25).",
    [
        row("INCOLOR", "Hi-Vision Meiryo", g_ls4a_i, [9659, 8159, 6359, 5899, 5549]),
        row("INCOLOR", "Hi-Vision LongLife BlueControl", g_ls4a_i, [9459, 7959, 6159, 5699, 5349]),
        row("INCOLOR", "No-Risk BlueControl", g_ls4a_i, [None, 7709, 5909, 5449, 5099],
            ["1.74 nao disponivel com No-Risk BC"]),
        row("SENSITY 2", "Hi-Vision Meiryo", g_ls4a_s2, [None, 9559, 7759, 7299, 6949]),
        row("SENSITY 2", "Hi-Vision LongLife BlueControl", g_ls4a_s2, [None, 9359, 7559, 7099, 6749]),
        row("SENSITY 2", "No-Risk BlueControl", g_ls4a_s2, [None, 9109, 7309, 6849, 6499]),
        row("POLARIZADO", "Hi-Vision Sun Pro", g_ls4a_p, [None, 8859, 7059, 6599, 6249]),
        row("COLORIDAS", "Hi-Vision Sun Pro", g_ls4a_i, [9749, 7999, 6199, 5739, 5389])
    ]
))

# ---------- Hoyalux iD LifeStyle 4 [variante B - p.25] ----------
g_ls4b_i = ["-13.00 a +8.00", "-12.00 a +8.00", "-10.00 a +8.00", "-8.00 a +6.00", "-8.00 a +6.00"]
g_ls4b_s2 = [None, "-12.00 a +8.00", "-10.00 a +8.00", "-8.00 a +6.00", "-8.00 a +6.00"]
g_ls4b_p = [None, "-12.00 a +8.00", "-10.00 a +8.00", "-8.00 a +5.50", "-8.00 a +5.00"]
data["familias"].append(family(
    "Hoyalux iD LifeStyle 4", 25, "iD Premium",
    "Lentes Progressivas",
    ["1.74", "1.67", "1.60 (EYAS 2.0)", "1.59", "1.50"],
    "alta",
    "EYAS 2.0 confirmado col3. LifeStyle 4 = produto base (Indoor/Urban/Outdoor). Precos ~150-200 BRL abaixo do LifeStyle 4i (p.24). Confirmado por auditoria visual PDF.",
    [
        row("INCOLOR", "Hi-Vision Meiryo", g_ls4b_i, [9509, 8009, 6209, 5749, 5399]),
        row("INCOLOR", "Hi-Vision LongLife BlueControl", g_ls4b_i, [9309, 7809, 6009, 5549, 5199]),
        row("INCOLOR", "No-Risk BlueControl", g_ls4b_i, [None, 7559, 5759, 5299, 4949]),
        row("SENSITY 2", "Hi-Vision Meiryo", g_ls4b_s2, [None, 9409, 7609, 7149, 6799]),
        row("SENSITY 2", "Hi-Vision LongLife BlueControl", g_ls4b_s2, [None, 9209, 7409, 6949, 6599]),
        row("SENSITY 2", "No-Risk BlueControl", g_ls4b_s2, [None, 8959, 7159, 6699, 6349]),
        row("POLARIZADO", "Hi-Vision Sun Pro", g_ls4b_p, [None, 8709, 6909, 6449, 6099]),
        row("COLORIDAS", "Hi-Vision Sun Pro", g_ls4b_i, [9599, 7849, 6049, 5589, 5239])
    ]
))

# ---------- Hoyalux Balansis ----------
g_bal = ["-12.00 a +8.00", "-10.00 a +8.00", "-8.00 a +6.00", "-8.00 a +6.00"]
g_bal_s2 = ["-12.00 a +8.00", None, "-8.00 a +6.00", "-8.00 a +6.00"]
g_bal_p = ["-12.00 a +8.00", "-10.00 a +8.00", None, "-8.00 a +3.00"]
data["familias"].append(family(
    "Hoyalux Balansis", 26, "Advanced",
    "Lentes Progressivas",
    ["1.67 (EYNOA)", "1.60 (EYAS 2.0)", "1.53 (PNX)", "1.50"],
    "alta",
    "Pagina 26 confirma as 4 colunas como EYNOA 1.67, EYAS 2.0 1.60, PNX 1.53 e Organic 1.50. Sensity 2 indisponivel na col2. OCR: 6299 e 5949 confirmados.",
    [
        row("INCOLOR", "Hi-Vision Meiryo", g_bal, [7159, 5359, 4899, 4549],
            ["EM BREVE na margem - verificar disponibilidade"]),
        row("INCOLOR", "Hi-Vision LongLife BlueControl", g_bal, [6959, 5159, 4699, 4349]),
        row("INCOLOR", "No-Risk BlueControl", g_bal, [6709, 4909, 4449, 4099]),
        row("SENSITY 2", "Hi-Vision Meiryo", g_bal_s2, [8559, None, 6299, 5949],
            ["col2 (1.60) EM BREVE para Sensity 2"]),
        row("SENSITY 2", "Hi-Vision LongLife BlueControl", g_bal_s2, [8359, None, 6099, 5749]),
        row("SENSITY 2", "No-Risk BlueControl", g_bal_s2, [8109, None, 5849, 5499]),
        row("POLARIZADO", "Hi-Vision Sun Pro", g_bal_p, [7859, 6059, None, 5249],
            ["col3 nao disponivel com Polarizado"]),
        row("COLORIDAS", "Hi-Vision Sun Pro", g_bal, [6999, 5199, 4739, 4389])
    ],
    {"montagem": "14mm/18mm", "cilindro": "-6.00", "adicao": "0.75 ate 3.50", "diametro": "ate 75mm", "marcacao": "BS41 / BS81"}
))

# ---------- Hoyalux Daynamic ----------
g_day = ["-13.00 a +7.50", "-13.00 a +6.50", "-10.00 a +6.00", "-8.00 a +6.00", "-8.00 a +6.00"]
g_day_s2 = ["-13.00 a +7.50", None, None, "-8.00 a +6.00", "-8.00 a +6.00"]
g_day_p = [None, "-11.50 a +6.50", None, None, "-8.00 a +3.00"]
data["familias"].append(family(
    "Hoyalux Daynamic", 27, "Advanced",
    "Lentes Progressivas",
    ["1.67 (EYNOA)", "1.60 (EYAS 2.0)", "1.59 (POLI)", "1.53 (PNX)", "1.50"],
    "alta",
    "Pagina 27 confirma as 5 colunas como EYNOA 1.67, EYAS 2.0 1.60, POLI 1.59, PNX 1.53 e Organic 1.50. Sensity 2 disponivel apenas nas colunas 1,4,5.",
    [
        row("INCOLOR", "Hi-Vision Meiryo", g_day, [5999, 4199, 'em_breve', 3739, 3389]),
        row("INCOLOR", "Hi-Vision LongLife BlueControl", g_day, [5799, 3999, 'em_breve', 3539, 3189]),
        row("INCOLOR", "No-Risk BlueControl", g_day, [5549, 3749, 3289, 3289, 2939]),
        row("INCOLOR", "Hi-Vision Hard", g_day, [4799, 2999, 2539, 2539, 2189]),
        row("SENSITY 2", "Hi-Vision Meiryo", g_day_s2, [7399, 'em_breve', 'em_breve', 5139, 4789]),
        row("SENSITY 2", "Hi-Vision LongLife BlueControl", g_day_s2, [7199, 'em_breve', 'em_breve', 4939, 4589]),
        row("SENSITY 2", "No-Risk BlueControl", g_day_s2, [6949, 'em_breve', 'em_breve', 4689, 4339]),
        row("SENSITY 2", "Hi-Vision Hard", g_day_s2, [6199, 'em_breve', 'em_breve', 3939, 3589]),
        row("POLARIZADO", "Hi-Vision Sun Pro", g_day_p, [None, 4899, None, None, 4089],
            ["Polarizado apenas cols 2 e 5"]),
        row("COLORIDAS", "Hi-Vision Sun Pro", g_day, [5839, 4039, 'em_breve', 3579, 3229])
    ],
    {"montagem": "14mm/16mm/18mm/20mm", "cilindro": "-6.00", "adicao": "0.75 ate 3.50", "diametro": "65 ate 80mm", "marcacao": "DP1 + Altura (4/6/8/2)"}
))

# ---------- ARGOS ----------
g_arg = ["-13.00 a +7.50", "-10.00 a +6.00", "-10.00 a +6.00", "-8.00 a +6.00", "-8.00 a +6.00"]
g_arg_s2 = [None, None, None, "-8.00 a +6.00", "-8.00 a +6.00"]
data["familias"].append(family(
    "ARGOS", 28, "Standard",
    "Lentes Progressivas",
    ["1.67 (EYNOA)", "1.60 (EYAS 2.0)", "1.59 (POLI)", "1.53 (PNX)", "1.50"],
    "alta",
    "Pagina 28 confirma as 5 colunas como EYNOA 1.67, EYAS 2.0 1.60, POLI 1.59, PNX 1.53 e Organic 1.50. Sensity 2 e Sensity Original disponiveis apenas nas colunas 4 e 5.",
    [
        row("INCOLOR", "Hi-Vision Meiryo", g_arg, [4959, 3159, 2699, 2699, 2349]),
        row("INCOLOR", "Hi-Vision LongLife BlueControl", g_arg, [4759, 2959, 'em_breve', 2499, 2149]),
        row("INCOLOR", "No-Risk BlueControl", g_arg, [4509, 2709, 2249, 2249, 1899]),
        row("INCOLOR", "Hi-Vision Hard", g_arg, [3909, 2109, 1649, 1649, 1299]),
        row("SENSITY 2", "Hi-Vision Meiryo", g_arg_s2, [None, None, None, 4099, 3749],
            ["Sensity 2 apenas cols 4,5"]),
        row("SENSITY 2", "Hi-Vision LongLife BlueControl", g_arg_s2, [None, None, None, 3899, 3549]),
        row("SENSITY 2", "No-Risk BlueControl", g_arg_s2, [None, None, None, 3649, 3299]),
        row("SENSITY 2", "Hi-Vision Hard", g_arg_s2, [None, None, None, 3049, 2699]),
        row("SENSITY ORIGINAL*", "Hi-Vision LongLife BlueControl", g_arg_s2, [None, None, None, 3499, 3149],
            ["*Enquanto durarem estoques"]),
        row("SENSITY ORIGINAL*", "No-Risk BlueControl", g_arg_s2, [None, None, None, 3249, 2899]),
        row("SENSITY ORIGINAL*", "Hi-Vision Hard", g_arg_s2, [None, None, None, 2649, 2299]),
        row("COLORIDAS", "Hi-Vision Sun Pro", g_arg, [4799, 2999, None, 2539, 2189])
    ],
    {"montagem": "14mm/18mm", "cilindro": "-4.00", "adicao": "1.00 ate 3.50", "diametro": "ate 80mm",
     "marcacao": "FSA1 ou FA1 ou DA + (1/5) + (1/X)",
     "nota": "Para o material EYNOA 1.67 a adicao e de 0.75 ate 3.50 e o cilindro ate -6.00"}
))

# ---------- Amplitude ----------
g_amp = ["-10.00 a +6.00", "-8.00 a +6.00", "-8.00 a +6.00"]
g_amp_s2 = [None, "-8.00 a +6.00", "-8.00 a +6.00"]
data["familias"].append(family(
    "Amplitude", 29, "Standard Entry",
    "Lentes Progressivas",
    ["1.59 (POLI)", "1.53 (PNX)", "1.50"],
    "alta",
    "Pagina 29 confirma as 3 colunas como POLI 1.59, PNX 1.53 e Organic 1.50. Produto entry-level.",
    [
        row("INCOLOR", "No-Risk BlueControl", g_amp, [1249, 1149, 799]),
        row("INCOLOR", "Hi-Vision Hard", g_amp, [1049, 949, 599]),
        row("SENSITY 2", "No-Risk BlueControl", g_amp_s2, [None, 1749, 1399]),
        row("COLORIDAS", "Hi-Vision Sun Pro", g_amp_s2, [None, 1439, 1089])
    ],
    {"montagem": "14mm/18mm", "cilindro": "-4.00", "adicao": "1.00 ate 3.50", "diametro": "ate 80mm", "marcacao": "AMS ou AM + Material"}
))

# ---------- WorkStyle 3 ----------
g_ws3 = ["-15.00 a +9.00", "-13.00 a +7.00", "-11.00 a +7.00", "-8.00 a +5.00", "-8.00 a +5.00"]
data["familias"].append(family(
    "WorkStyle 3", 32, "Ocupacional Premium",
    "Lentes Ocupacionais",
    ["1.74", "1.67", "1.60 (EYAS 2.0)", "1.59", "1.50"],
    "alta",
    "EYAS 2.0 confirmado col3 (x~274). 5 colunas. Desenhos CLOSE/SCREEN/SPACE.",
    [
        row("INCOLOR", "Hi-Vision LongLife BlueControl", g_ws3, [7499, 5999, 4199, 3739, 3389]),
        row("INCOLOR", "No-Risk BlueControl", g_ws3, [None, 5749, 3949, 3489, 3139],
            ["1.74 nao disponivel com No-Risk BC"]),
        row("COLORIDAS", "Hi-Vision Sun Pro", g_ws3, [7789, 6039, 4239, 3779, 3429])
    ],
    {"desenhos": ["CLOSE", "SCREEN", "SPACE"], "montagem": "15mm/16mm",
     "cilindro": "-6.00", "marcacao": "WS31+(P/S/C)+Corredor+ADD+F"}
))

# ---------- WorkSmart Room ----------
g_wsr = ["-11.00 a +7.00", "-8.00 a +6.00", "-8.00 a +6.00"]
data["familias"].append(family(
    "WorkSmart Room", 33, "Ocupacional",
    "Lentes Ocupacionais",
    ["1.60 (EYAS 2.0)", "1.53 (PNX)", "1.50"],
    "alta",
    "Pagina 33 confirma as 3 colunas como EYAS 2.0 1.60, PNX 1.53 e Organic 1.50. Versoes DT1 e DT21.",
    [
        row("INCOLOR", "Hi-Vision LongLife BlueControl", g_wsr, [2779, 2319, 1969]),
        row("INCOLOR", "No-Risk BlueControl", g_wsr, [2529, 2069, 1719]),
        row("COLORIDAS", "Hi-Vision Sun Pro", g_wsr, [2819, 2359, 2009])
    ],
    {"montagem": "18mm", "cilindro": "-6.00", "versoes": "DT1 (400) / DT21 (200)"}
))

# ---------- SYNC III ----------
g_sy = ["-13.00 a +9.00", "-13.00 a +7.50", "-10.00 a +6.00", "-10.00 a +6.00", "-8.00 a +6.00", "-8.00 a +6.00"]
g_sy_s2 = [None, "-13.00 a +7.50", None, None, "-8.00 a +6.00", "-8.00 a +6.00"]
g_sy_p = [None, None, None, None, None, "-8.00 a +3.00"]
data["familias"].append(family(
    "SYNC III", 35, "Especial - Fadiga Visual",
    "Lentes Especiais",
    ["1.74 (EYVIA)", "1.67 (EYNOA)", "1.60 (EYAS 2.0)", "1.59 (POLI)", "1.53 (PNX)", "1.50"],
    "alta",
    "Pagina 35 confirma as 6 colunas como EYVIA 1.74, EYNOA 1.67, EYAS 2.0 1.60, POLI 1.59, PNX 1.53 e Organic 1.50. Sensity 2 apenas nas colunas 2, 5 e 6. Polarizado apenas na coluna 6.",
    [
        row("INCOLOR", "Hi-Vision LongLife BlueControl", g_sy, [3709, 3359, 2559, None, 2099, 1749],
            ["col4 ausente"]),
        row("INCOLOR", "No-Risk BlueControl", g_sy, [None, 3109, 2309, 1849, 1849, 1499],
            ["col1 ausente", "cols 4,5 mesmo preco"]),
        row("SENSITY 2", "Hi-Vision LongLife BlueControl", g_sy_s2, [None, 4359, None, None, 3099, 2749],
            ["Sensity 2 apenas cols 2,5,6"]),
        row("SENSITY 2", "No-Risk BlueControl", g_sy_s2, [None, 4109, None, None, 2849, 2499]),
        row("POLARIZADO", "Hi-Vision Sun Pro", g_sy_p, [None, None, None, None, None, 2649],
            ["Polarizado APENAS col6"]),
        row("COLORIDAS", "Hi-Vision Sun Pro", g_sy, [3999, 3399, 2599, None, 2139, 1789],
            ["col4 ausente"])
    ],
    {"variantes": ["SYNC III-5 (+0.57 ADD)", "SYNC III-9 (+0.95 ADD)", "SYNC III-13 (+1.32 ADD)"],
     "indicacao": "Fadiga ocular / acomodacao (13-45 anos)",
     "montagem": "18mm",
     "cilindro": "-6.00",
     "diametro": "ate 80mm / 1.50 Polarizada ate 76mm",
     "marcacao": "DS1+ADD",
     "opcoes": "5 / 9 / 13",
     "faixas_etarias": {"5": "13-25", "9": "25-35", "13": "35-45"}}
))

# ---------- EnRoute Progressiva ----------
g_enroute_prog = ["-12.00 a +6.00", "-10.00 a +6.00"]
data["familias"].append(family(
    "EnRoute Progressiva", 36, "Progressiva Especial para Direcao",
    "Lentes Especiais",
    ["1.67", "1.60 (EYAS 2.0)"],
    "alta",
    "2 colunas. Produto especial para direcao com filtro de contraste. Col2 identificada como EYAS 2.0 pela pagina.",
    [
        row("INCOLOR", "Antirreflexo EnRoute", g_enroute_prog, [6699, 4899])
    ],
    {
        "montagem": "18mm",
        "adicao": "0.75 a 3.50",
        "cilindro": "-6.00",
        "diametro": "ate 75mm",
        "marcacao": "RP43",
        "observacao": "Lentes produzidas fora do Brasil"
    }
))

# ---------- EnRoute Visao Simples ----------
g_enroute_sv = ["-15.00 a +6.00", "-13.00 a +6.00"]
data["familias"].append(family(
    "EnRoute Visao Simples", 37, "Visao Simples Especial para Direcao",
    "Lentes Especiais",
    ["1.67", "1.60 (EYAS 2.0)"],
    "alta",
    "nuLUX EnRoute de visao simples. 2 colunas. Col2 associada a EYAS 2.0 pela pagina.",
    [
        row("INCOLOR", "Antirreflexo EnRoute", g_enroute_sv, [3090, 2290])
    ],
    {
        "design": "Asfericas e atoricas",
        "cilindro": "-4.00",
        "diametro": "ate 75mm",
        "marcacao": "(-)",
        "observacao": "Lentes produzidas fora do Brasil"
    }
))

# ---------- Hoyalux Sportive Progressiva ----------
g_sp_i_c6 = ["Curva6:-6/+4"] * 4
g_sp_i_c8 = ["Curva8:-5/+4"] * 4
g_sp_s2_c6 = [None, None, "Curva6:-6/+4", "Curva6:-6/+4"]
g_sp_s2_c8 = [None, None, "Curva8:-5/+4", "Curva8:-5/+4"]
g_sp_pol_c6 = [None, "Curva6:-6/+4", None, "Curva6:-6/+4"]
g_sp_pol_c8 = [None, "Curva8:-5/+4", None, "Curva8:-5/+4"]
data["familias"].append(family(
    "Hoyalux Sportive Progressiva", 38, "Progressiva Curva Especial",
    "Lentes Progressivas com Curva Especial",
    ["1.67 (EYNOA)", "1.60 (EYAS 2.0)", "1.53 (PNX)", "1.50"],
    "alta",
    "Imagem da tabela confirma 4 colunas: EYNOA 1.67, EYAS 2.0 1.60, PNX 1.53 e Organic 1.50. Sensity 2 apenas cols 3,4.",
    [
        row("INCOLOR", "Hi-Vision LongLife BlueControl (Curva 6)", g_sp_i_c6, [6869, 5069, 4609, 4259]),
        row("INCOLOR", "Hi-Vision LongLife BlueControl (Curva 8)", g_sp_i_c8, [6869, 5069, 4609, 4259]),
        row("INCOLOR", "No-Risk BlueControl (Curva 6)", g_sp_i_c6, [6619, 4819, 4359, 4009]),
        row("INCOLOR", "No-Risk BlueControl (Curva 8)", g_sp_i_c8, [6619, 4819, 4359, 4009]),
        row("INCOLOR", "Hi-Vision Hard (Curva 6)", g_sp_i_c6, [6209, 4409, 3949, 3599]),
        row("INCOLOR", "Hi-Vision Hard (Curva 8)", g_sp_i_c8, [6209, 4409, 3949, 3599]),
        row("SENSITY 2", "Hi-Vision LongLife BlueControl (Curva 6)", g_sp_s2_c6, [None, None, 6009, 5659],
            ["Sensity 2 apenas cols 3,4"]),
        row("SENSITY 2", "Hi-Vision LongLife BlueControl (Curva 8)", g_sp_s2_c8, [None, None, 6009, 5659],
            ["Sensity 2 apenas cols 3,4"]),
        row("SENSITY 2", "No-Risk BlueControl (Curva 6)", g_sp_s2_c6, [None, None, 5759, 5409]),
        row("SENSITY 2", "No-Risk BlueControl (Curva 8)", g_sp_s2_c8, [None, None, 5759, 5409]),
        row("SENSITY 2", "Hi-Vision Hard (Curva 6)", g_sp_s2_c6, [None, None, 5349, 4999]),
        row("SENSITY 2", "Hi-Vision Hard (Curva 8)", g_sp_s2_c8, [None, None, 5349, 4999]),
        row("POLARIZADO", "Hi-Vision Sun Pro (Curva 6)", g_sp_pol_c6,
            [None, 5969, None, 5159], ["Polarizado cols 2 e 4"]),
        row("POLARIZADO", "Hi-Vision Sun Pro (Curva 8)", g_sp_pol_c8,
            [None, 5969, None, 5159], ["Polarizado cols 2 e 4"]),
        row("COLORIDAS", "Hi-Vision Sun Pro (Curva 6)", g_sp_i_c6, [6909, 5109, 4649, 4299]),
        row("COLORIDAS", "Hi-Vision Sun Pro (Curva 8)", g_sp_i_c8, [6909, 5109, 4649, 4299])
    ],
    {"montagem": "18mm", "cilindro": "-4.00", "adicao": "1.00 a 2.50", "diametro": "80mm", "marcacao": "FA41+AR"}
))

# ---------- Sportive Visao Simples ----------
g_sv_i_c6 = ["Curva6:-6/+4"] * 4
g_sv_i_c8 = ["Curva8:-5/+4"] * 4
g_sv_s2_c6 = [None, None, "Curva6:-6/+4", "Curva6:-6/+4"]
g_sv_s2_c8 = [None, None, "Curva8:-5/+4", "Curva8:-5/+4"]
g_sv_pol_c6 = [None, "Curva6:-4/+4", None, "Curva6:-3.5/+4"]
g_sv_pol_c8 = [None, "Curva8:-4/+4", None, "Curva8:-3/+4"]
data["familias"].append(family(
    "Sportive Visao Simples", 39, "VS Curva Especial",
    "Lentes de Visao Simples com Curva Especial",
    ["1.67 (EYNOA)", "1.60 (EYAS 2.0)", "1.53 (PNX)", "1.50"],
    "alta",
    "Imagem da tabela confirma 4 colunas: EYNOA 1.67, EYAS 2.0 1.60, PNX 1.53 e Organic 1.50. Sensity 2 apenas cols 3,4.",
    [
        row("INCOLOR", "Hi-Vision LongLife BlueControl (Curva 6)", g_sv_i_c6, [3689, 2899, 2439, 2089]),
        row("INCOLOR", "Hi-Vision LongLife BlueControl (Curva 8)", g_sv_i_c8, [3689, 2899, 2439, 2089]),
        row("INCOLOR", "No-Risk BlueControl (Curva 6)", g_sv_i_c6, [3439, 2649, 2189, 1839]),
        row("INCOLOR", "No-Risk BlueControl (Curva 8)", g_sv_i_c8, [3439, 2649, 2189, 1839]),
        row("INCOLOR", "Hi-Vision Hard (Curva 6)", g_sv_i_c6, [2899, 2109, 1649, 1299]),
        row("INCOLOR", "Hi-Vision Hard (Curva 8)", g_sv_i_c8, [2899, 2109, 1649, 1299]),
        row("SENSITY 2", "Hi-Vision LongLife BlueControl (Curva 6)", g_sv_s2_c6, [None, None, 3439, 3089],
            ["Sensity 2 apenas cols 3,4"]),
        row("SENSITY 2", "Hi-Vision LongLife BlueControl (Curva 8)", g_sv_s2_c8, [None, None, 3439, 3089],
            ["Sensity 2 apenas cols 3,4"]),
        row("SENSITY 2", "No-Risk BlueControl (Curva 6)", g_sv_s2_c6, [None, None, 3189, 2839]),
        row("SENSITY 2", "No-Risk BlueControl (Curva 8)", g_sv_s2_c8, [None, None, 3189, 2839]),
        row("SENSITY 2", "Hi-Vision Hard (Curva 6)", g_sv_s2_c6, [None, None, 2649, 2299]),
        row("SENSITY 2", "Hi-Vision Hard (Curva 8)", g_sv_s2_c8, [None, None, 2649, 2299]),
        row("POLARIZADO", "Hi-Vision Sun Pro (Curva 6)", g_sv_pol_c6,
            [None, 3799, None, 2989], ["Polarizado cols 2 e 4"]),
        row("POLARIZADO", "Hi-Vision Sun Pro (Curva 8)", g_sv_pol_c8,
            [None, 3799, None, 2989], ["Polarizado cols 2 e 4"]),
        row("COLORIDAS", "Hi-Vision Sun Pro (Curva 6)", g_sv_i_c6, [3729, 2939, 2479, 2129]),
        row("COLORIDAS", "Hi-Vision Sun Pro (Curva 8)", g_sv_i_c8, [3729, 2939, 2479, 2129])
    ],
    {"design": "Asferico", "cilindro": "-4.00", "diametro": "ate 75mm / 1.50 Polarizada ate 79mm", "marcacao": "SA1+AR"}
))

# ---------- NULUX Prontas Asfericas EYAS 2.0 ----------
# pdf.pages[15] = PDF p.16
# EYAS 2.0 em col3 (x~263). 4 colunas: 1.74, 1.67, 1.60, 1.53
# Grade ranges: col1=-12 a -2 (alta miopia, 1.74), col2=-10/+6 (1.67), col3=-6/+6 (1.60 EYAS), col4=-6/+6 (1.53)
# Info: Cil -2.00 geral / 1.67 Cil -3.00. Materiais confirmados: 1.53/1.60/1.67 (Sensity) e 1.67/1.74 (outros).
g_np = ["-12.00 a -2.00**", "-10.00 a +6.00*", "-6.00 a +6.00", "-6.00 a +6.00"]
g_np_s2 = [None, "-8.00 a +6.00#", None, None]
data["familias"].append(family(
    "NULUX Prontas Asfericas EYAS 2.0", 16, "Pronta Asferica",
    "Lentes de Visao Simples Prontas",
    ["1.74 (EYVIA)", "1.67 (EYNOA)", "1.60 (EYAS 2.0)", "1.53 (PNX)"],
    "alta",
    "Pagina 16 confirma as 4 colunas como EYVIA 1.74, EYNOA 1.67, EYAS 2.0 1.60 e PNX 1.53. Coluna 1 restrita a alta miopia (-12 a -2).",
    [
        row("INCOLOR", "Hi-Vision Meiryo", g_np, [2199, 1599, 1379, None],
            ["1.53 sem Meiryo"]),
        row("INCOLOR", "Hi-Vision LongLife BlueControl", g_np, [None, 1499, None, None],
            ["LL BC apenas 1.67 - outros materiais ausentes no PDF"]),
        row("INCOLOR", "Hi-Vision LongLife UVControl", g_np, [None, 1499, 1199, None]),
        row("INCOLOR", "Hi-Vision LongLife", g_np, [1979, None, None, None],
            ["LL standard apenas 1.74"]),
        row("INCOLOR", "CleanExtra", g_np, [None, None, None, 679],
            ["CleanExtra apenas 1.53"]),
        row("SENSITY 2", "Hi-Vision LongLife UVControl", g_np_s2, [None, 2079, None, None],
            ["Sensity 2 apenas 1.67 nesta tabela"])
    ],
    {"cilindro": "-2.00 / 1.67 ate -3.00",
     "diametro": "1.53/1.60/1.67 Sensity 65/70mm | 1.67/1.74 65/70/75mm",
     "marcacao": "LLSP"}
))

output_path = '.tabelas/hoya_catalog_extraction_2025.json'
audit_csv_path = '.tabelas/hoya_catalog_auditoria_2025.csv'
with open(output_path, 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)
write_audit_csv(audit_csv_path, data)

total_rows = sum(len(fam.get('precos', [])) for fam in data['familias'])
print(f"Saved: {output_path}")
print(f"Saved: {audit_csv_path}")
print(f"Familias: {len(data['familias'])}")
print(f"Linhas de preco: {total_rows}")
for fam in data['familias']:
    name = fam['nome'][:48]
    rows = len(fam.get('precos', []))
    conf = fam.get('confianca_material', '?')
    print(f"  [{conf:8}] p.{fam['pagina_pdf']:2}  {name:<48}  {rows:2} rows")

if __name__ == "__main__":
    pass
