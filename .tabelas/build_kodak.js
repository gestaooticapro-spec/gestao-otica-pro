const fs = require('fs');

const header = 'fonte_tabela,laboratorio,pagina_pdf,bloco_visual,familia,produto,design,material,indice_refracao,tratamento,treatment_group,treatment_application,transitions,transitions_cores,blue_uv,esferico_min,esferico_max,cilindrico_max,adicao_min,adicao_max,preco_tipo,preco_par_brl,nota_disponibilidade';

const rows = [];

function r(fonte,pag,bloco,familia,produto,design,material,indice,trat,tg,ta,trans,tcores,buv,esf_min,esf_max,cil_max,ad_min,ad_max,preco,nota) {
  return `${fonte},Kodak,${pag},${bloco},${familia},${produto},${design},${material},${indice},${trat},${tg},${ta},${trans},${tcores},${buv},${esf_min},${esf_max},${cil_max},${ad_min},${ad_max},absoluto,${preco},${nota}`;
}

const MFD = 'Multifocal Digital';
const KOD = 'Kodak';

// ============================================================
// p.13 PVC — Kodak Unique Infinite
// ============================================================
const UI = 'Kodak Unique Infinite';

function addMaterial_UI_PVC(material, indice, esf_min, esf_max, rows_base, rows_buv, rows_gens, rows_ext, trans_gens, trans_ext) {
  const note = '';
  for (const [trat,preco] of rows_base) {
    rows.push(r('PVC',13,MFD,KOD,UI,MFD,material,indice,trat,trat,'standard','nao','','sim',esf_min,esf_max,'-6.00','1.00','3.50',preco,note));
  }
  if (rows_buv) for (const [trat,preco] of rows_buv) {
    rows.push(r('PVC',13,MFD,KOD,UI,MFD,material,indice,trat,trat,'standard','nao','','sim',esf_min,esf_max,'-6.00','1.00','3.50',preco,'+Blue UV'));
  }
  if (rows_gens) for (const [trat,preco] of rows_gens) {
    rows.push(r('PVC',13,MFD,KOD,UI,MFD,material,indice,trat,trat,'standard','sim',trans_gens,'sim',esf_min,esf_max,'-6.00','1.00','3.50',preco,'Transitions Gen S'));
  }
  if (rows_ext) for (const [trat,preco] of rows_ext) {
    rows.push(r('PVC',13,MFD,KOD,UI,MFD,material,indice,trat,trat,'standard','sim',trans_ext,'sim',esf_min,esf_max,'-6.00','1.00','3.50',preco,'Transitions Extractive'));
  }
}

// Orma 1.50
addMaterial_UI_PVC('Orma','1.50','-10.00','+5.25',
  [['Crizal Prevencia','1979.00'],['Crizal Sapphire HR','1979.00'],['Crizal Rock','1709.00'],['Crizal Easy Pro','1359.00'],['Optifog','1599.00'],['No Reflex','1209.00'],['Trio Easy Clean','1159.00'],['Verniz HC','959.00']],
  [['Crizal Prevencia','2119.00'],['Crizal Sapphire HR','2119.00'],['Crizal Rock','1849.00'],['Crizal Easy Pro','1499.00'],['Optifog','1739.00'],['No Reflex','1349.00'],['Trio Easy Clean','1299.00'],['Verniz HC','1099.00']],
  [['Crizal Prevencia','2919.00'],['Crizal Sapphire HR','2919.00'],['Crizal Rock','2649.00'],['Crizal Easy Pro','2299.00'],['Optifog','2539.00'],['No Reflex','2149.00'],['Trio Easy Clean','2099.00'],['Verniz HC','1899.00']],
  [['Crizal Prevencia','2989.00'],['Crizal Sapphire HR','2989.00'],['Crizal Rock','2719.00'],['Crizal Easy Pro','2369.00'],['Optifog','2609.00'],['No Reflex','2219.00'],['Trio Easy Clean','2169.00'],['Verniz HC','1969.00']],
  'C/M/V/A/S/R/E','C'
);

// Poly
addMaterial_UI_PVC('Airwear Polypower','Poly','-10.00','+6.50',
  [['Crizal Prevencia','2199.00'],['Crizal Sapphire HR','2199.00'],['Crizal Rock','1929.00'],['Crizal Easy Pro','1579.00'],['Optifog','1819.00'],['No Reflex','1429.00'],['Trio Easy Clean','1379.00'],['Verniz HC','1179.00']],
  null,
  [['Crizal Prevencia','3139.00'],['Crizal Sapphire HR','3139.00'],['Crizal Rock','2869.00'],['Crizal Easy Pro','2519.00'],['Optifog','2759.00'],['No Reflex','2369.00'],['Trio Easy Clean','2319.00'],['Verniz HC','2119.00']],
  [['Crizal Prevencia','3209.00'],['Crizal Sapphire HR','3209.00'],['Crizal Rock','2939.00'],['Crizal Easy Pro','2589.00'],['Optifog','2829.00'],['No Reflex','2439.00'],['Trio Easy Clean','2389.00'],['Verniz HC','2189.00']],
  'C/M/V/A/S/R/E','C'
);

// 1.67 (sem Verniz HC)
for (const [trat,preco] of [['Crizal Prevencia','3399.00'],['Crizal Sapphire HR','3399.00'],['Crizal Rock','3129.00'],['Crizal Easy Pro','2779.00'],['Optifog','3019.00'],['No Reflex','2629.00'],['Trio Easy Clean','2579.00']]) {
  rows.push(r('PVC',13,MFD,KOD,UI,MFD,'Stylis','1.67',trat,trat,'standard','nao','','sim','-14.00','+8.00','-6.00','1.00','3.50',preco,''));
}
for (const [trat,preco] of [['Crizal Prevencia','4339.00'],['Crizal Sapphire HR','4339.00'],['Crizal Rock','4069.00'],['Crizal Easy Pro','3719.00'],['Optifog','3959.00'],['No Reflex','3569.00'],['Trio Easy Clean','3519.00']]) {
  rows.push(r('PVC',13,MFD,KOD,UI,MFD,'Stylis','1.67',trat,trat,'standard','sim','C/M/V','sim','-14.00','+8.00','-6.00','1.00','3.50',preco,'Transitions Gen S'));
}
// 1.74 apenas Sapphire HR
rows.push(r('PVC',13,MFD,KOD,UI,MFD,'Stylis','1.74','Crizal Sapphire HR','Crizal Sapphire HR','standard','nao','','sim','-18.00','+13.00','-6.00','1.00','3.50','4179.00',''));
rows.push(r('PVC',13,MFD,KOD,UI,MFD,'Stylis','1.74','Crizal Sapphire HR','Crizal Sapphire HR','standard','sim','C','sim','-18.00','+13.00','-6.00','1.00','3.50','5119.00','Transitions Gen S'));

console.log('UI PVC done:', rows.length);

// ============================================================
// p.13 PVC — Kodak Unique UHD
// ============================================================
const UUHD = 'Kodak Unique UHD';

// Orma 1.50
for (const [trat,preco] of [['Crizal Prevencia','1849.00'],['Crizal Sapphire HR','1849.00'],['Crizal Rock','1579.00'],['Crizal Easy Pro','1229.00'],['Optifog','1469.00'],['No Reflex','1079.00'],['Trio Easy Clean','1029.00'],['Verniz HC','829.00']]) {
  rows.push(r('PVC',13,MFD,KOD,UUHD,MFD,'Orma','1.50',trat,trat,'standard','nao','','sim','-10.00','+5.25','-6.00','1.00','3.50',preco,''));
}
for (const [trat,preco] of [['Crizal Prevencia','1989.00'],['Crizal Sapphire HR','1989.00'],['Crizal Rock','1719.00'],['Crizal Easy Pro','1369.00'],['Optifog','1609.00'],['No Reflex','1219.00'],['Trio Easy Clean','1169.00'],['Verniz HC','969.00']]) {
  rows.push(r('PVC',13,MFD,KOD,UUHD,MFD,'Orma','1.50',trat,trat,'standard','nao','','sim','-10.00','+5.25','-6.00','1.00','3.50',preco,'+Blue UV'));
}
for (const [trat,preco] of [['Crizal Prevencia','2789.00'],['Crizal Sapphire HR','2789.00'],['Crizal Rock','2519.00'],['Crizal Easy Pro','2169.00'],['Optifog','2409.00'],['No Reflex','2019.00'],['Trio Easy Clean','1969.00'],['Verniz HC','1769.00']]) {
  rows.push(r('PVC',13,MFD,KOD,UUHD,MFD,'Orma','1.50',trat,trat,'standard','sim','C/M/V/A/S/R/E','sim','-10.00','+5.25','-6.00','1.00','3.50',preco,'Transitions Gen S'));
}
for (const [trat,preco] of [['Crizal Prevencia','2859.00'],['Crizal Sapphire HR','2859.00'],['Crizal Rock','2589.00'],['Crizal Easy Pro','2239.00'],['Optifog','2479.00'],['No Reflex','2089.00'],['Trio Easy Clean','2039.00'],['Verniz HC','1839.00']]) {
  rows.push(r('PVC',13,MFD,KOD,UUHD,MFD,'Orma','1.50',trat,trat,'standard','sim','C','sim','-10.00','+5.25','-6.00','1.00','3.50',preco,'Transitions Extractive'));
}
// Poly
for (const [trat,preco] of [['Crizal Prevencia','2069.00'],['Crizal Sapphire HR','2069.00'],['Crizal Rock','1799.00'],['Crizal Easy Pro','1449.00'],['Optifog','1689.00'],['No Reflex','1299.00'],['Trio Easy Clean','1249.00'],['Verniz HC','1049.00']]) {
  rows.push(r('PVC',13,MFD,KOD,UUHD,MFD,'Airwear Polypower','Poly',trat,trat,'standard','nao','','sim','-10.00','+6.50','-6.00','1.00','3.50',preco,''));
}
for (const [trat,preco] of [['Crizal Prevencia','3009.00'],['Crizal Sapphire HR','3009.00'],['Crizal Rock','2739.00'],['Crizal Easy Pro','2389.00'],['Optifog','2629.00'],['No Reflex','2239.00'],['Trio Easy Clean','2189.00'],['Verniz HC','1989.00']]) {
  rows.push(r('PVC',13,MFD,KOD,UUHD,MFD,'Airwear Polypower','Poly',trat,trat,'standard','sim','C/M/V/A/S/R/E','sim','-10.00','+6.50','-6.00','1.00','3.50',preco,'Transitions Gen S'));
}
for (const [trat,preco] of [['Crizal Prevencia','3079.00'],['Crizal Sapphire HR','3079.00'],['Crizal Rock','2809.00'],['Crizal Easy Pro','2459.00'],['Optifog','2699.00'],['No Reflex','2309.00'],['Trio Easy Clean','2259.00'],['Verniz HC','2059.00']]) {
  rows.push(r('PVC',13,MFD,KOD,UUHD,MFD,'Airwear Polypower','Poly',trat,trat,'standard','sim','C','sim','-10.00','+6.50','-6.00','1.00','3.50',preco,'Transitions Extractive'));
}
// 1.67
for (const [trat,preco] of [['Crizal Prevencia','3269.00'],['Crizal Sapphire HR','3269.00'],['Crizal Rock','2999.00'],['Crizal Easy Pro','2649.00'],['Optifog','2889.00'],['No Reflex','2499.00'],['Trio Easy Clean','2449.00']]) {
  rows.push(r('PVC',13,MFD,KOD,UUHD,MFD,'Stylis','1.67',trat,trat,'standard','nao','','sim','-14.00','+8.00','-6.00','1.00','3.50',preco,''));
}
for (const [trat,preco] of [['Crizal Prevencia','4209.00'],['Crizal Sapphire HR','4209.00'],['Crizal Rock','3939.00'],['Crizal Easy Pro','3589.00'],['Optifog','3829.00'],['No Reflex','3439.00'],['Trio Easy Clean','3389.00']]) {
  rows.push(r('PVC',13,MFD,KOD,UUHD,MFD,'Stylis','1.67',trat,trat,'standard','sim','C/M/V','sim','-14.00','+8.00','-6.00','1.00','3.50',preco,'Transitions Gen S'));
}
// 1.74
rows.push(r('PVC',13,MFD,KOD,UUHD,MFD,'Stylis','1.74','Crizal Sapphire HR','Crizal Sapphire HR','standard','nao','','sim','-18.00','+13.00','-6.00','1.00','3.50','4049.00',''));
rows.push(r('PVC',13,MFD,KOD,UUHD,MFD,'Stylis','1.74','Crizal Sapphire HR','Crizal Sapphire HR','standard','sim','C','sim','-18.00','+13.00','-6.00','1.00','3.50','4989.00','Transitions Gen S'));

