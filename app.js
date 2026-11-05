(function(){
'use strict';
var $=function(s,r){return (r||document).querySelector(s);};
var $$=function(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s));};
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
var ls={get:function(k,d){try{var v=localStorage.getItem(k);return v==null?d:JSON.parse(v);}catch(e){return d;}},set:function(k,v){try{localStorage.setItem(k,JSON.stringify(v));}catch(e){}}};
function slug(s){return String(s).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');}

var DEF={name:'China Town',cur:'$',ship:6,free:60,banner:'',contact:'',wa:'',note:'Orders are packed within two working days.',pay:'Cash on delivery, or bank or mobile transfer after we confirm your order.'};
var MARK={Tea:'茶',Tableware:'器',Kitchen:'厨',Pantry:'味',Gifts:'礼'};
var CATORDER=['Tea','Tableware','Kitchen','Pantry','Gifts'];
var STAT=['placed','confirmed','shipped','delivered','cancelled'];
var STATL={placed:'Placed',confirmed:'Confirmed',shipped:'Shipped',delivered:'Delivered',cancelled:'Cancelled'};
function mark(c){return MARK[c]||'品';}

var S={
  route:{v:'shop',cat:'all',id:''},
  db:null,assets:null,dl:null,uid:null,canAdmin:false,adminOn:ls.get('ct-admin',false),
  dbState:'loading',slow:false,loaded:false,offline:false,oq:'',armC:'',
  products:{},settings:Object.assign({},DEF),mine:{},all:[],
  cart:ls.get('ct-cart',[]),wish:ls.get('ct-wish',{}),
  form:Object.assign({name:'',phone:'',email:'',addr:'',city:'',note:'',pay:'cod'},ls.get('ct-form',{})),
  q:'',sort:'new',sel:null,last:null,atab:'orders',ofilter:'all',delArm:'',placing:false,formErr:{}
};
function admin(){return S.canAdmin&&S.adminOn;}
function money(n,cur){return (cur==null?S.settings.cur:cur)+(Number(n)||0).toFixed(2);}

/* ---------- art ---------- */
var G=window.CT_GLYPHS||{};
var GLYPHS=Object.keys(G);
function glyph(k){return '<svg viewBox="0 0 120 120" aria-hidden="true">'+(G[k]||G.gift)+'</svg>';}
function art(p){
  var c=/^#[0-9a-fA-F]{6}$/.test(p.hue||'')?p.hue:'#c0201b';
  var img=p.img?'<img src="'+(SITE?'':'/_blob/')+esc(p.img)+'" alt="'+esc(p.name)+'" loading="lazy" data-img data-g="'+esc(p.glyph||'gift')+'">':'';
  return '<div class="art" style="--h:'+c+'">'+(p.img?img:glyph(p.glyph))+'</div>';
}
document.addEventListener('error',function(e){var t=e.target;if(t&&t.matches&&t.matches('img[data-img]')){var d=t.parentNode;d.innerHTML=glyph(t.getAttribute('data-g'));}},true);

/* ---------- helpers ---------- */
function prod(id){return S.products[id];}
function shown(id){var p=S.products[id];return p&&(p.active!==false||admin());}
function ids(){return Object.keys(S.products).filter(shown);}
function cats(){var m={};ids().forEach(function(i){var c=S.products[i].cat||'Other';m[c]=(m[c]||0)+1;});
  return Object.keys(m).sort(function(a,b){var x=CATORDER.indexOf(a),y=CATORDER.indexOf(b);if(x<0)x=99;if(y<0)y=99;return x-y||a.localeCompare(b);}).map(function(c){return {n:c,s:slug(c),c:m[c]};});}
function stockTxt(p){var s=Number(p.stock)||0;return s<=0?'out':s<=5?'low':'in';}
function optsText(o){return Object.keys(o||{}).map(function(k){return k+': '+o[k];}).join(', ');}
function hash(s){var h=0;for(var i=0;i<s.length;i++){h=(h*31+s.charCodeAt(i))|0;}return Math.abs(h).toString(36);}
function when(ts){try{return new Date(ts).toLocaleString([],{dateStyle:'medium',timeStyle:'short'});}catch(e){return '';}}
function dbErr(e){var c=e&&e.code;return c==='quota_exceeded'?'Storage is full. Delete something first.':c==='invalid_argument'?'Your account is not allowed to change this.':'Could not save. Try again.';}

/* order helpers */
function waNum(){return String(S.settings.wa||'').replace(/\D/g,'');}
function findOrder(oid){
  if(S.last&&S.last.order.id===oid)return S.last.order;
  if(S.mine[oid])return S.mine[oid];
  var x=S.all.filter(function(y){return y.o.id===oid;})[0];return x?x.o:null;}
function waLink(o){var n=waNum();return n?'https://wa.me/'+n+'?text='+encodeURIComponent(orderText(o)):'';}
function orderFlags(o){var f=[],sum=0;
  o.items.forEach(function(i){sum+=(Number(i.price)||0)*i.q;var p=S.products[i.pid];
    if(!p)f.push(i.name+' is no longer in the catalogue');
    else if(Number(p.price)!==Number(i.price))f.push(i.name+': paid '+money(i.price,o.cur)+', listed now '+money(p.price,o.cur));});
  if(Math.abs(sum+(Number(o.ship)||0)-(Number(o.total)||0))>0.005)f.push('The total does not match the items and delivery');
  if(o.status==='cancelled'&&o.stockDone)f.push('Cancelled after stock was taken. Add the stock back by hand');
  return f;}

/* cart */
function saveCart(){ls.set('ct-cart',S.cart);}
function lines(){return S.cart.map(function(it){var p=S.products[it.pid];var ok=!!p&&p.active!==false&&(Number(p.stock)||0)>0;
  var q=it.q;if(p&&ok){q=Math.min(q,Number(p.stock)||0);}
  return {k:it.k,id:it.pid,p:p,opts:it.o||{},q:q,ok:ok};});}
function totals(ls_){var sub=0;ls_.forEach(function(l){if(l.p)sub+=(Number(l.p.price)||0)*l.q;});
  var free=Number(S.settings.free)||0,fee=Number(S.settings.ship)||0;
  var ship=sub===0?0:(free>0&&sub>=free?0:fee);return {sub:sub,ship:ship,total:sub+ship};}
function cartCount(){return S.cart.reduce(function(n,i){return n+i.q;},0);}
function addToCart(id,opts,qty){var p=prod(id);if(!p)return;var stock=Number(p.stock)||0;if(stock<=0){toast('Sold out');return;}
  var k=id+'_'+hash(JSON.stringify(opts||{}));var ex=S.cart.filter(function(i){return i.k===k;})[0];
  var have=ex?ex.q:0,want=have+qty;
  if(want>stock){want=stock;toast('Only '+stock+' in stock');}else{toast('Added to cart');}
  if(ex){ex.q=want;}else{S.cart.push({k:k,pid:id,o:opts||{},q:want});}
  saveCart();updateBadge();}
function defaultOpts(p){var o={};(p.options||[]).forEach(function(x){if(x&&x.v&&x.v.length)o[x.n]=x.v[0];});return o;}

/* ---------- views ---------- */
function icon(n){return {
 cart:'<svg viewBox="0 0 24 24"><path d="M3 4h2.5l2 11h10.5l2-8H7"/><circle cx="9" cy="19.5" r="1.4"/><circle cx="17" cy="19.5" r="1.4"/></svg>',
 moon:'<svg viewBox="0 0 24 24"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
 heart:'<svg viewBox="0 0 24 24"><path d="M12 20s-7-4.4-9-9.2C1.6 7.4 4 4.5 7 4.5c2 0 3.4 1.1 5 3 1.6-1.9 3-3 5-3 3 0 5.4 2.9 4 6.3-2 4.8-9 9.2-9 9.2z"/></svg>',
 search:'<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg>'}[n];}

function header(){
  var r=S.route.v,st=S.settings;
  var h='';
  var banner=st.banner||((Number(st.free)>0)?'Free delivery over '+money(st.free)+'. Every order is confirmed by the shop before it ships.':'Every order is confirmed by the shop before it ships.');
  h+='<div class="ticker">'+esc(banner)+'</div>';
  h+='<header class="top"><a class="logo" href="#shop"><span class="cjk">唐人街</span><span class="nm">'+esc(st.name)+'</span></a>';
  h+='<nav class="main" aria-label="Main"><a href="#shop"'+(r==='shop'||r==='product'?' aria-current="page"':'')+'>Shop</a>'+(SITE?'':'<a href="#orders"'+(r==='orders'?' aria-current="page"':'')+'>My orders</a>')+''+(admin()?'<a href="#admin"'+(r==='admin'?' aria-current="page"':'')+'>Dashboard</a>':'')+'</nav>';
  h+='<div class="tools">';
  if(S.canAdmin)h+='<button class="ib adm" data-act="admin" aria-pressed="'+S.adminOn+'" title="Turn admin mode on or off">Admin mode <span class="kn"></span></button>';
  h+='<button class="ib" data-act="theme" aria-label="Switch light or dark theme">'+icon('moon')+'</button>';
  h+='<a class="ib" href="#cart" aria-label="Cart">'+icon('cart')+'<span class="cnt" id="badge">'+cartCount()+'</span></a>';
  h+='</div></header>';
  return h;
}
function footer(){var st=S.settings;
  return '<footer class="bot"><div><b>'+esc(st.name)+'</b>Tea, tableware, kitchen tools and pantry goods.</div>'+
  '<div><b>Delivery</b>'+esc(st.note||'')+'</div>'+
  '<div><b>Payment</b>'+esc(st.pay||'')+' This page does not take card payments.</div>'+
  '<div><b>Contact</b>'+(st.contact?esc(st.contact):'The shop will phone you to confirm each order.')+(waNum()?'<br><a href="https://wa.me/'+waNum()+'" target="_blank" rel="noopener">WhatsApp +'+esc(waNum())+'</a>':'')+'</div></footer>';}

function card(id){
  var p=S.products[id],t=stockTxt(p),h='';
  h+='<article class="card'+(p.active===false?' off':'')+'">';
  h+='<button class="heart" data-act="wish" data-id="'+id+'" aria-pressed="'+!!S.wish[id]+'" aria-label="Save to wish list">'+icon('heart')+'</button>';
  h+='<a class="cl" href="#p-'+id+'"><div class="aw">'+art(p)+'<span class="seal" aria-hidden="true">'+mark(p.cat)+'</span>';
  if(t==='out')h+='<span class="stag out">Sold out</span>';else if(t==='low')h+='<span class="stag">Only '+(Number(p.stock)||0)+' left</span>';
  if(p.active===false)h+='<span class="stag hid">Hidden</span>';
  h+='</div><h3>'+esc(p.name)+'</h3><p class="tg">'+esc(p.tag||'')+'</p></a>';
  h+='<div class="pr"><span><span class="price">'+money(p.price)+'</span>'+(Number(p.was)>Number(p.price)?'<span class="was">'+money(p.was)+'</span>':'')+'</span>';
  var hasOpt=(p.options||[]).length>0;
  h+='<button class="btn btn-red btn-sm" data-act="'+(hasOpt?'view':'add')+'" data-id="'+id+'"'+(t==='out'?' disabled':'')+'>'+(hasOpt?'Choose':'Add')+'</button></div>';
  if(admin()){h+='<div class="ad"><button class="btn btn-line btn-sm" data-act="edit" data-id="'+id+'">Edit</button><button class="btn btn-line btn-sm" data-act="toggle" data-id="'+id+'">'+(p.active===false?'Show':'Hide')+'</button><button class="btn btn-danger btn-sm'+(S.delArm===id?' armed':'')+'" data-act="del" data-id="'+id+'">'+(S.delArm===id?'Confirm delete':'Delete')+'</button></div>';}
  return h+'</article>';
}
function list(){
  var c=S.route.cat,q=S.q.trim().toLowerCase();
  var a=ids().filter(function(id){var p=S.products[id];
    if(c==='saved'&&!S.wish[id])return false;
    if(c!=='all'&&c!=='saved'&&slug(p.cat||'Other')!==c)return false;
    if(q&&(p.name+' '+(p.cat||'')+' '+(p.tag||'')+' '+(p.desc||'')).toLowerCase().indexOf(q)<0)return false;
    return true;});
  var P=S.products;
  a.sort(function(x,y){
    if(S.sort==='lo')return P[x].price-P[y].price;
    if(S.sort==='hi')return P[y].price-P[x].price;
    if(S.sort==='az')return P[x].name.localeCompare(P[y].name);
    return (P[y].ts||0)-(P[x].ts||0);});
  return a;
}
function gridHTML(){
  if(S.dbState==='none')return '<div class="empty"><b>The shop cannot load here</b>Open this page while signed in to Claude to see the products.</div>';
  if(S.dbState==='error')return '<div class="empty"><b>Could not reach the shop</b>Check your connection and reload the page.</div>';
  if(!S.loaded)return '<div class="empty"><b>'+(S.slow?'Still trying to reach the shop':'Loading the shop')+'</b>'+(S.slow?'The connection is slow. The products will appear when it answers.':'One moment.')+'</div>';
  var a=list();
  if(!a.length){
    if(!ids().length)return '<div class="empty"><b>No products yet</b>'+(admin()?'Press "New product" above to add the first one.':'Please check back soon.')+'</div>';
    return '<div class="empty"><b>Nothing matches</b>Try another word or pick a different category.</div>';}
  return a.map(card).join('');
}
function shopView(){
  var st=S.settings,h='',cs=cats();
  h+='<section class="hero"><div><h1>Everything for the table, <em>from one street</em></h1><p>Tea, tableware, kitchen tools and pantry goods. Pick what you need, send the order, and the shop confirms it by phone.</p></div>';
  h+='<div class="perks"><div><b>茶</b>'+(Number(st.free)>0?'Free delivery over '+esc(money(st.free)):'Flat delivery '+esc(money(st.ship)))+'</div><div><b>器</b>Packed with care, fragile items double-wrapped</div><div><b>礼</b>Pay on delivery or by transfer</div></div></section>';
  if(S.offline&&!SITE)h+='<div class="note warn" style="margin-bottom:14px">You are viewing a saved copy of the catalogue, so prices and stock may have changed. You can still build an order here and send it to the shop'+(waNum()?' on WhatsApp.':'.')+'</div>';
  if(admin())h+='<div class="admbar"><span><b>Admin mode is on.</b> Edit, hide or delete any product. Changes appear for every visitor straight away.</span><button class="btn btn-gold btn-sm" data-act="new">+ New product</button></div>';
  h+='<div class="toolbar"><div class="search">'+icon('search')+'<input id="q" type="text" placeholder="Search products" aria-label="Search products" value="'+esc(S.q)+'"></div>';
  h+='<select id="sort" aria-label="Sort products"><option value="new"'+(S.sort==='new'?' selected':'')+'>Newest first</option><option value="lo"'+(S.sort==='lo'?' selected':'')+'>Price, low to high</option><option value="hi"'+(S.sort==='hi'?' selected':'')+'>Price, high to low</option><option value="az"'+(S.sort==='az'?' selected':'')+'>Name, A to Z</option></select></div>';
  h+='<div class="chips"><a class="chip" href="#shop" aria-current="'+(S.route.cat==='all')+'">All <small>'+ids().length+'</small></a>';
  cs.forEach(function(c){h+='<a class="chip" href="#cat-'+c.s+'" aria-current="'+(S.route.cat===c.s)+'">'+esc(c.n)+' <small>'+c.c+'</small></a>';});
  var sv=Object.keys(S.wish).filter(function(i){return shown(i);}).length;
  h+='<a class="chip" href="#cat-saved" aria-current="'+(S.route.cat==='saved')+'">Saved <small>'+sv+'</small></a></div>';
  h+='<div class="grid" id="gridwrap">'+gridHTML()+'</div>';
  return h;
}

function productView(){
  var id=S.route.id,p=S.products[id];
  if(!S.loaded&&S.dbState!=='none'&&S.dbState!=='error')return '<div class="page"><div class="empty">Loading</div></div>';
  if(!p||!shown(id))return '<div class="page"><div class="empty"><b>This product is not listed</b><a class="btn btn-red" href="#shop">Back to the shop</a></div></div>';
  if(!S.sel||S.sel.id!==id)S.sel={id:id,opts:defaultOpts(p),q:1};
  var t=stockTxt(p),stock=Number(p.stock)||0,h='';
  h+='<div class="crumb"><a href="#shop">Shop</a><span>/</span><a href="#cat-'+slug(p.cat||'Other')+'">'+esc(p.cat||'Other')+'</a><span>/</span><span>'+esc(p.name)+'</span></div>';
  h+='<div class="pdp"><div class="big">'+art(p)+'<span class="seal" aria-hidden="true">'+mark(p.cat)+'</span></div><div>';
  h+='<div class="cat">'+esc(p.cat||'Other')+'</div><h1>'+esc(p.name)+'</h1>';
  h+='<div class="pp"><span class="price">'+money(p.price)+'</span>'+(Number(p.was)>Number(p.price)?'<span class="was">'+money(p.was)+'</span><span class="save">Save '+Math.round((1-p.price/p.was)*100)+'%</span>':'')+'</div>';
  h+='<div class="stock '+t+'">'+(t==='out'?'Sold out':t==='low'?'Only '+stock+' left':'In stock')+'</div>';
  if(p.tag)h+='<p class="muted" style="margin:0 0 6px">'+esc(p.tag)+'</p>';
  (p.options||[]).forEach(function(o){if(!o||!o.v)return;
    h+='<div class="opt"><div class="lb">'+esc(o.n)+'</div><div class="row">'+o.v.map(function(v){return '<button class="chip" data-act="opt" data-n="'+esc(o.n)+'" data-v="'+esc(v)+'" aria-pressed="'+(S.sel.opts[o.n]===v)+'">'+esc(v)+'</button>';}).join('')+'</div></div>';});
  h+='<div class="buy"><div class="qty"><button data-act="pq" data-d="-1" aria-label="Fewer">−</button><span id="pqv">'+S.sel.q+'</span><button data-act="pq" data-d="1" aria-label="More">+</button></div>';
  h+='<button class="btn btn-red" data-act="addp"'+(t==='out'?' disabled':'')+'>Add to cart</button><button class="btn btn-gold" data-act="buy"'+(t==='out'?' disabled':'')+'>Buy now</button>';
  h+='<button class="chip" data-act="wish" data-id="'+id+'" aria-pressed="'+!!S.wish[id]+'">'+(S.wish[id]?'Saved':'Save')+'</button></div>';
  if(admin())h+='<div class="admbar"><span><b>Admin.</b> This product is '+(p.active===false?'hidden':'visible')+' to visitors.</span><button class="btn btn-gold btn-sm" data-act="edit" data-id="'+id+'">Edit product</button></div>';
  if(p.desc)h+='<div class="sec"><h2>About this product</h2><p>'+esc(p.desc)+'</p></div>';
  if((p.specs||[]).length){h+='<div class="sec"><h2>Specifications</h2><dl class="spec">'+p.specs.map(function(s){return '<dt>'+esc(s.k)+'</dt><dd>'+esc(s.v)+'</dd>';}).join('')+'</dl></div>';}
  h+='<div class="sec"><h2>Delivery and payment</h2><p>'+esc(S.settings.note||'')+'\n'+esc(S.settings.pay||'')+'\nDelivery: '+(Number(S.settings.free)>0?money(S.settings.ship)+', free over '+money(S.settings.free):money(S.settings.ship))+'.</p></div>';
  h+='</div></div>';
  var rel=ids().filter(function(i){return i!==id&&S.products[i].cat===p.cat;}).slice(0,4);
  if(rel.length)h+='<section class="rel"><h2>More from '+esc(p.cat||'the shop')+'</h2><div class="grid">'+rel.map(card).join('')+'</div></section>';
  return h;
}

function cartView(){
  var L=lines(),T=totals(L),h='<div class="page"><h1>Your cart</h1>';
  if(!L.length)return h+'<div class="empty"><b>Your cart is empty</b><a class="btn btn-red" href="#shop">Browse the shop</a></div></div>';
  h+='<div class="two-col"><div class="lines">';
  L.forEach(function(l){
    if(!l.p){h+='<div class="line"><div></div><div><h3>No longer listed</h3><div class="sub">This product was removed.</div></div><div class="rt"><button class="rm" data-act="rm" data-key="'+l.k+'">Remove</button></div></div>';return;}
    h+='<div class="line"><a href="#p-'+l.id+'">'+art(l.p)+'</a><div><a href="#p-'+l.id+'" style="text-decoration:none"><h3>'+esc(l.p.name)+'</h3></a><div class="sub">'+esc(optsText(l.opts)||l.p.tag||'')+'</div>'+(l.ok?'':'<div class="sub" style="color:var(--err);font-weight:700">Unavailable. Remove it to continue.</div>')+'</div>';
    h+='<div class="rt"><b class="num">'+money((Number(l.p.price)||0)*l.q)+'</b>'+(l.ok?'<div class="qty"><button data-act="cq" data-key="'+l.k+'" data-d="-1" aria-label="Fewer">−</button><span>'+l.q+'</span><button data-act="cq" data-key="'+l.k+'" data-d="1" aria-label="More">+</button></div>':'')+'<button class="rm" data-act="rm" data-key="'+l.k+'">Remove</button></div></div>';});
  h+='</div>'+summary(L,T,'<a class="btn btn-red" href="#checkout">Checkout</a>')+'</div></div>';
  return h;
}
function summary(L,T,cta){
  var free=Number(S.settings.free)||0,tip='';
  if(free>0&&T.sub>0&&T.sub<free)tip='<div class="muted" style="font-size:13px">Add '+money(free-T.sub)+' more for free delivery.</div>';
  return '<aside class="sum"><div class="r"><span>Subtotal</span><span class="num">'+money(T.sub)+'</span></div><div class="r"><span>Delivery</span><span class="num">'+(T.ship===0?'Free':money(T.ship))+'</span></div>'+tip+'<div class="r t"><span>Total</span><span class="num">'+money(T.total)+'</span></div>'+cta+'</aside>';
}
function checkoutView(){
  var L=lines(),T=totals(L),f=S.form,e=S.formErr;
  if(!L.length)return '<div class="page"><h1>Checkout</h1><div class="empty"><b>Your cart is empty</b><a class="btn btn-red" href="#shop">Browse the shop</a></div></div>';
  var bad=L.some(function(l){return !l.ok;});
  function fld(id,label,type,val,extra){return '<label class="'+(e[id]?'bad':'')+'" for="ck-'+id+'">'+label+'<input id="ck-'+id+'" data-f="'+id+'" type="'+type+'" value="'+esc(val)+'" '+(extra||'')+'></label>';}
  var h='<div class="page"><h1>Checkout</h1><div class="two-col"><div class="form">';
  h+='<div class="g2">'+fld('name','Full name','text',f.name,'autocomplete="name"')+fld('phone','Phone','tel',f.phone,'autocomplete="tel"')+'</div>';
  h+=fld('email','Email (optional)','email',f.email,'autocomplete="email"');
  h+=fld('addr','Delivery address','text',f.addr,'autocomplete="street-address"');
  h+='<div class="g2">'+fld('city','City or area','text',f.city,'autocomplete="address-level2"')+'</div>';
  h+='<label for="ck-note">Note for the shop (optional)<textarea id="ck-note" data-f="note" rows="2">'+esc(f.note)+'</textarea></label>';
  h+='<div class="fld">Payment<div class="pay"><label><input type="radio" name="pay" data-f="pay" value="cod"'+(f.pay==='cod'?' checked':'')+'><span>Pay on delivery<small>Cash when the parcel arrives.</small></span></label><label><input type="radio" name="pay" data-f="pay" value="transfer"'+(f.pay==='transfer'?' checked':'')+'><span>Bank or mobile transfer<small>The shop sends the account details when it confirms your order.</small></span></label></div></div>';
  h+='<div class="note warn">No money is taken on this page. Pressing the button sends your order to the shop, which confirms it by phone.</div>';
  if(bad)h+='<div class="note err">Some items in your cart are unavailable. Go back and remove them.</div>';
  h+='</div>'+summary(L,T,'<button class="btn btn-red" data-act="place"'+((bad||S.placing)?' disabled':'')+'>'+(S.placing?'Sending order':'Place order')+'</button><a class="btn btn-line" href="#cart">Back to cart</a>')+'</div></div>';
  return h;
}
function orderText(o){
  var t=[S.settings.name+' order '+o.id+' ('+when(o.ts)+')'];
  o.items.forEach(function(i){t.push(i.q+' x '+i.name+(optsText(i.opts)?' ('+optsText(i.opts)+')':'')+' = '+money(i.price*i.q,o.cur));});
  t.push('Delivery: '+(o.ship===0?'Free':money(o.ship,o.cur)));t.push('Total: '+money(o.total,o.cur));
  t.push('Payment: '+(o.pay==='transfer'?'Bank or mobile transfer':'Pay on delivery'));
  var c=o.cust||{};t.push('Name: '+c.name);t.push('Phone: '+c.phone);if(c.email)t.push('Email: '+c.email);t.push('Address: '+c.addr+', '+c.city);if(c.note)t.push('Note: '+c.note);
  return t.join('\n');
}
function thanksView(){
  var x=S.last;if(!x)return '<div class="page"><div class="empty"><b>No recent order</b><a class="btn btn-red" href="#shop">Back to the shop</a></div></div>';
  var o=x.order,h='<div class="page"><h1>'+(x.saved?'Order sent':(SITE?'Send your order':'Order not sent'))+'</h1>';
  if(x.saved)h+='<div class="note" style="margin-bottom:14px">Thank you, '+esc(o.cust.name)+'. The shop has your order <b>'+esc(o.id)+'</b> and will phone you on '+esc(o.cust.phone)+' to confirm it. No payment has been taken.</div>';
  else if(SITE)h+='<div class="note" style="margin-bottom:14px">Thank you, '+esc(o.cust.name)+'. Your order <b>'+esc(o.id)+'</b> is ready. '+(waNum()?'Press Send on WhatsApp so the shop receives it and can confirm it by phone.':'Copy the details below and send them to the shop'+(S.settings.contact?': '+esc(S.settings.contact):'')+'.')+' No payment has been taken.</div>';
  else h+='<div class="note err" style="margin-bottom:14px">This page could not send your order to the shop, so nothing has reached them yet. '+(waNum()?'Press Send on WhatsApp, or copy':'Copy')+' the details below and send them to the shop'+(S.settings.contact?': '+esc(S.settings.contact):'')+'. Your cart is still here.</div>';
  h+='<div class="ord">'+orderBody(o,false)+'<div class="ft">'+(waLink(o)?'<a class="btn '+(x.saved?'btn-line':'btn-gold')+' btn-sm" href="'+esc(waLink(o))+'" target="_blank" rel="noopener">Send on WhatsApp</a>':'')+'<button class="btn btn-line btn-sm" data-act="copyorder" data-oid="'+esc(o.id)+'">Copy order details</button>'+(S.dl?'<button class="btn btn-line btn-sm" data-act="receipt" data-oid="'+esc(o.id)+'">Save receipt</button>':'')+(x.saved?'<a class="btn btn-red btn-sm" href="#orders">Track my orders</a>':(SITE?'':'<a class="btn btn-red btn-sm" href="#cart">Back to cart</a>'))+'<a class="btn btn-line btn-sm" href="#shop">Keep shopping</a></div></div></div>';
  return h;
}
function orderBody(o,adm){
  var steps=STAT.slice(0,4),idx=steps.indexOf(o.status),x=o.status==='cancelled';
  var h='<div class="hd"><span class="id">'+esc(o.id)+'</span><span class="pill s-'+esc(o.status)+'">'+esc(STATL[o.status]||o.status)+'</span><span class="muted" style="font-size:13px">'+esc(when(o.ts))+'</span></div>';
  h+='<div class="steps'+(x?' x':'')+'" aria-hidden="true">'+steps.map(function(s,i){return '<i class="'+((x?i===0:i<=idx)?'on':'')+'"></i>';}).join('')+'</div>';
  h+='<ul>'+o.items.map(function(i){return '<li><span>'+i.q+' × '+esc(i.name)+(optsText(i.opts)?' <span class="muted">('+esc(optsText(i.opts))+')</span>':'')+'</span><span class="num">'+money(i.price*i.q,o.cur)+'</span></li>';}).join('')+'<li><span class="muted">Delivery</span><span class="num">'+(o.ship===0?'Free':money(o.ship,o.cur))+'</span></li></ul>';
  var c=o.cust||{};
  h+='<div class="meta"><div><b>Deliver to</b>'+esc(c.name)+'<br>'+esc(c.addr)+', '+esc(c.city)+'</div><div><b>Contact</b>'+esc(c.phone)+(c.email?'<br>'+esc(c.email):'')+'</div><div><b>Payment</b>'+(o.pay==='transfer'?'Bank or mobile transfer':'Pay on delivery')+'</div>'+(c.note?'<div><b>Note</b>'+esc(c.note)+'</div>':'')+'</div>';
  h+='<div class="ft">'+(adm?'':'')+'<span class="tot num">'+money(o.total,o.cur)+'</span></div>';
  return h;
}
function ordersView(){
  var h='<div class="page"><h1>My orders</h1>';
  if(!S.uid||!S.db)return h+'<div class="note">Orders are kept for signed-in visitors. Sign in to Claude to see the orders you place here.</div></div>';
  var a=Object.keys(S.mine).map(function(k){return S.mine[k];}).filter(function(o){return o&&o.items;}).sort(function(x,y){return y.ts-x.ts;});
  if(!a.length)return h+'<div class="empty"><b>No orders yet</b><a class="btn btn-red" href="#shop">Browse the shop</a></div></div>';
  h+='<div class="olist">'+a.map(function(o){return '<div class="ord">'+orderBody(o,false)+'<div class="ft">'+(o.status==='placed'?'<button class="btn btn-danger btn-sm'+(S.armC===o.id?' armed':'')+'" data-act="cancelmine" data-oid="'+esc(o.id)+'">'+(S.armC===o.id?'Confirm cancel':'Cancel order')+'</button>':'')+'<button class="btn btn-line btn-sm" data-act="copyorder" data-oid="'+esc(o.id)+'">Copy details</button>'+(S.dl?'<button class="btn btn-line btn-sm" data-act="receipt" data-oid="'+esc(o.id)+'">Save receipt</button>':'')+'</div></div>';}).join('')+'</div></div>';
  return h;
}

/* admin dashboard */
function adminView(){
  if(!admin())return '<div class="page"><div class="empty"><b>Admin mode is off</b>'+(S.canAdmin?'Switch it on with the Admin mode button at the top.':'Only the shop owner and editors can open this page.')+'</div></div>';
  var all=S.all.map(function(x){return x.o;}),open=all.filter(function(o){return o.status==='placed'||o.status==='confirmed'||o.status==='shipped';}).length;
  var val=all.filter(function(o){return o.status!=='cancelled';}).reduce(function(n,o){return n+(Number(o.total)||0);},0);
  var P=Object.keys(S.products),low=P.filter(function(i){return (Number(S.products[i].stock)||0)<=5;}).length;
  var h='<div class="page"><h1>Dashboard</h1><div class="tiles"><div class="tile"><b>'+open+'</b><span>Open orders</span></div><div class="tile"><b>'+all.length+'</b><span>All orders</span></div><div class="tile"><b class="num">'+money(val)+'</b><span>Order value, not cancelled</span></div><div class="tile"><b>'+P.length+'</b><span>Products</span></div><div class="tile"><b>'+low+'</b><span>Low or sold out</span></div></div>';
  h+='<div class="tabs">'+['orders','products','settings'].map(function(t){return '<button class="chip" data-act="tab" data-t="'+t+'" aria-pressed="'+(S.atab===t)+'">'+t.charAt(0).toUpperCase()+t.slice(1)+'</button>';}).join('');
  if(S.atab==='orders')h+='<span class="sp"></span><button class="btn btn-line btn-sm" data-act="csv">Export CSV</button>';
  if(S.atab==='products')h+='<span class="sp"></span><button class="btn btn-gold btn-sm" data-act="new">+ New product</button>';
  h+='</div>';
  if(S.atab==='orders')h+=adminOrders();else if(S.atab==='products')h+=adminProducts();else h+=adminSettings();
  return h+'</div>';
}
function orderCard(x){var o=x.o,fl=orderFlags(o);
  return '<div class="ord">'+orderBody(o,true)+(fl.length?'<div class="note warn flag"><b>Check this order.</b> '+fl.map(esc).join('. ')+'.</div>':'')+'<div class="ft"><label class="fld" style="display:flex;align-items:center;gap:8px;text-transform:none;letter-spacing:0">Status <select data-act="status" data-uid="'+esc(x.uid)+'" data-oid="'+esc(o.id)+'" aria-label="Order status">'+STAT.map(function(s){return '<option value="'+s+'"'+(o.status===s?' selected':'')+'>'+STATL[s]+'</option>';}).join('')+'</select></label><button class="btn btn-line btn-sm" data-act="copyorder" data-oid="'+esc(o.id)+'">Copy details</button></div></div>';}
function orderListHTML(){
  var q=S.oq.trim().toLowerCase();
  var a=S.all.filter(function(x){var o=x.o,c=o.cust||{};
    if(S.ofilter!=='all'&&o.status!==S.ofilter)return false;
    return !q||(o.id+' '+c.name+' '+c.phone+' '+c.city).toLowerCase().indexOf(q)>=0;});
  if(!a.length)return '<div class="empty"><b>No orders here</b>'+(S.all.length?'Try another search or status.':'New orders appear as soon as a customer places one.')+'</div>';
  return '<div class="olist">'+a.map(orderCard).join('')+'</div>';
}
function adminOrders(){
  var h='<div class="chips">'+['all'].concat(STAT).map(function(s){var n=s==='all'?S.all.length:S.all.filter(function(x){return x.o.status===s;}).length;return '<button class="chip" data-act="of" data-s="'+s+'" aria-pressed="'+(S.ofilter===s)+'">'+(s==='all'?'All':STATL[s])+' <small>'+n+'</small></button>';}).join('')+'</div>';
  h+='<div class="toolbar"><div class="search">'+icon('search')+'<input id="oq" type="text" placeholder="Search by order number, name, phone or city" aria-label="Search orders" value="'+esc(S.oq)+'"></div></div>';
  return h+'<div id="olistwrap">'+orderListHTML()+'</div>';
}
function adminProducts(){
  var P=Object.keys(S.products).sort(function(a,b){return (S.products[b].ts||0)-(S.products[a].ts||0);});
  if(!P.length)return '<div class="empty"><b>No products yet</b>Press "New product" to add the first one.</div>';
  return '<div class="tbl"><table><thead><tr><th></th><th>Product</th><th>Price</th><th>Stock</th><th>Status</th><th></th></tr></thead><tbody>'+P.map(function(id){var p=S.products[id];
    return '<tr><td><div class="th-art">'+art(p)+'</div></td><td><b>'+esc(p.name)+'</b><div class="muted" style="font-size:12px">'+esc(p.cat||'')+'</div></td><td><input type="number" min="0" step="0.01" value="'+(Number(p.price)||0)+'" data-fld="price" data-id="'+id+'" aria-label="Price"></td><td><input type="number" min="0" step="1" value="'+(Number(p.stock)||0)+'" data-fld="stock" data-id="'+id+'" aria-label="Stock"></td><td>'+(p.active===false?'<span class="pill s-cancelled">Hidden</span>':'<span class="pill s-confirmed">Visible</span>')+'</td><td><div class="acts"><button class="btn btn-line btn-sm" data-act="edit" data-id="'+id+'">Edit</button><button class="btn btn-line btn-sm" data-act="toggle" data-id="'+id+'">'+(p.active===false?'Show':'Hide')+'</button><button class="btn btn-danger btn-sm'+(S.delArm===id?' armed':'')+'" data-act="del" data-id="'+id+'">'+(S.delArm===id?'Confirm':'Delete')+'</button></div></td></tr>';}).join('')+'</tbody></table></div>';
}
function adminSettings(){var s=S.settings;
  function f(id,l,v,t,h){return '<label class="fld" for="st-'+id+'">'+l+'<input id="st-'+id+'" type="'+(t||'text')+'" value="'+esc(v)+'">'+(h?'<span class="hint">'+h+'</span>':'')+'</label>';}
  return '<div class="form" style="max-width:640px">'+f('name','Shop name',s.name)+'<div class="g2">'+f('cur','Currency symbol',s.cur,'text','Shown before every price.')+f('ship','Delivery fee',s.ship,'number')+'</div>'+f('free','Free delivery from (0 for never)',s.free,'number')+f('banner','Top banner text',s.banner,'text','Leave empty to use the free delivery message.')+f('contact','Contact line',s.contact,'text','For example a phone or WhatsApp number. Shown in the footer and when an order cannot be saved.')+f('wa','WhatsApp number',s.wa,'text','Digits with country code and no plus sign. Customers use it to send an order when this page cannot save it.')+f('note','Delivery note',s.note)+f('pay','Payment note',s.pay)+'<div><button class="btn btn-red" data-act="savesettings">Save settings</button></div></div>';
}

function main(){
  var v=S.route.v;
  if(v==='product')return productView();
  if(v==='cart')return cartView();
  if(v==='checkout')return checkoutView();
  if(v==='orders')return ordersView();
  if(v==='thanks')return thanksView();
  if(v==='admin')return adminView();
  return shopView();
}
var app=$('#app');
function render(){app.innerHTML=header()+'<main id="main">'+main()+'</main>'+footer();updateFab();}
var pend=false;
function soft(){if(pend)return;pend=true;requestAnimationFrame(function(){pend=false;var a=document.activeElement;
  if(a&&app.contains(a)&&/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)&&S.route.v!=='shop')return;
  if(a&&a.id==='q'){var g=$('#gridwrap');if(g)g.innerHTML=gridHTML();return;}
  render();});}
