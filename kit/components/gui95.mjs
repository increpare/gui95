/** GUI95 1.0.0. Semantic HTML enhancements; no framework or global shortcut registry. */
export const version = '1.0.0';
const controllers = new WeakMap();
const sessions = new WeakMap();
const dialogStacks = new WeakMap();
const isDisabled = element => !element || element.matches(':disabled') || !!element.closest('[aria-disabled="true"]');
const isAvailable = element => !isDisabled(element) && !element.closest('[hidden],[inert]');
const all = (root, selector) => [...(root.matches?.(selector) ? [root] : []), ...root.querySelectorAll(selector)];
const focus = element => { if (element?.isConnected && !isDisabled(element)) element.focus({ preventScroll: true }); };
const emit = (element, name, detail) => element.dispatchEvent(new CustomEvent(`gui95:${name}`, { bubbles: true, detail }));
const ownerDocument = element => element.ownerDocument || element;

/** Open a native modal dialog. Repeated opens share the current result promise. */
export function openDialog(dialog, { opener = dialog.ownerDocument.activeElement, initialFocus } = {}) {
  if (dialog?.tagName !== 'DIALOG') throw new TypeError('openDialog requires a native <dialog>');
  const current = sessions.get(dialog);
  if (current && dialog.open) return current.promise;
  if (current) finishDialog(dialog, current);
  if (dialog.open) throw new Error('Dialog is already open outside the GUI95 lifecycle');
  const doc = dialog.ownerDocument;
  const stack = dialogStacks.get(doc) || [];
  dialogStacks.set(doc, stack);
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  const session = { opener, promise, resolve, done: false };
  sessions.set(dialog, session);
  stack.push(dialog);
  const finish = () => { if (!dialog.open) finishDialog(dialog, session); };
  dialog.addEventListener('close', finish);
  session.cleanup = () => dialog.removeEventListener('close', finish);
  try { dialog.returnValue = ''; dialog.showModal(); }
  catch (error) { stack.splice(stack.indexOf(dialog), 1); sessions.delete(dialog); session.cleanup(); throw error; }
  focus(typeof initialFocus === 'string' ? dialog.querySelector(initialFocus) : initialFocus);
  emit(dialog, 'dialog-open', {});
  return promise;
}
function finishDialog(dialog, session) {
  if (session.done || sessions.get(dialog) !== session) return;
  session.done = true;
  session.cleanup();
  sessions.delete(dialog);
  const stack = dialogStacks.get(dialog.ownerDocument) || [];
  const index = stack.indexOf(dialog);
  if (index >= 0) stack.splice(index, 1);
  const top = stack.at(-1);
  if (!top || top.contains(session.opener)) focus(session.opener);
  else focus(top.querySelector('[autofocus],button,input,select,textarea,[tabindex]') || top);
  session.resolve(dialog.returnValue);
  emit(dialog, 'dialog-close', { returnValue: dialog.returnValue });
}
/** Close and settle synchronously, so an immediate reopen starts a fresh session. */
export function closeDialog(dialog, returnValue = '') {
  if (dialog?.tagName !== 'DIALOG') throw new TypeError('closeDialog requires a native <dialog>');
  const session = sessions.get(dialog);
  if (!dialog.open && !session) return false;
  if (dialog.open) dialog.close(String(returnValue));
  else dialog.returnValue = String(returnValue);
  if (session) finishDialog(dialog, session);
  return true;
}

/** Clamp and step-align a numeric draft. Emits change only when normalization changes text. */
export function commitNumber(input, { delta = 0 } = {}) {
  if (input?.type !== 'number') throw new TypeError('commitNumber requires input[type=number]');
  if (isDisabled(input) || input.readOnly) return input.valueAsNumber;
  const bound = (text, fallback) => text !== '' && Number.isFinite(Number(text)) ? Number(text) : fallback;
  const min = bound(input.min, -Infinity);
  const max = bound(input.max, Infinity);
  const step = input.step === 'any' ? 0 : Math.max(Number.EPSILON, bound(input.step, 1));
  const base = Number.isFinite(min) ? min : bound(input.defaultValue, 0);
  let value = input.valueAsNumber;
  if (!Number.isFinite(value)) value = Number.isFinite(min) ? min : 0;
  if (step > 0) value = base + Math.round((value - base) / step) * step;
  value += delta * (step || 1);
  const lower = step > 0 && Number.isFinite(min) ? base + Math.ceil((min - base) / step) * step : min;
  const upper = step > 0 && Number.isFinite(max) ? base + Math.floor((max - base) / step) * step : max;
  value = Math.min(upper, Math.max(lower, value));
  value = Number(value.toPrecision(12));
  const changed = input.value !== String(value);
  input.value = String(value);
  if (changed) {
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }
  emit(input, 'number-commit', { value });
  return value;
}

