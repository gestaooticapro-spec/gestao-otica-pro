GRANT UPDATE (
    dependente_id, oftalmologista_id, data_receita, obs_os,
    receita_longe_od_esferico, receita_longe_od_cilindrico, receita_longe_od_eixo,
    receita_longe_oe_esferico, receita_longe_oe_cilindrico, receita_longe_oe_eixo,
    receita_perto_od_esferico, receita_perto_od_cilindrico, receita_perto_od_eixo,
    receita_perto_oe_esferico, receita_perto_oe_cilindrico, receita_perto_oe_eixo,
    receita_adicao,
    medida_dnp_od, medida_dnp_oe, medida_altura_od, medida_altura_oe
) ON public.customer_manual_prescriptions TO service_role;
