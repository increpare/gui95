/** Browser-safe shared command registry. No Node modules or global listeners on import. */
const identifier=/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/i;
const aliases=new Map([['control','ctrl'],['cmd','meta'],['command','meta'],['option','alt'],['cmdorctrl','primary'],['mod','primary'],['esc','escape'],['space',' '],['return','enter'],['del','delete'],['plus','+']]);
const editable=target=>Boolean(target && (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)||target.isContentEditable||target.closest?.('[contenteditable="true"]')));
function shortcut(value) {
  if(!value) return null;
  if(typeof value!=='string'||value.length>100) throw new TypeError('shortcut must be a string of up to 100 characters');
  const tokens=value.toLowerCase().split('+').map(x=>x.trim()).map(x=>aliases.get(x)??x);
  const key=tokens.pop();
  if(!key||tokens.some(x=>!['ctrl','alt','shift','meta','primary'].includes(x))||new Set(tokens).size!==tokens.length) throw new TypeError(`Invalid shortcut: ${value}; use Plus for the + key`);
  return {key,mods:tokens.sort(),canonical:[...tokens.sort(),key].join('+')};
}
function eventMatches(event,binding,platform) {
  const mods=new Set(binding.mods);
  if(mods.delete('primary')) mods.add(/mac|iphone|ipad/i.test(platform)?'meta':'ctrl');
  return String(event.key).toLowerCase()===binding.key && Boolean(event.ctrlKey)===mods.has('ctrl') && Boolean(event.altKey)===mods.has('alt') && Boolean(event.shiftKey)===mods.has('shift') && Boolean(event.metaKey)===mods.has('meta');
}
export function createCommandRegistry(definitions,{context={},platform=globalThis.navigator?.platform??'',onError=error=>console.error(error)}={}) {
  if(!Array.isArray(definitions)||definitions.length>256) throw new TypeError('commands must be an array of at most 256 definitions');
  const commands=new Map();
  const listeners=new Set();
  const issues=[];
  const shortcuts=new Map();
  const mnemonics=new Map();
  let current={...context};
  for(const definition of definitions) {
    if(!definition||!identifier.test(definition.id)) throw new TypeError('Every command needs a stable id (letters, digits, dots, and hyphens)');
    if(commands.has(definition.id)) throw new TypeError(`Duplicate command id: ${definition.id}`);
    if(typeof definition.run!=='function') throw new TypeError(`${definition.id}: run must be a function`);
    const binding=shortcut(definition.shortcut);
    const item={...definition,binding};
    commands.set(item.id,item);
    if(binding) {
      // Primary and the platform-specific modifier share the same ownership.
      const effective=binding.canonical.replace('primary',/mac|iphone|ipad/i.test(platform)?'meta':'ctrl');
      if(shortcuts.has(effective)) issues.push({code:'shortcut-conflict',shortcut:definition.shortcut,ids:[shortcuts.get(effective),item.id]});
      else shortcuts.set(effective,item.id);
    }
    if(item.mnemonic) {
      if(typeof item.mnemonic!=='string'||[...item.mnemonic].length!==1) throw new TypeError(`${item.id}: mnemonic must be one character`);
      const key=`${item.menu??item.group??'application'}:${item.mnemonic.toLowerCase()}`;
      if(mnemonics.has(key)) issues.push({code:'mnemonic-conflict',mnemonic:item.mnemonic,ids:[mnemonics.get(key),item.id]});
      else mnemonics.set(key,item.id);
    }
  }
  const evaluate=(value,fallback)=>typeof value==='function'?Boolean(value(current)):value===undefined?fallback:Boolean(value);
  const state=id=>{
    const item=commands.get(id);
    if(!item) throw new RangeError(`Unknown command: ${id}`);
    return {id,label:item.label??id,help:item.help??'',shortcut:item.shortcut??'',enabled:evaluate(item.enabled,true),checked:item.checked===undefined?undefined:evaluate(item.checked,false),target:item.target??'application'};
  };
  const ownerFor=event=>event?.target?.closest?.('[data-command-owner]')?.dataset?.commandOwner??(event?.target?.closest?.('dialog[open]')?'dialog':current.owner??'document');
  const nativeOwns=event=>{const target=event.target;const key=String(event.key).toLowerCase();return (!event.ctrlKey&&!event.metaKey&&!event.altKey)&&(([' ','enter'].includes(key)&&(target?.tagName==='BUTTON'||target?.closest?.('a[href], [role="button"]')))||(['arrowleft','arrowright','arrowup','arrowdown','home','end'].includes(key)&&target?.closest?.('[data-gui95-toolbar], [role="tablist"], [role="tree"], [role="slider"]')));};
  const allowed=(item,owner)=>!item.target||item.target==='application'||item.target===owner;
  const execute=async(id,event)=>{
    const item=commands.get(id);
    if(!item) throw new RangeError(`Unknown command: ${id}`);
    if(!state(id).enabled||!allowed(item,ownerFor(event))||(event?.repeat&&!item.repeat)) return false;
    await item.run({...current,owner:ownerFor(event)},event);
    refresh();
    return true;
  };
  const refresh=()=>{for(const listener of listeners) listener();};
  const handleKeydown=event=>{
    if(event.defaultPrevented||event.isComposing||nativeOwns(event)) return false;
    for(const item of commands.values()) {
      if(!item.binding||!eventMatches(event,item.binding,platform)) continue;
      const owner=event.target?.closest?.('[role="menu"]')?'menu':ownerFor(event);
      if((event.repeat&&!item.repeat)||!state(item.id).enabled||!allowed(item,owner)||((owner==='dialog'||owner==='menu')&&item.target!==owner&&!item.allowInDialog)||(editable(event.target)&&!item.allowInEditable)) return false;
      event.preventDefault();
      void execute(item.id,event).catch(onError);
      return true;
    }
    return false;
  };
  const bind=(root,{status}={})=>{
    if(!root?.addEventListener||!root.querySelectorAll) throw new TypeError('bind needs a DOM root');
    const update=()=>{
      for(const node of root.querySelectorAll('[data-command]')) {
        if(!commands.has(node.dataset.command)) continue;
        const value=state(node.dataset.command);
        node.disabled=!value.enabled;
        node.setAttribute('aria-disabled',String(!value.enabled));
        if(value.checked!==undefined) node.setAttribute(node.getAttribute('role')==='menuitemcheckbox'?'aria-checked':'aria-pressed',String(value.checked));
        if(value.shortcut) node.setAttribute('aria-keyshortcuts',value.shortcut.replace(/Primary|CmdOrCtrl|Mod/gi,/mac|iphone|ipad/i.test(platform)?'Meta':'Control'));
        if(!node.hasAttribute('title')) node.title=value.help||value.label;
      }
    };
    const click=event=>{
      const node=event.target.closest?.('[data-command]');
      if(!node||!commands.has(node.dataset.command)||node.disabled) return;
      event.preventDefault();
      void execute(node.dataset.command,event).catch(onError);
    };
    let helpActive=false,lastHelp='',previousStatus='';
    const clearHelp=()=>{if(status&&helpActive&&status.textContent===lastHelp)status.textContent=previousStatus;helpActive=false;lastHelp='';previousStatus='';};
    const showHelp=event=>{const node=event.target.closest?.('[data-command]');if(!status)return;if(!node||!commands.has(node.dataset.command)){clearHelp();return;}if(!helpActive||status.textContent!==lastHelp)previousStatus=status.textContent;lastHelp=state(node.dataset.command).help;helpActive=true;status.textContent=lastHelp;};
    root.addEventListener('click',click);
    root.addEventListener('keydown',handleKeydown);
    root.addEventListener('pointerover',showHelp);
    root.addEventListener('focusin',showHelp);
    root.addEventListener('pointerleave',clearHelp);
    root.addEventListener('focusout',clearHelp);
    listeners.add(update);
    update();
    return ()=>{clearHelp();listeners.delete(update); for(const [type,fn] of [['click',click],['keydown',handleKeydown],['pointerover',showHelp],['focusin',showHelp],['pointerleave',clearHelp],['focusout',clearHelp]]) root.removeEventListener(type,fn);};
  };
  return Object.freeze({state,execute,handleKeydown,bind,refresh,setContext(patch){if(!patch||typeof patch!=='object') throw new TypeError('context must be an object'); current={...current,...patch}; refresh();},getContext(){return {...current};},diagnostics:()=>issues.map(x=>({...x,ids:[...x.ids]})),list:()=>[...commands.keys()].map(state)});
}
