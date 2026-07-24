create or replace package GEO000 as
  -- utilidades geo compartidas
  function DISTANCIA_M (P_LAT1 number, P_LON1 number, P_LAT2 number, P_LON2 number) return number;
  function HORARIO_ACTIVO (P_ZON number, P_TS timestamp default systimestamp) return varchar2; -- 'S'/'N'
  function USU_CODIGO return number;  -- codigo del usuario logueado
end GEO000;
/
create or replace package body GEO000 as

  function DISTANCIA_M (P_LAT1 number, P_LON1 number, P_LAT2 number, P_LON2 number) return number is
    R    constant number := 6371000;              -- radio terrestre (m)
    PI   constant number := acos(-1);
    dLat number := (P_LAT2 - P_LAT1) * PI / 180;
    dLon number := (P_LON2 - P_LON1) * PI / 180;
    a    number;
  begin
    a := sin(dLat/2) * sin(dLat/2)
       + cos(P_LAT1*PI/180) * cos(P_LAT2*PI/180) * sin(dLon/2) * sin(dLon/2);
    return round(R * 2 * atan2(sqrt(a), sqrt(1-a)));
  end;

  function HORARIO_ACTIVO (P_ZON number, P_TS timestamp default systimestamp) return varchar2 is
    l_n    number;
    l_dia  number := mod(trunc(cast(P_TS as date)) - date '2024-01-01', 7) + 1; -- 1=Lun..7=Dom
    l_hora varchar2(5) := to_char(P_TS, 'HH24:MI');
    l_ok   number;
  begin
    select count(*) into l_n from GEO_ZONA_HORARIO where ZOH_ZON_CODIGO = P_ZON;
    if l_n = 0 then
      return 'S';   -- sin horarios definidos = siempre activa
    end if;
    select count(*) into l_ok
      from GEO_ZONA_HORARIO
     where ZOH_ZON_CODIGO = P_ZON
       and ZOH_DIA = l_dia
       and l_hora between ZOH_HORA_DESDE and ZOH_HORA_HASTA;
    return case when l_ok > 0 then 'S' else 'N' end;
  end;

  function USU_CODIGO return number is
    l_cod number;
  begin
    select USU_CODIGO into l_cod from GEN_USUARIO where USU_LOGIN = upper(GENM000.USUARIO_ACTUAL);
    return l_cod;
  exception when no_data_found then return null;
  end;

end GEO000;
/
create or replace package GEO001 as
  -- Pagina GEO001 - Zonas (gerente). AJAX: GET/GUARDAR/ELIMINAR/LISTAR
  procedure AJAX;