function menus(root, listen) {
  const doc = ownerDocument(root);
  const headings = all(root, '[data-gui95-menubar] [data-gui95-menu]');
  const popupFor = trigger => doc.getElementById(trigger?.dataset.gui95Menu);
  const items = popup => [...popup.children].filter(item => item.matches('[role^="menuitem"]') && !isDisabled(item));
  const triggers = all(root, '[data-gui95-menu]');
  for (const trigger of triggers) {
    trigger.setAttribute('aria-haspopup', 'menu');
    trigger.setAttribute('aria-controls', trigger.dataset.gui95Menu);
    trigger.setAttribute('aria-expanded', 'false');
  }
  for (const popup of all(root, '[role="menu"]')) {
    popup.hidden = true;
    for (const item of items(popup)) item.tabIndex = -1;
  }
  let chain = [], previous, lastPoint, pressTarget;
  const hideFrom = level => {
    for (const entry of chain.splice(level)) { entry.popup.hidden = true; entry.trigger.setAttribute('aria-expanded', 'false'); }
  };
  const close = (restore = true) => { hideFrom(0); if (restore) focus(previous); previous = undefined; };
  const position = (popup, trigger, nested) => {
    popup.style.position = 'fixed'; popup.style.zIndex = String(1000 + chain.length);
    popup.style.maxHeight = `${Math.max(50, doc.defaultView.innerHeight - 8)}px`;
    const anchor = trigger.getBoundingClientRect();
    popup.style.left = '0px'; popup.style.top = '0px';
    const box = popup.getBoundingClientRect();
    let x = nested ? anchor.right - 2 : anchor.left;
    let y = nested ? anchor.top - 3 : anchor.bottom;
    if (x + box.width > doc.defaultView.innerWidth - 4) x = nested ? anchor.left - box.width + 2 : doc.defaultView.innerWidth - box.width - 4;
    popup.style.left = `${Math.max(4, x)}px`;
    popup.style.top = `${Math.max(4, Math.min(y, doc.defaultView.innerHeight - box.height - 4))}px`;
  };
  const open = (trigger, keyboard = false) => {
    const popup = popupFor(trigger);
    if (!popup || isDisabled(trigger)) return;
    const parent = trigger.closest('[role="menu"]');
    const level = parent ? chain.findIndex(entry => entry.popup === parent) + 1 : 0;
    if (parent && !level) return;
    if (!chain.length) previous = doc.activeElement;
    hideFrom(level);
    popup.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    chain.push({ trigger, popup });
    position(popup, trigger, !!parent);
    if (keyboard) focus(items(popup)[0]);
  };
  const selectPointer = target => {
    const heading = target.closest?.('[data-gui95-menubar] [data-gui95-menu]');
    if (heading && chain.length && chain[0].trigger !== heading) { open(heading); focus(heading); return; }
    const item = target.closest?.('[role^="menuitem"]');
    if (!item || isDisabled(item)) return;
    const popup = item.closest('[role="menu"]');
    const level = chain.findIndex(entry => entry.popup === popup);
    if (level < 0) return;
    focus(item);
    if (item.dataset.gui95Menu) {
      if (chain[level + 1]?.trigger !== item) open(item);
    } else hideFrom(level + 1);
  };
  listen(doc, 'pointermove', event => {
    const point = [event.clientX, event.clientY];
    // Layout may synthesize hover events; only coordinate movement transfers ownership.
    const moved = !lastPoint || point[0] !== lastPoint[0] || point[1] !== lastPoint[1];
    lastPoint = point;
    if (!moved || !chain.length) return;
    selectPointer(event.target);
  });
  listen(root, 'pointerdown', event => {
    if (event.button !== 0) return;
    lastPoint = [event.clientX, event.clientY];
    const trigger = event.target.closest?.('[data-gui95-menu]');
    if (trigger && !isDisabled(trigger)) {
      event.preventDefault(); pressTarget = trigger;
      if (headings.includes(trigger) && chain[0]?.trigger === trigger) close();
      else open(trigger);
      return;
    }
    if (chain.length) {
      const item = event.target.closest?.('[role^="menuitem"]');
      if (item) { pressTarget = item; selectPointer(item); }
    }
  });
  listen(doc, 'pointerdown', event => {
    if (chain.length && !chain.some(entry => entry.popup.contains(event.target) || entry.trigger.contains(event.target))) close(false);
  }, true);
  listen(doc, 'pointerup', event => {
    if (!pressTarget) return;
    const item = event.target.closest?.('[role^="menuitem"]');
    const dragged = item && item !== pressTarget;
    pressTarget = undefined;
    if (dragged && !isDisabled(item) && !item.dataset.gui95Menu && chain.some(entry => entry.popup.contains(item))) item.click();
  });
  listen(root, 'click', event => {
    const trigger = event.target.closest?.('[data-gui95-menu]');
    if (trigger) { event.preventDefault(); if (event.detail === 0) open(trigger, true); return; }
    const item = event.target.closest?.('[role^="menuitem"]');
    if (!item || !chain.some(entry => entry.popup.contains(item))) return;
    if (isDisabled(item)) { event.preventDefault(); event.stopImmediatePropagation(); return; }
    close(); emit(item, 'command', { id: item.dataset.command || item.id || null });
  });
  listen(doc, 'keydown', event => {
    if (doc.querySelector('dialog[open]')) { if (chain.length) close(false); return; }
    const mnemonic = event.altKey && !event.ctrlKey && !event.metaKey && event.key.length === 1;
    const matching = mnemonic ? headings.filter(item => (item.dataset.gui95Mnemonic || item.textContent.trim()[0] || '').toLowerCase() === event.key.toLowerCase() && !isDisabled(item)) : [];
    if (matching.length || event.key === 'F10') {
      if (root !== doc && !root.contains(doc.activeElement) && !chain.length) return;
      event.preventDefault(); event.stopImmediatePropagation();
      const list = matching.length ? matching : headings.filter(item => !isDisabled(item));
      const index = list.indexOf(chain[0]?.trigger);
      open(list[(index + 1) % list.length], true); return;
    }
    if (!chain.length) return;
    if (event.key === 'Tab') { close(); return; }
    if (['Alt', 'Control', 'Meta', 'Shift'].includes(event.key)) return;
    event.preventDefault(); event.stopImmediatePropagation();
    const current = doc.activeElement;
    const entry = chain.find(entry => entry.popup.contains(current)) || chain.at(-1);
    const level = chain.indexOf(entry);
    const options = items(entry.popup), index = options.indexOf(current);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { hideFrom(level + 1); focus(options[(index + (event.key === 'ArrowDown' ? 1 : options.length - 1) + options.length) % options.length]); }
    else if (event.key === 'Home' || event.key === 'End') { hideFrom(level + 1); focus(options[event.key === 'Home' ? 0 : options.length - 1]); }
    else if (event.key === 'ArrowRight') {
      if (current.dataset.gui95Menu) open(current, true);
      else { const enabled = headings.filter(item => !isDisabled(item)); const next = enabled[(enabled.indexOf(chain[0].trigger) + 1) % enabled.length]; open(next, true); }
    } else if (event.key === 'ArrowLeft') {
      if (level > 0) { const trigger = entry.trigger; hideFrom(level); focus(trigger); }
      else { const enabled=headings.filter(item=>!isDisabled(item)); open(enabled[(enabled.indexOf(chain[0].trigger)+enabled.length-1)%enabled.length],true); }
    } else if (event.key === 'Escape') {
      if (level > 0) { const trigger = entry.trigger; hideFrom(level); focus(trigger); } else close();
    } else if (event.key === 'Enter' || event.key === ' ') {
      if (!event.repeat && !isDisabled(current)) { if (current.dataset.gui95Menu) open(current, true); else current.click(); }
    } else if (event.key.length === 1) {
      const matches = options.filter(item => (item.dataset.gui95Mnemonic || item.textContent.trim()[0] || '').toLowerCase() === event.key.toLowerCase());
      if (matches.length) { const next = matches[(matches.indexOf(current) + 1) % matches.length]; focus(next); if (matches.length === 1) { if (next.dataset.gui95Menu) open(next, true); else next.click(); } }
    }
  }, true);
  listen(doc.defaultView, 'resize', () => close(false));
  listen(doc.defaultView, 'blur', () => close(false));
  return () => close(false);
}