console.log('UUHD PVC done:', rows.length);

// ============================================================
// p.13 PVC — Kodak Network UHD (sem 1.74)
// ============================================================
const NW = 'Kodak Network UHD';
const NW_NOTA = 'Network UHD nao disponivel em Stylis 1.74';

// 1.50
for (const [trat,preco] of [['Crizal Prevencia','1729.00'],['Crizal Sapphire HR','1729.00'],['Crizal Rock','1459.00'],['Crizal Easy Pro','1109.00'],['Optifog','1349.00'],['No Reflex','959.00'],['Trio Easy Clean','909.00'],['Verniz HC','709.00']]) {
  rows.push(r('PVC',13,MFD,KOD,NW,MFD,'Orma','1.50',trat,trat,'standard','nao','','sim','-10.25','+5.25','-6.00','1.00','3.50',preco,NW_NOTA));
}
for (const [trat,preco] of [['Crizal Prevencia','1869.00'],['Crizal Sapphire HR','1869.00'],['Crizal Rock','1599.00'],['Crizal Easy Pro','1249.00'],['Optifog','1489.00'],['No Reflex','1099.00'],['Trio Easy Clean','1049.00'],['Verniz HC','849.00']]) {
  rows.push(r('PVC',13,MFD,KOD,NW,MFD,'Orma','1.50',trat,trat,'standard','nao','','sim','-10.25','+5.25','-6.00','1.00','3.50',preco,NW_NOTA+'; +Blue UV'));
}
for (const [trat,preco] of [['Crizal Prevencia','2669.00'],['Crizal Sapphire HR','2669.00'],['Crizal Rock','2399.00'],['Crizal Easy Pro','2049.00'],['Optifog','2289.00'],['No Reflex','1899.00'],['Trio Easy Clean','1849.00'],['Verniz HC','1649.00']]) {
  rows.push(r('PVC',13,MFD,KOD,NW,MFD,'Orma','1.50',trat,trat,'standard','sim','C/M/V/A/S/R/E','sim','-10.25','+5.25','-6.00','1.00','3.50',preco,NW_NOTA+'; Transitions Gen S'));
}
for (const [trat,preco] of [['Crizal Prevencia','2739.00'],['Crizal Sapphire HR','2739.00'],['Crizal Rock','2469.00'],['Crizal Easy Pro','2119.00'],['Optifog','2359.00'],['No Reflex','1969.00'],['Trio Easy Clean','1919.00'],['Verniz HC','1719.00']]) {
  rows.push(r('PVC',13,MFD,KOD,NW,MFD,'Orma','1.50',trat,trat,'standard','sim','C','sim','-10.25','+5.25','-6.00','1.00','3.50',preco,NW_NOTA+'; Transitions Extractive'));
}
// Poly
for (const [trat,preco] of [['Crizal Prevencia','1949.00'],['Crizal Sapphire HR','1949.00'],['Crizal Rock','1679.00'],['Crizal Easy Pro','1329.00'],['Optifog','1569.00'],['No Reflex','1179.00'],['Trio Easy Clean','1129.00'],['Verniz HC','929.00']]) {
  rows.push(r('PVC',13,MFD,KOD,NW,MFD,'Airwear Polypower','Poly',trat,trat,'standard','nao','','sim','-10.00','+6.50','-6.00','1.00','3.50',preco,NW_NOTA));
}
for (const [trat,preco] of [['Crizal Prevencia','2889.00'],['Crizal Sapphire HR','2889.00'],['Crizal Rock','2619.00'],['Crizal Easy Pro','2269.00'],['Optifog','2509.00'],['No Reflex','2119.00'],['Trio Easy Clean','2069.00'],['Verniz HC','1869.00']]) {
  rows.push(r('PVC',13,MFD,KOD,NW,MFD,'Airwear Polypower','Poly',trat,trat,'standard','sim','C/M/V/A/S/R/E','sim','-10.00','+6.50','-6.00','1.00','3.50',preco,NW_NOTA+'; Transitions Gen S'));
}
for (const [trat,preco] of [['Crizal Prevencia','2959.00'],['Crizal Sapphire HR','2959.00'],['Crizal Rock','2689.00'],['Crizal Easy Pro','2339.00'],['Optifog','2579.00'],['No Reflex','2189.00'],['Trio Easy Clean','2139.00'],['Verniz HC','1939.00']]) {
  rows.push(r('PVC',13,MFD,KOD,NW,MFD,'Airwear Polypower','Poly',trat,trat,'standard','sim','C','sim','-10.00','+6.50','-6.00','1.00','3.50',preco,NW_NOTA+'; Transitions Extractive'));
}
// 1.67
for (const [trat,preco] of [['Crizal Prevencia','3149.00'],['Crizal Sapphire HR','3149.00'],['Crizal Rock','2879.00'],['Crizal Easy Pro','2529.00'],['Optifog','2769.00'],['No Reflex','2379.00'],['Trio Easy Clean','2329.00']]) {
  rows.push(r('PVC',13,MFD,KOD,NW,MFD,'Stylis','1.67',trat,trat,'standard','nao','','sim','-14.00','+8.00','-6.00','1.00','3.50',preco,NW_NOTA));
}
for (const [trat,preco] of [['Crizal Prevencia','4089.00'],['Crizal Sapphire HR','4089.00'],['Crizal Rock','3819.00'],['Crizal Easy Pro','3469.00'],['Optifog','3709.00'],['No Reflex','3319.00'],['Trio Easy Clean','3269.00']]) {
  rows.push(r('PVC',13,MFD,KOD,NW,MFD,'Stylis','1.67',trat,trat,'standard','sim','C/M/V','sim','-14.00','+8.00','-6.00','1.00','3.50',preco,NW_NOTA+'; Transitions Gen S'));
}

console.log('NW PVC done:', rows.length);
fs.writeFileSync('g:/projetos/gestao-otica-pro/.tabelas/kodak_p13_pvc_checkpoint.csv', header+'\n'+rows.join('\n'), 'utf8');
console.log('CHECKPOINT p13 PVC saved');

// ============================================================
// p.13 PVO — Kodak Unique Infinite
// ============================================================