end GEO001;
/
create or replace package body GEO001 as

  procedure LISTAR is
    l_out clob;
  begin
    select nvl(json_arrayagg(json_object(
             'codigo' value z.ZON_CODIGO, 'nombre' value z.ZON_NOMBRE,
             'lat' value z.ZON_LATITUD, 'lng' value z.ZON_LONGITUD,
             'radio' value z.ZON_RADIO_M, 'activo' value z.ZON_ACTIVO,
             'gerente' value g.USU_NOMBRE,
             'horarios' value (select count(*) from GEO_ZONA_HORARIO h where h.ZOH_ZON_CODIGO=z.ZON_CODIGO)
             returning clob) returning clob), to_clob('[]'))
      into l_out
      from GEO_ZONA z left join GEN_USUARIO g on g.USU_CODIGO = z.ZON_GERENTE_USU
     where z.ZON_ACTIVO = 'S';
    htp.p('{"ok":true,"data":'); GENM000.PJ(l_out); htp.p('}');
  end;

  procedure GET_ (P json_object_t) is
    l_cod number := P.get_number('codigo');
    l_out clob; l_hor clob;
  begin
    select json_object('codigo' value ZON_CODIGO, 'nombre' value ZON_NOMBRE,
             'desc' value ZON_DESCRIPCION, 'lat' value ZON_LATITUD, 'lng' value ZON_LONGITUD,
             'radio' value ZON_RADIO_M, 'activo' value ZON_ACTIVO returning clob)
      into l_out from GEO_ZONA where ZON_CODIGO = l_cod;
    select nvl(json_arrayagg(json_object('dia' value ZOH_DIA,
             'desde' value ZOH_HORA_DESDE, 'hasta' value ZOH_HORA_HASTA)
             order by ZOH_DIA returning clob), to_clob('[]'))
      into l_hor from GEO_ZONA_HORARIO where ZOH_ZON_CODIGO = l_cod;
    htp.p('{"ok":true,"data":'); GENM000.PJ(l_out);
    htp.p(',"horarios":'); GENM000.PJ(l_hor); htp.p('}');
  end;

  procedure GUARDAR (P json_object_t) is
    l_cod    number         := P.get_number('codigo');
    l_nombre varchar2(120)  := P.get_string('nombre');
    l_desc   varchar2(500)  := P.get_string('desc');
    l_lat    number         := P.get_number('lat');
    l_lng    number         := P.get_number('lng');
    l_radio  number         := nvl(P.get_number('radio'), 200);
    l_hor    json_array_t   := treat(P.get('horarios') as json_array_t);
    l_h      json_object_t;
    l_hc     number;
    l_dia    number; l_des varchar2(5); l_has varchar2(5);
  begin
    if l_nombre is null then raise_application_error(-20050,'El nombre es obligatorio'); end if;
    if l_lat is null or l_lng is null then raise_application_error(-20051,'Marca el centro en el mapa'); end if;
    if l_cod is null then
      select nvl(max(ZON_CODIGO)+1,1) into l_cod from GEO_ZONA;
      insert into GEO_ZONA (ZON_CODIGO,ZON_NOMBRE,ZON_DESCRIPCION,ZON_LATITUD,ZON_LONGITUD,
                            ZON_RADIO_M,ZON_GERENTE_USU,ZON_USUARIO_CREA)
      values (l_cod,l_nombre,l_desc,l_lat,l_lng,l_radio,GEO000.USU_CODIGO,GENM000.USUARIO_ACTUAL);
    else
      update GEO_ZONA set ZON_NOMBRE=l_nombre, ZON_DESCRIPCION=l_desc, ZON_LATITUD=l_lat,
             ZON_LONGITUD=l_lng, ZON_RADIO_M=l_radio,
             ZON_FECHA_MOD=sysdate, ZON_USUARIO_MOD=GENM000.USUARIO_ACTUAL
       where ZON_CODIGO=l_cod;
    end if;
    -- sincronizar horarios
    delete from GEO_ZONA_HORARIO where ZOH_ZON_CODIGO = l_cod;
    if l_hor is not null then
      for i in 0 .. l_hor.get_size - 1 loop
        l_h := treat(l_hor.get(i) as json_object_t);
        l_dia := l_h.get_number('dia'); l_des := l_h.get_string('desde'); l_has := l_h.get_string('hasta');
        select nvl(max(ZOH_CODIGO)+1,1) into l_hc from GEO_ZONA_HORARIO;
        insert into GEO_ZONA_HORARIO (ZOH_CODIGO,ZOH_ZON_CODIGO,ZOH_DIA,ZOH_HORA_DESDE,ZOH_HORA_HASTA)
        values (l_hc, l_cod, l_dia, l_des, l_has);
      end loop;
    end if;
    htp.p('{"ok":true,"msg":"Zona guardada"}');
  end;

  procedure ELIMINAR (P json_object_t) is
    l_cod number := P.get_number('codigo');
  begin
    update GEO_ZONA set ZON_ACTIVO='N' where ZON_CODIGO=l_cod;  -- baja logica (conserva marcaciones)
    htp.p('{"ok":true,"msg":"Zona desactivada"}');
  end;

  procedure AJAX is
    l_p json_object_t := json_object_t.parse(nvl(apex_application.g_x02,'{}'));
  begin
    case apex_application.g_x01
      when 'LISTAR'   then LISTAR;
      when 'GET'      then GET_(l_p);
      when 'GUARDAR'  then GUARDAR(l_p);
      when 'ELIMINAR' then ELIMINAR(l_p);
      else htp.p('{"ok":false,"msg":"Accion desconocida"}');
    end case;
  exception
    when others then
      htp.p('{"ok":false,"msg":"'||apex_escape.json(regexp_replace(sqlerrm,'^ORA-\d+: '))||'"}');
  end;

end GEO001;
/
create or replace package GEO002 as
  -- Pagina GEO002 - Marcar presencia (usuario). AJAX: ZONAS_CERCA/MARCAR
  procedure AJAX;