function updateBadge(){var b=$('#badge');if(b)b.textContent=cartCount();updateFab();}
function updateFab(){var f=$('#fab'),n=cartCount(),r=S.route.v;
  if(n>0&&r!=='cart'&&r!=='checkout'&&r!=='thanks'){f.hidden=false;f.textContent='Cart · '+n+' · '+money(totals(lines()).total);}else f.hidden=true;}
var tt,toastEl=$('#toast');
function toast(m){toastEl.textContent=m;toastEl.classList.add('show');clearTimeout(tt);tt=setTimeout(function(){toastEl.classList.remove('show');},2400);}
function copyText(t){var done=function(){toast('Copied');};
  var fb=function(){$('#cpTxt').value=t;var d=$('#cpDlg');if(d.showModal)d.showModal();else d.setAttribute('open','');setTimeout(function(){$('#cpTxt').select();},30);};
  if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(t).then(done,fb);}else fb();}
$('#cpClose').addEventListener('click',function(){$('#cpDlg').close();});

/* ---------- routing ---------- */
function parse(){var h=(location.hash||'').replace('#','');var r={v:'shop',cat:'all',id:''},m;
  if(!h||h==='shop')return r;
  if((m=h.match(/^cat-(.+)$/))){r.cat=m[1];return r;}
  if((m=h.match(/^p-(.+)$/))){r.v='product';r.id=m[1];return r;}
  if(['cart','checkout','orders','thanks','admin'].indexOf(h)>=0){r.v=h;return r;}
  return r;}
