create or replace package MAP001 as
  procedure AJAX;   -- GET / GUARDAR / ELIMINAR / STATS / LISTAR
end MAP001;
/
create or replace package body MAP001 as

  procedure GET_ (P json_object_t) is
    l_cod number := P.get_number('codigo');
    l_out clob;
  begin
    select json_object(
             'codigo'  value u.UBI_CODIGO,  'nombre' value u.UBI_NOMBRE,
             'desc'    value u.UBI_DESCRIPCION, 'cat' value u.UBI_CAT_CODIGO,
             'lat'     value u.UBI_LATITUD,  'lng'  value u.UBI_LONGITUD,
             'cat_nombre' value c.CAT_NOMBRE, 'cat_color' value c.CAT_COLOR,
             'cat_icono'  value c.CAT_ICONO,
             'quien'   value nvl(g.USU_NOMBRE, u.UBI_USUARIO_CREA),
             'fecha'   value to_char(u.UBI_FECHA_CREA,'DD/MM/YYYY HH24:MI'),
             'mio'     value case when g.USU_LOGIN = upper(GENM000.USUARIO_ACTUAL) then 1 else 0 end
             returning clob)
      into l_out
      from MAP_UBICACION u
      join MAP_CATEGORIA c on c.CAT_CODIGO = u.UBI_CAT_CODIGO
      left join GEN_USUARIO g on g.USU_CODIGO = u.UBI_USU_CODIGO
     where u.UBI_CODIGO = l_cod;
    htp.p('{"ok":true,"data":'); GENM000.PJ(l_out); htp.p('}');
  end;

  procedure LISTAR is
    l_out clob;
  begin
    select nvl(json_arrayagg(json_object(
             'codigo' value u.UBI_CODIGO, 'nombre' value u.UBI_NOMBRE,
             'lat' value u.UBI_LATITUD, 'lng' value u.UBI_LONGITUD,
             'desc' value u.UBI_DESCRIPCION,
             'cat' value c.CAT_NOMBRE, 'color' value c.CAT_COLOR, 'icono' value c.CAT_ICONO,
             'quien' value nvl(g.USU_NOMBRE, u.UBI_USUARIO_CREA),
             'fecha' value to_char(u.UBI_FECHA_CREA,'DD/MM/YYYY HH24:MI'),
             'mio' value case when g.USU_LOGIN = upper(GENM000.USUARIO_ACTUAL) then 1 else 0 end)
             returning clob), to_clob('[]'))
      into l_out
      from MAP_UBICACION u
      join MAP_CATEGORIA c on c.CAT_CODIGO = u.UBI_CAT_CODIGO
      left join GEN_USUARIO g on g.USU_CODIGO = u.UBI_USU_CODIGO
     where u.UBI_ESTADO = 'S';
    htp.p('{"ok":true,"data":'); GENM000.PJ(l_out); htp.p('}');
  end;

  procedure GUARDAR (P json_object_t) is
    l_cod    number         := P.get_number('codigo');
    l_nombre varchar2(120)  := P.get_string('nombre');
    l_desc   varchar2(1000) := P.get_string('desc');
    l_cat    number         := P.get_number('cat');
    l_lat    number         := P.get_number('lat');
    l_lng    number         := P.get_number('lng');
    l_usu    number;
  begin
    if l_nombre is null then raise_application_error(-20040,'El nombre es obligatorio'); end if;
    if l_cat is null    then raise_application_error(-20041,'Elige una categoria'); end if;
    if l_lat is null or l_lng is null then raise_application_error(-20042,'Coordenadas invalidas'); end if;
    begin
      select USU_CODIGO into l_usu from GEN_USUARIO where USU_LOGIN = upper(GENM000.USUARIO_ACTUAL);
    exception when no_data_found then l_usu := null; end;
    if l_cod is null then
      select nvl(max(UBI_CODIGO)+1,1) into l_cod from MAP_UBICACION;
      insert into MAP_UBICACION (UBI_CODIGO,UBI_NOMBRE,UBI_DESCRIPCION,UBI_CAT_CODIGO,
                                 UBI_LATITUD,UBI_LONGITUD,UBI_USU_CODIGO,UBI_USUARIO_CREA)
      values (l_cod,l_nombre,l_desc,l_cat,l_lat,l_lng,l_usu,GENM000.USUARIO_ACTUAL);
    else
      update MAP_UBICACION
         set UBI_NOMBRE=l_nombre, UBI_DESCRIPCION=l_desc, UBI_CAT_CODIGO=l_cat,
             UBI_LATITUD=l_lat, UBI_LONGITUD=l_lng,
             UBI_FECHA_MOD=sysdate, UBI_USUARIO_MOD=GENM000.USUARIO_ACTUAL
       where UBI_CODIGO=l_cod
         and (UBI_USU_CODIGO=l_usu or GENM000.TIENE_ACCESO(GENM000.USUARIO_ACTUAL,100,4));
      if sql%rowcount=0 then raise_application_error(-20043,'Solo puedes editar tus propias ubicaciones'); end if;
    end if;
    htp.p('{"ok":true,"msg":"Ubicacion guardada"}');
  end;

  procedure ELIMINAR (P json_object_t) is
    l_cod number := P.get_number('codigo');
    l_usu number;
  begin
    begin
      select USU_CODIGO into l_usu from GEN_USUARIO where USU_LOGIN = upper(GENM000.USUARIO_ACTUAL);
    exception when no_data_found then l_usu := null; end;
    delete from MAP_UBICACION
     where UBI_CODIGO=l_cod
       and (UBI_USU_CODIGO=l_usu or GENM000.TIENE_ACCESO(GENM000.USUARIO_ACTUAL,100,4));
    if sql%rowcount=0 then raise_application_error(-20044,'Solo puedes eliminar tus propias ubicaciones'); end if;
    htp.p('{"ok":true,"msg":"Ubicacion eliminada"}');
  end;

  procedure AJAX is
    l_p json_object_t := json_object_t.parse(nvl(apex_application.g_x02,'{}'));
  begin
    case apex_application.g_x01
      when 'GET'      then GET_(l_p);
      when 'LISTAR'   then LISTAR;
      when 'GUARDAR'  then GUARDAR(l_p);
      when 'ELIMINAR' then ELIMINAR(l_p);
      else htp.p('{"ok":false,"msg":"Accion desconocida"}');
    end case;
  exception
    when others then
      htp.p('{"ok":false,"msg":"'||apex_escape.json(regexp_replace(sqlerrm,'^ORA-\d+: '))||'"}');
  end;

end MAP001;
/
