# Lessons 12–14 SQL Examples

SQL transcribed from MyEducator interactive query figures (book-query embeds). Organized by lesson and section.

---

## Lesson 12: Introduction To SQL

### 12.3 The SELECT Clause of the SQL Statement

#### Figure 12.10 — Query Result

```sql
SELECT last_name, email
FROM member
```

#### Figure 12.11 — Select * Query and Result

```sql
SELECT *
FROM member
```

#### Figure 12.12 — Query Result with Duplicated Rows

```sql
SELECT position
FROM member
```

#### Figure 12.13 — Query Showing Only Unique Rows

```sql
SELECT DISTINCT position
FROM member
```

### 12.6 The Order By Clause of the SQL Statement

#### Figure 12.14 — Query with Results Sorted Alphabetically by Last Name

```sql
SELECT first_name, last_name
FROM member
ORDER BY last_name
```

#### Figure 12.15 — Query with Results Sorted Reverse Alphabetically by Last Name

```sql
SELECT first_name, last_name
FROM member
ORDER BY last_name DESC
```

#### Figure 12.16 — Query Resulting from Sorting on Multiple Fields

```sql
SELECT first_name, last_name, position
FROM member
ORDER BY position DESC, last_name
```

### 12.8 Limit Options

#### Figure 12.17 — Query Limited to Five Rows

```sql
SELECT first_name, last_name
FROM member
LIMIT 5
```

#### Figure 12.18 — Query Result with Order By and Limit

```sql
SELECT *
FROM expense
ORDER BY cost DESC
LIMIT 4
```

---

## Lesson 13: Writing Queries with Restrictions

### 13.1 What is the WHERE Clause?

#### Figure 13.1 — Query with a restriction

```sql
SELECT first_name, last_name, position
FROM member
WHERE position = 'President'
```

### 13.2 Comparison Operators

> Figure 13.4 is a comparison-operators table (no SQL query) — omitted.

#### Figure 13.2 — Where Clause with Field Not in the Select Clause

```sql
SELECT first_name
FROM member
WHERE last_name = 'Smith'
```

#### Figure 13.3 — Criterion with a Number Value

```sql
SELECT *
FROM expense
WHERE cost = 122.06
```

#### Figure 13.5 — Criterion with a Greater Than Operator

```sql
SELECT *
FROM expense
WHERE cost > 100
```

#### Figure 13.6 — Criterion with a Less Than Operator

```sql
SELECT *
FROM expense
WHERE cost < 50
```

#### Figure 13.7 — Query Result with Greater Than or Equal To Operator

```sql
SELECT *
FROM income
WHERE amount >= 200
```

### 13.4 Working with Null Values

#### Figure 13.8 — Member with a NULL Value for the link_to_major Field

```sql
SELECT first_name, last_name, link_to_major
FROM member
WHERE last_name = 'Woodard'
```

#### Figure 13.9 — Query with the IS NULL Operator

```sql
SELECT first_name, last_name, link_to_major
FROM member
WHERE link_to_major IS NULL
```

#### Figure 13.10 — Events with a NULL Value for the Notes Field

```sql
SELECT event_name, event_date, type, notes
FROM event
WHERE notes IS NULL
```

#### Figure 13.11 — Events with Non-Null Values for the Notes Field

```sql
SELECT event_name, event_date, type, notes
FROM event
WHERE notes IS NOT NULL
```

### 13.6 Compound Where Clauses

#### Figure 13.12 — Query with a Compound Where Clause

```sql
SELECT *
FROM income
WHERE amount >= 100
AND amount <= 1000
```

#### Figure 13.13 — Where Clause with the AND Operator

```sql
SELECT *
FROM expense
WHERE cost >= 20.2
AND cost <= 50.13
```

#### Figure 13.14 — Criterion using the Between Operator

```sql
SELECT *
FROM expense
WHERE cost BETWEEN 20.2 AND 50.13
```

#### Figure 13.15 — AND Criteria with Different Fields

```sql
SELECT *
FROM expense
WHERE cost > 100
AND expense_description = 'Pizza'
```

#### Figure 13.16 — Where with the OR Operator

```sql
SELECT *
FROM member
WHERE t_shirt_size = 'Small' OR t_shirt_size = 'Medium'
```

#### Figure 13.17 — Where Clause using the IN Operator

```sql
SELECT *
FROM member
WHERE t_shirt_size IN ('Small', 'Medium')
```

#### Figure 13.18 — OR Criteria with Different Fields

```sql
SELECT *
FROM member
WHERE first_name = 'Amy' OR last_name = 'Sanders'
```

