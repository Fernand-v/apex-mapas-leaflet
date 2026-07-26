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
function ajaxClob(action,data,clob,cb){apex.server.process('AJAX',{x01:action,x02:JSON.stringify(data),p_clob_01:clob},{dataType:'json',
 success:function(r){if(r.ok){if(cb)cb(r);}else apex.message.alert(r.msg||'Error');},error:function(){apex.message.alert('Error al guardar');}});}
var LMAP=null, GESTION='N', PARADAS=[], MARK=[], LINEA=null, REAL=null, RUTAS=[], DIST=null, DUR=null, CODIGO=null;
var OSRM='https://router.project-osrm.org';
function cargarLib(url,test,cb){ if(test()){cb();return;}
 var hadAmd=(typeof window.define=='function' && window.define.amd); if(hadAmd)window.define.amd=false;
 var s=document.createElement('script'); s.src=url;
 s.onload=function(){ if(hadAmd)window.define.amd=hadAmd; cb(); };
 s.onerror=function(){ if(hadAmd)window.define.amd=hadAmd; apex.message.alert('No se pudo cargar una libreria (CDN)'); };
 document.head.appendChild(s); }
function css(h){ if(!document.querySelector('link[href="'+h+'"]')){var l=document.createElement('link');l.rel='stylesheet';l.href=h;document.head.appendChild(l);} }
function initMapa(){
 document.getElementById('rutHost').innerHTML='<div style="display:flex;gap:12px;flex-wrap:wrap">'
  +'<div style="flex:1;min-width:320px"><div id="leafrut" style="height:66vh;min-height:440px;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden"></div>'
  +'<div style="font-size:12px;color:#6b7280;margin-top:6px"><span class="fa fa-info-circle"></span> Haz clic en el mapa para agregar paradas.</div></div>'
  +'<div style="width:300px;flex-shrink:0;display:flex;flex-direction:column;gap:10px">'
  +'<div><div style="font-weight:700;margin-bottom:4px">Ruta actual</div><div id="rutInfo" style="font-size:13px;color:#6b7280;margin-bottom:6px">Sin paradas</div>'
  +'<div id="rutParadas" style="display:flex;flex-direction:column;gap:4px"></div></div>'
  +'<div style="display:flex;gap:6px;flex-wrap:wrap">'
  +'<button type="button" class="t-Button t-Button--hot t-Button--small" onclick="calcular()"><span class="fa fa-random"></span> Calcular ruta</button>'
  +'<button type="button" class="t-Button t-Button--small" onclick="optimizar()"><span class="fa fa-magic"></span> Optimizar</button>'
  +'<button type="button" class="t-Button t-Button--small" onclick="desdePortafolio()"><span class="fa fa-map-marker"></span> Portafolio</button>'
  +'<button type="button" class="t-Button t-Button--small" onclick="limpiar()"><span class="fa fa-eraser"></span> Limpiar</button></div>'
  +'<div style="display:flex;gap:6px;flex-wrap:wrap">'
  +'<button type="button" class="t-Button t-Button--small" onclick="abrirGoogle()"><span class="fa fa-external-link"></span> Google Maps</button>'
  +'<button type="button" class="t-Button t-Button--small" onclick="exportar()"><span class="fa fa-download"></span> Exportar</button>'
  +'<button type="button" class="t-Button t-Button--small" onclick="abrirReal()"><span class="fa fa-random"></span> vs recorrido real</button>'
  +'<button type="button" id="btnGuardar" class="t-Button t-Button--small" style="display:none" onclick="abrirGuardar()"><span class="fa fa-save"></span> Guardar</button></div>'
  +'<div><div style="font-weight:700;margin:6px 0 4px">Rutas guardadas</div><div id="rutLista" style="display:flex;flex-direction:column;gap:5px"></div></div>'
  +'</div></div>';
 css('https://unpkg.com/leaflet@1.9.4/dist/leaflet.css');
 cargarLib('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',function(){return !!window.L;},function(){
   cargarLib('https://unpkg.com/@turf/turf@6/turf.min.js',function(){return !!window.turf;},function(){
     LMAP=L.map('leafrut').setView([-16.5,-68.15],13);
     L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap'}).addTo(LMAP);
     setTimeout(function(){LMAP.invalidateSize();},300);
     LMAP.on('click',function(e){ agregarParada('Parada '+(PARADAS.length+1), e.latlng.lat, e.latlng.lng); });
     cargarRutas();
   });});}
