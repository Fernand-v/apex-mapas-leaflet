create or replace package RUT000 as
  -- Rutas y navegacion. AJAX unico: g_x01=accion, g_x02=JSON, g_clob_01=GeoJSON de la ruta.
  procedure AJAX;
end RUT000;
/
create or replace package body RUT000 as

  function PUEDE_GESTIONAR return varchar2 is
    l number := 0;
  begin
    select count(*) into l
      from GEN_USUARIO u
      join GEN_USUARIO_ROL ur on ur.USRO_USU_CODIGO = u.USU_CODIGO
      join GEN_ROL r on r.ROL_CODIGO = ur.USRO_ROL_CODIGO and r.ROL_ACTIVO='S'
     where u.USU_LOGIN = upper(GENM000.USUARIO_ACTUAL)
       and r.ROL_NOMBRE in ('ADMINISTRADOR','JEFE');
    return case when l>0 then 'S' else 'N' end;
  end;

  procedure CHK_GESTION is
  begin
    if PUEDE_GESTIONAR <> 'S' then raise_application_error(-20180,'Solo ADMINISTRADOR o JEFE pueden crear/editar rutas'); end if;
  end;

  procedure LISTAR is
    l_out clob;
  begin
    select nvl(json_arrayagg(json_object(
             'codigo' value RUT_CODIGO, 'nombre' value RUT_NOMBRE, 'desc' value RUT_DESCRIPCION,
             'distancia_m' value RUT_DISTANCIA_M, 'duracion_s' value RUT_DURACION_S,
             'paradas' value (select count(*) from RUT_PARADA where PAR_RUT_CODIGO=RUT_CODIGO)
             returning clob) order by RUT_NOMBRE returning clob), to_clob('[]'))
      into l_out from RUT_RUTA where RUT_ACTIVO='S';
    htp.p('{"ok":true,"gestion":'||apex_json.stringify(PUEDE_GESTIONAR)||',"data":'); GENM000.PJ(l_out); htp.p('}');
  end;

  procedure GET_ (P json_object_t) is
    l_cod number := P.get_number('codigo');
    l_par clob; l_geo clob;
    l_nom varchar2(120); l_des varchar2(500); l_dist number; l_dur number;
  begin
    select RUT_NOMBRE,RUT_DESCRIPCION,RUT_DISTANCIA_M,RUT_DURACION_S,RUT_GEOJSON
      into l_nom,l_des,l_dist,l_dur,l_geo from RUT_RUTA where RUT_CODIGO=l_cod;
    select nvl(json_arrayagg(json_object('orden' value PAR_ORDEN,'nombre' value PAR_NOMBRE,
             'lat' value PAR_LAT,'lng' value PAR_LNG returning clob) order by PAR_ORDEN returning clob), to_clob('[]'))
      into l_par from RUT_PARADA where PAR_RUT_CODIGO=l_cod;
    htp.p('{"ok":true,"data":{"codigo":'||l_cod||',"nombre":'||apex_json.stringify(l_nom)
        ||',"desc":'||apex_json.stringify(l_des)||',"distancia_m":'||nvl(to_char(l_dist),'null')
        ||',"duracion_s":'||nvl(to_char(l_dur),'null')||',"paradas":');
    GENM000.PJ(l_par);
    htp.p(',"geojson":');
    if l_geo is null then htp.p('null'); else GENM000.PJ(l_geo); end if;
    htp.p('}}');
  end;

  procedure GUARDAR (P json_object_t) is
    l_cod  number := P.get_number('codigo');
    l_nom  varchar2(120) := P.get_string('nombre');
    l_des  varchar2(500) := P.get_string('desc');
    l_dist number := P.get_number('distancia_m');
    l_dur  number := P.get_number('duracion_s');
    l_geo  clob   := apex_application.g_clob_01;
    l_par  json_array_t := treat(P.get('paradas') as json_array_t);
    l_it   json_object_t;
  begin
    CHK_GESTION;
    if l_nom is null then raise_application_error(-20181,'Ponle un nombre a la ruta'); end if;
    if l_par is null or l_par.get_size < 2 then raise_application_error(-20182,'La ruta necesita al menos 2 paradas'); end if;
    if l_cod is null then
      insert into RUT_RUTA (RUT_NOMBRE,RUT_DESCRIPCION,RUT_DISTANCIA_M,RUT_DURACION_S,RUT_GEOJSON,RUT_USUARIO_CREA)
      values (l_nom,l_des,l_dist,l_dur,l_geo,GENM000.USUARIO_ACTUAL) returning RUT_CODIGO into l_cod;
    else
      update RUT_RUTA set RUT_NOMBRE=l_nom,RUT_DESCRIPCION=l_des,RUT_DISTANCIA_M=l_dist,
             RUT_DURACION_S=l_dur,RUT_GEOJSON=l_geo where RUT_CODIGO=l_cod;
      delete from RUT_PARADA where PAR_RUT_CODIGO=l_cod;
    end if;
    for i in 0 .. l_par.get_size-1 loop
      l_it := treat(l_par.get(i) as json_object_t);
      insert into RUT_PARADA (PAR_RUT_CODIGO,PAR_ORDEN,PAR_NOMBRE,PAR_LAT,PAR_LNG)
      values (l_cod, i+1, l_it.get_string('nombre'), l_it.get_number('lat'), l_it.get_number('lng'));
    end loop;
    htp.p('{"ok":true,"codigo":'||l_cod||'}');
  end;

  procedure ELIMINAR (P json_object_t) is
    l_cod number := P.get_number('codigo');
  begin
    CHK_GESTION;
    delete from RUT_RUTA where RUT_CODIGO=l_cod;
    htp.p('{"ok":true}');
  end;

  -- ubicaciones del portafolio (MAP_UBICACION) para agregar como paradas rapido
  procedure PORTAFOLIO is
    l_out clob;
    l_n number;
  begin
    select count(*) into l_n from all_tables where owner=sys_context('userenv','current_schema') and table_name='MAP_UBICACION';
    if l_n = 0 then htp.p('{"ok":true,"data":[]}'); return; end if;
    execute immediate q'~
      select nvl(json_arrayagg(json_object('nombre' value UBI_NOMBRE,'lat' value UBI_LATITUD,'lng' value UBI_LONGITUD
               returning clob) order by UBI_NOMBRE returning clob), to_clob('[]'))
        from MAP_UBICACION where UBI_ESTADO='A' or UBI_ESTADO is null~' into l_out;
    htp.p('{"ok":true,"data":'); GENM000.PJ(l_out); htp.p('}');
  exception when others then htp.p('{"ok":true,"data":[]}');
  end;

  procedure AJAX is
    l_p json_object_t := json_object_t.parse(nvl(apex_application.g_x02,'{}'));
  begin
    case apex_application.g_x01
      when 'LISTAR'     then LISTAR;
      when 'GET'        then GET_(l_p);
      when 'GUARDAR'    then GUARDAR(l_p);
      when 'ELIMINAR'   then ELIMINAR(l_p);
      when 'PORTAFOLIO' then PORTAFOLIO;
      else htp.p('{"ok":false,"msg":"Accion desconocida"}');
    end case;
  exception
    when others then
      htp.p('{"ok":false,"msg":"'||apex_escape.json(regexp_replace(sqlerrm,'^ORA-\d+: '))||'"}');
  end;

end RUT000;
/
