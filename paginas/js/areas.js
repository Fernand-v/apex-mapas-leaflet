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
var LMAP=null, GESTION='N', AREAS=[], CAPAS={}, PEND=null, CONSULTA=false, CMARK=null;
function cargarLib(url,test,cb){ if(test()){cb();return;}
 var hadAmd=(typeof window.define=='function' && window.define.amd); if(hadAmd)window.define.amd=false;
 var s=document.createElement('script'); s.src=url;
 s.onload=function(){ if(hadAmd)window.define.amd=hadAmd; cb(); };
 s.onerror=function(){ if(hadAmd)window.define.amd=hadAmd; apex.message.alert('No se pudo cargar una libreria (CDN)'); };
 document.head.appendChild(s); }
function cssOnce(href){ if(document.querySelector('link[href="'+href+'"]'))return;
 var l=document.createElement('link');l.rel='stylesheet';l.href=href;document.head.appendChild(l); }
function cargarTodo(cb){
 cssOnce('https://unpkg.com/leaflet@1.9.4/dist/leaflet.css');
 cargarLib('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',function(){return !!window.L;},function(){
   cssOnce('https://unpkg.com/@geoman-io/leaflet-geoman-free@2.14.2/dist/leaflet-geoman.css');
   cargarLib('https://unpkg.com/@geoman-io/leaflet-geoman-free@2.14.2/dist/leaflet-geoman.min.js',function(){return !!(window.L && L.PM);},function(){
     cargarLib('https://unpkg.com/@turf/turf@6/turf.min.js',function(){return !!window.turf;},cb);});});}
function fmtArea(m2){ if(!m2)return '';
 if(m2>=1000000)return (m2/1000000).toFixed(2)+' km2';
 if(m2>=10000)return (m2/10000).toFixed(2)+' ha';
 return Math.round(m2)+' m2'; }
function fmtLong(m){ if(!m)return ''; return m>=1000?(m/1000).toFixed(2)+' km':Math.round(m)+' m'; }
function initMapa(){
 document.getElementById('areaHost').innerHTML='<div style="display:flex;gap:12px;flex-wrap:wrap">'
  +'<div style="flex:1;min-width:300px"><div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px">'
  +'<button type="button" id="btnConsulta" class="t-Button" onclick="toggleConsulta()"><span class="fa fa-crosshairs"></span> Consultar punto</button>'
  +'<button type="button" class="t-Button" onclick="exportar()"><span class="fa fa-download"></span> Exportar</button>'
  +'<button type="button" id="btnImport" class="t-Button" style="display:none" onclick="abrirImport()"><span class="fa fa-upload"></span> Importar</button>'
  +'<span id="areaHint" style="font-size:12px;color:#b45309"></span></div>'
  +'<div id="leafarea" style="height:64vh;min-height:420px;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden"></div></div>'
  +'<div style="width:260px;flex-shrink:0"><div style="font-weight:700;margin-bottom:6px">Areas</div><div id="areaLista" style="display:flex;flex-direction:column;gap:6px"></div></div></div>';
 cargarTodo(function(){
   LMAP=L.map('leafarea').setView([-16.5,-68.15],13);
   L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap'}).addTo(LMAP);
   setTimeout(function(){LMAP.invalidateSize();},300);
   LMAP.on('click',function(e){ if(CONSULTA)consultarPunto(e.latlng); });
   cargar();
 });}
function activarDibujo(){
 if(GESTION!='S')return;
 LMAP.pm.addControls({position:'topleft',drawMarker:false,drawText:false,drawCircleMarker:false,
   drawPolygon:true,drawPolyline:true,drawRectangle:true,drawCircle:true,
   editMode:true,dragMode:true,removalMode:false,rotateMode:false});
 LMAP.on('pm:create',function(e){ onDibujo(e); });}
function medir(shape,layer,gj){
 var area=null,long=null;
 if(shape=='Circle'){ var r=layer.getRadius(); area=Math.PI*r*r; long=2*Math.PI*r; gj.properties=gj.properties||{}; gj.properties.radius=r; }
 else if(shape=='Line'){ long=turf.length(gj,{units:'kilometers'})*1000; }
 else { area=turf.area(gj); try{ long=turf.length(turf.polygonToLine(gj),{units:'kilometers'})*1000; }catch(e){} }
 return {area:area,long:long};}
function tipoDe(shape){ return shape=='Circle'?'CIRCULO':(shape=='Line'?'LINEA':(shape=='Rectangle'?'RECTANGULO':'POLIGONO')); }
function onDibujo(e){
 var gj=e.layer.toGeoJSON(); var m=medir(e.shape,e.layer,gj);
 PEND={layer:e.layer,shape:e.shape,gj:gj,area:m.area,long:m.long};
 LMAP.removeLayer(e.layer);   // se re-agrega al guardar (o se descarta)
 formArea({tipo:tipoDe(e.shape),area_m2:m.area,longitud_m:m.long});}
