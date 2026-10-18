import { createHash } from 'node:crypto';
import { loadPublicContent,describe } from './content.mjs';

const words=value=>(value.toLowerCase().match(/[a-z0-9]+/g)??[]).map(word=>word.length>4&&word.endsWith('ies')?word.slice(0,-3)+'y':word.length>4&&/(?:ches|shes|xes|sses)$/.test(word)?word.slice(0,-2):word.length>4&&word.endsWith('s')&&!word.endsWith('ss')?word.slice(0,-1):word);
const aliases=[['mru','recent','recently'],['combobox','combo'],['spinner','spinbutton','numeric'],['checkbox','check'],['radio','radiogroup'],['tooltip','hint'],['mnemonic','accesskey'],['splitter','divider']];
const controlNames={checkbox:'tri-state tristate indeterminate three-state',combobox:'combobox autocomplete editable dropdown',spinner:'updown spinbutton buddy numeric',tree:'treeview hierarchy',listview:'listview details report multicolumn',slider:'trackbar range',progress:'progressbar',properties:'propertysheet settings preferences',menus:'menubar cascading MRU recent',color:'colour palette swatch'};
const related={combobox:['select','listbox','text','multiselect'],properties:['tabs','modal','modeless','message'],menus:['context-menu','toolbar','hotkey'],'context-menu':['menus','listview','tree'],tree:['listview','splitter'],listview:['header','tree','multiselect'],font:['text','rich-text','modal'],color:['radio','spinner','modal'],wizard:['modal','text','properties']};
const widgetManifest='demo/dist/widgets/manifest.json';
const qualityGuides=['SKILL.md','docs/design-guide.md','docs/reuse.md','docs/integration-lessons.md','docs/historical-sources.md','docs/historical-audit-2026-10-18.md','docs/widget-coverage.md','examples/widgets/QA.md','THIRD-PARTY-NOTICES.md'];
const priorities=['guide','widget','tool','verification','source','asset','notice','demo'];
export const materialKinds=['all',...priorities];

