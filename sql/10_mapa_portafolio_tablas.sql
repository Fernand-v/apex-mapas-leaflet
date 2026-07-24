drop table if exists MAP_UBICACION cascade constraints
/
drop table if exists MAP_CATEGORIA cascade constraints
/
create table MAP_CATEGORIA (
  CAT_CODIGO   number        constraint MAP_CAT_PK primary key,
  CAT_NOMBRE   varchar2(60)  not null constraint MAP_CAT_UK unique,
  CAT_ICONO    varchar2(50)  default 'fa-map-marker',
  CAT_COLOR    varchar2(9)   default '#3b5bdb',
  CAT_ACTIVO   varchar2(1)   default 'S' not null check (CAT_ACTIVO in ('S','N'))
)
/
create table MAP_UBICACION (
  UBI_CODIGO       number         constraint MAP_UBI_PK primary key,
  UBI_NOMBRE       varchar2(120)  not null,
  UBI_DESCRIPCION  varchar2(1000),
  UBI_CAT_CODIGO   number         not null constraint MAP_UBI_FK_CAT references MAP_CATEGORIA,
  UBI_LATITUD      number(10,7)   not null,
  UBI_LONGITUD     number(10,7)   not null,
  UBI_USU_CODIGO   number         constraint MAP_UBI_FK_USU references GEN_USUARIO,
  UBI_ESTADO       varchar2(1)    default 'S' not null check (UBI_ESTADO in ('S','N')),
  UBI_FECHA_CREA   date           default sysdate,
  UBI_USUARIO_CREA varchar2(30),
  UBI_FECHA_MOD    date,
  UBI_USUARIO_MOD  varchar2(30)
)
/
create index MAP_UBI_IX_CAT on MAP_UBICACION (UBI_CAT_CODIGO)
/
create index MAP_UBI_IX_USU on MAP_UBICACION (UBI_USU_CODIGO)
/
-- seed categorias
insert into MAP_CATEGORIA values (1,'Restaurante','fa-cutlery',    '#e63946','S')
/
insert into MAP_CATEGORIA values (2,'Turistico',  'fa-camera',     '#2a9d8f','S')
/
insert into MAP_CATEGORIA values (3,'Trabajo',    'fa-briefcase',  '#3b5bdb','S')
/
insert into MAP_CATEGORIA values (4,'Hogar',      'fa-home',       '#e76f51','S')
/
insert into MAP_CATEGORIA values (5,'Evento',     'fa-calendar',   '#7048e8','S')
/
insert into MAP_CATEGORIA values (6,'Compras',    'fa-shopping-cart','#f4a261','S')
/
-- seed ubicaciones demo (Asuncion, Paraguay) del usuario ADMIN (codigo 1)
insert into MAP_UBICACION (UBI_CODIGO,UBI_NOMBRE,UBI_DESCRIPCION,UBI_CAT_CODIGO,UBI_LATITUD,UBI_LONGITUD,UBI_USU_CODIGO,UBI_USUARIO_CREA)
values (1,'Palacio de los Lopez','Sede del gobierno paraguayo',2,-25.2827000,-57.6359000,1,'ADMIN')
/
insert into MAP_UBICACION (UBI_CODIGO,UBI_NOMBRE,UBI_DESCRIPCION,UBI_CAT_CODIGO,UBI_LATITUD,UBI_LONGITUD,UBI_USU_CODIGO,UBI_USUARIO_CREA)
values (2,'Costanera de Asuncion','Paseo junto al rio Paraguay',2,-25.2680000,-57.6440000,1,'ADMIN')
/
insert into MAP_UBICACION (UBI_CODIGO,UBI_NOMBRE,UBI_DESCRIPCION,UBI_CAT_CODIGO,UBI_LATITUD,UBI_LONGITUD,UBI_USU_CODIGO,UBI_USUARIO_CREA)
values (3,'Mercado 4','Mercado tradicional',6,-25.2990000,-57.6280000,1,'ADMIN')
/