function formArea(a){a=a||{};var INP='width:100%;border:1px solid #d1d5db;border-radius:8px;padding:7px';
 var med=(a.tipo=='LINEA')?('Longitud: '+fmtLong(a.longitud_m)):('Superficie: '+fmtArea(a.area_m2)+(a.longitud_m?' &middot; perimetro '+fmtLong(a.longitud_m):''));
 var h='<div style="max-width:440px"><div style="font-size:13px;color:#4f46e5;font-weight:600;margin-bottom:8px">'+escE(a.tipo||'')+' &middot; '+med+'</div>'
  +'<input type="hidden" id="aCod" value="'+(a.codigo||'')+'">'
  +'<div style="margin-bottom:8px"><label style="font-size:12px;color:#6b7280">Nombre</label><input id="aNom" style="'+INP+'" maxlength="120" value="'+escE(a.nombre||'')+'"></div>'
  +'<div style="display:flex;gap:8px;flex-wrap:wrap"><div style="flex:1;min-width:130px;margin-bottom:8px"><label style="font-size:12px;color:#6b7280">Categoria</label><input id="aCat" style="'+INP+'" maxlength="80" value="'+escE(a.categoria||'')+'"></div>'
  +'<div style="margin-bottom:8px"><label style="font-size:12px;color:#6b7280">Color</label><input type="color" id="aCol" value="'+(a.color||'#2563eb')+'" style="width:48px;height:38px;border:1px solid #d1d5db;border-radius:8px;padding:2px"></div></div>'
  +'<div style="margin-bottom:10px"><label style="font-size:12px;color:#6b7280">Descripcion</label><textarea id="aDesc" rows="2" style="'+INP+'">'+escE(a.desc||'')+'</textarea></div>'
  +'<div style="display:flex;gap:8px"><button type="button" class="t-Button t-Button--hot" onclick="guardarArea()"><span class="fa fa-check"></span> Guardar</button>'
  +(a.codigo?'<button type="button" class="t-Button" onclick="borrarArea('+a.codigo+')"><span class="fa fa-trash-o"></span> Eliminar</button>':'')
  +'<button type="button" class="t-Button" onclick="cancelarForm()">Cancelar</button></div></div>';
 document.getElementById('formHost').innerHTML=h; openModal('dlgForm');}
function cancelarForm(){ PEND=null; closeModal(); }
function guardarArea(){
 var cod=+document.getElementById('aCod').value||null;
 var meta={codigo:cod,nombre:document.getElementById('aNom').value,categoria:document.getElementById('aCat').value,
   color:document.getElementById('aCol').value,desc:document.getElementById('aDesc').value};
 if(!meta.nombre){apex.message.alert('Ponle un nombre');return;}
 var gj, area, long, tipo;
 if(PEND){ gj=PEND.gj; area=PEND.area; long=PEND.long; tipo=tipoDe(PEND.shape); }
 else { var a=AREAS.filter(function(x){return x.codigo==cod;})[0]; gj=a.geojson; area=a.area_m2; long=a.longitud_m; tipo=a.tipo; }
 meta.tipo=tipo; meta.area_m2=area; meta.longitud_m=long;
 ajaxClob('GUARDAR',meta,JSON.stringify(gj),function(){PEND=null;closeModal();cargar();});}
function borrarArea(cod){apex.message.confirm('Eliminar esta area?',function(ok){if(ok)
 ajaxGen('ELIMINAR',{codigo:cod},function(){closeModal();cargar();});});}
function estilo(a){return {color:a.color||'#2563eb',weight:2,fillOpacity:0.15};}
function dibujarArea(a){
 var lay, gj=a.geojson;
 if(a.tipo=='CIRCULO'){ var c=gj.geometry.coordinates; var r=(gj.properties&&gj.properties.radius)||100;
   lay=L.circle([c[1],c[0]],Object.assign({radius:r},estilo(a))); }
 else { lay=L.geoJSON(gj,{style:estilo(a),pointToLayer:function(f,ll){return L.marker(ll);}}); }
 lay.addTo(LMAP);
 var med=(a.tipo=='LINEA')?fmtLong(a.longitud_m):fmtArea(a.area_m2);
 lay.bindPopup('<b>'+escE(a.nombre)+'</b>'+(a.categoria?'<br><span style="font-size:12px;color:#6b7280">'+escE(a.categoria)+'</span>':'')
   +'<br><span style="font-size:12px">'+med+'</span>'
   +(GESTION=='S'?'<br><button type="button" class="t-Button t-Button--small t-Button--hot" onclick="editarArea('+a.codigo+')" style="margin-top:6px">Editar</button>':''));
 CAPAS[a.codigo]=lay;}
function cargar(){ajaxGen('LISTAR',{},function(r){GESTION=r.gestion;AREAS=r.data||[];
 Object.keys(CAPAS).forEach(function(k){LMAP.removeLayer(CAPAS[k]);});CAPAS={};
 document.getElementById('btnImport').style.display=(GESTION=='S')?'':'none';
 AREAS.forEach(dibujarArea);
 pintarLista();
 if(GESTION=='S' && !LMAP.pm.controlsVisible())activarDibujo();});}