#### Figure 13.19 — The NOT Operator

```sql
SELECT first_name, last_name, t_shirt_size
FROM member
WHERE NOT (t_shirt_size = 'Small')
```

### 13.7 Working with Date Fields in a Where Clause

#### Figure 13.20 — Date of the March Meeting

```sql
SELECT event_name, event_date
FROM event
```

#### Figure 13.21 — Incorrect Syntax for Date Field in Where Clause

```sql
SELECT event_name, event_date
FROM event
WHERE event_date = '2020-03-10'
```

> Book presents this as incorrect for datetime values.

#### Figure 13.22 — Events that Occurred at Noon on 3/10/2020

```sql
SELECT event_name, event_date
FROM event
WHERE event_date = '2020-03-10T12:00:00'
```

#### Figure 13.23 — Events that Occurred At Any Time on 3/10/2020

```sql
SELECT event_name, event_date
FROM event
WHERE event_date >= '2020-03-10'
AND event_date < '2020-03-11'
```

#### Figure 13.24 — Events that Occurred During February of 2020

```sql
SELECT event_name, event_date
FROM event
WHERE event_date >= '2020-02-01'
AND event_date < '2020-03-01'
```

#### Figure 13.25 — Events that Occurred in 2019

```sql
SELECT event_name, event_date
FROM event
WHERE YEAR(event_date) = 2019
```

#### Figure 13.26 — Events that Occurred in November

```sql
SELECT event_name, event_date
FROM event
WHERE MONTH(event_date) = 11
```

#### Figure 13.27 — Events that Occurred on the 12th

```sql
SELECT event_name, event_date
FROM event
WHERE DAY(event_date) = 12
```

#### Figure 13.28 — Events that Occurred on 3/10/2020

```sql
SELECT event_name, event_date
FROM event
WHERE MONTH(event_date) = 3
AND DAY(event_date) = 10
AND YEAR(event_date) = 2020
```

#### Figure 13.29 — Events that Occurred During February of 2020

```sql
SELECT event_name, event_date
FROM event
WHERE MONTH(event_date) = 2
AND YEAR(event_date) = 2020
```

### 13.9 Wildcards

#### Figure 13.30 — Unique Values for the expense_description Field

```sql
SELECT DISTINCT expense_description
FROM expense
```

#### Figure 13.31 — No Records Contain an expense_description of Exactly 'Water'

```sql
SELECT *
FROM expense
WHERE expense_description = 'Water'
```

#### Figure 13.32 — Where Clause with a Wildcard Criteria

```sql
SELECT *
FROM expense
WHERE expense_description LIKE '%Water%'
```

#### Figure 13.33 — Where Clause with the Underscore Wildcard Character

```sql
SELECT *
FROM member
WHERE first_name LIKE 'Adel_'
```

---

## Lesson 14: Joining Multiple Tables in the Same Query

### 14.1 What is a Join?

> Figure 14.2 is a linking diagram (no SQL) — omitted.

#### Figure 14.1 — The Major Table

```sql
SELECT *
FROM major
```

#### Figure 14.3 — Linking Tables using Primary and Foreign Keys

```sql
SELECT first_name, last_name, link_to_major, major_id, major_name
FROM member
JOIN major
ON member.link_to_major = major.major_id
```

#### Figure 14.4 — Member without a Major

```sql
SELECT first_name, last_name, link_to_major
FROM member
WHERE link_to_major IS NULL
```

#### Figure 14.5 — The Major and Member Tables Joined in the Same Query

```sql
SELECT first_name, last_name, major_name
FROM major
JOIN member
ON major.major_id = member.link_to_major
```

#### Figure 14.6 — Members with the College for their Majors

```sql
SELECT last_name, college
FROM major
JOIN member
ON major.major_id = member.link_to_major
```

### 14.3 Joining Three or More Tables

#### Figure 14.7 — Joining the Major, Member, and Zip_code Tables

```sql
SELECT first_name, major_name, state
FROM major
JOIN member
ON major.major_id = member.link_to_major
JOIN zip_code
ON member.zip = zip_code.zip_code
```

### 14.5 Using Fields from Different Joined Tables in the Same Where Clause

#### Figure 14.8 — Query with Fields from Two Tables in the Where Clause

```sql
SELECT first_name, last_name, college, state
FROM major
JOIN member
ON major.major_id = member.link_to_major
JOIN zip_code
ON member.zip = zip_code.zip_code
WHERE college = 'College of Engineering'
AND short_state = 'NY'
```