// Orma 1.50
for (const [trat,preco] of [['Crizal Prevencia','904.00'],['Crizal Sapphire HR','904.00'],['Crizal Rock','782.00'],['Crizal Easy Pro','620.00'],['Optifog','745.00'],['No Reflex','551.00'],['Trio Easy Clean','545.00'],['Verniz HC','439.00']]) {
  rows.push(r('PVO',13,MFD,KOD,UI,MFD,'Orma','1.50',trat,trat,'standard','nao','','sim','-10.00','+5.25','-6.00','1.00','3.50',preco,''));
}
for (const [trat,preco] of [['Crizal Prevencia','969.00'],['Crizal Sapphire HR','969.00'],['Crizal Rock','847.00'],['Crizal Easy Pro','685.00'],['Optifog','810.00'],['No Reflex','616.00'],['Trio Easy Clean','610.00'],['Verniz HC','504.00']]) {
  rows.push(r('PVO',13,MFD,KOD,UI,MFD,'Orma','1.50',trat,trat,'standard','nao','','sim','-10.00','+5.25','-6.00','1.00','3.50',preco,'+Blue UV'));
}
for (const [trat,preco] of [['Crizal Prevencia','1256.00'],['Crizal Sapphire HR','1256.00'],['Crizal Rock','1134.00'],['Crizal Easy Pro','972.00'],['Optifog','1097.00'],['No Reflex','903.00'],['Trio Easy Clean','897.00'],['Verniz HC','791.00']]) {
  rows.push(r('PVO',13,MFD,KOD,UI,MFD,'Orma','1.50',trat,trat,'standard','sim','C/M/V/A/S/R/E','sim','-10.00','+5.25','-6.00','1.00','3.50',preco,'Transitions Gen S'));
}
for (const [trat,preco] of [['Crizal Prevencia','1287.00'],['Crizal Sapphire HR','1287.00'],['Crizal Rock','1165.00'],['Crizal Easy Pro','1003.00'],['Optifog','1128.00'],['No Reflex','934.00'],['Trio Easy Clean','928.00'],['Verniz HC','822.00']]) {
  rows.push(r('PVO',13,MFD,KOD,UI,MFD,'Orma','1.50',trat,trat,'standard','sim','C','sim','-10.00','+5.25','-6.00','1.00','3.50',preco,'Transitions Extractive'));
}
// Poly
for (const [trat,preco] of [['Crizal Prevencia','986.00'],['Crizal Sapphire HR','986.00'],['Crizal Rock','864.00'],['Crizal Easy Pro','702.00'],['Optifog','827.00'],['No Reflex','633.00'],['Trio Easy Clean','627.00'],['Verniz HC','521.00']]) {
  rows.push(r('PVO',13,MFD,KOD,UI,MFD,'Airwear Polypower','Poly',trat,trat,'standard','nao','','sim','-10.00','+6.50','-6.00','1.00','3.50',preco,''));
}
for (const [trat,preco] of [['Crizal Prevencia','1339.00'],['Crizal Sapphire HR','1339.00'],['Crizal Rock','1217.00'],['Crizal Easy Pro','1055.00'],['Optifog','1180.00'],['No Reflex','986.00'],['Trio Easy Clean','980.00'],['Verniz HC','874.00']]) {
  rows.push(r('PVO',13,MFD,KOD,UI,MFD,'Airwear Polypower','Poly',trat,trat,'standard','sim','C/M/V/A/S/R/E','sim','-10.00','+6.50','-6.00','1.00','3.50',preco,'Transitions Gen S'));
}
for (const [trat,preco] of [['Crizal Prevencia','1369.00'],['Crizal Sapphire HR','1369.00'],['Crizal Rock','1247.00'],['Crizal Easy Pro','1085.00'],['Optifog','1210.00'],['No Reflex','1016.00'],['Trio Easy Clean','1010.00'],['Verniz HC','904.00']]) {
  rows.push(r('PVO',13,MFD,KOD,UI,MFD,'Airwear Polypower','Poly',trat,trat,'standard','sim','C','sim','-10.00','+6.50','-6.00','1.00','3.50',preco,'Transitions Extractive'));
}
// 1.67
for (const [trat,preco] of [['Crizal Prevencia','1436.00'],['Crizal Sapphire HR','1436.00'],['Crizal Rock','1314.00'],['Crizal Easy Pro','1152.00'],['Optifog','1277.00'],['No Reflex','1083.00'],['Trio Easy Clean','1077.00']]) {
  rows.push(r('PVO',13,MFD,KOD,UI,MFD,'Stylis','1.67',trat,trat,'standard','nao','','sim','-14.00','+8.00','-6.00','1.00','3.50',preco,''));
}
for (const [trat,preco] of [['Crizal Prevencia','1787.00'],['Crizal Sapphire HR','1787.00'],['Crizal Rock','1665.00'],['Crizal Easy Pro','1503.00'],['Optifog','1628.00'],['No Reflex','1434.00'],['Trio Easy Clean','1428.00']]) {
  rows.push(r('PVO',13,MFD,KOD,UI,MFD,'Stylis','1.67',trat,trat,'standard','sim','C/M/V','sim','-14.00','+8.00','-6.00','1.00','3.50',preco,'Transitions Gen S'));
}
// 1.74
rows.push(r('PVO',13,MFD,KOD,UI,MFD,'Stylis','1.74','Crizal Sapphire HR','Crizal Sapphire HR','standard','nao','','sim','-18.00','+13.00','-6.00','1.00','3.50','1754.00',''));
rows.push(r('PVO',13,MFD,KOD,UI,MFD,'Stylis','1.74','Crizal Sapphire HR','Crizal Sapphire HR','standard','sim','C','sim','-18.00','+13.00','-6.00','1.00','3.50','2137.00','Transitions Gen S'));

console.log('UI PVO done:', rows.length);

// ============================================================
// p.13 PVO — Kodak Unique UHD
// ============================================================

// Orma 1.50
for (const [trat,preco] of [['Crizal Prevencia','855.00'],['Crizal Sapphire HR','855.00'],['Crizal Rock','733.00'],['Crizal Easy Pro','571.00'],['Optifog','696.00'],['No Reflex','502.00'],['Trio Easy Clean','496.00'],['Verniz HC','390.00']]) {
  rows.push(r('PVO',13,MFD,KOD,UUHD,MFD,'Orma','1.50',trat,trat,'standard','nao','','sim','-10.00','+5.25','-6.00','1.00','3.50',preco,''));
}
for (const [trat,preco] of [['Crizal Prevencia','923.00'],['Crizal Sapphire HR','923.00'],['Crizal Rock','801.00'],['Crizal Easy Pro','639.00'],['Optifog','764.00'],['No Reflex','570.00'],['Trio Easy Clean','564.00'],['Verniz HC','458.00']]) {
  rows.push(r('PVO',13,MFD,KOD,UUHD,MFD,'Orma','1.50',trat,trat,'standard','nao','','sim','-10.00','+5.25','-6.00','1.00','3.50',preco,'+Blue UV'));
}
for (const [trat,preco] of [['Crizal Prevencia','1207.00'],['Crizal Sapphire HR','1207.00'],['Crizal Rock','1085.00'],['Crizal Easy Pro','923.00'],['Optifog','1048.00'],['No Reflex','854.00'],['Trio Easy Clean','848.00'],['Verniz HC','742.00']]) {
  rows.push(r('PVO',13,MFD,KOD,UUHD,MFD,'Orma','1.50',trat,trat,'standard','sim','C/M/V/A/S/R/E','sim','-10.00','+5.25','-6.00','1.00','3.50',preco,'Transitions Gen S'));
}
for (const [trat,preco] of [['Crizal Prevencia','1238.00'],['Crizal Sapphire HR','1238.00'],['Crizal Rock','1116.00'],['Crizal Easy Pro','954.00'],['Optifog','1079.00'],['No Reflex','885.00'],['Trio Easy Clean','879.00'],['Verniz HC','773.00']]) {
  rows.push(r('PVO',13,MFD,KOD,UUHD,MFD,'Orma','1.50',trat,trat,'standard','sim','C','sim','-10.00','+5.25','-6.00','1.00','3.50',preco,'Transitions Extractive'));
}
// Poly
for (const [trat,preco] of [['Crizal Prevencia','937.00'],['Crizal Sapphire HR','937.00'],['Crizal Rock','815.00'],['Crizal Easy Pro','653.00'],['Optifog','778.00'],['No Reflex','584.00'],['Trio Easy Clean','578.00'],['Verniz HC','472.00']]) {
  rows.push(r('PVO',13,MFD,KOD,UUHD,MFD,'Airwear Polypower','Poly',trat,trat,'standard','nao','','sim','-10.00','+6.50','-6.00','1.00','3.50',preco,''));
}
for (const [trat,preco] of [['Crizal Prevencia','1290.00'],['Crizal Sapphire HR','1290.00'],['Crizal Rock','1168.00'],['Crizal Easy Pro','1006.00'],['Optifog','1131.00'],['No Reflex','937.00'],['Trio Easy Clean','931.00'],['Verniz HC','825.00']]) {
  rows.push(r('PVO',13,MFD,KOD,UUHD,MFD,'Airwear Polypower','Poly',trat,trat,'standard','sim','C/M/V/A/S/R/E','sim','-10.00','+6.50','-6.00','1.00','3.50',preco,'Transitions Gen S'));
}
for (const [trat,preco] of [['Crizal Prevencia','1321.00'],['Crizal Sapphire HR','1321.00'],['Crizal Rock','1199.00'],['Crizal Easy Pro','1037.00'],['Optifog','1162.00'],['No Reflex','968.00'],['Trio Easy Clean','962.00'],['Verniz HC','856.00']]) {
  rows.push(r('PVO',13,MFD,KOD,UUHD,MFD,'Airwear Polypower','Poly',trat,trat,'standard','sim','C','sim','-10.00','+6.50','-6.00','1.00','3.50',preco,'Transitions Extractive'));
}
// 1.67
for (const [trat,preco] of [['Crizal Prevencia','1387.00'],['Crizal Sapphire HR','1387.00'],['Crizal Rock','1265.00'],['Crizal Easy Pro','1103.00'],['Optifog','1228.00'],['No Reflex','1034.00'],['Trio Easy Clean','1028.00']]) {
  rows.push(r('PVO',13,MFD,KOD,UUHD,MFD,'Stylis','1.67',trat,trat,'standard','nao','','sim','-14.00','+8.00','-6.00','1.00','3.50',preco,''));
}
for (const [trat,preco] of [['Crizal Prevencia','1738.00'],['Crizal Sapphire HR','1738.00'],['Crizal Rock','1616.00'],['Crizal Easy Pro','1454.00'],['Optifog','1579.00'],['No Reflex','1385.00'],['Trio Easy Clean','1379.00']]) {
  rows.push(r('PVO',13,MFD,KOD,UUHD,MFD,'Stylis','1.67',trat,trat,'standard','sim','C/M/V','sim','-14.00','+8.00','-6.00','1.00','3.50',preco,'Transitions Gen S'));
}
// 1.74
rows.push(r('PVO',13,MFD,KOD,UUHD,MFD,'Stylis','1.74','Crizal Sapphire HR','Crizal Sapphire HR','standard','nao','','sim','-18.00','+13.00','-6.00','1.00','3.50','1701.00',''));
rows.push(r('PVO',13,MFD,KOD,UUHD,MFD,'Stylis','1.74','Crizal Sapphire HR','Crizal Sapphire HR','standard','sim','C','sim','-18.00','+13.00','-6.00','1.00','3.50','2084.00','Transitions Gen S'));

console.log('UUHD PVO done:', rows.length);

// ============================================================
// p.13 PVO — Kodak Network UHD
// ============================================================

