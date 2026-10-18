/** Serializable editor model: a completed save acknowledges its captured revision only. */
export function createDocumentModel({text='',name='Untitled.txt',handle=null}={}) {
  let state={text,name,handle,revision:0,savedRevision:0,documentId:0};
  const read=()=>({...state,dirty:state.revision!==state.savedRevision});
  return Object.freeze({
    read,
    edit(text){if(typeof text!=='string')throw new TypeError('text must be a string');if(text!==state.text)state={...state,text,revision:state.revision+1};return read();},
    load({text='',name='Untitled.txt',handle=null}={}){if(typeof text!=='string'||typeof name!=='string')throw new TypeError('document text and name must be strings');state={text,name,handle,revision:0,savedRevision:0,documentId:state.documentId+1};return read();},
    snapshot(){return Object.freeze({...state});},
    saved(snapshot,{name=state.name,handle=state.handle}={}){if(snapshot.documentId!==state.documentId)return false;state={...state,name,handle,savedRevision:snapshot.revision};return true;}
  });
}