function agregarParada(nom,lat,lng){ PARADAS.push({nombre:nom,lat:lat,lng:lng}); pintarParadas(); }
function pintarParadas(){
 MARK.forEach(function(m){LMAP.removeLayer(m);}); MARK=[];
 PARADAS.forEach(function(p,i){
   var ic=L.divIcon({className:'',html:'<div style="background:#2563eb;color:#fff;width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)">'+(i+1)+'</div>',iconSize:[24,24],iconAnchor:[12,12]});
   var m=L.marker([p.lat,p.lng],{icon:ic}).addTo(LMAP); MARK.push(m);});
 var h=document.getElementById('rutParadas');
 h.innerHTML=PARADAS.map(function(p,i){return '<div style="display:flex;align-items:center;gap:6px;background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:5px 8px">'
   +'<span style="width:20px;height:20px;border-radius:50%;background:#2563eb;color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0">'+(i+1)+'</span>'
   +'<input value="'+escE(p.nombre)+'" onchange="PARADAS['+i+'].nombre=this.value" style="flex:1;min-width:0;border:0;font-size:13px;background:none">'
   +'<button type="button" onclick="mover('+i+',-1)" style="background:none;border:0;cursor:pointer;color:#6b7280" title="Subir">&uarr;</button>'
   +'<button type="button" onclick="mover('+i+',1)" style="background:none;border:0;cursor:pointer;color:#6b7280" title="Bajar">&darr;</button>'
   +'<button type="button" onclick="quitar('+i+')" style="background:none;border:0;cursor:pointer;color:#b91c1c" title="Quitar">&times;</button></div>';}).join('');
 actualizarInfo();}
function mover(i,d){var j=i+d; if(j<0||j>=PARADAS.length)return; var t=PARADAS[i];PARADAS[i]=PARADAS[j];PARADAS[j]=t; pintarParadas();}
function quitar(i){PARADAS.splice(i,1); pintarParadas();}
function limpiar(){PARADAS=[];CODIGO=null;DIST=null;DUR=null; if(LINEA){LMAP.removeLayer(LINEA);LINEA=null;} if(REAL){LMAP.removeLayer(REAL);REAL=null;} pintarParadas();}
function actualizarInfo(){var el=document.getElementById('rutInfo');
 document.getElementById('btnGuardar').style.display=(GESTION=='S' && PARADAS.length>=2)?'':'none';
 if(!PARADAS.length){el.textContent='Sin paradas';return;}
 var t=PARADAS.length+' parada(s)';
 if(DIST!=null)t+=' &middot; '+(DIST/1000).toFixed(1)+' km';
 if(DUR!=null)t+=' &middot; '+Math.round(DUR/60)+' min';
 el.innerHTML=t;}
function coordsStr(){return PARADAS.map(function(p){return p.lng+','+p.lat;}).join(';');}
function dibujarLinea(coords){ if(LINEA)LMAP.removeLayer(LINEA);
 LINEA=L.polyline(coords.map(function(c){return [c[1],c[0]];}),{color:'#2563eb',weight:5,opacity:.8}).addTo(LMAP);
 try{LMAP.fitBounds(LINEA.getBounds(),{padding:[40,40]});}catch(e){}}
function calcular(){ if(PARADAS.length<2){apex.message.alert('Agrega al menos 2 paradas');return;}
 fetch(OSRM+'/route/v1/driving/'+coordsStr()+'?overview=full&geometries=geojson')
  .then(function(r){return r.json();})
  .then(function(j){ if(j.code=='Ok'&&j.routes&&j.routes.length){var rt=j.routes[0];
     DIST=rt.distance;DUR=rt.duration; window._geo={type:'Feature',properties:{},geometry:rt.geometry};
     dibujarLinea(rt.geometry.coordinates); actualizarInfo(); apex.message.showPageSuccess('Ruta calculada por calle');}
   else rectaFallback(); })
  .catch(function(){ rectaFallback(); });}
function rectaFallback(){
 var coords=PARADAS.map(function(p){return [p.lng,p.lat];});
 var line=turf.lineString(coords); DIST=turf.length(line,{units:'kilometers'})*1000; DUR=null;
 window._geo={type:'Feature',properties:{},geometry:line.geometry};
 dibujarLinea(coords); actualizarInfo(); apex.message.showPageSuccess('Ruta en linea recta (sin servicio de calles)');}