function route(){S.route=parse();S.sel=null;window.scrollTo(0,0);render();}
window.addEventListener('hashchange',route);

/* ---------- data ---------- */
/* Saved copy of the catalogue, shown when the live shop cannot be reached (for example to signed-out visitors). */
var FALLBACK=window.SHOP_DATA||{products:{},settings:{}};
var SITE=!!window.SHOP_DATA;
function useFallback(){S.products=FALLBACK.products;S.settings=Object.assign({},DEF,FALLBACK.settings);S.loaded=true;S.offline=true;S.dbState='offline';render();}
function subscribe(){
  var db=S.db;
  db.collection('products').onSnapshot(function(snap){var m={};snap.docs.forEach(function(d){m[d.id]=d.data();});S.products=m;S.loaded=true;S.offline=false;S.dbState='ok';soft();},function(){if(!S.loaded)useFallback();});
  db.doc('settings/main').onSnapshot(function(s){S.settings=Object.assign({},DEF,s.exists?s.data():{});soft();},function(){});
  if(S.uid){db.doc('orders/'+S.uid).onSnapshot(function(s){S.mine=s.exists?(s.data().orders||{}):{};soft();},function(){});}
  if(S.canAdmin){db.collection('orders').onSnapshot(function(snap){var a=[];snap.docs.forEach(function(d){var o=d.data().orders||{};Object.keys(o).forEach(function(k){if(o[k]&&o[k].items)a.push({uid:d.id,o:o[k]});});});a.sort(function(x,y){return y.o.ts-x.o.ts;});S.all=a;soft();},function(){});}
}
async function boot(){
  render();
  setTimeout(function(){if(!S.loaded&&S.dbState==='loading'){S.slow=true;render();}},10000);
  var cl=window.claude;
  if(!cl||!cl.use){useFallback();return;}
  try{
    var r=await Promise.all([cl.use('db'),cl.use('user'),cl.use('assets'),cl.use('downloads')]);
    S.db=r[0];S.assets=r[2];S.dl=r[3];var user=r[1];
    if(!S.db){useFallback();return;}
    if(user){try{S.canAdmin=!!(await user.canEdit());}catch(e){}try{S.uid=await user.id();}catch(e){}}
    subscribe();render();
  }catch(e){useFallback();}
}