export async function loadCatalog(root) {
  const {files}=await loadPublicContent(root),chunks=[];
  const manifest=JSON.parse(files.get(widgetManifest)?.text||'{}');
  if (manifest.schema!==1||!Array.isArray(manifest.examples)||!manifest.examples.length) throw new Error('Missing or unsupported widget manifest; build examples before starting or packaging MCP.');
  const widgets=new Map();
  for (const entry of manifest.examples) {
    if (!/^[a-z]+(?:-[a-z]+)*$/.test(entry.id)||widgets.has(entry.id)||entry.file!==entry.id+'.html') throw new Error('Invalid or duplicate widget descriptor.');
    const name='demo/dist/widgets/'+entry.file,file=files.get(name);
    if (!file||file.kind!=='widget') throw new Error('Missing widget template: '+name);
    for (const field of ['title','family','states','keys','note','authoring_path']) if (typeof entry[field]!=='string'||!entry[field]) throw new Error('Missing widget '+field+': '+entry.id);
    if (!files.has(entry.authoring_path)) throw new Error('Missing widget authoring source: '+entry.id);
    if (!Array.isArray(entry.sources)||!entry.sources.length||entry.sources.some(source=>!source.label||!/^https:\/\//.test(source.url))) throw new Error('Invalid widget source pointers.');
    widgets.set(entry.id,{...entry,path:name});file.widget_id=entry.id;file.family=entry.family;
  }
  for (const file of files.values()) {
    if (!file.lines) {
      chunks.push({path:file.path,title:file.title,heading:file.title,excerpt:`${file.title}\n${file.path}\n${file.mime_type}\n${file.license_note}`,tokens:words(file.title+' '+file.path+' '+file.mime_type),titleTokens:words(file.title+' '+file.path),kind:file.kind});
      continue;
    }
    // Search descriptors instead of CSS/helper/license boilerplate repeated in every generated page.
    if (file.path.startsWith('demo/dist/widgets/')) continue;
    let heading=file.title;
    const lines=file.lines;
    for (let start=0;start<lines.length;start+=35) {
      const selected=lines.slice(start,start+45);
      for (const line of selected) if (/^#{1,4} /.test(line)) heading=line.replace(/^#+ /,'').trim();
      // Minified source remains searchable. read() provides a column cursor for lossless retrieval.
      const joined=selected.join('\n');
      for (let offset=0;offset<joined.length||offset===0;offset+=4500) {
        const excerpt=joined.slice(offset,offset+6000);
        const prefix=joined.slice(0,offset),start_line=start+prefix.split('\n').length,start_column=offset-prefix.lastIndexOf('\n')-1;
        chunks.push({path:file.path,title:file.title,heading,start_line,start_column,end_line:Math.min(start+45,lines.length),excerpt,tokens:words(excerpt),titleTokens:words(file.path+' '+heading),kind:file.kind});
      }
    }
  }
  for (const widget of widgets.values()) {
    const line=files.get(widgetManifest).lines.findIndex(value=>value.includes('"id": "'+widget.id+'"'))+1;
    const excerpt=[widget.title,widget.family,'States: '+widget.states,'Keyboard: '+widget.keys,'Scope: '+widget.note].join('\n');
    chunks.push({path:widgetManifest,title:widget.title,heading:widget.title,widget_id:widget.id,example_path:widget.path,start_line:line,end_line:line+7,excerpt,tokens:words(excerpt+' '+widget.id+' '+(controlNames[widget.id]||'')),titleTokens:words(widget.id+' '+widget.title+' '+widget.family+' '+(controlNames[widget.id]||'')),kind:'widget'});
  }
  const revision=createHash('sha256').update([...files.values()].map(file=>file.path+':'+file.sha256).join('\n')).digest('hex');
  function overview() {
    return {counts:Object.fromEntries(priorities.map(kind=>[kind,[...files.values()].filter(file=>file.kind===kind).length])),widgets:widgets.size,
      start_here:qualityGuides.filter(name=>files.has(name)),families:[...new Set([...widgets.values()].map(widget=>widget.family))],
      workflow:['Search for a control or behavior; widget hits include a widget_id.','Use get_gui95_widget for a complete self-contained template and its states, keys, scope and source pointers.','Read design/integration guidance, notices and verification limits; fetch source/tools/assets as needed.','Adapt the required controls, preserve semantics and behavior, then test the actual app.'],
      verification_note:'Example verification is edition-specific. Historical audits include proposals; archived tests and screenshots do not establish new passing results. Browser templates do not certify native Win32 or Electron behavior.'};
  }
  return {
    revision,files,widgets,overview,
    list({kind='all',query='',offset=0,limit=40}={}) {
      if (!materialKinds.includes(kind)||!Number.isInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>100) throw new Error('Invalid material listing range or kind.');
      const terms=words(query);
      const selected=[...files.values()].filter(file=>(kind==='all'||file.kind===kind)&&terms.every(term=>words(file.path+' '+file.title+' '+(file.family||'')).some(token=>token.includes(term))))
        .sort((a,b)=>priorities.indexOf(a.kind)-priorities.indexOf(b.kind)||a.path.localeCompare(b.path));
      return {overview:overview(),materials:selected.slice(offset,offset+limit).map(describe),total:selected.length,next_offset:offset+limit<selected.length?offset+limit:null};
    },
    search(query,limit=5) {
      if(typeof query!=='string'||!Number.isInteger(limit)||limit<1||limit>8)throw new Error('Invalid search query or limit.');
      const terms=[...new Set(words(query))].filter(term=>term.length>1);
      if (!terms.length) return [];
      const matches=(token,term)=>token.includes(term)||aliases.some(group=>group.includes(term)&&group.some(alias=>token===alias));
      const ranked=chunks.map(chunk=>{
        let score=0,matched=0,titleMatches=0;
        for (const term of terms) {
          const count=chunk.tokens.filter(word=>matches(word,term)).length;
          const titleMatch=chunk.titleTokens.some(word=>matches(word,term));
          if (count||titleMatch) matched++;
          if (titleMatch) titleMatches++;
          score+=Math.min(count,4)+(titleMatch?12:0);
        }
        if (score) score=score*(matched/terms.length)**2+(chunk.kind==='guide'?8:0)+(chunk.widget_id&&titleMatches&&matched/terms.length>=.75?14:0)+(words(chunk.title).join(' ').includes(terms.join(' '))?20:0);
        return {...chunk,score};
      }).filter(chunk=>chunk.score>0).sort((a,b)=>b.score-a.score||a.path.localeCompare(b.path)||(a.start_line||0)-(b.start_line||0));
      const seen=new Set(),selected=[];
      for (const chunk of ranked) {
        const identity=chunk.widget_id||(chunk.kind==='asset'?'asset:'+files.get(chunk.path).sha256:chunk.path+'\0'+chunk.heading);
        if (seen.has(identity)) continue;seen.add(identity);
        const {tokens,titleTokens,score,...hit}=chunk,file=files.get(hit.path);
        selected.push({...hit,source_url:file.source_url,sha256:file.sha256,archived:file.archived});
        if (selected.length===limit) break;
      }
      return selected;
    },
    widget(id,{includeCode=true}={}) {
      const widget=widgets.get(id);if(!widget) throw new Error('Unknown widget. Use list_gui95_materials with kind widget, or search_gui95.');
      const file=files.get(widget.path);
      return {id:widget.id,title:widget.title,family:widget.family,states:widget.states,keyboard:widget.keys,scope:widget.note,sources:widget.sources,
        template:{...describe(file),...(includeCode?{code:file.bytes.toString('utf8')}:{})},
        authoring_paths:[widget.authoring_path,'examples/widgets/shared.mjs'],verification_paths:['examples/widgets/QA.md','examples/widgets/check.mjs'],
        guide_paths:qualityGuides.filter(name=>files.has(name)),related_widgets:[...new Set([...(related[id]||[]),...[...widgets.values()].filter(w=>w.family===widget.family&&w.id!==id).map(w=>w.id)])].slice(0,5).map(key=>({id:key,title:widgets.get(key).title})),
        next_step:'Use the template as an independent starting point; scope CSS, replace example IDs and demo actions, retain its MIT notice, and test keyboard/pointer behavior, cancellation, scaling and the intended host.'};
    },
    asset(name,{includeData=true}={}) {
      const file=files.get(name);if(!file||file.kind!=='asset') throw new Error('Unknown asset. Use list_gui95_materials with kind asset.');
      return {...describe(file),...(includeData&&file.size_bytes<=512*1024?{encoding:'base64',data:file.bytes.toString('base64')}:{}),
        ...((includeData&&file.size_bytes>512*1024)?{data_note:'This asset exceeds the 512 KiB inline limit; use its download URL.'}:{})};
    },
    read(name,start=1,count=100,startColumn=0) {
      const file=files.get(name);if(!file) throw new Error('Unknown reference. Use a path returned by search_gui95 or list_gui95_materials.');
      if (!file.lines) throw new Error('Binary asset: use get_gui95_asset.');
      if (!Number.isInteger(start)||start<1||start>file.lines.length||!Number.isInteger(count)||count<1||count>200||!Number.isInteger(startColumn)||startColumn<0||startColumn>file.lines[start-1].length) throw new Error('Invalid line range or column.');
      let remaining=24000,line=start-1,column=startColumn,text='';
      const last=Math.min(start-1+count,file.lines.length);
      while(line<last&&remaining>0) {
        const segment=file.lines[line].slice(column);let take=Math.min(segment.length,remaining);
        if(take>0&&take<segment.length&&/[\uD800-\uDBFF]/.test(segment[take-1])&&/[\uDC00-\uDFFF]/.test(segment[take]))take--;
        text+=segment.slice(0,take);remaining-=take;column+=take;
        if(take<segment.length) break;
        if(line<file.lines.length-1){if(!remaining)break;text+='\n';remaining--;}
        line++;column=0;
      }
      const next=line<file.lines.length?{line:line+1,column}:null;
      return {...describe(file),start_line:start,start_column:startColumn,end_line:column>0?line+1:Math.max(start,line),text,
        text_normalization:'CRLF is normalized to LF for line reads; SHA-256 and downloads identify the original bytes.',
        truncated_line:column>0,next_cursor:next,next_line:next?.line??null};
    }
  };
}