function optimizar(){ if(PARADAS.length<3){apex.message.alert('Se necesitan 3+ paradas para optimizar');return;}
 fetch(OSRM+'/trip/v1/driving/'+coordsStr()+'?source=first&roundtrip=false&overview=full&geometries=geojson')
  .then(function(r){return r.json();})
  .then(function(j){ if(j.code=='Ok'&&j.trips&&j.trips.length){
     var orden=j.waypoints.map(function(w,i){return {i:i,wi:w.waypoint_index};}).sort(function(a,b){return a.wi-b.wi;});
     PARADAS=orden.map(function(o){return PARADAS[o.i];});
     var rt=j.trips[0]; DIST=rt.distance;DUR=rt.duration; window._geo={type:'Feature',properties:{},geometry:rt.geometry};
     dibujarLinea(rt.geometry.coordinates); pintarParadas(); apex.message.showPageSuccess('Orden optimizado');}
   else apex.message.alert('No se pudo optimizar'); })
  .catch(function(){apex.message.alert('No se pudo optimizar (sin servicio)');});}
function abrirGoogle(){ if(PARADAS.length<2){apex.message.alert('Agrega paradas');return;}
 var o=PARADAS[0], d=PARADAS[PARADAS.length-1];
 var wp=PARADAS.slice(1,-1).map(function(p){return p.lat+','+p.lng;}).join('|');
 var u='https://www.google.com/maps/dir/?api=1&origin='+o.lat+','+o.lng+'&destination='+d.lat+','+d.lng
   +(wp?'&waypoints='+encodeURIComponent(wp):'')+'&travelmode=driving';
 window.open(u,'_blank');}
function exportar(){
 var feats=PARADAS.map(function(p,i){return {type:'Feature',properties:{orden:i+1,nombre:p.nombre},geometry:{type:'Point',coordinates:[p.lng,p.lat]}};});
 if(window._geo)feats.unshift({type:'Feature',properties:{tipo:'ruta',distancia_m:DIST,duracion_s:DUR},geometry:window._geo.geometry});
 var fc={type:'FeatureCollection',features:feats};
 var blob=new Blob([JSON.stringify(fc,null,2)],{type:'application/geo+json'});
 var a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='ruta.geojson';a.click();
 setTimeout(function(){URL.revokeObjectURL(a.href);},1000);}
function desdePortafolio(){ajaxGen('PORTAFOLIO',{},function(r){var d=r.data||[];
 if(!d.length){apex.message.alert('No hay ubicaciones en el portafolio (modulo de mapas).');return;}
 document.getElementById('portHost').innerHTML='<div style="max-width:420px"><p style="font-size:13px;color:#374151">Toca una ubicacion para agregarla como parada:</p>'
  +'<div style="max-height:50vh;overflow-y:auto">'+d.map(function(u,i){return '<div onclick="addPort('+i+')" style="padding:8px;border-bottom:1px solid #f1f5f9;cursor:pointer"><span class="fa fa-map-marker" style="color:#e11d48"></span> '+escE(u.nombre)+'</div>';}).join('')+'</div>'
  +'<div style="margin-top:10px"><button type="button" class="t-Button" onclick="closeModal()">Cerrar</button></div></div>';
 window._port=d; openModal('dlgPort');});}
function addPort(i){var u=window._port[i]; agregarParada(u.nombre,u.lat,u.lng);}
// comparar planificado vs recorrido real (pegar GeoJSON/lista de puntos)
function abrirReal(){document.getElementById('realHost').innerHTML='<div style="max-width:460px">'
  +'<p style="font-size:13px;color:#374151">Pega el recorrido REAL (GeoJSON LineString, o una lista de [lng,lat]). Se dibuja en rojo y se calcula el desvio maximo respecto a la ruta planificada.</p>'
  +'<textarea id="realTxt" rows="7" style="width:100%;border:1px solid #d1d5db;border-radius:8px;padding:8px;font-family:monospace;font-size:12px"></textarea>'
  +'<div style="margin-top:10px;display:flex;gap:8px"><button type="button" class="t-Button t-Button--hot" onclick="compararReal()">Comparar</button>'
  +'<button type="button" class="t-Button" onclick="closeModal()">Cerrar</button></div></div>';
 openModal('dlgReal');}
