import {Node, Extension, type Editor, type JSONContent} from '@tiptap/core';
import {Plugin, PluginKey} from '@tiptap/pm/state';
import {Decoration, DecorationSet} from '@tiptap/pm/view';
import type {Node as PMNode} from '@tiptap/pm/model';
import {type Document, type EditTarget, type WritingSection, sectionText, targetFor,uid} from './domain';
export const WritingDocument=Node.create({name:'doc',topNode:true,content:'writingSection+'});

export const WritingSectionNode = Node.create({
  name:'writingSection',content:'block+',defining:true,isolating:true,
  addProseMirrorPlugins(){return [new Plugin({appendTransaction(_transactions,_old,state){let changed=false;const tr=state.tr;const seen=new Set<string>();state.doc.forEach((node,pos)=>{if(node.type.name!=='writingSection')return;const id=node.attrs.id;if(!id||seen.has(id)){tr.setNodeMarkup(pos,undefined,{...node.attrs,id:uid()});changed=true;}seen.add(id);});return changed?tr:null;}})];},
  addAttributes(){return {id:{default:null},kind:{default:'Freeform'},label:{default:'Freeform'}};},
  parseHTML(){return [{tag:'section[data-writing-section]'}];},
  renderHTML({HTMLAttributes}){return ['section', {...HTMLAttributes,'data-writing-section':'','data-testid':'writing-section'},0];}
});
const highlightKey=new PluginKey('target-highlight');
export const TargetHighlight=Extension.create({name:'targetHighlight',addProseMirrorPlugins(){return [new Plugin({key:highlightKey,state:{init:()=>DecorationSet.empty,apply(tr,old){const value=tr.getMeta(highlightKey);if(value!==undefined)return value?DecorationSet.create(tr.doc,[Decoration.inline(value.from,value.to,{class:'target-highlight'})]):DecorationSet.empty;return old.map(tr.mapping,tr.doc);}},props:{decorations(state){return highlightKey.getState(state);}}})];}});
export function toEditor(doc:Document):JSONContent{return {type:'doc',content:doc.sections.map(s=>({type:'writingSection',attrs:{id:s.id,kind:s.kind,label:s.label},content:s.content}))};}
export function fromEditor(editor:Editor,sections:WritingSection[]):WritingSection[]{return (editor.getJSON().content??[]).map(n=>{const prior=sections.find(s=>s.id===n.attrs?.id);return {...prior!,id:n.attrs!.id,kind:n.attrs!.kind,label:n.attrs!.label,notes:prior?.notes??'',variants:prior?.variants??[],content:(n.content??[{type:'paragraph'}]) as WritingSection['content']};});}
export function sectionLocation(editor:Editor,id:string){let found:{node:PMNode,pos:number}|null=null;editor.state.doc.forEach((node,pos)=>{if(node.attrs.id===id)found={node,pos};});return found as {node:PMNode,pos:number}|null;}
/** Mirrors domain sectionText exactly, including only top-level block separators. */
export function positionMap(node:PMNode,pos:number){const starts:number[]=[],ends:number[]=[];let text='';let previousEnd=pos+2;
 const append=(value:string,at:number,width=1)=>{for(let i=0;i<value.length;i++){starts.push(at+i*width);ends.push(at+(i+1)*width);text+=value[i];}};
 node.forEach((block,offset,index)=>{const bp=pos+1+offset;if(index){starts.push(previousEnd);ends.push(bp+1);text+='\n';}if(block.isText)append(block.text??'',bp);else block.descendants((child,relative)=>{if(child.isText)append(child.text??'',bp+1+relative);else if(child.type.name==='hardBreak')append('\n',bp+1+relative);});previousEnd=bp+block.nodeSize-1;});
 return {text,starts,ends,empty:pos+2};
}
export function targetRange(editor:Editor,target:EditTarget){if(!target.sectionId)return null;const found=sectionLocation(editor,target.sectionId);if(!found)return null;const map=positionMap(found.node,found.pos);if(map.text!==target.sectionSnapshot)return null;return {from:map.starts[target.start]??map.ends.at(-1)??map.empty,to:target.end>target.start?(map.ends[target.end-1]??map.empty):(map.starts[target.start]??map.ends.at(-1)??map.empty)};}
export function highlight(editor:Editor,target:EditTarget|null){const range=target?targetRange(editor,target):null;editor.view.dispatch(editor.state.tr.setMeta(highlightKey,range&&range.to>range.from?range:null));}
export function cursorTarget(editor:Editor,doc:Document):EditTarget|null{
 const {from,to}=editor.state.selection;const a=editor.state.doc.resolve(from),b=editor.state.doc.resolve(to);
 if(a.depth<1||b.depth<1||a.node(1).type.name!=='writingSection'||a.node(1)!==b.node(1))return null;
 const id=a.node(1).attrs.id;const s=doc.sections.find(s=>s.id===id);if(!s)return null;
 const m=positionMap(a.node(1),a.before(1));let start=m.starts.findIndex(p=>p>=from);if(start<0)start=m.text.length;
 let end=m.ends.findIndex(p=>p>to);if(end<0)end=m.text.length;
 if(from!==to){if(start>=end)return null;const selected=m.text.slice(start,end);return targetFor(doc,id,/^\S+$/u.test(selected.trim())?'word':'selection',start,end);}
 const text=sectionText(s);const segmenter=new Intl.Segmenter(undefined,{granularity:'sentence'});let chosen={index:0,segment:text};for(const segment of segmenter.segment(text)){if(start>=segment.index&&(start<segment.index+segment.segment.length||start===text.length)){chosen=segment;break;}}
 return targetFor(doc,id,'selection',chosen.index,chosen.index+chosen.segment.length);
}
