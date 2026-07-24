var _gcDlg;
function openModal(id){_gcDlg=id;apex.theme.openRegion(id);}
function closeModal(){if(_gcDlg)apex.theme.closeRegion(_gcDlg);}
function ajaxGen(action,data,cb){
 apex.server.process('AJAX',{x01:action,x02:JSON.stringify(data)},{dataType:'json',
  success:function(r){if(r.ok){if(r.msg)apex.message.showPageSuccess(r.msg);if(cb)cb(r);}
                      else apex.message.alert(r.msg||'Error');},
  error:function(x){
    // antes decia solo "Error de red o sesion" y no se sabia que hacer.
    // Lo tipico es que la sesion APEX caduque con la pestana abierta -> se ofrece recargar.
    var s=(x&&x.status)||0;
    if(s===0||s===401||s===403||s===302){
      apex.message.confirm('Tu sesion expiro o se perdio la conexion. Recargar la pagina para volver a entrar?',
        function(ok){if(ok)location.reload();});
    } else {
      apex.message.alert('Error del servidor ('+s+'). Si se repite, avisa a soporte.');
    }}});
}
function escE(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
var LMAP=null, MK={}, AVA={}, TRAIL=null, WATCH=null, TIMER=null, SEL=null, PERFIL=null;
var CIRCLES={}, REGLAS=[], PICKING=false, PICK=null, USUS=[];
function cargarLeaflet(cb){
  if(window.L){cb();return;}
  var css=document.createElement('link');css.rel='stylesheet';
  css.href='https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';document.head.appendChild(css);
  var hadAmd=(typeof window.define==='function'&&window.define.amd);
  if(hadAmd){window.define.amd=false;}
  var s=document.createElement('script');s.src='https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
  s.onload=function(){if(hadAmd){window.define.amd=hadAmd;}cb();};
  s.onerror=function(){apex.message.alert('No se pudo cargar el mapa (CDN)');};
  document.head.appendChild(s);
}
function initMon(){
  var host=document.getElementById('monHost');
  host.innerHTML='<div style="display:flex;gap:12px;flex-wrap:wrap">'
   +'<div style="flex:1;min-width:280px">'
   +'<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px;align-items:center">'
   +'<button type="button" id="btnShare" class="t-Button t-Button--hot" onclick="toggleShare()"><span class="fa fa-location-arrow"></span> Compartir mi ubicacion</button>'
   +'<button type="button" class="t-Button" onclick="abrirAvatar()"><span class="fa fa-user-circle"></span> Mi avatar</button>'
   +'<button type="button" class="t-Button" onclick="abrirReglas()"><span class="fa fa-bell"></span> Alertas</button>'
   +'<span id="pickHint" style="font-size:12px;color:#b45309;display:none"><span class="fa fa-crosshairs"></span> Haz clic en el mapa para ubicar la zona</span>'
   +'<span id="shareState" style="font-size:12px;color:#6b7280"></span></div>'
   +'<div id="leafmon" style="height:60vh;min-height:380px;width:100%;border-radius:10px;overflow:hidden;border:1px solid #e5e7eb"></div></div>'
   +'<div style="width:260px;flex-shrink:0"><div style="font-weight:700;margin-bottom:6px">Activos ahora</div>'
   +'<div id="listaMon" style="display:flex;flex-direction:column;gap:6px"></div>'
   +'<div style="font-weight:700;margin:12px 0 6px">Alertas recientes</div>'
   +'<div id="feedAlertas" style="display:flex;flex-direction:column;gap:5px;max-height:240px;overflow-y:auto"></div></div></div>';
  cargarLeaflet(function(){
    LMAP=L.map('leafmon').setView([-16.5,-68.15],12);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap'}).addTo(LMAP);
    LMAP.on('click', function(e){ if(PICKING){ PICK=e.latlng; marcarPick(); } });
    setTimeout(function(){LMAP.invalidateSize();},300);
    if(PERFIL && PERFIL.puede_monitorear=='S'){ cargarReglas(); cargarAlertas(); }
    refrescar();
    TIMER=setInterval(function(){ refrescar(); cargarAlertas(); },8000);
  });
}
// dibuja los circulos de las reglas de geocerca en el mapa
function pintarCirculos(){
  Object.keys(CIRCLES).forEach(function(k){ LMAP.removeLayer(CIRCLES[k]); }); CIRCLES={};
  REGLAS.forEach(function(r){
    if((r.tipo=='LLEGADA'||r.tipo=='SALIDA') && r.lat!=null && r.activo=='S'){
      var col=r.tipo=='LLEGADA'?'#16a34a':'#e11d48';
      var c=L.circle([r.lat,r.lng],{radius:r.radio,color:col,weight:2,fillOpacity:.08}).addTo(LMAP);
      c.bindTooltip(r.nombre+' ('+r.tipo.toLowerCase()+')');
      CIRCLES[r.codigo]=c;
    }
  });
}
var PICKMK=null;
function marcarPick(){
  if(PICKMK){ LMAP.removeLayer(PICKMK); }
  if(PICK){ PICKMK=L.marker([PICK.lat,PICK.lng]).addTo(LMAP);
    var e=document.getElementById('rgCoord'); if(e) e.textContent='Zona: '+PICK.lat.toFixed(5)+', '+PICK.lng.toFixed(5); }
}
// icono: avatar (imagen o inicial+color) con flecha de rumbo y badge de velocidad
function iconoUsu(u){
  var av = AVA[u.usu];
  var cara = av ? '<img src="'+av+'" style="width:100%;height:100%;object-fit:cover">'
                : '<span style="color:#fff;font-weight:700;font-size:15px">'+escE(u.inicial)+'</span>';
  var flecha = (u.rumbo!=null && u.vel_kmh>=1)
    ? '<div style="position:absolute;top:-9px;left:50%;transform:translateX(-50%) rotate('+u.rumbo+'deg);color:#111827;font-size:12px"><span class="fa fa-caret-up"></span></div>' : '';
  var badge = '<div style="position:absolute;bottom:-8px;left:50%;transform:translateX(-50%);background:#111827;color:#fff;font-size:9px;line-height:1;padding:2px 5px;border-radius:99px;white-space:nowrap">'+(u.vel_kmh||0)+' km/h</div>';
  var html='<div style="position:relative;width:40px;height:40px">'
    +'<div style="width:40px;height:40px;border-radius:50%;overflow:hidden;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;background:'+(u.color||'#4f46e5')+'">'+cara+'</div>'
    +flecha+badge+'</div>';
  return L.divIcon({className:'',html:html,iconSize:[40,40],iconAnchor:[20,20],popupAnchor:[0,-22]});
}
function popupUsu(u){
  var edad=u.antiguedad_seg;
  var visto=edad<60?'hace '+edad+'s':'hace '+Math.round(edad/60)+' min';
  return '<div style="min-width:170px"><b>'+escE(u.nombre)+'</b> <span style="color:#9ca3af">@'+escE(u.login)+'</span>'
    +'<div style="font-size:12px;color:#374151;margin-top:4px">Velocidad: <b>'+(u.vel_kmh||0)+' km/h</b>'
    +(u.bateria!=null?' &middot; Bateria '+u.bateria+'%':'')+'</div>'
    +'<div style="font-size:11px;color:#6b7280">Precision ~'+(u.precision||'?')+' m &middot; '+u.hora+' ('+visto+')</div>'
    +'<div style="margin-top:6px"><button type="button" class="t-Button t-Button--small t-Button--hot" onclick="verRastro('+u.usu+')">Ver recorrido</button></div></div>';
}
function refrescar(){
  ajaxGen('ACTIVOS',{minutos:10},function(r){
    var d=r.data||[], vistos={};
    // asegura avatares en cache (una sola vez por usuario con foto)
    d.forEach(function(u){ if(u.avatar=='S' && !(u.usu in AVA)){ AVA[u.usu]=null;
      ajaxGen('AVATAR',{usu:u.usu},function(a){ if(a.data){AVA[u.usu]=a.data;} }); } });
    d.forEach(function(u){ vistos[u.usu]=1;
      var ll=[u.lat,u.lng];
      if(MK[u.usu]){ MK[u.usu].setLatLng(ll); MK[u.usu].setIcon(iconoUsu(u)); MK[u.usu]._u=u; }
      else { var m=L.marker(ll,{icon:iconoUsu(u)}).addTo(LMAP); m._u=u;
        m.bindPopup(popupUsu(u)); m.on('popupopen',function(){this.setPopupContent(popupUsu(this._u));});
        MK[u.usu]=m; }
    });
    Object.keys(MK).forEach(function(k){ if(!vistos[k]){ LMAP.removeLayer(MK[k]); delete MK[k]; } });
    pintarLista(d);
  });
}
function pintarLista(d){
  var h=document.getElementById('listaMon');
  if(!d.length){ h.innerHTML='<div style="color:#9ca3af;font-size:13px">Nadie compartiendo ahora.</div>'; return; }
  h.innerHTML=d.map(function(u){
    var av=AVA[u.usu];
    var cara=av?'<img src="'+av+'" style="width:100%;height:100%;object-fit:cover">'
               :'<span style="color:#fff;font-weight:700;font-size:12px">'+escE(u.inicial)+'</span>';
    return '<div onclick="centrar('+u.usu+')" style="display:flex;align-items:center;gap:8px;background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:6px 8px;cursor:pointer">'
     +'<div style="width:30px;height:30px;border-radius:50%;overflow:hidden;flex-shrink:0;display:flex;align-items:center;justify-content:center;background:'+(u.color||'#4f46e5')+'">'+cara+'</div>'
     +'<div style="min-width:0"><div style="font-weight:600;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+escE(u.nombre)+'</div>'
     +'<div style="font-size:11px;color:#6b7280">'+(u.vel_kmh||0)+' km/h &middot; '+u.hora+'</div></div></div>';
  }).join('');
}
function centrar(usu){ if(MK[usu]){ LMAP.setView(MK[usu].getLatLng(),16); MK[usu].openPopup(); } }
function verRastro(usu){
  ajaxGen('HISTORIAL',{usu:usu,puntos:40},function(r){
    if(TRAIL){ LMAP.removeLayer(TRAIL); TRAIL=null; }
    var pts=(r.data||[]); if(pts.length<2){ apex.message.showPageSuccess('Sin recorrido reciente'); return; }
    TRAIL=L.polyline(pts,{color:'#e11d48',weight:4,opacity:.7}).addTo(LMAP);
    LMAP.fitBounds(TRAIL.getBounds(),{padding:[40,40]});
  });
}
// --- compartir mi ubicacion ---
function toggleShare(){ if(WATCH!=null){ detener(); } else { iniciar(); } }
function iniciar(){
  if(!navigator.geolocation){ apex.message.alert('Tu navegador no soporta geolocalizacion'); return; }
  WATCH=navigator.geolocation.watchPosition(function(p){
    var c=p.coords, bat=null;
    reportar(c.latitude,c.longitude,c.accuracy,c.speed,c.heading);
  }, function(e){ apex.message.alert('No se pudo obtener tu ubicacion: '+e.message); detener(); },
  {enableHighAccuracy:true,maximumAge:5000,timeout:15000});
  document.getElementById('btnShare').innerHTML='<span class="fa fa-stop"></span> Dejar de compartir';
  document.getElementById('btnShare').classList.remove('t-Button--hot');
  document.getElementById('shareState').textContent='Compartiendo tu ubicacion...';
}
function reportar(lat,lng,prec,vel,rumbo){
  ajaxGen('REPORTAR',{lat:lat,lng:lng,precision:prec,velocidad:(vel==null?null:vel),rumbo:(rumbo==null||isNaN(rumbo)?null:rumbo)},function(){ refrescar(); });
}
function detener(){
  if(WATCH!=null){ navigator.geolocation.clearWatch(WATCH); WATCH=null; }
  ajaxGen('DETENER',{},function(){ refrescar(); });
  var b=document.getElementById('btnShare');
  if(b){ b.innerHTML='<span class="fa fa-location-arrow"></span> Compartir mi ubicacion'; b.classList.add('t-Button--hot'); }
  var st=document.getElementById('shareState'); if(st) st.textContent='';
}
// --- avatar propio ---
function abrirAvatar(){
  ajaxGen('MI_PERFIL',{},function(r){ PERFIL=r.data; pintarAvatar(); openModal('dlgAvatar'); });
}
function pintarAvatar(){
  var p=PERFIL||{};
  var cols=['#4f46e5','#16a34a','#e11d48','#f59e0b','#7048e8','#0891b2','#334155','#db2777'];
  var pal=cols.map(function(c){return '<button type="button" onclick="setColor(\''+c+'\')" style="width:26px;height:26px;border-radius:50%;border:'+((p.color==c)?'3px solid #111':'2px solid #fff')+';background:'+c+';cursor:pointer;box-shadow:0 1px 3px rgba(0,0,0,.3)"></button>';}).join('');
  var prev = p.avatar=='S'
    ? '<img id="avPrev" src="" style="width:80px;height:80px;border-radius:50%;object-fit:cover;border:2px solid #e5e7eb">'
    : '<div id="avPrev" style="width:80px;height:80px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:'+(p.color||'#4f46e5')+';color:#fff;font-size:30px;font-weight:700">'+escE(p.inicial)+'</div>';
  var h='<div style="max-width:420px"><div style="display:flex;gap:14px;align-items:center;margin-bottom:12px">'
   +prev+'<div><div style="font-weight:700">'+escE(p.nombre)+'</div>'
   +'<div style="font-size:12px;color:#6b7280">Tu foto identifica tu marcador en el mapa.</div></div></div>'
   +'<div style="margin-bottom:10px"><label style="font-size:12px;color:#6b7280;display:block;margin-bottom:4px">Color (si no hay foto)</label><div style="display:flex;gap:6px;flex-wrap:wrap">'+pal+'</div></div>'
   +'<div style="margin-bottom:12px"><label style="font-size:12px;color:#6b7280;display:block;margin-bottom:4px">Foto</label>'
   +'<input type="file" id="avFile" accept="image/*" onchange="subirAvatar()"></div>'
   +'<div style="border-top:1px solid #eee;padding-top:10px;display:flex;gap:8px">'
   +(p.avatar=='S'?'<button type="button" class="t-Button" onclick="quitarAvatar()"><span class="fa fa-trash-o"></span> Quitar foto</button>':'')
   +'<button type="button" class="t-Button" onclick="closeModal()">Cerrar</button></div></div>';
  document.getElementById('avatarHost').innerHTML=h;
  if(p.avatar=='S'){ ajaxGen('AVATAR',{usu:p.usu},function(a){ var i=document.getElementById('avPrev'); if(i&&a.data)i.src=a.data; }); }
}
function setColor(c){ ajaxGen('GUARDAR_COLOR',{color:c},function(){ PERFIL.color=c; AVA={}; pintarAvatar(); refrescar(); }); }
function subirAvatar(){
  var f=document.getElementById('avFile').files[0]; if(!f) return;
  if(f.size>1500000){ apex.message.alert('La imagen es muy grande (max ~1MB)'); return; }
  var rd=new FileReader();
  rd.onload=function(){ var b64=String(rd.result).split(',')[1];
    apex.server.process('AJAX',{x01:'SUBIR_AVATAR',x02:JSON.stringify({mime:f.type}),p_clob_01:b64},{dataType:'json',
     success:function(r){ if(r.ok){ delete AVA[PERFIL.usu]; PERFIL.avatar='S'; apex.message.showPageSuccess('Avatar actualizado'); pintarAvatar(); refrescar(); }
                          else apex.message.alert(r.msg||'Error'); },
     error:function(){ apex.message.alert('No se pudo subir la imagen'); }}); };
  rd.readAsDataURL(f);
}
function quitarAvatar(){ ajaxGen('QUITAR_AVATAR',{},function(){ delete AVA[PERFIL.usu]; PERFIL.avatar='N'; pintarAvatar(); refrescar(); }); }
// --- alertas y reglas ---
function icoAlerta(t){ return t=='VELOCIDAD'?'fa-tachometer':(t=='LLEGADA'?'fa-sign-in':'fa-sign-out'); }
function colAlerta(t){ return t=='VELOCIDAD'?'#b45309':(t=='LLEGADA'?'#16a34a':'#e11d48'); }
function cargarAlertas(){
  if(!(PERFIL && PERFIL.puede_monitorear=='S')) return;
  ajaxGen('ALERTAS',{n:30},function(r){ pintarFeed(r.data||[]); });
}
function pintarFeed(d){
  var h=document.getElementById('feedAlertas'); if(!h) return;
  if(!d.length){ h.innerHTML='<div style="color:#9ca3af;font-size:12px">Sin alertas.</div>'; return; }
  h.innerHTML=d.map(function(a){
    return '<div onclick="'+(a.lat!=null?'LMAP.setView(['+a.lat+','+a.lng+'],16)':'')+'" style="background:#fff;border:1px solid #e5e7eb;border-left:3px solid '+colAlerta(a.tipo)+';border-radius:8px;padding:6px 8px;'+(a.lat!=null?'cursor:pointer':'')+'">'
     +'<div style="font-size:12px;color:#111827"><span class="fa '+icoAlerta(a.tipo)+'" style="color:'+colAlerta(a.tipo)+'"></span> '+escE(a.detalle)+'</div>'
     +'<div style="font-size:10px;color:#9ca3af">'+a.hora+'</div></div>';
  }).join('');
}
function abrirReglas(){
  if(!(PERFIL && PERFIL.puede_monitorear=='S')){ apex.message.alert('Solo los monitores gestionan alertas'); return; }
  cargarReglas(function(){ pintarReglasDlg(); openModal('dlgReglas'); });
}
function cargarReglas(cb){
  ajaxGen('REGLAS',{},function(r){ REGLAS=r.data||[]; if(LMAP) pintarCirculos(); if(cb)cb(); });
}
function pintarReglasDlg(){
  var lista = REGLAS.length ? REGLAS.map(function(r){
      var desc = r.tipo=='VELOCIDAD' ? ('supera '+r.umbral+' km/h')
               : (r.tipo.toLowerCase()+' a "'+escE(r.nombre)+'" (radio '+r.radio+' m)');
      return '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:6px 10px;margin-bottom:5px">'
       +'<div><b>'+escE(r.nombre)+'</b> <span style="font-size:12px;color:#6b7280">- '+desc+(r.objetivo_nom?' - solo '+escE(r.objetivo_nom):'')+'</span>'
       +(r.activo!='S'?' <span style="font-size:10px;color:#9ca3af">(inactiva)</span>':'')+'</div>'
       +'<button type="button" class="t-Button t-Button--small t-Button--noLabel t-Button--icon" onclick="elimRegla('+r.codigo+')"><span class="t-Icon fa fa-trash-o"></span></button></div>';
    }).join('') : '<div style="color:#9ca3af;font-size:13px;margin-bottom:8px">No hay reglas todavia.</div>';
  var INP='width:100%;border:1px solid #d1d5db;border-radius:8px;padding:7px';
  var opu=USUS.map(function(u){return '<option value="'+u.usu+'">'+escE(u.nombre)+'</option>';}).join('');
  var h='<div style="max-width:520px">'+lista
   +'<div style="border-top:1px solid #eee;margin-top:8px;padding-top:10px"><div style="font-weight:700;margin-bottom:8px">Nueva regla</div>'
   +'<div style="margin-bottom:8px"><label style="font-size:12px;color:#6b7280">Nombre</label><input id="rgNom" style="'+INP+'" maxlength="120" placeholder="Ej: Exceso de velocidad / Llegada a la obra"></div>'
   +'<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px">'
   +'<div style="flex:1;min-width:150px"><label style="font-size:12px;color:#6b7280">Tipo</label>'
   +'<select id="rgTipo" style="'+INP+'" onchange="togReglaTipo()"><option value="VELOCIDAD">Supera velocidad</option><option value="LLEGADA">Llega a un lugar</option><option value="SALIDA">Sale de un lugar</option></select></div>'
   +'<div style="flex:1;min-width:150px"><label style="font-size:12px;color:#6b7280">Vigilar a</label>'
   +'<select id="rgObj" style="'+INP+'"><option value="">Todos</option>'+opu+'</select></div></div>'
   +'<div id="rgVelBox" style="margin-bottom:8px"><label style="font-size:12px;color:#6b7280">Umbral (km/h)</label><input type="number" id="rgUmbral" min="1" style="'+INP+'" value="60"></div>'
   +'<div id="rgZonaBox" style="display:none;margin-bottom:8px"><div style="display:flex;gap:8px;align-items:end;flex-wrap:wrap">'
   +'<div style="flex:1;min-width:120px"><label style="font-size:12px;color:#6b7280">Radio (m)</label><input type="number" id="rgRadio" min="10" style="'+INP+'" value="200"></div>'
   +'<button type="button" class="t-Button" onclick="togPick()"><span class="fa fa-crosshairs"></span> Marcar en el mapa</button></div>'
   +'<div id="rgCoord" style="font-size:12px;color:#6b7280;margin-top:4px">Zona: sin marcar</div></div>'
   +'<div style="display:flex;gap:8px;margin-top:6px"><button type="button" class="t-Button t-Button--hot" onclick="guardarRegla()"><span class="fa fa-check"></span> Crear regla</button>'
   +'<button type="button" class="t-Button" onclick="closeModal()">Cerrar</button></div></div></div>';
  document.getElementById('reglasHost').innerHTML=h;
  togReglaTipo();
}
function togReglaTipo(){
  var t=document.getElementById('rgTipo').value;
  document.getElementById('rgVelBox').style.display=(t=='VELOCIDAD')?'':'none';
  document.getElementById('rgZonaBox').style.display=(t=='VELOCIDAD')?'none':'';
}
function togPick(){ PICKING=!PICKING; document.getElementById('pickHint').style.display=PICKING?'':'none';
  if(PICKING){ apex.message.showPageSuccess('Haz clic en el mapa para ubicar la zona'); } }
function guardarRegla(){
  var t=document.getElementById('rgTipo').value;
  var d={codigo:null,nombre:document.getElementById('rgNom').value,tipo:t,activo:'S',
    objetivo:(document.getElementById('rgObj').value||null)};
  if(!d.nombre){ apex.message.alert('Ponle un nombre a la regla'); return; }
  if(t=='VELOCIDAD'){ d.umbral=+document.getElementById('rgUmbral').value||0; }
  else { if(!PICK){ apex.message.alert('Marca la zona en el mapa'); return; }
    d.lat=PICK.lat; d.lng=PICK.lng; d.radio=+document.getElementById('rgRadio').value||0; }
  ajaxGen('GUARDAR_REGLA',d,function(){ PICK=null; PICKING=false;
    if(PICKMK){LMAP.removeLayer(PICKMK);PICKMK=null;}
    document.getElementById('pickHint').style.display='none';
    cargarReglas(function(){ pintarReglasDlg(); }); });
}
function elimRegla(cod){ apex.message.confirm('Eliminar esta regla?',function(ok){ if(ok)
  ajaxGen('ELIMINAR_REGLA',{codigo:cod},function(){ cargarReglas(function(){ pintarReglasDlg(); }); }); }); }
apex.jQuery(function(){
  ajaxGen('MI_PERFIL',{},function(r){ PERFIL=r.data;
    if(PERFIL && PERFIL.puede_monitorear=='S'){
      ajaxGen('USUARIOS',{},function(u){ USUS=u.data||[]; });
      cargarAlertas();
    }
  });
  initMon();
});