function compararReal(){var t=document.getElementById('realTxt').value; var coords;
 try{var o=JSON.parse(t);
   if(o.type=='Feature')coords=o.geometry.coordinates;
   else if(o.type=='LineString')coords=o.coordinates;
   else if(Array.isArray(o))coords=o;
   else if(o.type=='FeatureCollection')coords=o.features[0].geometry.coordinates;
 }catch(e){apex.message.alert('GeoJSON invalido');return;}
 if(!coords||coords.length<2){apex.message.alert('Recorrido invalido');return;}
 if(REAL)LMAP.removeLayer(REAL);
 REAL=L.polyline(coords.map(function(c){return [c[1],c[0]];}),{color:'#e11d48',weight:4,opacity:.8,dashArray:'6,6'}).addTo(LMAP);
 var desvio=0;
 if(window._geo){var ln=turf.lineString(window._geo.geometry.coordinates);
   coords.forEach(function(c){try{var d=turf.pointToLineDistance(turf.point(c),ln,{units:'meters'}); if(d>desvio)desvio=d;}catch(e){}});}
 closeModal();
 apex.message.showPageSuccess('Recorrido real dibujado. Desvio maximo: '+Math.round(desvio)+' m'+(desvio>100?' (desvio importante)':''));}
// guardar / cargar
function abrirGuardar(){ if(!window._geo){apex.message.alert('Primero calcula la ruta');return;}
 document.getElementById('guardHost').innerHTML='<div style="max-width:400px">'
  +'<div style="margin-bottom:8px"><label style="font-size:12px;color:#6b7280">Nombre de la ruta</label><input id="rNom" style="width:100%;border:1px solid #d1d5db;border-radius:8px;padding:7px" value="'+escE((PARADAS[0]?PARADAS[0].nombre:'')+' -> '+(PARADAS[PARADAS.length-1]?PARADAS[PARADAS.length-1].nombre:''))+'"></div>'
  +'<div style="margin-bottom:10px"><label style="font-size:12px;color:#6b7280">Descripcion</label><input id="rDesc" style="width:100%;border:1px solid #d1d5db;border-radius:8px;padding:7px"></div>'
  +'<div style="display:flex;gap:8px"><button type="button" class="t-Button t-Button--hot" onclick="guardar()">Guardar</button><button type="button" class="t-Button" onclick="closeModal()">Cerrar</button></div></div>';
 openModal('dlgGuard');}
function guardar(){var meta={codigo:CODIGO,nombre:document.getElementById('rNom').value,desc:document.getElementById('rDesc').value,
   distancia_m:DIST,duracion_s:DUR,paradas:PARADAS};
 if(!meta.nombre){apex.message.alert('Ponle un nombre');return;}
 ajaxClob('GUARDAR',meta,JSON.stringify(window._geo),function(r){CODIGO=r.codigo;closeModal();cargarRutas();apex.message.showPageSuccess('Ruta guardada');});}
function cargarRutas(){ajaxGen('LISTAR',{},function(r){GESTION=r.gestion;RUTAS=r.data||[];actualizarInfo();
 var h=document.getElementById('rutLista');
 if(!RUTAS.length){h.innerHTML='<div style="color:#9ca3af;font-size:13px">Sin rutas guardadas.</div>';return;}
 h.innerHTML=RUTAS.map(function(x){return '<div style="display:flex;align-items:center;gap:6px;background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:6px 8px">'
   +'<div onclick="cargarRuta('+x.codigo+')" style="flex:1;min-width:0;cursor:pointer"><div style="font-weight:600;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+escE(x.nombre)+'</div>'
   +'<div style="font-size:11px;color:#94a3b8">'+x.paradas+' paradas'+(x.distancia_m?' &middot; '+(x.distancia_m/1000).toFixed(1)+' km':'')+(x.duracion_s?' &middot; '+Math.round(x.duracion_s/60)+' min':'')+'</div></div>'
   +(GESTION=='S'?'<button type="button" onclick="borrarRuta('+x.codigo+')" style="background:none;border:0;cursor:pointer;color:#b91c1c"><span class="fa fa-trash-o"></span></button>':'')+'</div>';}).join('');});}
function cargarRuta(cod){ajaxGen('GET',{codigo:cod},function(r){var d=r.data;
 CODIGO=d.codigo; PARADAS=(d.paradas||[]).map(function(p){return {nombre:p.nombre,lat:p.lat,lng:p.lng};});
 DIST=d.distancia_m; DUR=d.duracion_s; window._geo=d.geojson||null;
 pintarParadas();
 if(d.geojson&&d.geojson.geometry)dibujarLinea(d.geojson.geometry.coordinates);});}
function borrarRuta(cod){apex.message.confirm('Eliminar esta ruta?',function(ok){if(ok)
 ajaxGen('ELIMINAR',{codigo:cod},function(){if(CODIGO==cod)limpiar();cargarRutas();});});}
apex.jQuery(function(){initMapa();});