// 1.50
for (const [trat,preco] of [['Crizal Prevencia','820.00'],['Crizal Sapphire HR','820.00'],['Crizal Rock','698.00'],['Crizal Easy Pro','536.00'],['Optifog','661.00'],['No Reflex','467.00'],['Trio Easy Clean','461.00'],['Verniz HC','355.00']]) {
  rows.push(r('PVO',13,MFD,KOD,NW,MFD,'Orma','1.50',trat,trat,'standard','nao','','sim','-10.25','+5.25','-6.00','1.00','3.50',preco,NW_NOTA));
}
for (const [trat,preco] of [['Crizal Prevencia','892.00'],['Crizal Sapphire HR','892.00'],['Crizal Rock','770.00'],['Crizal Easy Pro','608.00'],['Optifog','733.00'],['No Reflex','539.00'],['Trio Easy Clean','533.00'],['Verniz HC','427.00']]) {
  rows.push(r('PVO',13,MFD,KOD,NW,MFD,'Orma','1.50',trat,trat,'standard','nao','','sim','-10.25','+5.25','-6.00','1.00','3.50',preco,NW_NOTA+'; +Blue UV'));
}
for (const [trat,preco] of [['Crizal Prevencia','1172.00'],['Crizal Sapphire HR','1172.00'],['Crizal Rock','1050.00'],['Crizal Easy Pro','888.00'],['Optifog','1013.00'],['No Reflex','819.00'],['Trio Easy Clean','813.00'],['Verniz HC','707.00']]) {
  rows.push(r('PVO',13,MFD,KOD,NW,MFD,'Orma','1.50',trat,trat,'standard','sim','C/M/V/A/S/R/E','sim','-10.25','+5.25','-6.00','1.00','3.50',preco,NW_NOTA+'; Transitions Gen S'));
}
for (const [trat,preco] of [['Crizal Prevencia','1202.00'],['Crizal Sapphire HR','1202.00'],['Crizal Rock','1080.00'],['Crizal Easy Pro','918.00'],['Optifog','1043.00'],['No Reflex','849.00'],['Trio Easy Clean','843.00'],['Verniz HC','737.00']]) {
  rows.push(r('PVO',13,MFD,KOD,NW,MFD,'Orma','1.50',trat,trat,'standard','sim','C','sim','-10.25','+5.25','-6.00','1.00','3.50',preco,NW_NOTA+'; Transitions Extractive'));
}
// Poly
for (const [trat,preco] of [['Crizal Prevencia','901.00'],['Crizal Sapphire HR','901.00'],['Crizal Rock','779.00'],['Crizal Easy Pro','617.00'],['Optifog','742.00'],['No Reflex','548.00'],['Trio Easy Clean','542.00'],['Verniz HC','436.00']]) {
  rows.push(r('PVO',13,MFD,KOD,NW,MFD,'Airwear Polypower','Poly',trat,trat,'standard','nao','','sim','-10.00','+6.50','-6.00','1.00','3.50',preco,NW_NOTA));
}
for (const [trat,preco] of [['Crizal Prevencia','1254.00'],['Crizal Sapphire HR','1254.00'],['Crizal Rock','1132.00'],['Crizal Easy Pro','970.00'],['Optifog','1095.00'],['No Reflex','901.00'],['Trio Easy Clean','895.00'],['Verniz HC','789.00']]) {
  rows.push(r('PVO',13,MFD,KOD,NW,MFD,'Airwear Polypower','Poly',trat,trat,'standard','sim','C/M/V/A/S/R/E','sim','-10.00','+6.50','-6.00','1.00','3.50',preco,NW_NOTA+'; Transitions Gen S'));
}
for (const [trat,preco] of [['Crizal Prevencia','1285.00'],['Crizal Sapphire HR','1285.00'],['Crizal Rock','1163.00'],['Crizal Easy Pro','1001.00'],['Optifog','1126.00'],['No Reflex','932.00'],['Trio Easy Clean','926.00'],['Verniz HC','820.00']]) {
  rows.push(r('PVO',13,MFD,KOD,NW,MFD,'Airwear Polypower','Poly',trat,trat,'standard','sim','C','sim','-10.00','+6.50','-6.00','1.00','3.50',preco,NW_NOTA+'; Transitions Extractive'));
}
// 1.67
for (const [trat,preco] of [['Crizal Prevencia','1351.00'],['Crizal Sapphire HR','1351.00'],['Crizal Rock','1229.00'],['Crizal Easy Pro','1067.00'],['Optifog','1192.00'],['No Reflex','998.00'],['Trio Easy Clean','992.00']]) {
  rows.push(r('PVO',13,MFD,KOD,NW,MFD,'Stylis','1.67',trat,trat,'standard','nao','','sim','-14.00','+8.00','-6.00','1.00','3.50',preco,NW_NOTA));
}
for (const [trat,preco] of [['Crizal Prevencia','1703.00'],['Crizal Sapphire HR','1703.00'],['Crizal Rock','1581.00'],['Crizal Easy Pro','1419.00'],['Optifog','1544.00'],['No Reflex','1350.00'],['Trio Easy Clean','1344.00']]) {
  rows.push(r('PVO',13,MFD,KOD,NW,MFD,'Stylis','1.67',trat,trat,'standard','sim','C/M/V','sim','-14.00','+8.00','-6.00','1.00','3.50',preco,NW_NOTA+'; Transitions Gen S'));
}

console.log('NW PVO done:', rows.length);
fs.writeFileSync('g:/projetos/gestao-otica-pro/.tabelas/kodak_p13_done.csv', header+'\n'+rows.join('\n'), 'utf8');
console.log('CHECKPOINT p13 COMPLETE saved:', rows.length, 'rows');

// ============================================================
// p.14 PVC — Kodak Precise UHD (multifocal digital, short disponivel)
// Materiais: 1.50 / Poly / 1.67
// Tratamentos: Prevencia, Sapphire HR, Rock, Easy Pro, Optifog, No Reflex, Trio Easy Clean, Verniz HC
// 1.67 Verniz HC = traco
// short: adicao max 3.00, gravacao S
// ============================================================
const PUHD = 'Kodak Precise UHD';
const MFD14 = 'Multifocal Digital';
const SHORT_NOTA = 'short disponivel: adicao max 3.00; gravacao S';

// 1.50 base
for (const [trat,preco] of [['Crizal Prevencia','1469.00'],['Crizal Sapphire HR','1469.00'],['Crizal Rock','1199.00'],['Crizal Easy Pro','849.00'],['Optifog','1089.00'],['No Reflex','699.00'],['Trio Easy Clean','649.00'],['Verniz HC','449.00']]) {
  rows.push(r('PVC',14,MFD14,KOD,PUHD,MFD14,'Orma','1.50',trat,trat,'standard','nao','','sim','-10.25','+5.25','-6.00','1.00','3.50',preco,SHORT_NOTA));
}
// 1.50 Transitions Gen S Blue UV
for (const [trat,preco] of [['Crizal Prevencia','2409.00'],['Crizal Sapphire HR','2409.00'],['Crizal Rock','2139.00'],['Crizal Easy Pro','1789.00'],['Optifog','2029.00'],['No Reflex','1639.00'],['Trio Easy Clean','1589.00'],['Verniz HC','1389.00']]) {
  rows.push(r('PVC',14,MFD14,KOD,PUHD,MFD14,'Orma','1.50',trat,trat,'standard','sim','C/M/V/A/S/R/E','sim','-11.75','+6.50','-6.00','1.00','3.50',preco,SHORT_NOTA+'; Transitions Gen S'));
}
// Poly base
for (const [trat,preco] of [['Crizal Prevencia','1829.00'],['Crizal Sapphire HR','1829.00'],['Crizal Rock','1559.00'],['Crizal Easy Pro','1209.00'],['Optifog','1449.00'],['No Reflex','1059.00'],['Trio Easy Clean','1009.00'],['Verniz HC','809.00']]) {
  rows.push(r('PVC',14,MFD14,KOD,PUHD,MFD14,'Airwear Polypower','Poly',trat,trat,'standard','nao','','sim','-11.75','+6.50','-6.00','1.00','3.50',preco,SHORT_NOTA));
}
// Poly Transitions Gen S
for (const [trat,preco] of [['Crizal Prevencia','2629.00'],['Crizal Sapphire HR','2629.00'],['Crizal Rock','2359.00'],['Crizal Easy Pro','2009.00'],['Optifog','2249.00'],['No Reflex','1859.00'],['Trio Easy Clean','1809.00'],['Verniz HC','1609.00']]) {
  rows.push(r('PVC',14,MFD14,KOD,PUHD,MFD14,'Airwear Polypower','Poly',trat,trat,'standard','sim','C/M/V/A/S/R/E','sim','-11.75','+6.50','-6.00','1.00','3.50',preco,SHORT_NOTA+'; Transitions Gen S'));
}
// 1.67 base (sem Verniz HC)
for (const [trat,preco] of [['Crizal Prevencia','3029.00'],['Crizal Sapphire HR','3029.00'],['Crizal Rock','2759.00'],['Crizal Easy Pro','2409.00'],['Optifog','2649.00'],['No Reflex','2259.00'],['Trio Easy Clean','2209.00']]) {
  rows.push(r('PVC',14,MFD14,KOD,PUHD,MFD14,'Stylis','1.67',trat,trat,'standard','nao','','sim','-14.00','+8.00','-6.00','1.00','3.50',preco,SHORT_NOTA));
}
// 1.67 Transitions Gen S
for (const [trat,preco] of [['Crizal Prevencia','3829.00'],['Crizal Sapphire HR','3829.00'],['Crizal Rock','3559.00'],['Crizal Easy Pro','3209.00'],['Optifog','3449.00'],['No Reflex','3059.00'],['Trio Easy Clean','3009.00']]) {
  rows.push(r('PVC',14,MFD14,KOD,PUHD,MFD14,'Stylis','1.67',trat,trat,'standard','sim','C/M/V','sim','-14.00','+8.00','-6.00','1.00','3.50',preco,SHORT_NOTA+'; Transitions Gen S'));
}

console.log('Precise UHD PVC done:', rows.length);