end GEO002;
/
create or replace package body GEO002 as

  procedure ZONAS_CERCA (P json_object_t) is
    l_lat number := P.get_number('lat');
    l_lng number := P.get_number('lng');
    l_out clob;
  begin
    if l_lat is null or l_lng is null then
      htp.p('{"ok":false,"msg":"No se pudo obtener tu ubicacion"}'); return;
    end if;
    -- solo zonas activas EN HORARIO, dentro del radio + buffer 200m.
    -- fuera de horario no se muestra. ya_marcado = marco hoy en esa zona.
    select nvl(json_arrayagg(json_object(
             'codigo' value codigo, 'nombre' value nombre, 'lat' value lat, 'lng' value lng,
             'radio' value radio, 'dist' value dist,
             'en_rango' value case when dist <= radio then 1 else 0 end,
             'ya_marcado' value ya,
             'marcable' value case when dist <= radio and ya = 0 then 1 else 0 end
             returning clob) order by dist returning clob), to_clob('[]'))
      into l_out
      from (
        select z.ZON_CODIGO codigo, z.ZON_NOMBRE nombre, z.ZON_LATITUD lat, z.ZON_LONGITUD lng,
               z.ZON_RADIO_M radio,
               GEO000.DISTANCIA_M(l_lat, l_lng, z.ZON_LATITUD, z.ZON_LONGITUD) dist,
               (select count(*) from GEO_MARCACION m
                 where m.MAR_ZON_CODIGO = z.ZON_CODIGO
                   and m.MAR_USU_CODIGO = GEO000.USU_CODIGO
                   and trunc(m.MAR_FECHA) = trunc(sysdate)) ya
          from GEO_ZONA z
         where z.ZON_ACTIVO = 'S'
           and GEO000.HORARIO_ACTIVO(z.ZON_CODIGO) = 'S'
      )
     where dist <= radio + 200
     order by dist;
    htp.p('{"ok":true,"data":'); GENM000.PJ(l_out); htp.p('}');
  end;

  procedure MARCAR (P json_object_t) is
    l_zon  number := P.get_number('zona');
    l_lat  number := P.get_number('lat');
    l_lng  number := P.get_number('lng');
    l_dist number; l_radio number; l_hor varchar2(1); l_cod number; l_ya number;
  begin
    if l_lat is null or l_lng is null then raise_application_error(-20060,'Ubicacion invalida'); end if;
    select ZON_RADIO_M, GEO000.DISTANCIA_M(l_lat,l_lng,ZON_LATITUD,ZON_LONGITUD)
      into l_radio, l_dist
      from GEO_ZONA where ZON_CODIGO = l_zon and ZON_ACTIVO='S';
    -- validacion server-side (nunca confiar en el cliente)
    if l_dist > l_radio then
      raise_application_error(-20061,'Estas fuera de la zona ('||l_dist||' m, radio '||l_radio||' m)');
    end if;
    l_hor := GEO000.HORARIO_ACTIVO(l_zon);
    if l_hor = 'N' then
      raise_application_error(-20062,'Fuera del horario permitido para esta zona');
    end if;
    -- una sola marca por dia por zona
    select count(*) into l_ya from GEO_MARCACION
     where MAR_ZON_CODIGO = l_zon and MAR_USU_CODIGO = GEO000.USU_CODIGO
       and trunc(MAR_FECHA) = trunc(sysdate);
    if l_ya > 0 then
      raise_application_error(-20063,'Ya marcaste presencia hoy en esta zona');
    end if;
    select nvl(max(MAR_CODIGO)+1,1) into l_cod from GEO_MARCACION;
    insert into GEO_MARCACION (MAR_CODIGO,MAR_ZON_CODIGO,MAR_USU_CODIGO,MAR_LATITUD,MAR_LONGITUD,
                               MAR_DISTANCIA_M,MAR_USUARIO_CREA)
    values (l_cod,l_zon,GEO000.USU_CODIGO,l_lat,l_lng,l_dist,GENM000.USUARIO_ACTUAL);
    htp.p('{"ok":true,"msg":"Presencia marcada a '||l_dist||' m del centro"}');
  exception
    when no_data_found then
      htp.p('{"ok":false,"msg":"Zona no disponible"}');
  end;

  procedure AJAX is
    l_p json_object_t := json_object_t.parse(nvl(apex_application.g_x02,'{}'));
  begin
    case apex_application.g_x01
      when 'ZONAS_CERCA' then ZONAS_CERCA(l_p);
      when 'MARCAR'      then MARCAR(l_p);
      else htp.p('{"ok":false,"msg":"Accion desconocida"}');
    end case;
  exception
    when others then
      htp.p('{"ok":false,"msg":"'||apex_escape.json(regexp_replace(sqlerrm,'^ORA-\d+: '))||'"}');
  end;

end GEO002;
/