/* ---------- admin actions ---------- */
function need(){if(!S.db){toast('Not connected. Open the page signed in to Claude.');return false;}return true;}
async function setActive(id){if(!need())return;var p=prod(id);try{await S.db.doc('products/'+id).update({active:p.active===false,ts:p.ts||Date.now()});}catch(e){toast(dbErr(e));}}
async function delProduct(id){if(!need())return;try{await S.db.doc('products/'+id).delete();S.delArm='';toast('Product deleted');}catch(e){toast(dbErr(e));}}
async function applyStock(o,dir){for(var i=0;i<o.items.length;i++){var it=o.items[i],p=prod(it.pid);if(!p)continue;var n=Math.max(0,(Number(p.stock)||0)-dir*it.q);await S.db.doc('products/'+it.pid).update({stock:n});p.stock=n;}}
async function setStatus(uid,oid,status){
  if(!need())return;var x=S.all.filter(function(y){return y.o.id===oid&&y.uid===uid;})[0];if(!x)return;var o=x.o;
  var patch={status:status,upd:Date.now()};
  try{
    if(['confirmed','shipped','delivered'].indexOf(status)>=0&&!o.stockDone){
      var short=o.items.filter(function(i){var p=prod(i.pid);return p&&(Number(p.stock)||0)<i.q;})[0];
      if(short){toast('Not enough stock for '+short.name+'. Update the stock first.');render();return;}
      await applyStock(o,1);patch.stockDone=true;}
    if(status==='cancelled'&&o.stockDone){await applyStock(o,-1);patch.stockDone=false;}
    var m={};m[oid]=patch;await S.db.doc('orders/'+uid).update({orders:m});toast('Order '+STATL[status].toLowerCase());
  }catch(e){toast(dbErr(e));soft();}
}
async function cancelMine(oid){
  if(!need()||!S.uid)return;var o=S.mine[oid];
  if(!o||o.status!=='placed'){toast('The shop has already started this order. Please phone the shop to cancel it.');S.armC='';render();return;}
  var m={};m[oid]={status:'cancelled',upd:Date.now()};
  try{await S.db.doc('orders/'+S.uid).update({orders:m});S.armC='';toast('Order cancelled');}catch(e){toast(dbErr(e));}
}
async function saveReceipt(oid){
  var o=findOrder(oid);if(!o||!S.dl){toast('Saving files is not available here');return;}
  try{await S.dl.save({filename:'china-town-'+o.id+'.txt',data:orderText(o)});toast('Receipt saved');}catch(e){if(!e||e.code!=='declined')toast('Could not save the file');}
}
async function saveSettings(){
  if(!need())return;var g=function(i){return $('#st-'+i).value.trim();};
  var d={name:g('name')||DEF.name,cur:g('cur')||'$',ship:Math.max(0,parseFloat(g('ship'))||0),free:Math.max(0,parseFloat(g('free'))||0),banner:g('banner'),contact:g('contact'),wa:g('wa').replace(/\D/g,''),note:g('note'),pay:g('pay')};
  try{await S.db.doc('settings/main').set(d);toast('Settings saved');}catch(e){toast(dbErr(e));}
}
function csvCell(v){v=String(v==null?'':v);return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v;}
async function exportCsv(){
  if(!S.dl){toast('Saving files is not available here');return;}
  if(!S.all.length){toast('No orders to export');return;}
  var rows=[['Order','Date','Status','Name','Phone','Email','Address','City','Items','Delivery','Total','Payment','Note']];
  S.all.forEach(function(x){var o=x.o,c=o.cust||{};rows.push([o.id,new Date(o.ts).toISOString(),o.status,c.name,c.phone,c.email,c.addr,c.city,o.items.map(function(i){return i.q+' x '+i.name+(optsText(i.opts)?' ('+optsText(i.opts)+')':'');}).join('; '),o.ship,o.total,o.pay,c.note]);});
  try{await S.dl.save({filename:'china-town-orders.csv',data:rows.map(function(r){return r.map(csvCell).join(',');}).join('\n')});toast('File saved');}catch(e){if(!e||e.code!=='declined')toast('Could not save the file');}
}