// ============================================================
// p.14 PVC — Kodak Precise (multifocal tradicional)
// Materiais: 1.50 / Poly
// Tratamentos: Prevencia, Sapphire HR, Rock, Easy Pro, Optifog, No Reflex, Trio Easy Clean, Sem AR
// Sem Verniz HC, tem Sem AR
// ============================================================
const PREC = 'Kodak Precise';
const MFTRAD = 'Multifocal Tradicional';

// 1.50 base
for (const [trat,preco] of [['Crizal Prevencia','1469.00'],['Crizal Sapphire HR','1469.00'],['Crizal Rock','1199.00'],['Crizal Easy Pro','849.00'],['Optifog','1089.00'],['No Reflex','699.00'],['Trio Easy Clean','649.00'],['Sem AR','449.00']]) {
  rows.push(r('PVC',14,MFTRAD,KOD,PREC,MFTRAD,'Orma','1.50',trat,trat,'standard','nao','','nao','-9.00','+6.00','-6.00','1.00','3.50',preco,'alt min 14mm'));
}
// 1.50 Transitions Gen S Blue UV
for (const [trat,preco] of [['Crizal Prevencia','2409.00'],['Crizal Sapphire HR','2409.00'],['Crizal Rock','2139.00'],['Crizal Easy Pro','1789.00'],['Optifog','2029.00'],['No Reflex','1639.00'],['Trio Easy Clean','1589.00'],['Sem AR','1389.00']]) {
  rows.push(r('PVC',14,MFTRAD,KOD,PREC,MFTRAD,'Orma','1.50',trat,trat,'standard','sim','C/M/V/A/S/R/E','sim','-9.00','+6.00','-6.00','1.00','3.50',preco,'alt min 14mm; Transitions Gen S'));
}
// Poly base
for (const [trat,preco] of [['Crizal Prevencia','1689.00'],['Crizal Sapphire HR','1689.00'],['Crizal Rock','1419.00'],['Crizal Easy Pro','1069.00'],['Optifog','1309.00'],['No Reflex','919.00'],['Trio Easy Clean','869.00'],['Sem AR','669.00']]) {
  rows.push(r('PVC',14,MFTRAD,KOD,PREC,MFTRAD,'Airwear Polypower','Poly',trat,trat,'standard','nao','','nao','-10.00','+6.00','-6.00','1.00','3.50',preco,'alt min 14mm'));
}
// Poly Transitions Gen S
for (const [trat,preco] of [['Crizal Prevencia','2629.00'],['Crizal Sapphire HR','2629.00'],['Crizal Rock','2359.00'],['Crizal Easy Pro','2009.00'],['Optifog','2249.00'],['No Reflex','1859.00'],['Trio Easy Clean','1809.00'],['Sem AR','1609.00']]) {
  rows.push(r('PVC',14,MFTRAD,KOD,PREC,MFTRAD,'Airwear Polypower','Poly',trat,trat,'standard','sim','C/M/V/A/S/R/E','sim','-10.00','+6.00','-6.00','1.00','3.50',preco,'alt min 14mm; Transitions Gen S'));
}

console.log('Precise PVC done:', rows.length);

// ============================================================
// p.14 PVC — Kodak SoftWear (ocupacional digital)
// Materiais: 1.50 / Poly / 1.67
// Tratamentos: Prevencia, Sapphire HR, Rock, Easy Pro, Optifog, No Reflex, Trio Easy Clean, Verniz HC
// 1.67 Verniz HC = traco
// Sem Transitions Extractive
// ============================================================
const SW = 'Kodak SoftWear';
const OCD = 'Ocupacional Digital';

for (const [trat,preco] of [['Crizal Prevencia','1469.00'],['Crizal Sapphire HR','1469.00'],['Crizal Rock','1199.00'],['Crizal Easy Pro','849.00'],['Optifog','1089.00'],['No Reflex','699.00'],['Trio Easy Clean','649.00'],['Verniz HC','449.00']]) {
  rows.push(r('PVC',14,OCD,KOD,SW,OCD,'Orma','1.50',trat,trat,'standard','nao','','sim','-10.00','+5.00','-6.00','','',preco,''));
}
for (const [trat,preco] of [['Crizal Prevencia','1689.00'],['Crizal Sapphire HR','1689.00'],['Crizal Rock','1419.00'],['Crizal Easy Pro','1069.00'],['Optifog','1309.00'],['No Reflex','919.00'],['Trio Easy Clean','869.00'],['Verniz HC','669.00']]) {
  rows.push(r('PVC',14,OCD,KOD,SW,OCD,'Airwear Polypower','Poly',trat,trat,'standard','nao','','sim','-10.00','+6.00','-6.00','','',preco,''));
}
// 1.67 (sem Verniz HC)
for (const [trat,preco] of [['Crizal Prevencia','2889.00'],['Crizal Sapphire HR','2889.00'],['Crizal Rock','2619.00'],['Crizal Easy Pro','2269.00'],['Optifog','2509.00'],['No Reflex','2119.00'],['Trio Easy Clean','2069.00']]) {
  rows.push(r('PVC',14,OCD,KOD,SW,OCD,'Stylis','1.67',trat,trat,'standard','nao','','sim','-14.00','+8.00','-6.00','','',preco,''));
}

console.log('SoftWear PVC done:', rows.length);
fs.writeFileSync('g:/projetos/gestao-otica-pro/.tabelas/kodak_p14_pvc_checkpoint.csv', header+'\n'+rows.join('\n'), 'utf8');
console.log('CHECKPOINT p14 PVC saved');

// ============================================================
// p.14 PVO — Kodak Precise UHD
// ============================================================

// 1.50 base
for (const [trat,preco] of [['Crizal Prevencia','744.00'],['Crizal Sapphire HR','744.00'],['Crizal Rock','622.00'],['Crizal Easy Pro','460.00'],['Optifog','585.00'],['No Reflex','391.00'],['Trio Easy Clean','385.00'],['Verniz HC','279.00']]) {
  rows.push(r('PVO',14,MFD14,KOD,PUHD,MFD14,'Orma','1.50',trat,trat,'standard','nao','','sim','-10.25','+5.25','-6.00','1.00','3.50',preco,SHORT_NOTA));
}
// 1.50 Transitions Gen S
for (const [trat,preco] of [['Crizal Prevencia','1123.00'],['Crizal Sapphire HR','1123.00'],['Crizal Rock','1001.00'],['Crizal Easy Pro','839.00'],['Optifog','964.00'],['No Reflex','770.00'],['Trio Easy Clean','764.00'],['Verniz HC','658.00']]) {
  rows.push(r('PVO',14,MFD14,KOD,PUHD,MFD14,'Orma','1.50',trat,trat,'standard','sim','C/M/V/A/S/R/E','sim','-11.75','+6.50','-6.00','1.00','3.50',preco,SHORT_NOTA+'; Transitions Gen S'));
}
// Poly base
for (const [trat,preco] of [['Crizal Prevencia','837.00'],['Crizal Sapphire HR','837.00'],['Crizal Rock','715.00'],['Crizal Easy Pro','553.00'],['Optifog','678.00'],['No Reflex','484.00'],['Trio Easy Clean','478.00'],['Verniz HC','372.00']]) {
  rows.push(r('PVO',14,MFD14,KOD,PUHD,MFD14,'Airwear Polypower','Poly',trat,trat,'standard','nao','','sim','-11.75','+6.50','-6.00','1.00','3.50',preco,SHORT_NOTA));
}
// Poly Transitions Gen S
for (const [trat,preco] of [['Crizal Prevencia','1211.00'],['Crizal Sapphire HR','1211.00'],['Crizal Rock','1089.00'],['Crizal Easy Pro','927.00'],['Optifog','1052.00'],['No Reflex','858.00'],['Trio Easy Clean','852.00'],['Verniz HC','746.00']]) {
  rows.push(r('PVO',14,MFD14,KOD,PUHD,MFD14,'Airwear Polypower','Poly',trat,trat,'standard','sim','C/M/V/A/S/R/E','sim','-11.75','+6.50','-6.00','1.00','3.50',preco,SHORT_NOTA+'; Transitions Gen S'));
}
// 1.67 base (sem Verniz HC)
for (const [trat,preco] of [['Crizal Prevencia','1380.00'],['Crizal Sapphire HR','1380.00'],['Crizal Rock','1258.00'],['Crizal Easy Pro','1096.00'],['Optifog','1221.00'],['No Reflex','1027.00'],['Trio Easy Clean','1021.00']]) {
  rows.push(r('PVO',14,MFD14,KOD,PUHD,MFD14,'Stylis','1.67',trat,trat,'standard','nao','','sim','-14.00','+8.00','-6.00','1.00','3.50',preco,SHORT_NOTA));
}
// 1.67 Transitions Gen S
for (const [trat,preco] of [['Crizal Prevencia','1691.00'],['Crizal Sapphire HR','1691.00'],['Crizal Rock','1569.00'],['Crizal Easy Pro','1407.00'],['Optifog','1532.00'],['No Reflex','1338.00'],['Trio Easy Clean','1332.00']]) {
  rows.push(r('PVO',14,MFD14,KOD,PUHD,MFD14,'Stylis','1.67',trat,trat,'standard','sim','C/M/V','sim','-14.00','+8.00','-6.00','1.00','3.50',preco,SHORT_NOTA+'; Transitions Gen S'));
}

console.log('Precise UHD PVO done:', rows.length);

// ============================================================
// p.14 PVO — Kodak Precise
// ============================================================

