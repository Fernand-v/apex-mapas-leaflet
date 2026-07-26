create or replace package AREA000 as
  -- Croquis y areas sobre mapas. AJAX unico: g_x01=accion, g_x02=JSON meta,
  -- g_clob_01 = GeoJSON (Feature) al guardar.
  procedure AJAX;
end AREA000;
/
create or replace package body AREA000 as

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
    if PUEDE_GESTIONAR <> 'S' then raise_application_error(-20170,'Solo ADMINISTRADOR o JEFE pueden dibujar/editar'); end if;
  end;

  procedure LISTAR is
    l_out clob;
  begin
    select nvl(json_arrayagg(json_object(
             'codigo' value ARE_CODIGO, 'nombre' value ARE_NOMBRE, 'desc' value ARE_DESCRIPCION,
             'tipo' value ARE_TIPO, 'categoria' value ARE_CATEGORIA, 'color' value ARE_COLOR,
             'area_m2' value ARE_AREA_M2, 'longitud_m' value ARE_LONGITUD_M,
             'geojson' value ARE_GEOJSON format json
             returning clob) order by ARE_NOMBRE returning clob), to_clob('[]'))
      into l_out from MAP_AREA where ARE_ACTIVO='S';
    htp.p('{"ok":true,"gestion":'||apex_json.stringify(PUEDE_GESTIONAR)||',"data":'); GENM000.PJ(l_out); htp.p('}');
  end;

  procedure GET_ (P json_object_t) is
    l_cod number := P.get_number('codigo');
    l_out clob;
  begin
    select json_object('codigo' value ARE_CODIGO,'nombre' value ARE_NOMBRE,'desc' value ARE_DESCRIPCION,
             'tipo' value ARE_TIPO,'categoria' value ARE_CATEGORIA,'color' value ARE_COLOR,
             'area_m2' value ARE_AREA_M2,'longitud_m' value ARE_LONGITUD_M,
             'geojson' value ARE_GEOJSON format json returning clob)
      into l_out from MAP_AREA where ARE_CODIGO=l_cod;
    htp.p('{"ok":true,"data":'); GENM000.PJ(l_out); htp.p('}');
  end;

  procedure GUARDAR (P json_object_t) is
    l_cod  number := P.get_number('codigo');
    l_nom  varchar2(120) := P.get_string('nombre');
    l_des  varchar2(500) := P.get_string('desc');
    l_tipo varchar2(12)  := upper(P.get_string('tipo'));
    l_cat  varchar2(80)  := P.get_string('categoria');
    l_col  varchar2(9)   := nvl(P.get_string('color'),'#2563eb');
    l_area number := P.get_number('area_m2');
    l_long number := P.get_number('longitud_m');
    l_geo  clob   := apex_application.g_clob_01;
  begin
    CHK_GESTION;
    if l_nom is null then raise_application_error(-20171,'Ponle un nombre al area'); end if;
    if l_tipo not in ('POLIGONO','LINEA','CIRCULO','RECTANGULO') then raise_application_error(-20172,'Tipo invalido'); end if;
    if l_geo is null or dbms_lob.getlength(l_geo)=0 then raise_application_error(-20173,'Falta la geometria'); end if;
    if l_cod is null then
      insert into MAP_AREA (ARE_NOMBRE,ARE_DESCRIPCION,ARE_TIPO,ARE_CATEGORIA,ARE_COLOR,ARE_GEOJSON,ARE_AREA_M2,ARE_LONGITUD_M,ARE_USUARIO_CREA)
      values (l_nom,l_des,l_tipo,l_cat,l_col,l_geo,l_area,l_long,GENM000.USUARIO_ACTUAL)
      returning ARE_CODIGO into l_cod;
    else
      update MAP_AREA set ARE_NOMBRE=l_nom,ARE_DESCRIPCION=l_des,ARE_TIPO=l_tipo,ARE_CATEGORIA=l_cat,
             ARE_COLOR=l_col,ARE_GEOJSON=l_geo,ARE_AREA_M2=l_area,ARE_LONGITUD_M=l_long
       where ARE_CODIGO=l_cod;
    end if;
    htp.p('{"ok":true,"codigo":'||l_cod||'}');
  end;

  procedure ELIMINAR (P json_object_t) is
    l_cod number := P.get_number('codigo');
  begin
    CHK_GESTION;
    delete from MAP_AREA where ARE_CODIGO=l_cod;
    htp.p('{"ok":true}');
  end;

  -- Exportar todo como una FeatureCollection GeoJSON (para descargar / usar en otro sistema).
  procedure EXPORTAR is
    l_feats clob;
  begin
    select nvl(json_arrayagg(json_transform(ARE_GEOJSON,
             set '$.properties.nombre' = ARE_NOMBRE,
             set '$.properties.categoria' = ARE_CATEGORIA,
             set '$.properties.color' = ARE_COLOR
             returning clob) returning clob), to_clob('[]'))
      into l_feats from MAP_AREA where ARE_ACTIVO='S';
    htp.p('{"ok":true,"fc":{"type":"FeatureCollection","features":');
    GENM000.PJ(l_feats); htp.p('}}');
  end;

  procedure AJAX is
    l_p json_object_t := json_object_t.parse(nvl(apex_application.g_x02,'{}'));
  begin
    case apex_application.g_x01
      when 'LISTAR'   then LISTAR;
      when 'GET'      then GET_(l_p);
      when 'GUARDAR'  then GUARDAR(l_p);
      when 'ELIMINAR' then ELIMINAR(l_p);
      when 'EXPORTAR' then EXPORTAR;
      else htp.p('{"ok":false,"msg":"Accion desconocida"}');
    end case;
  exception
    when others then
      htp.p('{"ok":false,"msg":"'||apex_escape.json(regexp_replace(sqlerrm,'^ORA-\d+: '))||'"}');
  end;

end AREA000;
/
