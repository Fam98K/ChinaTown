/* China Town shop manager. Edits data.js in the browser and publishes it to GitHub. */
(function(){
'use strict';
var $=function(s,r){return (r||document).querySelector(s);};
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function slug(s){return String(s).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');}
function clone(x){return JSON.parse(JSON.stringify(x));}
var ls={get:function(k,d){try{var v=localStorage.getItem(k);return v==null?d:JSON.parse(v);}catch(e){return d;}},set:function(k,v){try{localStorage.setItem(k,JSON.stringify(v));}catch(e){}},del:function(k){try{localStorage.removeItem(k);}catch(e){}}};

var G=window.CT_GLYPHS||{},GL=Object.keys(G);
function glyph(k){return '<svg viewBox="0 0 120 120" aria-hidden="true">'+(G[k]||G.gift||'')+'</svg>';}
var DEFS={name:'China Town',cur:'$',ship:6,free:60,banner:'',contact:'',wa:'',note:'',pay:''};
var SEARCH='<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg>';
var MOON='<svg viewBox="0 0 24 24"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';

function guess(){
  var h=location.hostname,p=location.pathname.split('/').filter(Boolean);
  if(/\.github\.io$/.test(h)){var o=h.split('.')[0];var r=(p[0]&&!/\.html?$/.test(p[0]))?p[0]:o+'.github.io';return {owner:o,repo:r};}
  return {owner:'',repo:''};
}
var base=window.SHOP_DATA||{products:{},settings:{}};
var saved=ls.get('ctadmin-conn',{}),g=guess();
var S={
  data:{products:clone(base.products||{}),settings:Object.assign({},DEFS,base.settings||{})},
  orig:'',pending:{},prev:{},tab:'products',q:'',delArm:'',busy:false,pubmsg:'',err:'',edit:'',photo:null,
  conn:{owner:saved.owner||g.owner,repo:saved.repo||g.repo,token:saved.token||'',branch:'',ok:false,msg:''}
};
S.orig=JSON.stringify(S.data);
function dirty(){return JSON.stringify(S.data)!==S.orig||Object.keys(S.pending).length>0;}

/* ---------- GitHub ---------- */
function enc(x){return encodeURIComponent(x);}
function cpath(path){return '/repos/'+enc(S.conn.owner)+'/'+enc(S.conn.repo)+'/contents/'+path.split('/').map(enc).join('/');}
async function api(method,path,body){
  var o={method:method,headers:{'Authorization':'Bearer '+S.conn.token,'Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'}};
  if(body){o.headers['Content-Type']='application/json';o.body=JSON.stringify(body);}
  var r;try{r=await fetch('https://api.github.com'+path,o);}catch(e){throw {status:0,message:'Could not reach GitHub. Check your internet connection.'};}
  var j=null;try{j=await r.json();}catch(e){}
  if(!r.ok)throw {status:r.status,message:(j&&j.message)||('GitHub answered '+r.status)};
  return j;
}
function explain(e){
  var s=e&&e.status,m=(e&&e.message)||'Something went wrong.';
  if(s===401)return 'GitHub did not accept the token. Check that you pasted all of it and that it has not expired.';
  if(s===403)return 'GitHub refused the request. The token needs "Contents: Read and write" for this repository. ('+m+')';
  if(s===404)return 'Repository not found. Check the owner and repository names, and that the token was given access to this repository.';
  if(s===409||s===422)return 'GitHub reports a conflict ('+m+'). Press Connect to load the latest version, then try again.';
  return m;
}
function toB64(str){var b=new TextEncoder().encode(str),s='';for(var i=0;i<b.length;i+=0x8000)s+=String.fromCharCode.apply(null,b.subarray(i,i+0x8000));return btoa(s);}
function fromB64(b){var s=atob(String(b).replace(/\s/g,'')),u=new Uint8Array(s.length);for(var i=0;i<s.length;i++)u[i]=s.charCodeAt(i);return new TextDecoder().decode(u);}
function parseData(text){var m=text.match(/window\.SHOP_DATA\s*=\s*([\s\S]*?);\s*$/);if(!m)throw {parse:true};return JSON.parse(m[1]);}
function dataText(){return '// China Town catalogue. The admin page writes this file. You can also edit it by hand.\nwindow.SHOP_DATA = '+JSON.stringify(S.data,null,2).replace(/<\//g,'<\\/')+';\n';}
function load(d){S.data={products:d.products||{},settings:Object.assign({},DEFS,d.settings||{})};S.orig=JSON.stringify(S.data);S.pending={};}

async function connect(){
  var c=S.conn;c.msg='';
  if(!c.owner||!c.repo||!c.token){c.ok=false;c.msg='Fill in the owner, repository and token.';render();return;}
  try{
    var r=await api('GET','/repos/'+enc(c.owner)+'/'+enc(c.repo));
    if(r.permissions&&r.permissions.push===false)throw {message:'This token can read the repository but cannot write to it. Create the token with "Contents: Read and write".'};
    c.branch=r.default_branch||'main';
    try{
      var f=await api('GET',cpath('data.js')+'?ref='+enc(c.branch));
      if(!dirty())load(parseData(fromB64(f.content)));
    }catch(e){if(e.status!==404&&!e.parse)throw e;}
    c.ok=true;ls.set('ctadmin-conn',{owner:c.owner,repo:c.repo,token:c.token});
    toast('Connected');
  }catch(e){c.ok=false;c.msg=explain(e);}
  render();
}
async function putFile(path,b64,msg,sha){
  await api('PUT',cpath(path),{message:msg,content:b64,branch:S.conn.branch,sha:sha||undefined});
}
async function save(){
  if(S.busy||!S.conn.ok)return;
  S.busy=true;S.pubmsg='';S.err='';bar();
  try{
    var used={};Object.keys(S.data.products).forEach(function(k){var i=S.data.products[k].img;if(i)used[i]=1;});
    var paths=Object.keys(S.pending).filter(function(p){return used[p]&&S.prev[p];});
    for(var i=0;i<paths.length;i++){await putFile(paths[i],S.prev[paths[i]].split(',')[1],'Add product photo',null);}
    var sha=null;
    try{var f=await api('GET',cpath('data.js')+'?ref='+enc(S.conn.branch));sha=f.sha;}catch(e){if(e.status!==404)throw e;}
    await putFile('data.js',toB64(dataText()),'Update catalogue from the admin page',sha);
    S.pending={};S.orig=JSON.stringify(S.data);
    S.pubmsg='Published at '+new Date().toLocaleTimeString()+'. Customers see the change in 1 to 2 minutes. Press Ctrl+F5 on the shop page to see it sooner.';
  }catch(e){S.err='Could not publish: '+explain(e);}
  S.busy=false;render();
}
function download(name,data,type){
  var a=document.createElement('a');a.href=URL.createObjectURL(new Blob([data],{type:type||'text/plain'}));a.download=name;
  document.body.appendChild(a);a.click();setTimeout(function(){URL.revokeObjectURL(a.href);a.remove();},800);
}
function downloadAll(){
  download('data.js',dataText(),'text/javascript');
  var used={};Object.keys(S.data.products).forEach(function(k){var i=S.data.products[k].img;if(i)used[i]=1;});
  var paths=Object.keys(S.pending).filter(function(p){return used[p]&&S.prev[p];});
  paths.forEach(function(p,i){setTimeout(function(){fetch(S.prev[p]).then(function(r){return r.blob();}).then(function(b){download(p.split('/').pop(),b,'image/jpeg');});},400*(i+1));});
  toast(paths.length?'Downloading data.js and '+paths.length+' photo(s). Put photos in an images folder.':'Downloading data.js');
}

/* ---------- views ---------- */
function art(p){
  var c=/^#[0-9a-fA-F]{6}$/.test(p.hue||'')?p.hue:'#c0201b';
  var src=p.img?(S.prev[p.img]||p.img):'';
  return '<div class="art" style="--h:'+c+'">'+(src?'<img src="'+esc(src)+'" alt="">':glyph(p.glyph))+'</div>';
}
function header(){
  return '<header class="top"><a class="logo" href="index.html"><span class="cjk">唐人街</span><span class="nm">'+esc(S.data.settings.name||'China Town')+'</span></a>'+
  '<nav class="main"><a href="index.html">View shop</a><a href="#" aria-current="page">Manager</a></nav>'+
  '<div class="tools"><button class="ib" data-act="theme" aria-label="Switch light or dark theme">'+MOON+'</button></div></header>';
}
function connHTML(){
  var c=S.conn;
  var st=c.ok?'<span class="ok">Connected to '+esc(c.owner)+'/'+esc(c.repo)+' ('+esc(c.branch)+')</span>':'<span class="muted">Not connected. You can still edit and download the file.</span>';
  return '<details class="form" style="margin-bottom:16px"'+(c.ok?'':' open')+'><summary style="cursor:pointer;font-weight:700">Publishing to GitHub &nbsp; '+st+'</summary><div style="display:grid;gap:14px;margin-top:14px">'+
  '<div class="g2"><label class="fld" for="gh-owner">GitHub user name<input id="gh-owner" type="text" value="'+esc(c.owner)+'" autocomplete="off"></label><label class="fld" for="gh-repo">Repository name<input id="gh-repo" type="text" value="'+esc(c.repo)+'" autocomplete="off"></label></div>'+
  '<label class="fld" for="gh-token">Access token<input id="gh-token" type="password" value="'+esc(c.token)+'" autocomplete="off"><span class="hint">Kept in this browser only. Do not use this on a shared computer.</span></label>'+
  (c.msg?'<div class="note err">'+esc(c.msg)+'</div>':'')+
  '<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-red btn-sm" data-act="connect">Connect</button>'+(c.token?'<button class="btn btn-line btn-sm" data-act="forget">Remove saved token</button>':'')+'</div>'+
  '<div class="muted" style="font-size:14px"><b style="color:var(--ink)">How to get a token (once):</b><ol style="margin:8px 0 0;padding-left:20px;display:grid;gap:4px"><li>On GitHub open your profile menu, then Settings, then Developer settings, then Personal access tokens, then Fine-grained tokens, then Generate new token.</li><li>Name it China Town. Under Repository access choose "Only select repositories" and pick your shop repository.</li><li>Under Permissions, Repository permissions, set Contents to "Read and write".</li><li>Generate the token, copy it, paste it above and press Connect.</li></ol></div>'+
  '</div></details>';
}
function cats(){var m={};Object.keys(S.data.products).forEach(function(k){m[S.data.products[k].cat||'Other']=1;});['Tea','Tableware','Kitchen','Pantry','Gifts'].forEach(function(c){m[c]=1;});return Object.keys(m);}
function ids(){
  var q=S.q.trim().toLowerCase(),P=S.data.products;
  return Object.keys(P).filter(function(i){return !q||(P[i].name+' '+(P[i].cat||'')).toLowerCase().indexOf(q)>=0;}).sort(function(a,b){return (P[b].ts||0)-(P[a].ts||0);});
}
function tableHTML(){
  var a=ids(),P=S.data.products;
  if(!a.length)return '<div class="empty"><b>'+(Object.keys(P).length?'No product matches':'No products yet')+'</b>Press "Add product" to create one.</div>';
  return '<div class="tbl"><table><thead><tr><th></th><th>Product</th><th>Price</th><th>Stock</th><th>Status</th><th></th></tr></thead><tbody>'+a.map(function(id){var p=P[id];
    return '<tr><td><div class="th-art">'+art(p)+'</div></td><td><b>'+esc(p.name)+'</b><div class="muted" style="font-size:12px">'+esc(p.cat||'')+'</div></td>'+
    '<td><input type="number" min="0" step="0.01" value="'+(Number(p.price)||0)+'" data-fld="price" data-id="'+esc(id)+'" aria-label="Price"></td>'+
    '<td><input type="number" min="0" step="1" value="'+(Number(p.stock)||0)+'" data-fld="stock" data-id="'+esc(id)+'" aria-label="Stock"></td>'+
    '<td>'+(p.active===false?'<span class="pill s-cancelled">Hidden</span>':'<span class="pill s-confirmed">Visible</span>')+'</td>'+
    '<td><div class="acts"><button class="btn btn-line btn-sm" data-act="edit" data-id="'+esc(id)+'">Edit</button><button class="btn btn-line btn-sm" data-act="toggle" data-id="'+esc(id)+'">'+(p.active===false?'Show':'Hide')+'</button><button class="btn btn-danger btn-sm'+(S.delArm===id?' armed':'')+'" data-act="del" data-id="'+esc(id)+'">'+(S.delArm===id?'Confirm':'Delete')+'</button></div></td></tr>';}).join('')+'</tbody></table></div>';
}
function settingsHTML(){
  var s=S.data.settings;
  function f(id,l,v,t,h){return '<label class="fld" for="st-'+id+'">'+l+'<input id="st-'+id+'" data-s="'+id+'" type="'+(t||'text')+'" value="'+esc(v)+'"'+(t==='number'?' min="0" step="0.01"':'')+'>'+(h?'<span class="hint">'+h+'</span>':'')+'</label>';}
  return '<div class="form" style="max-width:680px">'+f('name','Shop name',s.name)+'<div class="g2">'+f('cur','Currency symbol',s.cur,'text','Shown before every price.')+f('ship','Delivery fee',s.ship,'number')+'</div>'+
    f('free','Free delivery from (0 for never)',s.free,'number')+f('banner','Top banner text',s.banner,'text','Leave empty to show the free delivery message.')+
    f('contact','Contact line',s.contact,'text','A phone number or address shown in the footer.')+
    f('wa','WhatsApp number',s.wa,'text','Digits with the country code, no plus sign. Orders are sent to this number.')+
    f('note','Delivery note',s.note)+f('pay','Payment note',s.pay)+'</div>';
}
function render(){
  var h=header()+'<main class="page"><h1>Shop manager</h1>';
  if(S.pubmsg)h+='<div class="note" style="margin-bottom:14px"><b class="ok">Published.</b> '+esc(S.pubmsg.replace(/^Published /,'Published '))+'</div>';
  if(S.err)h+='<div class="note err" style="margin-bottom:14px">'+esc(S.err)+'</div>';
  h+=connHTML()+'<div id="tiles" class="tiles"></div>';
  h+='<div class="tabs">'+['products','settings'].map(function(t){return '<button class="chip" data-act="tab" data-t="'+t+'" aria-pressed="'+(S.tab===t)+'">'+t.charAt(0).toUpperCase()+t.slice(1)+'</button>';}).join('');
  if(S.tab==='products')h+='<span class="sp"></span><button class="btn btn-gold btn-sm" data-act="add">+ Add product</button>';
  h+='</div>';
  if(S.tab==='products')h+='<div class="toolbar"><div class="search">'+SEARCH+'<input id="aq" type="text" placeholder="Search products" aria-label="Search products" value="'+esc(S.q)+'"></div></div><div id="ptable">'+tableHTML()+'</div>';
  else h+=settingsHTML();
  $('#app').innerHTML=h+'</main>';
  tiles();bar();
}
function tiles(){
  var t=$('#tiles');if(!t)return;var P=S.data.products,k=Object.keys(P);
  var vis=k.filter(function(i){return P[i].active!==false;}).length,low=k.filter(function(i){return (Number(P[i].stock)||0)<=5;}).length;
  var html='<div class="tile"><b>'+k.length+'</b><span>Products</span></div><div class="tile"><b>'+vis+'</b><span>Visible in the shop</span></div><div class="tile"><b>'+low+'</b><span>Low or sold out</span></div>';
  if(t._h!==html){t.innerHTML=html;t._h=html;}
}
function bar(){
  var b=$('#savebar');if(!b)return;var d=dirty();b.hidden=!d&&!S.busy;if(b.hidden)return;
  var html='<b>'+(S.busy?'Publishing. Please wait.':'You have unsaved changes')+'</b>'+(S.busy?'':
    '<button class="btn btn-gold btn-sm" data-act="save"'+(S.conn.ok?'':' disabled title="Connect to GitHub first"')+'>Publish to site</button>'+
    '<button class="btn btn-line btn-sm" data-act="dl">Download data.js</button><button class="btn btn-line btn-sm" data-act="discard">Discard changes</button>'+
    (S.conn.ok?'':'<span style="flex-basis:100%;font-size:12px;opacity:.8">Connect to GitHub above to publish from here, or download the file and upload it to your repository.</span>'));
  /* Only rebuild when the content changed, so a click that starts while a field loses focus is not lost. */
  if(b._h!==html){b.innerHTML=html;b._h=html;}
}
var tt,toastEl=$('#toast');
function toast(m){toastEl.textContent=m;toastEl.classList.add('show');clearTimeout(tt);tt=setTimeout(function(){toastEl.classList.remove('show');},2800);}

/* ---------- product editor ---------- */
function fmtSpecs(a){return (a||[]).map(function(s){return s.k+': '+s.v;}).join('\n');}
function fmtOpts(a){return (a||[]).map(function(o){return o.n+': '+(o.v||[]).join(', ');}).join('\n');}
function shrink(file){return new Promise(function(res,rej){var im=new Image(),u=URL.createObjectURL(file);
  im.onload=function(){var s=Math.min(1,900/Math.max(im.width,im.height)),c=document.createElement('canvas');c.width=Math.max(1,Math.round(im.width*s));c.height=Math.max(1,Math.round(im.height*s));
    c.getContext('2d').drawImage(im,0,0,c.width,c.height);URL.revokeObjectURL(u);res(c.toDataURL('image/jpeg',.84));};
  im.onerror=function(){URL.revokeObjectURL(u);rej(new Error('img'));};im.src=u;});}
function openEditor(id){
  var p=id?S.data.products[id]:{name:'',cat:'Tea',price:10,was:0,stock:10,tag:'',desc:'',specs:[],options:[],glyph:'tin',hue:'#c0201b',img:'',active:true};
  if(!p)return;S.edit=id||'';S.photo=null;
  var hue=/^#[0-9a-fA-F]{6}$/.test(p.hue||'')?p.hue:'#c0201b',d=$('#edDlg');
  var row='style="padding:0;border:0;background:none"';
  d.innerHTML='<form id="edForm"><h2>'+(id?'Edit product':'Add product')+'</h2>'+
  '<label class="fld" for="ed-name">Name<input id="ed-name" type="text" maxlength="70" value="'+esc(p.name)+'" required></label>'+
  '<div class="form g2" '+row+'><label class="fld" for="ed-cat">Category<input id="ed-cat" type="text" list="ed-cats" maxlength="30" value="'+esc(p.cat)+'"></label><datalist id="ed-cats">'+cats().map(function(c){return '<option value="'+esc(c)+'">';}).join('')+'</datalist><label class="fld" for="ed-tag">Short line<input id="ed-tag" type="text" maxlength="70" value="'+esc(p.tag||'')+'"></label></div>'+
  '<div class="form g2" '+row+'><label class="fld" for="ed-price">Price<input id="ed-price" type="number" min="0" step="0.01" value="'+(Number(p.price)||0)+'"></label><label class="fld" for="ed-was">Old price (optional)<input id="ed-was" type="number" min="0" step="0.01" value="'+(Number(p.was)||0)+'"></label></div>'+
  '<div class="form g2" '+row+'><label class="fld" for="ed-stock">In stock<input id="ed-stock" type="number" min="0" step="1" value="'+(Number(p.stock)||0)+'"></label><label class="fld" for="ed-hue">Colour<input id="ed-hue" type="color" value="'+hue+'" style="height:42px;padding:3px"></label></div>'+
  '<label class="fld" for="ed-desc">Description<textarea id="ed-desc" rows="4">'+esc(p.desc||'')+'</textarea></label>'+
  '<label class="fld" for="ed-specs">Specifications<textarea id="ed-specs" rows="5">'+esc(fmtSpecs(p.specs))+'</textarea><span class="hint">One per line, written as Label: value</span></label>'+
  '<label class="fld" for="ed-opts">Buying options (optional)<textarea id="ed-opts" rows="2">'+esc(fmtOpts(p.options))+'</textarea><span class="hint">One per line, written as Name: choice, choice. Example: Size: 20 cm, 25 cm</span></label>'+
  '<div class="form g2" '+row+'><label class="fld" for="ed-glyph">Picture style (used when there is no photo)<select id="ed-glyph" style="width:100%">'+GL.map(function(k){return '<option value="'+k+'"'+(p.glyph===k?' selected':'')+'>'+k+'</option>';}).join('')+'</select></label>'+
  '<label class="fld" for="ed-file">Photo<input id="ed-file" type="file" accept="image/*"><span class="hint" id="ed-fnote">'+(p.img?'A photo is set. Choose another to replace it.':'No photo yet.')+'</span></label></div>'+
  '<div style="width:96px" id="ed-prev">'+art({glyph:p.glyph,hue:hue,img:p.img})+'</div>'+
  (p.img?'<div class="checks"><label><input type="checkbox" id="ed-rmimg"> Remove the current photo</label></div>':'')+
  '<div class="checks"><label><input type="checkbox" id="ed-active"'+(p.active===false?'':' checked')+'> Visible in the shop</label></div>'+
  '<div class="ferr" id="ed-err" role="alert"></div><div class="row"><button type="button" class="btn btn-line" id="ed-cancel">Cancel</button><button type="submit" class="btn btn-red">Save product</button></div></form>';
  if(d.showModal)d.showModal();else d.setAttribute('open','');
  $('#ed-cancel').addEventListener('click',function(){d.close();});
  $('#ed-file').addEventListener('change',function(e){var f=e.target.files&&e.target.files[0];S.photo=null;if(!f)return;
    shrink(f).then(function(u){S.photo=u;$('#ed-fnote').textContent='Photo ready ('+Math.round(u.length*0.75/1024)+' KB). It is added when you save.';$('#ed-prev').innerHTML=art({glyph:$('#ed-glyph').value,hue:$('#ed-hue').value,img:'__new'}).replace('</div>','</div>');var im=$('#ed-prev img');if(im)im.src=u;},function(){$('#ed-fnote').textContent='That file could not be read as an image.';});});
  function pv(){if(S.photo)return;$('#ed-prev').innerHTML=art({glyph:$('#ed-glyph').value,hue:$('#ed-hue').value,img:''});}
  $('#ed-glyph').addEventListener('input',pv);$('#ed-hue').addEventListener('input',pv);
  $('#edForm').addEventListener('submit',function(e){e.preventDefault();saveProduct();});
}
function saveProduct(){
  var err=$('#ed-err');err.textContent='';
  var name=$('#ed-name').value.trim(),price=parseFloat($('#ed-price').value);
  if(!name){err.textContent='Add a product name.';return;}
  if(!(price>=0)){err.textContent='Enter a price of zero or more.';return;}
  var id=S.edit,old=id?S.data.products[id]:null;
  if(!id){id=(slug(name).slice(0,28)||'item');while(S.data.products[id])id+='-'+Math.random().toString(36).slice(2,4);}
  var specs=$('#ed-specs').value.split('\n').map(function(l){var i=l.indexOf(':');return i>0?{k:l.slice(0,i).trim(),v:l.slice(i+1).trim()}:null;}).filter(function(s){return s&&s.k&&s.v;});
  var options=$('#ed-opts').value.split('\n').map(function(l){var i=l.indexOf(':');if(i<=0)return null;var v=l.slice(i+1).split(',').map(function(x){return x.trim();}).filter(Boolean);return v.length?{n:l.slice(0,i).trim(),v:v}:null;}).filter(Boolean).slice(0,3);
  var img=old&&old.img?old.img:'';
  var rm=$('#ed-rmimg');if(rm&&rm.checked)img='';
  if(S.photo){img='images/'+(slug(name).slice(0,24)||'item')+'-'+Date.now().toString(36)+'.jpg';S.prev[img]=S.photo;S.pending[img]=1;}
  S.data.products[id]=Object.assign({},old||{},{name:name,cat:$('#ed-cat').value.trim()||'Other',price:price,was:Math.max(0,parseFloat($('#ed-was').value)||0),stock:Math.max(0,Math.floor(parseFloat($('#ed-stock').value)||0)),tag:$('#ed-tag').value.trim(),desc:$('#ed-desc').value.trim(),specs:specs,options:options,glyph:$('#ed-glyph').value,hue:$('#ed-hue').value,img:img,active:$('#ed-active').checked,ts:(old&&old.ts)||Date.now()});
  $('#edDlg').close();S.photo=null;S.pubmsg='';render();toast(old?'Product changed':'Product added');
}

/* ---------- events ---------- */
document.addEventListener('click',function(e){
  var t=e.target.closest('[data-act]');if(!t)return;var a=t.getAttribute('data-act'),id=t.getAttribute('data-id');
  if(a==='tab'){S.tab=t.getAttribute('data-t');render();return;}
  if(a==='add'){openEditor('');return;}
  if(a==='edit'){openEditor(id);return;}
  if(a==='toggle'){var p=S.data.products[id];if(p){p.active=p.active===false;S.pubmsg='';render();}return;}
  if(a==='del'){if(S.delArm===id){delete S.data.products[id];S.delArm='';S.pubmsg='';render();toast('Product deleted');}else{S.delArm=id;render();setTimeout(function(){if(S.delArm===id){S.delArm='';render();}},4000);}return;}
  if(a==='connect'){connect();return;}
  if(a==='forget'){ls.del('ctadmin-conn');S.conn.token='';S.conn.ok=false;S.conn.msg='';render();toast('Token removed from this browser');return;}
  if(a==='save'){save();return;}
  if(a==='dl'){downloadAll();return;}
  if(a==='discard'){S.data=JSON.parse(S.orig);S.pending={};S.pubmsg='';render();toast('Changes discarded');return;}
  if(a==='theme'){var r=document.documentElement,cur=r.getAttribute('data-theme');if(!cur)cur=(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches)?'dark':'light';var nx=cur==='dark'?'light':'dark';r.setAttribute('data-theme',nx);ls.set('ct-theme',nx);return;}
});
document.addEventListener('input',function(e){
  var t=e.target;
  if(t.id==='aq'){S.q=t.value;var w=$('#ptable');if(w)w.innerHTML=tableHTML();return;}
  if(t.id==='gh-owner'){S.conn.owner=t.value.trim();return;}
  if(t.id==='gh-repo'){S.conn.repo=t.value.trim();return;}
  if(t.id==='gh-token'){S.conn.token=t.value.trim();return;}
  var s=t.getAttribute&&t.getAttribute('data-s');
  if(s){var v=t.value;if(s==='ship'||s==='free')v=Math.max(0,parseFloat(v)||0);else if(s==='wa')v=v.replace(/\D/g,'');S.data.settings[s]=v;S.pubmsg='';bar();}
});
document.addEventListener('change',function(e){
  var t=e.target,f=t.getAttribute&&t.getAttribute('data-fld');
  if(f){var p=S.data.products[t.getAttribute('data-id')];if(!p)return;var v=Math.max(0,parseFloat(t.value)||0);if(f==='stock')v=Math.floor(v);p[f]=v;S.pubmsg='';tiles();bar();}
});
window.addEventListener('beforeunload',function(e){if(dirty()){e.preventDefault();e.returnValue='';}});

var th=ls.get('ct-theme','');if(th==='light'||th==='dark')document.documentElement.setAttribute('data-theme',th);
render();
if(S.conn.token&&S.conn.owner&&S.conn.repo)connect();
})();
