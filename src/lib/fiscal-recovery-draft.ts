const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

/** A form's URL carries its draft identity through reload/back/retry. It is
 * only an idempotency hint; the server still authenticates and reserves scope.
 * Opening a new emission page without this parameter starts a new draft.
 */
export function fiscalDraftIdentity(url:URL,createId:()=>string):{id:string;url:URL;changed:boolean} {
  const existing=url.searchParams.get('recoveryDraftId');
  if(existing&&uuid.test(existing))return {id:existing,url,changed:false};
  const id=createId();if(!uuid.test(id))throw new Error('RECOVERY_DRAFT_ID_INVALID');
  const next=new URL(url);next.searchParams.set('recoveryDraftId',id);return {id,url:next,changed:true};
}
export function browserFiscalDraftId():string {
  const draft=fiscalDraftIdentity(new URL(window.location.href),()=>crypto.randomUUID());
  if(draft.changed)window.history.replaceState(window.history.state,'',draft.url);
  return draft.id;
}
