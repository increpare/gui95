import test from 'node:test';
import assert from 'node:assert/strict';
import {createDocumentModel} from '../document-model.mjs';
test('save finishes at its captured revision and keeps edits made during the dialog dirty',()=>{
  const model=createDocumentModel();model.edit('first');const saving=model.snapshot();model.edit('newer');model.saved(saving,{name:'saved.txt',handle:'chosen-file'});assert.equal(model.read().dirty,true);assert.equal(model.read().text,'newer');assert.equal(model.read().name,'saved.txt');model.saved(model.snapshot());assert.equal(model.read().dirty,false);
});
test('a late save cannot mark a replacement document clean or rename it',()=>{
  const model=createDocumentModel();model.edit('old');const saving=model.snapshot();model.load({text:'replacement',name:'new.txt'});model.edit('replacement edit');assert.equal(model.saved(saving,{name:'old.txt'}),false);assert.equal(model.read().name,'new.txt');assert.equal(model.read().dirty,true);
});
test('a late older save completion marks newer text dirty again',()=>{
  const model=createDocumentModel();model.edit('one');const one=model.snapshot();model.edit('two');const two=model.snapshot();model.saved(two);model.saved(one);assert.equal(model.read().dirty,true);
});
