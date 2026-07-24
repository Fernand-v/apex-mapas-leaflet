-- ACL de red para que el job ORACLE_APEX_PWA_PUSH_QUEUE (corre como APEX_240200)
-- pueda salir por HTTPS a los servicios de push de los navegadores.
-- Sin esto, apex_pwa.send_push_notification encola pero el envio falla con ORA-24247.
begin
  for h in (select column_value host
              from table(sys.odcivarchar2list(
                     'fcm.googleapis.com',                    -- Chrome / Edge
                     'updates.push.services.mozilla.com',     -- Firefox
                     '*.notify.windows.com',                  -- WNS
                     'web.push.apple.com'))) loop             -- Safari
    -- sin lower/upper_port: un host con comodin no admite rango de puertos (ORA-24244)
    dbms_network_acl_admin.append_host_ace(
      host       => h.host,
      ace        => xs$ace_type(
                      privilege_list => xs$name_list('connect','resolve'),
                      principal_name => 'APEX_240200',
                      principal_type => xs_acl.ptype_db));
  end loop;
end;
/