// 1.50 base
for (const [trat,preco] of [['Crizal Prevencia','744.00'],['Crizal Sapphire HR','744.00'],['Crizal Rock','622.00'],['Crizal Easy Pro','460.00'],['Optifog','585.00'],['No Reflex','391.00'],['Trio Easy Clean','385.00'],['Sem AR','279.00']]) {
  rows.push(r('PVO',14,MFTRAD,KOD,PREC,MFTRAD,'Orma','1.50',trat,trat,'standard','nao','','nao','-9.00','+6.00','-6.00','1.00','3.50',preco,'alt min 14mm'));
}
// 1.50 Transitions Gen S
for (const [trat,preco] of [['Crizal Prevencia','1123.00'],['Crizal Sapphire HR','1123.00'],['Crizal Rock','1001.00'],['Crizal Easy Pro','839.00'],['Optifog','964.00'],['No Reflex','770.00'],['Trio Easy Clean','764.00'],['Sem AR','658.00']]) {
  rows.push(r('PVO',14,MFTRAD,KOD,PREC,MFTRAD,'Orma','1.50',trat,trat,'standard','sim','C/M/V/A/S/R/E','sim','-9.00','+6.00','-6.00','1.00','3.50',preco,'alt min 14mm; Transitions Gen S'));
}
// Poly base
for (const [trat,preco] of [['Crizal Prevencia','911.00'],['Crizal Sapphire HR','911.00'],['Crizal Rock','789.00'],['Crizal Easy Pro','627.00'],['Optifog','752.00'],['No Reflex','558.00'],['Trio Easy Clean','552.00'],['Sem AR','446.00']]) {
  rows.push(r('PVO',14,MFTRAD,KOD,PREC,MFTRAD,'Airwear Polypower','Poly',trat,trat,'standard','nao','','nao','-10.00','+6.00','-6.00','1.00','3.50',preco,'alt min 14mm'));
}
// Poly Transitions Gen S
for (const [trat,preco] of [['Crizal Prevencia','1211.00'],['Crizal Sapphire HR','1211.00'],['Crizal Rock','1089.00'],['Crizal Easy Pro','927.00'],['Optifog','1052.00'],['No Reflex','858.00'],['Trio Easy Clean','852.00'],['Sem AR','746.00']]) {
  rows.push(r('PVO',14,MFTRAD,KOD,PREC,MFTRAD,'Airwear Polypower','Poly',trat,trat,'standard','sim','C/M/V/A/S/R/E','sim','-10.00','+6.00','-6.00','1.00','3.50',preco,'alt min 14mm; Transitions Gen S'));
}

console.log('Precise PVO done:', rows.length);

// ============================================================
// p.14 PVO — Kodak SoftWear
// ============================================================

for (const [trat,preco] of [['Crizal Prevencia','720.00'],['Crizal Sapphire HR','720.00'],['Crizal Rock','598.00'],['Crizal Easy Pro','436.00'],['Optifog','561.00'],['No Reflex','367.00'],['Trio Easy Clean','361.00'],['Verniz HC','255.00']]) {
  rows.push(r('PVO',14,OCD,KOD,SW,OCD,'Orma','1.50',trat,trat,'standard','nao','','sim','-10.00','+5.00','-6.00','','',preco,''));
}
for (const [trat,preco] of [['Crizal Prevencia','802.00'],['Crizal Sapphire HR','802.00'],['Crizal Rock','680.00'],['Crizal Easy Pro','518.00'],['Optifog','643.00'],['No Reflex','449.00'],['Trio Easy Clean','443.00'],['Verniz HC','337.00']]) {
  rows.push(r('PVO',14,OCD,KOD,SW,OCD,'Airwear Polypower','Poly',trat,trat,'standard','nao','','sim','-10.00','+6.00','-6.00','','',preco,''));
}
for (const [trat,preco] of [['Crizal Prevencia','1252.00'],['Crizal Sapphire HR','1252.00'],['Crizal Rock','1130.00'],['Crizal Easy Pro','968.00'],['Optifog','1093.00'],['No Reflex','899.00'],['Trio Easy Clean','893.00']]) {
  rows.push(r('PVO',14,OCD,KOD,SW,OCD,'Stylis','1.67',trat,trat,'standard','nao','','sim','-14.00','+8.00','-6.00','','',preco,''));
}

console.log('SoftWear PVO done:', rows.length);
fs.writeFileSync('g:/projetos/gestao-otica-pro/.tabelas/kodak_p14_done.csv', header+'\n'+rows.join('\n'), 'utf8');
console.log('CHECKPOINT p14 COMPLETE saved:', rows.length, 'rows');

// ============================================================
// p.15 PVC — Kodak Single (visao simples digital)
// Materiais: 1.50 / Poly / 1.67 / 1.74
// Tratamentos: Prevencia, Sapphire HR, Rock, Easy Pro, Optifog, No Reflex, Trio Easy Clean, Verniz HC
// 1.67 Verniz HC = traco | 1.74: apenas Sapphire HR
// Cilindrico ate -6.00 | Sem adicao
// ============================================================
const SGL = 'Kodak Single';
const VSD = 'Visao Simples Digital';

// 1.50 base
for (const [trat,preco] of [['Crizal Prevencia','1259.00'],['Crizal Sapphire HR','1259.00'],['Crizal Rock','989.00'],['Crizal Easy Pro','639.00'],['Optifog','879.00'],['No Reflex','489.00'],['Trio Easy Clean','439.00'],['Verniz HC','239.00']]) {
  rows.push(r('PVC',15,VSD,KOD,SGL,VSD,'Orma','1.50',trat,trat,'standard','nao','','sim','-10.00','+6.00','-6.00','','',preco,''));
}
// +Blue UV
for (const [trat,preco] of [['Crizal Prevencia','1339.00'],['Crizal Sapphire HR','1339.00'],['Crizal Rock','1069.00'],['Crizal Easy Pro','719.00'],['Optifog','959.00'],['No Reflex','569.00'],['Trio Easy Clean','519.00'],['Verniz HC','319.00']]) {
  rows.push(r('PVC',15,VSD,KOD,SGL,VSD,'Orma','1.50',trat,trat,'standard','nao','','sim','-10.00','+6.00','-6.00','','',preco,'+Blue UV'));
}
// Transitions Gen S C/M/V/A/S/R/E
for (const [trat,preco] of [['Crizal Prevencia','2049.00'],['Crizal Sapphire HR','2049.00'],['Crizal Rock','1779.00'],['Crizal Easy Pro','1429.00'],['Optifog','1669.00'],['No Reflex','1279.00'],['Trio Easy Clean','1229.00'],['Verniz HC','1029.00']]) {
  rows.push(r('PVC',15,VSD,KOD,SGL,VSD,'Orma','1.50',trat,trat,'standard','sim','C/M/V/A/S/R/E','sim','-10.00','+6.00','-6.00','','',preco,'Transitions Gen S'));
}
// Transitions Extractive C
for (const [trat,preco] of [['Crizal Prevencia','2119.00'],['Crizal Sapphire HR','2119.00'],['Crizal Rock','1849.00'],['Crizal Easy Pro','1499.00'],['Optifog','1739.00'],['No Reflex','1349.00'],['Trio Easy Clean','1299.00'],['Verniz HC','1099.00']]) {
  rows.push(r('PVC',15,VSD,KOD,SGL,VSD,'Orma','1.50',trat,trat,'standard','sim','C','sim','-10.00','+6.00','-6.00','','',preco,'Transitions Extractive'));
}

// Poly base
for (const [trat,preco] of [['Crizal Prevencia','1429.00'],['Crizal Sapphire HR','1429.00'],['Crizal Rock','1159.00'],['Crizal Easy Pro','809.00'],['Optifog','1049.00'],['No Reflex','659.00'],['Trio Easy Clean','609.00'],['Verniz HC','409.00']]) {
  rows.push(r('PVC',15,VSD,KOD,SGL,VSD,'Airwear Polypower','Poly',trat,trat,'standard','nao','','sim','-10.00','+6.00','-6.00','','',preco,''));
}
// Poly Transitions Gen S
for (const [trat,preco] of [['Crizal Prevencia','2219.00'],['Crizal Sapphire HR','2219.00'],['Crizal Rock','1949.00'],['Crizal Easy Pro','1599.00'],['Optifog','1839.00'],['No Reflex','1449.00'],['Trio Easy Clean','1399.00'],['Verniz HC','1199.00']]) {
  rows.push(r('PVC',15,VSD,KOD,SGL,VSD,'Airwear Polypower','Poly',trat,trat,'standard','sim','C/M/V/A/S/R/E','sim','-10.00','+6.00','-6.00','','',preco,'Transitions Gen S'));
}
// Poly Transitions Extractive
for (const [trat,preco] of [['Crizal Prevencia','2289.00'],['Crizal Sapphire HR','2289.00'],['Crizal Rock','2019.00'],['Crizal Easy Pro','1669.00'],['Optifog','1909.00'],['No Reflex','1519.00'],['Trio Easy Clean','1469.00'],['Verniz HC','1269.00']]) {
  rows.push(r('PVC',15,VSD,KOD,SGL,VSD,'Airwear Polypower','Poly',trat,trat,'standard','sim','C','sim','-10.00','+6.00','-6.00','','',preco,'Transitions Extractive'));
}

// 1.67 base (sem Verniz HC)
for (const [trat,preco] of [['Crizal Prevencia','2349.00'],['Crizal Sapphire HR','2349.00'],['Crizal Rock','2079.00'],['Crizal Easy Pro','1729.00'],['Optifog','1969.00'],['No Reflex','1579.00'],['Trio Easy Clean','1529.00']]) {
  rows.push(r('PVC',15,VSD,KOD,SGL,VSD,'Stylis','1.67',trat,trat,'standard','nao','','sim','-14.00','+8.00','-6.00','','',preco,''));
}
// 1.67 Transitions Gen S C/M/V
for (const [trat,preco] of [['Crizal Prevencia','3139.00'],['Crizal Sapphire HR','3139.00'],['Crizal Rock','2869.00'],['Crizal Easy Pro','2519.00'],['Optifog','2759.00'],['No Reflex','2369.00'],['Trio Easy Clean','2319.00']]) {
  rows.push(r('PVC',15,VSD,KOD,SGL,VSD,'Stylis','1.67',trat,trat,'standard','sim','C/M/V','sim','-14.00','+8.00','-6.00','','',preco,'Transitions Gen S'));
}
// 1.74 Sapphire HR only
rows.push(r('PVC',15,VSD,KOD,SGL,VSD,'Stylis','1.74','Crizal Sapphire HR','Crizal Sapphire HR','standard','nao','','sim','-18.00','+13.00','-6.00','','','3059.00',''));
rows.push(r('PVC',15,VSD,KOD,SGL,VSD,'Stylis','1.74','Crizal Sapphire HR','Crizal Sapphire HR','standard','sim','C','sim','-18.00','+13.00','-6.00','','','3849.00','Transitions Gen S'));

console.log('Single PVC done:', rows.length);