function observeControlState(element, refresh, cleanups) {
  const observer = new element.ownerDocument.defaultView.MutationObserver(refresh);
  observer.observe(element, { subtree: true, attributes: true, attributeFilter: ['disabled', 'aria-disabled', 'hidden', 'inert'] });
  cleanups.push(() => observer.disconnect());
}

function toolbars(root, listen, cleanups) {
  for (const bar of all(root, '[data-gui95-toolbar]')) {
    bar.setAttribute('role', 'toolbar');
    const candidates = () => [...bar.querySelectorAll('button,input,select,textarea,[tabindex]')];
    const controls = () => candidates().filter(isAvailable);
    const setStop = item => candidates().forEach(control => { control.tabIndex = control === item ? 0 : -1; });
    const repairStop = () => {
      const available = controls();
      setStop(available.find(item => item.tabIndex === 0) || available[0]);
    };
    repairStop();
    observeControlState(bar, repairStop, cleanups);
    listen(bar, 'focusin', event => { if (controls().includes(event.target)) setStop(event.target); });
    listen(bar, 'keydown', event => {
      if (event.target.matches('input,select,textarea')) { event.stopPropagation(); return; }
      if ([' ', 'Enter'].includes(event.key)) { event.stopPropagation(); if (event.repeat && event.target.matches('[data-gui95-toggle]')) event.preventDefault(); return; }
      if (!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key)) return;
      const options = controls(), index = options.indexOf(event.target);
      if (index < 0) return;
      event.preventDefault(); event.stopPropagation();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : (index + (['ArrowRight','ArrowDown'].includes(event.key) ? 1 : options.length - 1)) % options.length;
      setStop(options[next]); focus(options[next]);
    });
  }
  listen(root, 'click', event => {
    const button = event.target.closest?.('[data-gui95-toggle]');
    if (!button || isDisabled(button)) return;
    const pressed = button.getAttribute('aria-pressed') !== 'true';
    const group = button.dataset.gui95ToggleGroup;
    if (group) for (const sibling of all(root, '[data-gui95-toggle-group]')) if (sibling !== button && sibling.dataset.gui95ToggleGroup === group) sibling.setAttribute('aria-pressed', 'false');
    button.setAttribute('aria-pressed', String(group ? true : pressed));
    emit(button, 'toggle', { pressed: button.getAttribute('aria-pressed') === 'true' });
  });
}
function trees(root, listen, cleanups) {
  for (const tree of all(root, '[data-gui95-tree]')) {
    tree.setAttribute('role', 'tree');
    const nodes = [...tree.querySelectorAll('[role="treeitem"]')];
    const group = item => [...item.children].find(child => child.matches('[role="group"]'));
    const visible = () => nodes.filter(isAvailable);
    const setCurrent = (item, select = true) => {
      if (!item || isDisabled(item)) return;
      for (const node of nodes) { node.tabIndex = node === item ? 0 : -1; if (select) node.setAttribute('aria-selected', String(node === item)); }
      focus(item); if (select) emit(tree, 'tree-select', { item, id: item.id || null });
    };
    const expand = (item, value) => { const children = group(item); if (!children) return; item.setAttribute('aria-expanded', String(value)); children.hidden = !value; const glyph=item.querySelector(':scope > [data-gui95-tree-label] [data-gui95-disclosure]'); if(glyph)glyph.textContent=value?'−':'+'; emit(tree, 'tree-expand', { item, expanded: value }); };
    nodes.forEach(item => { item.tabIndex = -1; if (group(item)) expand(item, item.getAttribute('aria-expanded') === 'true'); });
    const initial = visible().find(item => item.getAttribute('aria-selected') === 'true') || visible()[0];
    nodes.forEach(item => { item.tabIndex = item === initial ? 0 : -1; item.setAttribute('aria-selected', String(item === initial)); });
    const repairStop = () => {
      const available = visible();
      const current = available.find(item => item.tabIndex === 0) || available.find(item => item.getAttribute('aria-selected') === 'true') || available[0];
      nodes.forEach(item => { item.tabIndex = item === current ? 0 : -1; });
    };
    observeControlState(tree, repairStop, cleanups);
    listen(tree, 'click', event => { const item = event.target.closest('[role="treeitem"]'); if (!item || !tree.contains(item) || isDisabled(item)) return; setCurrent(item); if (event.target.closest('[data-gui95-disclosure]')) expand(item,item.getAttribute('aria-expanded') !== 'true'); });
    listen(tree, 'dblclick', event => { const item=event.target.closest('[role="treeitem"]'); if(item&&!isDisabled(item)&&!event.target.closest('[data-gui95-disclosure]')) expand(item,item.getAttribute('aria-expanded') !== 'true'); });
    listen(tree, 'keydown', event => {
      const item = event.target.closest('[role="treeitem"]');
      if (!item || event.target.closest('input,textarea,select,button,a')) return;
      const options = visible(), index = options.indexOf(item);
      const handled = ['ArrowDown','ArrowUp','ArrowRight','ArrowLeft','Home','End','Enter',' '].includes(event.key) || (event.key.length === 1 && !event.ctrlKey && !event.altKey && !event.metaKey);
      if (!handled) return;
      event.preventDefault(); event.stopPropagation();
      if (event.key === 'ArrowDown') setCurrent(options[Math.min(index + 1, options.length - 1)]);
      else if (event.key === 'ArrowUp') setCurrent(options[Math.max(0,index - 1)]);
      else if (event.key === 'Home') setCurrent(options[0]);
      else if (event.key === 'End') setCurrent(options.at(-1));
      else if (event.key === 'ArrowRight') { if (group(item) && item.getAttribute('aria-expanded') !== 'true') expand(item,true); else if (group(item)) setCurrent(visible().find(child => child.parentElement === group(item)));  }
      else if (event.key === 'ArrowLeft') { if (group(item) && item.getAttribute('aria-expanded') === 'true') expand(item,false); else setCurrent(item.parentElement.closest('[role="treeitem"]')); }
      else if (event.key === 'Enter') { if (!event.repeat) expand(item,item.getAttribute('aria-expanded') !== 'true'); }
      else if (event.key === ' ') { if (!event.repeat) setCurrent(item); }
      else { const following=[...options.slice(index+1),...options.slice(0,index+1)].find(node=>(node.querySelector(':scope > [data-gui95-tree-label]')?.textContent||'').replace(/^[+−\s]+/,'').toLowerCase().startsWith(event.key.toLowerCase())); setCurrent(following); }
    });
  }
}
function splitters(root, listen, cleanups) {
  for (const container of all(root, '[data-gui95-split]')) {
    const bar = container.querySelector(':scope > [data-gui95-splitter]');
    if (!bar || container.children.length !== 3) continue;
    const vertical = container.dataset.gui95Axis !== 'y';
    bar.setAttribute('role','separator'); bar.tabIndex=0; bar.setAttribute('aria-orientation', vertical?'vertical':'horizontal');
    const axis=vertical?'width':'height'; let value, drag;
    const bounds=()=>{ const total=container.getBoundingClientRect()[axis]-bar.getBoundingClientRect()[axis]; const requestedMin=Math.max(0,Number(container.dataset.gui95Min)||80);const secondary=Math.max(0,Number(container.dataset.gui95MinSecondary)||80);return{min:Math.min(requestedMin,Math.max(0,total-secondary)),max:Math.max(0,total-secondary)}; };
    const update=next=>{ const {min,max}=bounds();value=Math.round(Math.min(max,Math.max(min,next)));container.style.setProperty('--gui95-split',`${value}px`);bar.setAttribute('aria-valuemin',String(Math.round(min)));bar.setAttribute('aria-valuemax',String(Math.round(max)));bar.setAttribute('aria-valuenow',String(value));emit(container,'split',{value,axis:vertical?'x':'y'}); };
    update(Number(container.dataset.gui95Position)||container.getBoundingClientRect()[axis]/2);
    listen(bar,'keydown',event=>{const keys=vertical?['ArrowLeft','ArrowRight']:['ArrowUp','ArrowDown'];if(![...keys,'Home','End'].includes(event.key))return;event.preventDefault();event.stopPropagation();const {min,max}=bounds();update(event.key==='Home'?min:event.key==='End'?max:value+(event.key===keys[0]?-1:1)*(event.shiftKey?1:10));});
    listen(bar,'pointerdown',event=>{if(event.button!==0)return;event.preventDefault();focus(bar);drag={id:event.pointerId,start:vertical?event.clientX:event.clientY,value};bar.setPointerCapture(event.pointerId);bar.dataset.gui95Dragging='';});
    listen(bar,'pointermove',event=>{if(drag?.id===event.pointerId)update(drag.value+(vertical?event.clientX:event.clientY)-drag.start);});
    const finish=event=>{if(drag?.id!==event.pointerId)return;if(event.type==='pointercancel')update(drag.value);drag=undefined;delete bar.dataset.gui95Dragging;if(bar.hasPointerCapture(event.pointerId))bar.releasePointerCapture(event.pointerId);};
    listen(bar,'pointerup',finish);listen(bar,'pointercancel',finish);listen(bar,'lostpointercapture',event=>{if(drag?.id===event.pointerId){drag=undefined;delete bar.dataset.gui95Dragging;}});
    const Observer=ownerDocument(root).defaultView.ResizeObserver;
    if(Observer){const observer=new Observer(()=>update(value));observer.observe(container);cleanups.push(()=>observer.disconnect());}
  }
}

