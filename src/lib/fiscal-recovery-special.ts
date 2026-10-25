/** Origin markers are business metadata, outside infNFe and signed XML. */
export function ownRecoveryOrigin(draftId:string|undefined,pilot:boolean):string|null {
  return pilot&&draftId&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(draftId)?`draft:${draftId}`:null;
}
export function isOwnRecoveryInvoice(row:{payload_json?:Record<string,unknown>|null},origin:string|null):boolean {
  return origin!==null&&row.payload_json?._recovery_origin_id===origin;
}
export function specialRecoveryMetadata(options:{returnEntry:boolean;shipmentReturn:boolean;demonstrationReturn:boolean;depositReturn:boolean;key:string}) {
  if(options.returnEntry)return {_entry_access_key:options.key};
  if(options.shipmentReturn)return options.demonstrationReturn?{_demonstration_origin_key:options.key}:{_shipment_origin_key:options.key};
  if(options.depositReturn)return {_transfer_deposit_origin_key:options.key};
  return {};
}
export function returnQuantityLimits(items:Array<{codigo:string;quantidade:number}>):Record<string,number>{
  const limits:Record<string,number>=Object.create(null);
  for(const item of items){const code=item.codigo.trim();if(!code||!Number.isFinite(item.quantidade)||item.quantidade<=0)throw new Error('RECOVERY_RETURN_ORIGIN_INVALID');
    limits[code]=(limits[code]??0)+item.quantidade;}
  return limits;
}