// ============================================================
// p.15 PVC — Lentes Prontas Kodak
// ============================================================
const LP = 'Lentes Prontas Kodak';
const LP_BLOCO = 'Lentes Prontas';

rows.push(r('PVC',15,LP_BLOCO,KOD,LP,'','City 1.67','Stylis','1.67','','','','nao','','sim','-10.00 a 0.00; -12.00 a -10.25','','','-2.00','','','989.00','City 1.67'));
rows.push(r('PVC',15,LP_BLOCO,KOD,LP,'','City Poly','Airwear Polypower','Poly','','','','nao','','sim','-8.00','+4.00','-2.00','','','429.00','City Poly'));
rows.push(r('PVC',15,LP_BLOCO,KOD,LP,'','City 1.56','','1.56','','','','nao','','sim','-6.00','+6.00','-2.00','','','329.00','City 1.56'));
rows.push(r('PVC',15,LP_BLOCO,KOD,LP,'','No Reflex 1.50 Transitions Gen S cinza','Orma','1.50','','','','sim','C','sim','-4.00','+4.00','-2.00','','','649.00','No Reflex 1.50 Transitions Gen S cinza'));
rows.push(r('PVC',15,LP_BLOCO,KOD,LP,'','Blue 1.67','Stylis','1.67','','','','nao','','sim','-10.00','+6.00','-2.00','','','879.00','Blue 1.67'));
rows.push(r('PVC',15,LP_BLOCO,KOD,LP,'','Blue Poly','Airwear Polypower','Poly','','','','nao','','sim','-8.00','+4.00','-2.00','','','319.00','Blue Poly'));
rows.push(r('PVC',15,LP_BLOCO,KOD,LP,'','Blue 1.56','','1.56','','','','nao','','sim','-6.00','+4.00','-2.00','','','219.00','Blue 1.56'));
rows.push(r('PVC',15,LP_BLOCO,KOD,LP,'','Intro Poly','Airwear Polypower','Poly','','','','nao','','nao','-8.00','+4.00','-2.00','','','209.00','Intro Poly'));
rows.push(r('PVC',15,LP_BLOCO,KOD,LP,'','Intro 1.56','','1.56','','','','nao','','nao','-6.00','+6.00','-2.00','','','109.00','Intro 1.56'));

console.log('Lentes Prontas PVC done:', rows.length);

// ============================================================
// p.15 PVC — Kodak Easy Sun (multifocal solar + coloracao)
// ============================================================
const ES = 'Kodak Easy Sun';
const SOLAR_BLOCO = 'Lentes Coloridas - Multifocal Digital';

// Solares
for (const [trat,tg,ta,preco] of [
  ['Crizal Sapphire HR Face Interna','Crizal Sapphire HR','internal','1689.00'],
  ['Optifog','Optifog','standard','1669.00'],
  ['Verniz HC','Verniz HC','standard','1029.00'],
]) {
  rows.push(r('PVC',15,SOLAR_BLOCO,KOD,ES,'Solar','Orma','1.50',trat,tg,ta,'nao','','nao','-10.00','+5.00','-6.00','1.00','3.50',preco,'Xperio cinza/marrom/verde'));
}
for (const [trat,tg,ta,preco] of [
  ['Crizal Sapphire HR Face Interna','Crizal Sapphire HR','internal','1909.00'],
  ['Optifog','Optifog','standard','1889.00'],
  ['Verniz HC','Verniz HC','standard','1249.00'],
]) {
  rows.push(r('PVC',15,SOLAR_BLOCO,KOD,ES,'Solar','Airwear Polypower','Poly',trat,tg,ta,'nao','','nao','-10.00','+6.00','-6.00','1.00','3.50',preco,'Xperio cinza/marrom/verde'));
}
// Coloracao
rows.push(r('PVC',15,SOLAR_BLOCO,KOD,ES,'Coloracao padrao','Orma','1.50','Verniz HC','Verniz HC','standard','nao','','nao','-10.00','+5.00','-6.00','1.00','3.50','639.00','adicao 1.00 a 3.50; alt min 14mm'));
rows.push(r('PVC',15,SOLAR_BLOCO,KOD,ES,'Coloracao especial','Orma','1.50','Verniz HC','Verniz HC','standard','nao','','nao','-10.00','+5.00','-6.00','1.00','3.50','749.00','adicao 1.00 a 3.50; alt min 14mm'));
rows.push(r('PVC',15,SOLAR_BLOCO,KOD,ES,'Coloracao padrao','Airwear Polypower','Poly','Verniz HC','Verniz HC','standard','nao','','nao','-10.00','+6.00','-6.00','1.00','3.50','859.00','adicao 1.00 a 3.50; alt min 14mm'));
rows.push(r('PVC',15,SOLAR_BLOCO,KOD,ES,'Coloracao especial','Airwear Polypower','Poly','Verniz HC','Verniz HC','standard','nao','','nao','-10.00','+6.00','-6.00','1.00','3.50','969.00','adicao 1.00 a 3.50; alt min 14mm'));

// ============================================================
// p.15 PVC — Kodak Single Sun (VS solar + coloracao)
// ============================================================
const SS = 'Kodak Single Sun';
const SOLAR_VS_BLOCO = 'Lentes Coloridas - Visao Simples Digital';

for (const [trat,tg,ta,preco] of [
  ['Crizal Sapphire HR Face Interna','Crizal Sapphire HR','internal','1359.00'],
  ['Optifog','Optifog','standard','1339.00'],
  ['Verniz HC','Verniz HC','standard','699.00'],
]) {
  rows.push(r('PVC',15,SOLAR_VS_BLOCO,KOD,SS,'Solar','Orma','1.50',trat,tg,ta,'nao','','nao','-10.00','+6.00','-6.00','','',preco,'Xperio cinza/marrom/verde'));
}
for (const [trat,tg,ta,preco] of [
  ['Crizal Sapphire HR Face Interna','Crizal Sapphire HR','internal','1529.00'],
  ['Optifog','Optifog','standard','1509.00'],
  ['Verniz HC','Verniz HC','standard','869.00'],
]) {
  rows.push(r('PVC',15,SOLAR_VS_BLOCO,KOD,SS,'Solar','Airwear Polypower','Poly',trat,tg,ta,'nao','','nao','-10.00','+6.00','-6.00','','',preco,'Xperio cinza/marrom/verde'));
}
// Coloracao
rows.push(r('PVC',15,SOLAR_VS_BLOCO,KOD,SS,'Coloracao padrao','Orma','1.50','Verniz HC','Verniz HC','standard','nao','','nao','-10.00','+6.00','-6.00','','','399.00',''));
rows.push(r('PVC',15,SOLAR_VS_BLOCO,KOD,SS,'Coloracao especial','Orma','1.50','Verniz HC','Verniz HC','standard','nao','','nao','-10.00','+6.00','-6.00','','','509.00',''));
rows.push(r('PVC',15,SOLAR_VS_BLOCO,KOD,SS,'Coloracao padrao','Airwear Polypower','Poly','Verniz HC','Verniz HC','standard','nao','','nao','-10.00','+6.00','-6.00','','','569.00',''));
rows.push(r('PVC',15,SOLAR_VS_BLOCO,KOD,SS,'Coloracao especial','Airwear Polypower','Poly','Verniz HC','Verniz HC','standard','nao','','nao','-10.00','+6.00','-6.00','','','679.00',''));

console.log('p15 PVC done:', rows.length);
fs.writeFileSync('g:/projetos/gestao-otica-pro/.tabelas/kodak_p15_pvc_checkpoint.csv', header+'\n'+rows.join('\n'), 'utf8');
console.log('CHECKPOINT p15 PVC saved');

// ============================================================
// p.15 PVO — Kodak Single
// ============================================================

// 1.50 base
for (const [trat,preco] of [['Crizal Prevencia','627.00'],['Crizal Sapphire HR','627.00'],['Crizal Rock','505.00'],['Crizal Easy Pro','343.00'],['Optifog','468.00'],['No Reflex','274.00'],['Trio Easy Clean','268.00'],['Verniz HC','162.00']]) {
  rows.push(r('PVO',15,VSD,KOD,SGL,VSD,'Orma','1.50',trat,trat,'standard','nao','','sim','-10.00','+6.00','-6.00','','',preco,''));
}
for (const [trat,preco] of [['Crizal Prevencia','675.00'],['Crizal Sapphire HR','675.00'],['Crizal Rock','553.00'],['Crizal Easy Pro','391.00'],['Optifog','516.00'],['No Reflex','322.00'],['Trio Easy Clean','316.00'],['Verniz HC','210.00']]) {
  rows.push(r('PVO',15,VSD,KOD,SGL,VSD,'Orma','1.50',trat,trat,'standard','nao','','sim','-10.00','+6.00','-6.00','','',preco,'+Blue UV'));
}
for (const [trat,preco] of [['Crizal Prevencia','916.00'],['Crizal Sapphire HR','916.00'],['Crizal Rock','794.00'],['Crizal Easy Pro','632.00'],['Optifog','757.00'],['No Reflex','563.00'],['Trio Easy Clean','557.00'],['Verniz HC','451.00']]) {
  rows.push(r('PVO',15,VSD,KOD,SGL,VSD,'Orma','1.50',trat,trat,'standard','sim','C/M/V/A/S/R/E','sim','-10.00','+6.00','-6.00','','',preco,'Transitions Gen S'));
}
for (const [trat,preco] of [['Crizal Prevencia','948.00'],['Crizal Sapphire HR','948.00'],['Crizal Rock','826.00'],['Crizal Easy Pro','664.00'],['Optifog','789.00'],['No Reflex','595.00'],['Trio Easy Clean','589.00'],['Verniz HC','483.00']]) {
  rows.push(r('PVO',15,VSD,KOD,SGL,VSD,'Orma','1.50',trat,trat,'standard','sim','C','sim','-10.00','+6.00','-6.00','','',preco,'Transitions Extractive'));
}