/** Enhance a document or scoped element once. Call destroy() before removing/rebuilding its markup. */
export function enhance(root = document) {
  if (!root?.querySelectorAll) throw new TypeError('enhance requires a Document or Element');
  if (controllers.has(root)) return controllers.get(root);
  const doc=ownerDocument(root), abort=new doc.defaultView.AbortController(), cleanups=[];
  const listen=(target,type,handler,options={})=>target.addEventListener(type,handler,typeof options==='boolean'?{capture:options,signal:abort.signal}:{...options,signal:abort.signal});
  listen(root,'click',event=>{const item=event.target.closest?.('[aria-disabled="true"]');if(item){event.preventDefault();event.stopImmediatePropagation();}},true);
  cleanups.push(menus(root,listen));
  toolbars(root,listen,cleanups);trees(root,listen,cleanups);splitters(root,listen,cleanups);
  listen(root,'click',event=>{
    const opener=event.target.closest?.('[data-gui95-open-dialog]');
    if(opener&&!isDisabled(opener)){event.preventDefault();const dialog=doc.getElementById(opener.dataset.gui95OpenDialog);if(dialog)openDialog(dialog,{opener});return;}
    const closer=event.target.closest?.('[data-gui95-close-dialog]');
    if(closer&&!isDisabled(closer)){event.preventDefault();const dialog=closer.closest('dialog');if(dialog)closeDialog(dialog,closer.dataset.gui95CloseDialog);return;}
    const stepper=event.target.closest?.('[data-gui95-step]');
    if(stepper&&!isDisabled(stepper)){event.preventDefault();const input=doc.getElementById(stepper.dataset.gui95Step);if(input?.matches('[data-gui95-number]'))commitNumber(input,{delta:Number(stepper.dataset.gui95Delta)||1});}
  });
  listen(root,'focusout',event=>{if(event.target.matches('[data-gui95-number]'))commitNumber(event.target);});
  listen(root,'keydown',event=>{if(event.target.matches('[data-gui95-number]')&&event.key==='Enter'){event.preventDefault();event.stopPropagation();commitNumber(event.target);}});
  listen(doc,'keydown',event=>{
    const stack=dialogStacks.get(doc)||[], top=stack.at(-1);
    if(!top||event.key!=='Escape')return;
    event.preventDefault();event.stopImmediatePropagation();if(!event.repeat)closeDialog(top,'cancel');
  },true);
  for(const dialog of all(root,'dialog[data-gui95-dialog]')){
    listen(dialog,'cancel',event=>{event.preventDefault();closeDialog(dialog,'cancel');});
    listen(dialog,'submit',event=>{if(event.target.method==='dialog'||event.submitter?.formMethod==='dialog'){event.preventDefault();closeDialog(dialog,event.submitter?.value||'');}});
  }
  const controller={root,destroy(){
    for(const dialog of [...(dialogStacks.get(doc)||[])].reverse()) if(root===doc||root.contains(dialog)) closeDialog(dialog,'cancel');
    abort.abort();cleanups.forEach(cleanup=>cleanup());controllers.delete(root);
  }};
  controllers.set(root,controller);
  return controller;
}