function pintarLista(){var h=document.getElementById('areaLista');
 if(!AREAS.length){h.innerHTML='<div style="color:#9ca3af;font-size:13px">Sin areas.'+(GESTION=='S'?' Dibuja una con las herramientas del mapa.':'')+'</div>';return;}
 h.innerHTML=AREAS.map(function(a){var med=(a.tipo=='LINEA')?fmtLong(a.longitud_m):fmtArea(a.area_m2);
  return '<div onclick="irArea('+a.codigo+')" style="display:flex;align-items:center;gap:8px;background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:7px 9px;cursor:pointer">'
   +'<span style="width:14px;height:14px;border-radius:3px;background:'+(a.color||'#2563eb')+';flex-shrink:0"></span>'
   +'<div style="min-width:0;flex:1"><div style="font-weight:600;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+escE(a.nombre)+'</div>'
   +'<div style="font-size:11px;color:#94a3b8">'+a.tipo.toLowerCase()+' &middot; '+med+'</div></div></div>';}).join('');}
function irArea(cod){var l=CAPAS[cod];if(!l)return; try{LMAP.fitBounds(l.getBounds(),{padding:[40,40]});}catch(e){LMAP.setView(l.getLatLng(),15);} l.openPopup();}
function editarArea(cod){var a=AREAS.filter(function(x){return x.codigo==cod;})[0];if(!a)return;
 formArea({codigo:a.codigo,nombre:a.nombre,categoria:a.categoria,color:a.color,desc:a.desc,tipo:a.tipo,area_m2:a.area_m2,longitud_m:a.longitud_m});}
// ---- consultar en que area(s) cae un punto ----
function toggleConsulta(){CONSULTA=!CONSULTA;
 document.getElementById('areaHint').textContent=CONSULTA?'Haz clic en el mapa para ver en que area cae':'';
 document.getElementById('btnConsulta').classList.toggle('t-Button--hot',CONSULTA);}
function consultarPunto(ll){
 if(CMARK)LMAP.removeLayer(CMARK); CMARK=L.marker([ll.lat,ll.lng]).addTo(LMAP);
 var pt=turf.point([ll.lng,ll.lat]); var dentro=[];
 AREAS.forEach(function(a){ try{
   if(a.tipo=='CIRCULO'){ var c=a.geojson.geometry.coordinates; var r=(a.geojson.properties&&a.geojson.properties.radius)||0;
     if(turf.distance(pt,turf.point(c),{units:'meters'})<=r)dentro.push(a.nombre); }
   else if(a.tipo!='LINEA'){ if(turf.booleanPointInPolygon(pt,a.geojson))dentro.push(a.nombre); }
 }catch(e){} });
 CMARK.bindPopup(dentro.length?('<b>Dentro de:</b><br>'+dentro.map(escE).join('<br>')):'<span style="color:#6b7280">Fuera de todas las areas</span>').openPopup();}
// ---- importar / exportar GeoJSON ----
function exportar(){ajaxGen('EXPORTAR',{},function(r){
 var blob=new Blob([JSON.stringify(r.fc,null,2)],{type:'application/geo+json'});
 var a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='areas.geojson';a.click();
 setTimeout(function(){URL.revokeObjectURL(a.href);},1000);});}
function abrirImport(){document.getElementById('impHost').innerHTML='<div style="max-width:460px">'
  +'<p style="font-size:13px;color:#374151">Pega un GeoJSON (Feature o FeatureCollection). Cada figura se guardara como un area.</p>'
  +'<textarea id="impTxt" rows="8" style="width:100%;border:1px solid #d1d5db;border-radius:8px;padding:8px;font-family:monospace;font-size:12px"></textarea>'
  +'<div style="margin-top:10px;display:flex;gap:8px"><button type="button" class="t-Button t-Button--hot" onclick="importar()">Importar</button>'
  +'<button type="button" class="t-Button" onclick="closeModal()">Cerrar</button></div></div>';
 openModal('dlgImport');}
function importar(){var t=document.getElementById('impTxt').value;var o;
 try{o=JSON.parse(t);}catch(e){apex.message.alert('GeoJSON invalido');return;}
 var feats=(o.type=='FeatureCollection')?o.features:[o];
 var i=0; (function siguiente(){ if(i>=feats.length){closeModal();cargar();apex.message.showPageSuccess(feats.length+' area(s) importada(s)');return;}
   var f=feats[i++]; var g=f.geometry||{}; var tipo=g.type=='LineString'?'LINEA':(g.type=='Point'?'CIRCULO':'POLIGONO');
   var gj={type:'Feature',properties:f.properties||{},geometry:g};
   var area=null,long=null; try{ if(tipo=='LINEA')long=turf.length(gj,{units:'kilometers'})*1000; else if(tipo!='CIRCULO')area=turf.area(gj); }catch(e){}
   var meta={nombre:(f.properties&&f.properties.nombre)||('Area '+i),categoria:(f.properties&&f.properties.categoria)||null,
     color:(f.properties&&f.properties.color)||'#2563eb',tipo:tipo,area_m2:area,longitud_m:long};
   ajaxClob('GUARDAR',meta,JSON.stringify(gj),function(){siguiente();}); })();}
apex.jQuery(function(){initMapa();});