/* product editor */
var edBlob=null,edRemove=false;
function fmtSpecs(a){return (a||[]).map(function(s){return s.k+': '+s.v;}).join('\n');}
function fmtOpts(a){return (a||[]).map(function(o){return o.n+': '+(o.v||[]).join(', ');}).join('\n');}
function openEditor(id){
  var p=id?prod(id):{name:'',cat:'Tea',price:10,was:0,stock:10,tag:'',desc:'',specs:[],options:[],glyph:'tin',hue:'#c0201b',active:true,img:''};
  if(!p)return;S.editId=id||'';edBlob=null;edRemove=false;
  var cs=cats().map(function(c){return c.n;});CATORDER.forEach(function(c){if(cs.indexOf(c)<0)cs.push(c);});
  var d=$('#edDlg');
  d.innerHTML='<form id="edForm"><h2>'+(id?'Edit product':'New product')+'</h2>'+
  '<label class="fld" for="ed-name">Name<input id="ed-name" type="text" maxlength="70" value="'+esc(p.name)+'" required></label>'+
  '<div class="form g2" style="padding:0;border:0;background:none"><label class="fld" for="ed-cat">Category<input id="ed-cat" type="text" list="ed-cats" maxlength="30" value="'+esc(p.cat)+'"></label><datalist id="ed-cats">'+cs.map(function(c){return '<option value="'+esc(c)+'">';}).join('')+'</datalist><label class="fld" for="ed-tag">Short line<input id="ed-tag" type="text" maxlength="70" value="'+esc(p.tag||'')+'"></label></div>'+
  '<div class="form g2" style="padding:0;border:0;background:none"><label class="fld" for="ed-price">Price<input id="ed-price" type="number" min="0" step="0.01" value="'+(Number(p.price)||0)+'"></label><label class="fld" for="ed-was">Old price (optional)<input id="ed-was" type="number" min="0" step="0.01" value="'+(Number(p.was)||0)+'"></label></div>'+
  '<div class="form g2" style="padding:0;border:0;background:none"><label class="fld" for="ed-stock">In stock<input id="ed-stock" type="number" min="0" step="1" value="'+(Number(p.stock)||0)+'"></label><label class="fld" for="ed-hue">Colour<input id="ed-hue" type="color" value="'+(/^#[0-9a-fA-F]{6}$/.test(p.hue||'')?p.hue:'#c0201b')+'" style="height:42px;padding:3px"></label></div>'+
  '<label class="fld" for="ed-desc">Description<textarea id="ed-desc" rows="4">'+esc(p.desc||'')+'</textarea></label>'+
  '<label class="fld" for="ed-specs">Specifications<textarea id="ed-specs" rows="5">'+esc(fmtSpecs(p.specs))+'</textarea><span class="hint">One per line, written as Label: value</span></label>'+
  '<label class="fld" for="ed-opts">Buying options (optional)<textarea id="ed-opts" rows="2">'+esc(fmtOpts(p.options))+'</textarea><span class="hint">One per line, written as Name: choice, choice. Example: Size: 20 cm, 25 cm</span></label>'+
  '<div class="form g2" style="padding:0;border:0;background:none"><label class="fld" for="ed-glyph">Picture style (used when there is no photo)<select id="ed-glyph" style="width:100%">'+GLYPHS.map(function(g){return '<option value="'+g+'"'+(p.glyph===g?' selected':'')+'>'+g+'</option>';}).join('')+'</select></label>'+
  (S.assets?'<label class="fld" for="ed-file">Photo<input id="ed-file" type="file" accept="image/*"><span class="hint" id="ed-fnote">'+(p.img?'A photo is set. Choose another to replace it.':'No photo yet.')+'</span></label>':'<div class="fld">Photo<span class="hint">Uploading photos needs Editor access.</span></div>')+'</div>'+
  (S.assets&&p.img?'<div class="checks"><label><input type="checkbox" id="ed-rmimg"> Remove the current photo</label></div>':'')+
  '<div class="checks"><label><input type="checkbox" id="ed-active"'+(p.active===false?'':' checked')+'> Visible in the shop</label></div>'+
  '<div class="ferr" id="ed-err" role="alert"></div><div class="row"><button type="button" class="btn btn-line" id="ed-cancel">Cancel</button><button type="submit" class="btn btn-red" id="ed-save">Save product</button></div></form>';
  if(d.showModal)d.showModal();else d.setAttribute('open','');
  $('#ed-cancel').addEventListener('click',function(){d.close();});
  var fi=$('#ed-file');if(fi)fi.addEventListener('change',function(){var f=fi.files&&fi.files[0];edBlob=null;if(!f)return;
    shrink(f).then(function(b){edBlob=b;$('#ed-fnote').textContent='Photo ready ('+Math.round(b.size/1024)+' KB). It uploads when you save.';},function(){$('#ed-fnote').textContent='That file could not be read as an image.';});});
  $('#edForm').addEventListener('submit',function(e){e.preventDefault();saveProduct();});
}
function shrink(file){return new Promise(function(res,rej){var im=new Image(),u=URL.createObjectURL(file);
  im.onload=function(){var s=Math.min(1,900/Math.max(im.width,im.height)),c=document.createElement('canvas');c.width=Math.max(1,Math.round(im.width*s));c.height=Math.max(1,Math.round(im.height*s));
    c.getContext('2d').drawImage(im,0,0,c.width,c.height);URL.revokeObjectURL(u);c.toBlob(function(b){b?res(b):rej(new Error('blob'));},'image/jpeg',.84);};
  im.onerror=function(){URL.revokeObjectURL(u);rej(new Error('img'));};im.src=u;});}
async function saveProduct(){
  var err=$('#ed-err'),btn=$('#ed-save');err.textContent='';
  if(!need())return;
  var name=$('#ed-name').value.trim(),price=parseFloat($('#ed-price').value);
  if(!name){err.textContent='Add a product name.';return;}
  if(!(price>=0)){err.textContent='Enter a price of zero or more.';return;}
  var id=S.editId,old=id?prod(id):null;
  if(!id){id=(slug(name).slice(0,28)||'item')+'-'+Math.random().toString(36).slice(2,5);}
  var specs=$('#ed-specs').value.split('\n').map(function(l){var i=l.indexOf(':');return i>0?{k:l.slice(0,i).trim(),v:l.slice(i+1).trim()}:null;}).filter(function(s){return s&&s.k&&s.v;});
  var options=$('#ed-opts').value.split('\n').map(function(l){var i=l.indexOf(':');if(i<=0)return null;var v=l.slice(i+1).split(',').map(function(x){return x.trim();}).filter(Boolean);return v.length?{n:l.slice(0,i).trim(),v:v}:null;}).filter(Boolean).slice(0,3);
  var img=old&&old.img?old.img:'';
  btn.disabled=true;btn.textContent='Saving';
  try{
    var rm=$('#ed-rmimg');if(rm&&rm.checked)img='';
    if(edBlob&&S.assets){var up=await S.assets.upload(edBlob,{type:'image/jpeg'});img=up.id;}
    var d={name:name,cat:$('#ed-cat').value.trim()||'Other',price:price,was:Math.max(0,parseFloat($('#ed-was').value)||0),stock:Math.max(0,Math.floor(parseFloat($('#ed-stock').value)||0)),tag:$('#ed-tag').value.trim(),desc:$('#ed-desc').value.trim(),specs:specs,options:options,glyph:$('#ed-glyph').value,hue:$('#ed-hue').value,img:img,active:$('#ed-active').checked,ts:(old&&old.ts)||Date.now()};
    await S.db.doc('products/'+id).set(d);
    $('#edDlg').close();toast(old?'Product saved':'Product added');
  }catch(e){err.textContent=(e&&e.code&&/too_large|quota|unsupported/.test(e.code))?'The photo could not be stored. Try a smaller image.':dbErr(e);btn.disabled=false;btn.textContent='Save product';}
}

/* ---------- orders ---------- */
function validate(){var f=S.form,e={};
  if(!f.name.trim())e.name=1;if(f.phone.replace(/\D/g,'').length<6)e.phone=1;if(!f.addr.trim())e.addr=1;if(!f.city.trim())e.city=1;
  if(f.email.trim()&&!/^\S+@\S+\.\S+$/.test(f.email.trim()))e.email=1;
  S.formErr=e;return !Object.keys(e).length;}
async function place(){
  if(S.placing)return;
  var L=lines();if(!L.length||L.some(function(l){return !l.ok;})){toast('Check your cart first');return;}
  if(!validate()){render();toast('Check the highlighted fields');var b=$('.form label.bad input');if(b)b.focus();return;}
  var T=totals(L),f=S.form,id='CT-'+Math.random().toString(36).slice(2,8).toUpperCase();
  var order={id:id,ts:Date.now(),status:'placed',cur:S.settings.cur,items:L.map(function(l){return {pid:l.id,name:l.p.name,opts:l.opts,q:l.q,price:Number(l.p.price)||0};}),sub:T.sub,ship:T.ship,total:T.total,pay:f.pay,stockDone:false,
    cust:{name:f.name.trim(),phone:f.phone.trim(),email:f.email.trim(),addr:f.addr.trim(),city:f.city.trim(),note:f.note.trim()}};
  S.placing=true;render();
  var saved=false;
  if(S.db&&S.uid){var ref=S.db.doc('orders/'+S.uid),m={};m[id]=order;
    try{await ref.update({orders:m});saved=true;}catch(e1){try{await ref.set({uid:S.uid,orders:m});saved=true;}catch(e2){saved=false;}}}
  S.placing=false;S.last={order:order,saved:saved};
  if(saved||SITE){S.cart=[];saveCart();}
  if(location.hash==='#thanks'){route();}else{location.hash='thanks';}
}

/* ---------- events ---------- */
document.addEventListener('click',function(e){
  var t=e.target.closest('[data-act]');if(!t)return;var a=t.getAttribute('data-act'),id=t.getAttribute('data-id');
  if(a==='add'){addToCart(id,defaultOpts(prod(id)),1);return;}
  if(a==='view'){location.hash='p-'+id;return;}
  if(a==='wish'){if(S.wish[id])delete S.wish[id];else S.wish[id]=1;ls.set('ct-wish',S.wish);render();return;}
  if(a==='opt'){S.sel.opts[t.getAttribute('data-n')]=t.getAttribute('data-v');render();return;}
  if(a==='pq'){var p=prod(S.sel.id),mx=Math.max(1,Number(p.stock)||1);S.sel.q=Math.min(mx,Math.max(1,S.sel.q+Number(t.getAttribute('data-d'))));var v=$('#pqv');if(v)v.textContent=S.sel.q;return;}
  if(a==='addp'){addToCart(S.sel.id,S.sel.opts,S.sel.q);return;}
  if(a==='buy'){addToCart(S.sel.id,S.sel.opts,S.sel.q);location.hash='checkout';return;}
  if(a==='cq'){var k=t.getAttribute('data-key'),it=S.cart.filter(function(i){return i.k===k;})[0];if(!it)return;var pp=prod(it.pid),mx2=pp?Number(pp.stock)||1:1;var n=it.q+Number(t.getAttribute('data-d'));if(n<1)n=1;if(n>mx2){n=mx2;toast('Only '+mx2+' in stock');}it.q=n;saveCart();render();return;}
  if(a==='rm'){var k2=t.getAttribute('data-key');S.cart=S.cart.filter(function(i){return i.k!==k2;});saveCart();render();return;}
  if(a==='place'){place();return;}
  if(a==='copyorder'){var o=findOrder(t.getAttribute('data-oid'));if(o)copyText(orderText(o));return;}
  if(a==='receipt'){saveReceipt(t.getAttribute('data-oid'));return;}
  if(a==='cancelmine'){var co=t.getAttribute('data-oid');if(S.armC===co){cancelMine(co);}else{S.armC=co;render();setTimeout(function(){if(S.armC===co){S.armC='';render();}},4000);}return;}
  if(a==='theme'){var r=document.documentElement,cur=r.getAttribute('data-theme');if(!cur)cur=(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches)?'dark':'light';var nx=cur==='dark'?'light':'dark';r.setAttribute('data-theme',nx);ls.set('ct-theme',nx);return;}
  if(a==='admin'){S.adminOn=!S.adminOn;ls.set('ct-admin',S.adminOn);if(!S.adminOn&&S.route.v==='admin')location.hash='shop';render();toast(S.adminOn?'Admin mode on':'Admin mode off');return;}
  if(a==='new'){openEditor('');return;}
  if(a==='edit'){openEditor(id);return;}
  if(a==='toggle'){setActive(id);return;}
  if(a==='del'){if(S.delArm===id){delProduct(id);}else{S.delArm=id;render();setTimeout(function(){if(S.delArm===id){S.delArm='';render();}},4000);}return;}
  if(a==='tab'){S.atab=t.getAttribute('data-t');render();return;}
  if(a==='of'){S.ofilter=t.getAttribute('data-s');render();return;}
  if(a==='savesettings'){saveSettings();return;}
  if(a==='csv'){exportCsv();return;}
});
document.addEventListener('input',function(e){var t=e.target;
  if(t.id==='q'){S.q=t.value;var g=$('#gridwrap');if(g)g.innerHTML=gridHTML();return;}
  if(t.id==='oq'){S.oq=t.value;var w=$('#olistwrap');if(w)w.innerHTML=orderListHTML();return;}
  var f=t.getAttribute&&t.getAttribute('data-f');
  if(f&&f!=='pay'){S.form[f]=t.value;ls.set('ct-form',S.form);if(S.formErr[f]){delete S.formErr[f];var l=t.closest('label');if(l)l.classList.remove('bad');}}
});
document.addEventListener('change',function(e){var t=e.target;
  if(t.id==='sort'){S.sort=t.value;var g=$('#gridwrap');if(g)g.innerHTML=gridHTML();return;}
  if(t.getAttribute('data-f')==='pay'){S.form.pay=t.value;ls.set('ct-form',S.form);return;}
  if(t.getAttribute('data-act')==='status'){setStatus(t.getAttribute('data-uid'),t.getAttribute('data-oid'),t.value);return;}
  var fld=t.getAttribute('data-fld');
  if(fld&&need()){var id=t.getAttribute('data-id'),v=Math.max(0,parseFloat(t.value)||0);if(fld==='stock')v=Math.floor(v);var u={};u[fld]=v;
    S.db.doc('products/'+id).update(u).then(function(){toast('Updated');},function(er){toast(dbErr(er));soft();});}
});

/* init */
var th=ls.get('ct-theme','');if(th==='light'||th==='dark')document.documentElement.setAttribute('data-theme',th);
S.route=parse();
boot();
})();
