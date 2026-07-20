

create user hudsonu with password 'Anti_Theft_Device99';

CREATE SCHEMA AUTHORIZATION hudsonu;


drop table HUDSONU.EXPENSE;
drop table HUDSONU.BUDGET;
drop table HUDSONU.EVENT;
drop table hudsonu.club_member;
drop table HUDSONU.STUDENT;
drop table HUDSONU.CLUB;
drop table HUDSONU.major;

CREATE TABLE HUDSONU.MAJOR(
    MAJOR_CODE CHAR(4) PRIMARY KEY ,
    MAJOR_NAME  VARCHAR(60),
    DEPARTMENT VARCHAR(60),
    DIVISION VARCHAR(50)
);

create table HUDSONU.CLUB(
	club_code varchar(6)  primary key ,
	Name varchar(50),
	DESCRIPTION varchar(3000), 
	SUMMARY varchar(300), 
	FEE decimal(2,0)
);

create table HUDSONU.STUDENT(
	STUDENT_ID varchar(10)  primary key ,
	FIRST_NAME varchar(50),
	LAST_NAME varchar(50),
	PHONE VARCHAR(12),
	SHIRT_SIZE VARCHAR(3),
	CITY VARCHAR(25),
	STATE CHAR(2),
	ZIP CHAR(5),
	EMAIL VARCHAR(21), 
	MAJOR_CODE char(4) references HUDSONU.major
);

create table hudsonu.club_member(
	CLUB_CODE varchar(6) references HUDSONU.CLUB,
	STUDENT_ID varchar(10)  references HUDSONU.STUDENT,
	POSITION varchar(15),
	primary key (club_code, STUDENT_ID)
);


create table HUDSONU.EVENT(
	EVENT_ID int primary key ,
	NAME varchar(200),
	BEGIN_TIME date,
	END_TIME date,
	LOCATION varchar(100),
	THEME varchar(20),
	CATEGORY varchar(32),
	BUDGET decimal(4,0),
	club_code varchar(6) references HUDSONU.CLUB,
	DESCRIPTION varchar(3000),
	TOTAL_BUDGET decimal(5)
);

create table HUDSONU.BUDGET(
	EVENT_ID int references HUDSONU.EVENT,
	ACCOUNT VARCHAR(30),
	AMOUNT decimal(3,0),
	DESCRIPTION VARCHAR(125),
	primary key(EVENT_ID, account)
);

create table HUDSONU.EXPENSE(
	EXPENSE_ID int primary key,
	EXPENSE_DATE DATE,
	EVENT_ID int references HUDSONU.EVENT,
	STUDENT_ID varchar(10)  references HUDSONU.STUDENT,
	AMOUNT decimal(5,2),
	ACCOUNT VARCHAR(30)
);


grant select on HUDSONU.EXPENSE to public;
grant select on HUDSONU.BUDGET to public;
grant select on HUDSONU.EVENT to public;
grant select on hudsonu.club_member to public;
grant select on HUDSONU.STUDENT to public;
grant select on HUDSONU.CLUB to public;
grant select on HUDSONU.major to public;









