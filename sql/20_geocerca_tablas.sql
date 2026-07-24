drop table if exists GEO_MARCACION cascade constraints
/
drop table if exists GEO_ZONA_HORARIO cascade constraints
/
drop table if exists GEO_ZONA cascade constraints
/
create table GEO_ZONA (
  ZON_CODIGO         number        constraint GEO_ZON_PK primary key,
  ZON_NOMBRE         varchar2(120) not null,
  ZON_DESCRIPCION    varchar2(500),
  ZON_LATITUD        number(10,7)  not null,
  ZON_LONGITUD       number(10,7)  not null,
  ZON_RADIO_M        number        default 200 not null,   -- radio geocerca en metros
  ZON_GERENTE_USU    number        constraint GEO_ZON_FK_USU references GEN_USUARIO,
  ZON_ACTIVO         varchar2(1)   default 'S' not null check (ZON_ACTIVO in ('S','N')),
  ZON_FECHA_CREA     date          default sysdate,
  ZON_USUARIO_CREA   varchar2(30),
  ZON_FECHA_MOD      date,
  ZON_USUARIO_MOD    varchar2(30)
)
/
create table GEO_ZONA_HORARIO (
  ZOH_CODIGO      number        constraint GEO_ZOH_PK primary key,
  ZOH_ZON_CODIGO  number        not null constraint GEO_ZOH_FK_ZON references GEO_ZONA on delete cascade,
  ZOH_DIA         number        not null check (ZOH_DIA between 1 and 7),   -- 1=Lunes .. 7=Domingo
  ZOH_HORA_DESDE  varchar2(5)   not null,   -- 'HH24:MI'
  ZOH_HORA_HASTA  varchar2(5)   not null
)
/
create index GEO_ZOH_IX on GEO_ZONA_HORARIO (ZOH_ZON_CODIGO)
/
create table GEO_MARCACION (
  MAR_CODIGO       number        constraint GEO_MAR_PK primary key,
  MAR_ZON_CODIGO   number        not null constraint GEO_MAR_FK_ZON references GEO_ZONA,
  MAR_USU_CODIGO   number        constraint GEO_MAR_FK_USU references GEN_USUARIO,
  MAR_LATITUD      number(10,7)  not null,
  MAR_LONGITUD     number(10,7)  not null,
  MAR_DISTANCIA_M  number,                  -- distancia al centro al marcar
  MAR_FECHA        timestamp     default systimestamp,
  MAR_USUARIO_CREA varchar2(30)
)
/
create index GEO_MAR_IX_ZON on GEO_MARCACION (MAR_ZON_CODIGO)
/
create index GEO_MAR_IX_USU on GEO_MARCACION (MAR_USU_CODIGO)
/
create index GEO_MAR_IX_FEC on GEO_MARCACION (MAR_FECHA)
/
-- rol GERENTE
insert into GEN_ROL (ROL_CODIGO, ROL_NOMBRE, ROL_USUARIO_CREA)
select nvl(max(ROL_CODIGO)+1,1), 'GERENTE', 'ADMIN' from GEN_ROL
where not exists (select 1 from GEN_ROL where ROL_NOMBRE='GERENTE')
/
-- zona demo: centro de Asuncion, radio 300m, gerente=ADMIN(1)
insert into GEO_ZONA (ZON_CODIGO, ZON_NOMBRE, ZON_DESCRIPCION, ZON_LATITUD, ZON_LONGITUD, ZON_RADIO_M, ZON_GERENTE_USU, ZON_USUARIO_CREA)
values (1, 'Oficina Central', 'Zona de marcacion oficina central', -25.2827000, -57.6359000, 300, 1, 'ADMIN')
/
-- horario demo Lunes a Viernes 08:00-18:00
insert into GEO_ZONA_HORARIO (ZOH_CODIGO, ZOH_ZON_CODIGO, ZOH_DIA, ZOH_HORA_DESDE, ZOH_HORA_HASTA)
select rownum, 1, rownum, '08:00', '18:00' from dual connect by level <= 5
/
