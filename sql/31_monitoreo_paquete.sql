create or replace package MON000 as
  -- Monitoreo en tiempo real. AJAX unico: g_x01=accion, g_x02=JSON.
  -- El avatar propio se sube en apex_application.g_clob_01 (base64), como en CHAT.
  procedure AJAX;
end MON000;
/
create or replace package body MON000 as

  C_ANTISPAM_MIN constant number := 3;   -- min entre alertas repetidas de la misma regla+usuario

  function USU_CODIGO return number is
    l number;
  begin
    select USU_CODIGO into l from GEN_USUARIO where USU_LOGIN = upper(GENM000.USUARIO_ACTUAL);
    return l;
  exception when no_data_found then return null;
  end;

  -- Puede VER el mapa de todos: ADMINISTRADOR / GERENTE / JEFE.
  function PUEDE_MONITOREAR return varchar2 is
    l number := 0;
  begin
    select count(*) into l
      from GEN_USUARIO u
      join GEN_USUARIO_ROL ur on ur.USRO_USU_CODIGO = u.USU_CODIGO
      join GEN_ROL r on r.ROL_CODIGO = ur.USRO_ROL_CODIGO and r.ROL_ACTIVO='S'
     where u.USU_LOGIN = upper(GENM000.USUARIO_ACTUAL)
       and r.ROL_NOMBRE in ('ADMINISTRADOR','GERENTE','JEFE');
    return case when l>0 then 'S' else 'N' end;
  end;

  procedure CHK_MONITOR is
  begin
    if PUEDE_MONITOREAR <> 'S' then
      raise_application_error(-20140,'No tienes permiso para ver el monitoreo');
    end if;
  end;

  -- distancia Haversine en metros entre dos coordenadas
  function DIST_M (P_LAT1 number, P_LNG1 number, P_LAT2 number, P_LNG2 number) return number is
    R  constant number := 6371000;
    dLat number := (P_LAT2 - P_LAT1) * 3.141592653589793 / 180;
    dLng number := (P_LNG2 - P_LNG1) * 3.141592653589793 / 180;
    a  number;
  begin
    a := sin(dLat/2)*sin(dLat/2)
       + cos(P_LAT1*3.141592653589793/180) * cos(P_LAT2*3.141592653589793/180)
         * sin(dLng/2)*sin(dLng/2);
    return R * 2 * atan2(sqrt(a), sqrt(1-a));
  end;

  -- inicial (1a letra del nombre o login) para el avatar de respaldo
  function INICIAL (P_NOM varchar2, P_LOGIN varchar2) return varchar2 is
  begin
    return upper(substr(nvl(trim(P_NOM), P_LOGIN),1,1));
  end;

  -- Envia un push a todos los monitores (ADMIN/GERENTE/JEFE) suscritos. Best-effort.
  procedure PUSH_MONITORES (P_TITULO varchar2, P_CUERPO varchar2) is
    l_app number := to_number(v('APP_ID'));
  begin
    for u in (
      select distinct s.USER_NAME
        from GEN_USUARIO g
        join GEN_USUARIO_ROL ur on ur.USRO_USU_CODIGO = g.USU_CODIGO
        join GEN_ROL r on r.ROL_CODIGO = ur.USRO_ROL_CODIGO and r.ROL_ACTIVO='S'
                      and r.ROL_NOMBRE in ('ADMINISTRADOR','GERENTE','JEFE')
        join APEX_APPL_PUSH_SUBSCRIPTIONS s
          on s.APPLICATION_ID = l_app and upper(s.USER_NAME) = upper(g.USU_LOGIN)
       where g.USU_ACTIVO='S')
    loop
      begin
        apex_pwa.send_push_notification(
          p_application_id => l_app, p_user_name => u.USER_NAME,
          p_title => P_TITULO, p_body => P_CUERPO,
          p_target_url => 'f?p='||l_app||':52:0');
      exception when others then null;
      end;
    end loop;
  exception when others then null;
  end;

  -- Registra una alerta (bitacora) y notifica a los monitores. Con anti-spam:
  -- no repite la misma regla+usuario si ya hubo una en los ultimos C_ANTISPAM_MIN.
  procedure DISPARAR (P_REG number, P_USU number, P_TIPO varchar2, P_DET varchar2,
                      P_LAT number, P_LNG number, P_VEL number) is
    l_n number;
    l_nom varchar2(120);
  begin
    select count(*) into l_n from MON_ALERTA
     where ALE_REG_CODIGO=P_REG and ALE_USU_CODIGO=P_USU
       and ALE_FECHA >= systimestamp - numtodsinterval(C_ANTISPAM_MIN*60,'SECOND');
    if l_n > 0 then return; end if;   -- ya avisamos hace poco

    insert into MON_ALERTA(ALE_REG_CODIGO,ALE_USU_CODIGO,ALE_TIPO,ALE_DETALLE,ALE_LAT,ALE_LNG,ALE_VEL_KMH)
    values(P_REG,P_USU,P_TIPO,P_DET,P_LAT,P_LNG,P_VEL);

    select coalesce(USU_NOMBRE,USU_LOGIN) into l_nom from GEN_USUARIO where USU_CODIGO=P_USU;
    PUSH_MONITORES(l_nom||' - alerta', P_DET);
  end;

  -- Evalua las reglas activas contra la nueva posicion del usuario.
  procedure EVALUAR_REGLAS (P_USU number, P_LAT number, P_LNG number, P_VEL_KMH number,
                            P_PLAT number, P_PLNG number) is
    l_nom varchar2(120);
    l_dist number; l_pdist number;
  begin
    select coalesce(USU_NOMBRE,USU_LOGIN) into l_nom from GEN_USUARIO where USU_CODIGO=P_USU;
    for r in (select * from MON_REGLA
               where REG_ACTIVO='S'
                 and (REG_USU_OBJETIVO is null or REG_USU_OBJETIVO = P_USU))
    loop
      if r.REG_TIPO = 'VELOCIDAD' then
        if P_VEL_KMH is not null and r.REG_UMBRAL_KMH is not null
           and P_VEL_KMH > r.REG_UMBRAL_KMH then
          DISPARAR(r.REG_CODIGO, P_USU, 'VELOCIDAD',
                   l_nom||' supero '||r.REG_UMBRAL_KMH||' km/h (va a '||round(P_VEL_KMH,1)||')',
                   P_LAT, P_LNG, P_VEL_KMH);
        end if;
      elsif r.REG_TIPO in ('LLEGADA','SALIDA') and r.REG_LAT is not null then
        l_dist := DIST_M(P_LAT, P_LNG, r.REG_LAT, r.REG_LNG);
        l_pdist := case when P_PLAT is null then null
                        else DIST_M(P_PLAT, P_PLNG, r.REG_LAT, r.REG_LNG) end;
        if r.REG_TIPO='LLEGADA'
           and l_dist <= r.REG_RADIO_M
           and (l_pdist is null or l_pdist > r.REG_RADIO_M) then
          DISPARAR(r.REG_CODIGO, P_USU, 'LLEGADA',
                   l_nom||' llego a '||r.REG_NOMBRE, P_LAT, P_LNG, P_VEL_KMH);
        elsif r.REG_TIPO='SALIDA'
           and l_dist > r.REG_RADIO_M
           and (l_pdist is not null and l_pdist <= r.REG_RADIO_M) then
          DISPARAR(r.REG_CODIGO, P_USU, 'SALIDA',
                   l_nom||' salio de '||r.REG_NOMBRE, P_LAT, P_LNG, P_VEL_KMH);
        end if;
      end if;
    end loop;
  exception when others then null;   -- una regla rota no frena el reporte
  end;

  -- El usuario reporta su posicion actual. Calcula la velocidad si la API no la trae.
  procedure REPORTAR (P json_object_t) is
    l_usu number := USU_CODIGO;
    l_lat number := P.get_number('lat');
    l_lng number := P.get_number('lng');
    l_prec number := P.get_number('precision');
    l_vel  number := P.get_number('velocidad');   -- m/s (puede venir null)
    l_rumbo number := P.get_number('rumbo');
    l_bat  number := P.get_number('bateria');
    l_plat number; l_plng number; l_pfec timestamp; l_dt number; l_hay_prev boolean := false;
  begin
    if l_usu is null then raise_application_error(-20141,'Sesion no valida'); end if;
    if l_lat is null or l_lng is null then raise_application_error(-20142,'Faltan coordenadas'); end if;

    -- ultimo punto del usuario: sirve para calcular velocidad Y para llegada/salida de geocercas
    begin
      select POS_LAT, POS_LNG, POS_FECHA
        into l_plat, l_plng, l_pfec
        from (select POS_LAT, POS_LNG, POS_FECHA from MON_POSICION
               where POS_USU_CODIGO = l_usu order by POS_FECHA desc)
       where rownum = 1;
      l_hay_prev := true;
    exception when no_data_found then l_hay_prev := false;
    end;

    -- velocidad: si la API no la da (o es negativa), la calculamos con el ultimo punto
    if l_vel is null or l_vel < 0 then
      if l_hay_prev then
        l_dt := extract(day    from (systimestamp - l_pfec))*86400
              + extract(hour   from (systimestamp - l_pfec))*3600
              + extract(minute from (systimestamp - l_pfec))*60
              + extract(second from (systimestamp - l_pfec));
        if l_dt is not null and l_dt between 1 and 120 then
          l_vel := DIST_M(l_plat, l_plng, l_lat, l_lng) / l_dt;   -- m/s
        else
          l_vel := 0;
        end if;
      else
        l_vel := 0;
      end if;
    end if;

    insert into MON_POSICION (POS_USU_CODIGO, POS_LAT, POS_LNG, POS_PRECISION_M,
                              POS_VELOCIDAD_MS, POS_RUMBO, POS_BATERIA)
    values (l_usu, l_lat, l_lng, l_prec, l_vel, l_rumbo, l_bat);

    -- evaluar reglas de alerta (velocidad / llegada / salida) contra este punto
    EVALUAR_REGLAS(l_usu, l_lat, l_lng, nvl(l_vel,0)*3.6,
                   case when l_hay_prev then l_plat end,
                   case when l_hay_prev then l_plng end);

    htp.p('{"ok":true}');
  end;

  -- Dejar de compartir: borra mis posiciones (desaparezco del mapa de todos).
  procedure DETENER is
    l_usu number := USU_CODIGO;
  begin
    if l_usu is not null then delete from MON_POSICION where POS_USU_CODIGO = l_usu; end if;
    htp.p('{"ok":true}');
  end;

  -- Usuarios activos (con posicion en los ultimos N minutos) para pintar el mapa.
  procedure ACTIVOS (P json_object_t) is
    l_min number := nvl(P.get_number('minutos'), 10);
    l_out clob;
  begin
    CHK_MONITOR;
    with ult as (
      select p.*,
             row_number() over (partition by p.POS_USU_CODIGO order by p.POS_FECHA desc) rn
        from MON_POSICION p
       where p.POS_FECHA >= systimestamp - numtodsinterval(l_min*60,'SECOND'))
    select nvl(json_arrayagg(json_object(
             'usu'    value u.USU_CODIGO,
             'nombre' value coalesce(u.USU_NOMBRE, u.USU_LOGIN),
             'login'  value u.USU_LOGIN,
             'color'  value nvl(u.USU_COLOR,'#4f46e5'),
             'inicial' value upper(substr(nvl(trim(u.USU_NOMBRE),u.USU_LOGIN),1,1)),
             'avatar' value case when u.USU_AVATAR is not null then 'S' else 'N' end,
             'lat'    value x.POS_LAT,
             'lng'    value x.POS_LNG,
             'precision' value round(x.POS_PRECISION_M),
             'vel_kmh' value round(nvl(x.POS_VELOCIDAD_MS,0) * 3.6, 1),
             'rumbo'  value round(x.POS_RUMBO),
             'bateria' value x.POS_BATERIA,
             'hora'   value to_char(x.POS_FECHA,'HH24:MI:SS'),
             'antiguedad_seg' value round((cast(systimestamp as date) - cast(x.POS_FECHA as date))*86400)
             returning clob) order by u.USU_LOGIN returning clob), to_clob('[]'))
      into l_out
      from ult x
      join GEN_USUARIO u on u.USU_CODIGO = x.POS_USU_CODIGO
     where x.rn = 1;
    htp.p('{"ok":true,"data":'); GENM000.PJ(l_out); htp.p('}');
  end;

  -- Rastro (ultimos N puntos) de un usuario, para dibujar su recorrido reciente.
  procedure HISTORIAL (P json_object_t) is
    l_usu number := P.get_number('usu');
    l_n   number := nvl(P.get_number('puntos'), 30);
    l_out clob;
  begin
    CHK_MONITOR;
    select nvl(json_arrayagg(json_array(t.POS_LAT, t.POS_LNG returning clob)
             order by t.POS_FECHA returning clob), to_clob('[]'))
      into l_out
      from (select POS_LAT, POS_LNG, POS_FECHA from MON_POSICION
             where POS_USU_CODIGO = l_usu order by POS_FECHA desc)
           t
     where rownum <= l_n;
    htp.p('{"ok":true,"data":'); GENM000.PJ(l_out); htp.p('}');
  end;

  -- Avatar (dataURL) de un usuario, para el marcador del mapa.
  procedure AVATAR (P json_object_t) is
    l_usu number := P.get_number('usu');
    l_b blob; l_m varchar2(100);
  begin
    select USU_AVATAR, USU_AVATAR_MIME into l_b, l_m
      from GEN_USUARIO where USU_CODIGO = l_usu;
    if l_b is null then htp.p('{"ok":true,"data":null}'); return; end if;
    -- htp.prn (no htp.p): htp.p mete un salto tras "base64," y rompe el dataURL
    htp.prn('{"ok":true,"data":"data:'||nvl(l_m,'image/png')||';base64,');
    htp.prn(apex_web_service.blob2clobbase64(l_b));
    htp.prn('"}');
  exception when no_data_found then htp.p('{"ok":true,"data":null}');
  end;

  -- Subir MI avatar (base64 en g_clob_01). Limite ~1MB.
  procedure SUBIR_AVATAR (P json_object_t) is
    l_usu number := USU_CODIGO;
    l_mime varchar2(100) := nvl(P.get_string('mime'),'image/png');
    l_b64  clob := apex_application.g_clob_01;
    l_blob blob;
  begin
    if l_usu is null then raise_application_error(-20143,'Sesion no valida'); end if;
    if l_b64 is null or length(l_b64) = 0 then raise_application_error(-20144,'No llego la imagen'); end if;
    if dbms_lob.getlength(l_b64) > 1500000 then raise_application_error(-20145,'La imagen es muy grande (max ~1MB)'); end if;
    l_blob := apex_web_service.clobbase642blob(l_b64);
    update GEN_USUARIO set USU_AVATAR = l_blob, USU_AVATAR_MIME = l_mime
     where USU_CODIGO = l_usu;
    htp.p('{"ok":true,"msg":"Avatar actualizado"}');
  end;

  procedure QUITAR_AVATAR is
    l_usu number := USU_CODIGO;
  begin
    if l_usu is not null then
      update GEN_USUARIO set USU_AVATAR = null, USU_AVATAR_MIME = null where USU_CODIGO = l_usu;
    end if;
    htp.p('{"ok":true,"msg":"Avatar quitado"}');
  end;

  -- Guardar el color del avatar de respaldo (paleta).
  procedure GUARDAR_COLOR (P json_object_t) is
    l_usu number := USU_CODIGO;
    l_col varchar2(9) := P.get_string('color');
  begin
    if l_usu is not null and l_col is not null then
      update GEN_USUARIO set USU_COLOR = l_col where USU_CODIGO = l_usu;
    end if;
    htp.p('{"ok":true}');
  end;

  -- Mi perfil (para el panel de avatar).
  procedure MI_PERFIL is
    l_usu number := USU_CODIGO;
    l_pm  varchar2(1) := PUEDE_MONITOREAR;   -- fuera del SQL (no es usable dentro)
    l_out clob;
  begin
    select json_object(
             'usu' value u.USU_CODIGO,
             'nombre' value coalesce(u.USU_NOMBRE,u.USU_LOGIN),
             'color' value nvl(u.USU_COLOR,'#4f46e5'),
             'inicial' value upper(substr(nvl(trim(u.USU_NOMBRE),u.USU_LOGIN),1,1)),
             'avatar' value case when u.USU_AVATAR is not null then 'S' else 'N' end,
             'puede_monitorear' value l_pm
             returning clob)
      into l_out from GEN_USUARIO u where u.USU_CODIGO = l_usu;
    htp.p('{"ok":true,"data":'); GENM000.PJ(l_out); htp.p('}');
  end;

  -- Listar reglas de alerta (solo monitores).
  procedure REGLAS is
    l_out clob;
  begin
    CHK_MONITOR;
    select nvl(json_arrayagg(json_object(
             'codigo' value r.REG_CODIGO, 'nombre' value r.REG_NOMBRE, 'tipo' value r.REG_TIPO,
             'umbral' value r.REG_UMBRAL_KMH, 'lat' value r.REG_LAT, 'lng' value r.REG_LNG,
             'radio' value r.REG_RADIO_M, 'activo' value r.REG_ACTIVO,
             'objetivo' value r.REG_USU_OBJETIVO,
             'objetivo_nom' value (select coalesce(g.USU_NOMBRE,g.USU_LOGIN)
                                     from GEN_USUARIO g where g.USU_CODIGO=r.REG_USU_OBJETIVO)
             returning clob) order by r.REG_CODIGO returning clob), to_clob('[]'))
      into l_out from MON_REGLA r;
    htp.p('{"ok":true,"data":'); GENM000.PJ(l_out); htp.p('}');
  end;

  procedure GUARDAR_REGLA (P json_object_t) is
    l_cod  number := P.get_number('codigo');
    l_nom  varchar2(120) := P.get_string('nombre');
    l_tipo varchar2(12)  := P.get_string('tipo');
    l_umb  number := P.get_number('umbral');
    l_lat  number := P.get_number('lat');
    l_lng  number := P.get_number('lng');
    l_rad  number := P.get_number('radio');
    l_obj  number := P.get_number('objetivo');
    l_act  varchar2(1) := nvl(P.get_string('activo'),'S');
  begin
    CHK_MONITOR;
    if l_nom is null then raise_application_error(-20146,'La regla necesita un nombre'); end if;
    if l_tipo = 'VELOCIDAD' and (l_umb is null or l_umb <= 0) then
      raise_application_error(-20147,'Indica el umbral de velocidad (km/h)');
    end if;
    if l_tipo in ('LLEGADA','SALIDA') and (l_lat is null or l_lng is null or nvl(l_rad,0) <= 0) then
      raise_application_error(-20148,'Marca el lugar en el mapa y define el radio (m)');
    end if;
    if l_cod is null then
      insert into MON_REGLA(REG_NOMBRE,REG_TIPO,REG_UMBRAL_KMH,REG_LAT,REG_LNG,REG_RADIO_M,
                            REG_USU_OBJETIVO,REG_ACTIVO,REG_USUARIO_CREA)
      values(l_nom,l_tipo,l_umb,l_lat,l_lng,l_rad,l_obj,l_act,GENM000.USUARIO_ACTUAL);
    else
      update MON_REGLA set REG_NOMBRE=l_nom,REG_TIPO=l_tipo,REG_UMBRAL_KMH=l_umb,
             REG_LAT=l_lat,REG_LNG=l_lng,REG_RADIO_M=l_rad,REG_USU_OBJETIVO=l_obj,REG_ACTIVO=l_act
       where REG_CODIGO=l_cod;
    end if;
    htp.p('{"ok":true,"msg":"Regla guardada"}');
  end;

  procedure ELIMINAR_REGLA (P json_object_t) is
    l_cod number := P.get_number('codigo');
  begin
    CHK_MONITOR;
    delete from MON_REGLA where REG_CODIGO = l_cod;
    htp.p('{"ok":true,"msg":"Regla eliminada"}');
  end;

  -- Feed de alertas recientes (para el panel de la pagina).
  procedure ALERTAS (P json_object_t) is
    l_n number := nvl(P.get_number('n'), 30);
    l_out clob;
  begin
    CHK_MONITOR;
    select nvl(json_arrayagg(json_object(
             'codigo' value a.ALE_CODIGO, 'tipo' value a.ALE_TIPO, 'detalle' value a.ALE_DETALLE,
             'lat' value a.ALE_LAT, 'lng' value a.ALE_LNG,
             'hora' value to_char(a.ALE_FECHA,'DD/MM HH24:MI'), 'visto' value a.ALE_VISTO
             returning clob) order by a.ALE_CODIGO desc returning clob), to_clob('[]'))
      into l_out
      from (select * from MON_ALERTA order by ALE_CODIGO desc) a
     where rownum <= l_n;
    htp.p('{"ok":true,"data":'); GENM000.PJ(l_out); htp.p('}');
  end;

  procedure MARCAR_ALERTAS is
  begin
    CHK_MONITOR;
    update MON_ALERTA set ALE_VISTO='S' where ALE_VISTO='N';
    htp.p('{"ok":true}');
  end;

  -- Usuarios activos, para el selector "vigilar a" de las reglas.
  procedure USUARIOS is
    l_out clob;
  begin
    CHK_MONITOR;
    select nvl(json_arrayagg(json_object(
             'usu' value USU_CODIGO, 'nombre' value coalesce(USU_NOMBRE,USU_LOGIN)
             returning clob) order by USU_LOGIN returning clob), to_clob('[]'))
      into l_out from GEN_USUARIO where USU_ACTIVO='S';
    htp.p('{"ok":true,"data":'); GENM000.PJ(l_out); htp.p('}');
  end;

  procedure AJAX is
    l_p json_object_t := json_object_t.parse(nvl(apex_application.g_x02,'{}'));
  begin
    case apex_application.g_x01
      when 'REPORTAR'      then REPORTAR(l_p);
      when 'DETENER'       then DETENER;
      when 'ACTIVOS'       then ACTIVOS(l_p);
      when 'HISTORIAL'     then HISTORIAL(l_p);
      when 'AVATAR'        then AVATAR(l_p);
      when 'SUBIR_AVATAR'  then SUBIR_AVATAR(l_p);
      when 'QUITAR_AVATAR' then QUITAR_AVATAR;
      when 'GUARDAR_COLOR' then GUARDAR_COLOR(l_p);
      when 'MI_PERFIL'     then MI_PERFIL;
      when 'REGLAS'        then REGLAS;
      when 'GUARDAR_REGLA' then GUARDAR_REGLA(l_p);
      when 'ELIMINAR_REGLA' then ELIMINAR_REGLA(l_p);
      when 'ALERTAS'       then ALERTAS(l_p);
      when 'MARCAR_ALERTAS' then MARCAR_ALERTAS;
      when 'USUARIOS'      then USUARIOS;
      else htp.p('{"ok":false,"msg":"Accion desconocida"}');
    end case;
  exception
    when others then
      htp.p('{"ok":false,"msg":"'||apex_escape.json(regexp_replace(sqlerrm,'^ORA-\d+: '))||'"}');
  end;

end MON000;
/