// Poly base
for (const [trat,preco] of [['Crizal Prevencia','690.00'],['Crizal Sapphire HR','690.00'],['Crizal Rock','568.00'],['Crizal Easy Pro','406.00'],['Optifog','531.00'],['No Reflex','337.00'],['Trio Easy Clean','331.00'],['Verniz HC','225.00']]) {
  rows.push(r('PVO',15,VSD,KOD,SGL,VSD,'Airwear Polypower','Poly',trat,trat,'standard','nao','','sim','-10.00','+6.00','-6.00','','',preco,''));
}
for (const [trat,preco] of [['Crizal Prevencia','986.00'],['Crizal Sapphire HR','986.00'],['Crizal Rock','864.00'],['Crizal Easy Pro','702.00'],['Optifog','827.00'],['No Reflex','633.00'],['Trio Easy Clean','627.00'],['Verniz HC','521.00']]) {
  rows.push(r('PVO',15,VSD,KOD,SGL,VSD,'Airwear Polypower','Poly',trat,trat,'standard','sim','C/M/V/A/S/R/E','sim','-10.00','+6.00','-6.00','','',preco,'Transitions Gen S'));
}
for (const [trat,preco] of [['Crizal Prevencia','1018.00'],['Crizal Sapphire HR','1018.00'],['Crizal Rock','896.00'],['Crizal Easy Pro','734.00'],['Optifog','859.00'],['No Reflex','665.00'],['Trio Easy Clean','659.00'],['Verniz HC','553.00']]) {
  rows.push(r('PVO',15,VSD,KOD,SGL,VSD,'Airwear Polypower','Poly',trat,trat,'standard','sim','C','sim','-10.00','+6.00','-6.00','','',preco,'Transitions Extractive'));
}

// 1.67 (sem Verniz HC)
for (const [trat,preco] of [['Crizal Prevencia','1068.00'],['Crizal Sapphire HR','1068.00'],['Crizal Rock','946.00'],['Crizal Easy Pro','784.00'],['Optifog','909.00'],['No Reflex','715.00'],['Trio Easy Clean','709.00']]) {
  rows.push(r('PVO',15,VSD,KOD,SGL,VSD,'Stylis','1.67',trat,trat,'standard','nao','','sim','-14.00','+8.00','-6.00','','',preco,''));
}
for (const [trat,preco] of [['Crizal Prevencia','1365.00'],['Crizal Sapphire HR','1365.00'],['Crizal Rock','1243.00'],['Crizal Easy Pro','1081.00'],['Optifog','1206.00'],['No Reflex','1012.00'],['Trio Easy Clean','1006.00']]) {
  rows.push(r('PVO',15,VSD,KOD,SGL,VSD,'Stylis','1.67',trat,trat,'standard','sim','C/M/V','sim','-14.00','+8.00','-6.00','','',preco,'Transitions Gen S'));
}
// 1.74
rows.push(r('PVO',15,VSD,KOD,SGL,VSD,'Stylis','1.74','Crizal Sapphire HR','Crizal Sapphire HR','standard','nao','','sim','-18.00','+13.00','-6.00','','','1391.00',''));
rows.push(r('PVO',15,VSD,KOD,SGL,VSD,'Stylis','1.74','Crizal Sapphire HR','Crizal Sapphire HR','standard','sim','C','sim','-18.00','+13.00','-6.00','','','1666.00','Transitions Gen S'));

console.log('Single PVO done:', rows.length);

// ============================================================
// p.15 PVO — Lentes Prontas Kodak
// ============================================================
rows.push(r('PVO',15,LP_BLOCO,KOD,LP,'','City 1.67','Stylis','1.67','','','','nao','','sim','-10.00 a 0.00; -12.00 a -10.25','','','-2.00','','','376.00','City 1.67'));
rows.push(r('PVO',15,LP_BLOCO,KOD,LP,'','City Poly','Airwear Polypower','Poly','','','','nao','','sim','-8.00','+4.00','-2.00','','','175.00','City Poly'));
rows.push(r('PVO',15,LP_BLOCO,KOD,LP,'','City 1.56','','1.56','','','','nao','','sim','-6.00','+6.00','-2.00','','','125.00','City 1.56'));
rows.push(r('PVO',15,LP_BLOCO,KOD,LP,'','No Reflex 1.50 Transitions Gen S cinza','Orma','1.50','','','','sim','C','sim','-4.00','+4.00','-2.00','','','234.00','No Reflex 1.50 Transitions Gen S cinza'));
rows.push(r('PVO',15,LP_BLOCO,KOD,LP,'','Blue 1.67','Stylis','1.67','','','','nao','','sim','-10.00','+6.00','-2.00','','','299.00','Blue 1.67'));
rows.push(r('PVO',15,LP_BLOCO,KOD,LP,'','Blue Poly','Airwear Polypower','Poly','','','','nao','','sim','-8.00','+4.00','-2.00','','','113.00','Blue Poly'));
rows.push(r('PVO',15,LP_BLOCO,KOD,LP,'','Blue 1.56','','1.56','','','','nao','','sim','-6.00','+4.00','-2.00','','','82.00','Blue 1.56'));
rows.push(r('PVO',15,LP_BLOCO,KOD,LP,'','Intro Poly','Airwear Polypower','Poly','','','','nao','','nao','-8.00','+4.00','-2.00','','','82.00','Intro Poly'));
rows.push(r('PVO',15,LP_BLOCO,KOD,LP,'','Intro 1.56','','1.56','','','','nao','','nao','-6.00','+6.00','-2.00','','','37.00','Intro 1.56'));

// ============================================================
// p.15 PVO — Kodak Easy Sun
// ============================================================
for (const [trat,tg,ta,preco] of [
  ['Crizal Sapphire HR Face Interna','Crizal Sapphire HR','internal','765.00'],
  ['Optifog','Optifog','standard','771.00'],
  ['Verniz HC','Verniz HC','standard','465.00'],
]) {
  rows.push(r('PVO',15,SOLAR_BLOCO,KOD,ES,'Solar','Orma','1.50',trat,tg,ta,'nao','','nao','-10.00','+5.00','-6.00','1.00','3.50',preco,'Xperio cinza/marrom/verde'));
}
for (const [trat,tg,ta,preco] of [
  ['Crizal Sapphire HR Face Interna','Crizal Sapphire HR','internal','848.00'],
  ['Optifog','Optifog','standard','854.00'],
  ['Verniz HC','Verniz HC','standard','548.00'],
]) {
  rows.push(r('PVO',15,SOLAR_BLOCO,KOD,ES,'Solar','Airwear Polypower','Poly',trat,tg,ta,'nao','','nao','-10.00','+6.00','-6.00','1.00','3.50',preco,'Xperio cinza/marrom/verde'));
}
rows.push(r('PVO',15,SOLAR_BLOCO,KOD,ES,'Coloracao padrao','Orma','1.50','Verniz HC','Verniz HC','standard','nao','','nao','-10.00','+5.00','-6.00','1.00','3.50','322.00','adicao 1.00 a 3.50; alt min 14mm'));
rows.push(r('PVO',15,SOLAR_BLOCO,KOD,ES,'Coloracao especial','Orma','1.50','Verniz HC','Verniz HC','standard','nao','','nao','-10.00','+5.00','-6.00','1.00','3.50','361.00','adicao 1.00 a 3.50; alt min 14mm'));
rows.push(r('PVO',15,SOLAR_BLOCO,KOD,ES,'Coloracao padrao','Airwear Polypower','Poly','Verniz HC','Verniz HC','standard','nao','','nao','-10.00','+6.00','-6.00','1.00','3.50','406.00','adicao 1.00 a 3.50; alt min 14mm'));
rows.push(r('PVO',15,SOLAR_BLOCO,KOD,ES,'Coloracao especial','Airwear Polypower','Poly','Verniz HC','Verniz HC','standard','nao','','nao','-10.00','+6.00','-6.00','1.00','3.50','445.00','adicao 1.00 a 3.50; alt min 14mm'));

// ============================================================
// p.15 PVO — Kodak Single Sun
// ============================================================
for (const [trat,tg,ta,preco] of [
  ['Crizal Sapphire HR Face Interna','Crizal Sapphire HR','internal','636.00'],
  ['Optifog','Optifog','standard','642.00'],
  ['Verniz HC','Verniz HC','standard','336.00'],
]) {
  rows.push(r('PVO',15,SOLAR_VS_BLOCO,KOD,SS,'Solar','Orma','1.50',trat,tg,ta,'nao','','nao','-10.00','+6.00','-6.00','','',preco,'Xperio cinza/marrom/verde'));
}
for (const [trat,tg,ta,preco] of [
  ['Crizal Sapphire HR Face Interna','Crizal Sapphire HR','internal','706.00'],
  ['Optifog','Optifog','standard','712.00'],
  ['Verniz HC','Verniz HC','standard','406.00'],
]) {
  rows.push(r('PVO',15,SOLAR_VS_BLOCO,KOD,SS,'Solar','Airwear Polypower','Poly',trat,tg,ta,'nao','','nao','-10.00','+6.00','-6.00','','',preco,'Xperio cinza/marrom/verde'));
}
rows.push(r('PVO',15,SOLAR_VS_BLOCO,KOD,SS,'Coloracao padrao','Orma','1.50','Verniz HC','Verniz HC','standard','nao','','nao','-10.00','+6.00','-6.00','','','202.00',''));
rows.push(r('PVO',15,SOLAR_VS_BLOCO,KOD,SS,'Coloracao especial','Orma','1.50','Verniz HC','Verniz HC','standard','nao','','nao','-10.00','+6.00','-6.00','','','241.00',''));
rows.push(r('PVO',15,SOLAR_VS_BLOCO,KOD,SS,'Coloracao padrao','Airwear Polypower','Poly','Verniz HC','Verniz HC','standard','nao','','nao','-10.00','+6.00','-6.00','','','278.00',''));
rows.push(r('PVO',15,SOLAR_VS_BLOCO,KOD,SS,'Coloracao especial','Airwear Polypower','Poly','Verniz HC','Verniz HC','standard','nao','','nao','-10.00','+6.00','-6.00','','','317.00',''));

console.log('p15 PVO done. Total Kodak rows:', rows.length);

// Save final Kodak file
fs.writeFileSync('g:/projetos/gestao-otica-pro/.tabelas/kodak_p13_15_completo.csv', header+'\n'+rows.join('\n'), 'utf8');
console.log('KODAK COMPLETO SALVO:', rows.length, 'rows');
