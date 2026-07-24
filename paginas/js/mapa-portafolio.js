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
var LMAP, LMARKERS=[], LEAFLET_READY=false;
function cargarLeaflet(cb){
  if(window.L){ cb(); return; }
  var css=document.createElement('link'); css.rel='stylesheet';
  css.href='https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
  document.head.appendChild(css);
  // APEX usa RequireJS: Leaflet se registraria como modulo AMD y no como global L.
  // Quitamos solo define.amd (no define) para forzar window.L sin romper RequireJS.
  var hadAmd = (typeof window.define==='function' && window.define.amd);
  if(hadAmd){ window.define.amd = false; }
  var js=document.createElement('script');
  js.src='https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
  js.onload=function(){ if(hadAmd){ window.define.amd = hadAmd; } cb(); };
  document.head.appendChild(js);
}
function initMapa(){
  var host=document.getElementById('mapaHost');
  if(host && !document.getElementById('leafmap')){
    host.innerHTML='<div id="leafmap" style="height:560px;width:100%;border-radius:10px;overflow:hidden"></div>'
      +'<div style="font-size:12px;color:#6b7280;margin-top:8px"><span class="fa fa-info-circle"></span> '
      +'Haz clic en el mapa para marcar una ubicacion. Clic en un marcador para ver detalles.</div>';
  }
  cargarLeaflet(function(){
    if(LMAP) return;
    LMAP=L.map('leafmap').setView([-25.28,-57.63],12);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      {maxZoom:19, attribution:'© OpenStreetMap'}).addTo(LMAP);
    LMAP.on('click', function(e){ abrirNueva(e.latlng.lat, e.latlng.lng); });
    LEAFLET_READY=true;
    refrescarMapa();
    setTimeout(function(){ LMAP.invalidateSize(); }, 300);
  });
}
function iconoCat(color){
  return L.divIcon({className:'', html:
    '<div style=\'background:'+color+';width:26px;height:26px;border-radius:50% 50% 50% 0;'
    +'transform:rotate(-45deg);border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.4)\'></div>',
    iconSize:[26,26], iconAnchor:[13,26], popupAnchor:[0,-24]});
}
function refrescarMapa(){
  if(typeof apex!=='undefined' && apex.region('listaubi')) apex.region('listaubi').refresh();
  if(!LEAFLET_READY) return;
  ajaxGen('LISTAR',{}, function(r){
    LMARKERS.forEach(function(m){ LMAP.removeLayer(m); }); LMARKERS=[];
    (r.data||[]).forEach(function(u){
      var m=L.marker([u.lat,u.lng],{icon:iconoCat(u.color)}).addTo(LMAP);
      var pop='<div style=\'min-width:170px\'><b>'+u.nombre+'</b><br>'
        +'<span style=\'display:inline-block;padding:1px 8px;border-radius:99px;color:#fff;font-size:11px;background:'
        +u.color+'\'>'+u.cat+'</span>'
        +(u.desc?'<p style=\'margin:6px 0\'>'+u.desc+'</p>':'')
        +'<div style=\'font-size:11px;color:#6b7280;margin-top:4px\'>Marcado por '+u.quien+'<br>el '+u.fecha+'</div>'
        +'<div style=\'margin-top:8px\'><button type=\'button\' class=\'t-Button t-Button--small t-Button--hot\' '
        +'onclick=\'abrirEditar('+u.codigo+')\'>Ver / Editar</button></div></div>';
      m.bindPopup(pop);
      LMARKERS.push(m);
    });
  });
}
function centrarEn(lat,lng){ if(LMAP){ LMAP.setView([lat,lng],16); } }
function abrirNueva(lat,lng){
  apex.item('P2_CODIGO').setValue('');
  apex.item('P2_NOMBRE').setValue('');
  apex.item('P2_CAT').setValue('');
  apex.item('P2_DESC').setValue('');
  apex.item('P2_LAT').setValue(lat);
  apex.item('P2_LNG').setValue(lng);
  apex.item('P2_INFO').setValue('Nueva ubicacion en '+(+lat).toFixed(5)+', '+(+lng).toFixed(5));
  openModal('dlgUbi');
}
function abrirEditar(id){
  ajaxGen('GET',{codigo:id}, function(r){ var d=r.data;
    apex.item('P2_CODIGO').setValue(d.codigo);
    apex.item('P2_NOMBRE').setValue(d.nombre);
    apex.item('P2_CAT').setValue(d.cat);
    apex.item('P2_DESC').setValue(d.desc||'');
    apex.item('P2_LAT').setValue(d.lat);
    apex.item('P2_LNG').setValue(d.lng);
    apex.item('P2_INFO').setValue(d.cat_nombre+' — Marcado por '+d.quien+' el '+d.fecha);
    openModal('dlgUbi');
  });
}
function guardarUbi(){
  if(!$v('P2_NOMBRE')){ apex.message.alert('Escribe un nombre'); return; }
  if(!$v('P2_CAT')){ apex.message.alert('Elige una categoria'); return; }
  ajaxGen('GUARDAR',{codigo:$v('P2_CODIGO')||null,nombre:$v('P2_NOMBRE'),
    cat:+$v('P2_CAT'),desc:$v('P2_DESC'),lat:+$v('P2_LAT'),lng:+$v('P2_LNG')},
    function(){ closeModal(); refrescarMapa(); });
}
function eliminarUbi(){
  if(!$v('P2_CODIGO')){ closeModal(); return; }
  apex.message.confirm('Eliminar esta ubicacion?', function(ok){ if(!ok) return;
    ajaxGen('ELIMINAR',{codigo:$v('P2_CODIGO')}, function(){ closeModal(); refrescarMapa(); });
  });
}
function ubicarme(){
  if(!navigator.geolocation){ apex.message.alert('Tu navegador no soporta geolocalizacion'); return; }
  navigator.geolocation.getCurrentPosition(function(p){
    if(LMAP) LMAP.setView([p.coords.latitude,p.coords.longitude],15);
    abrirNueva(p.coords.latitude, p.coords.longitude);
  }, function(){ apex.message.alert('No se pudo obtener tu ubicacion'); });
}
apex.jQuery(function(){ initMapa(); });