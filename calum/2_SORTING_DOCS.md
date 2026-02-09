# The problem

We want to sort by any field + created_at + updated_at

## First idea (What I'd do in a production app)

There are only really 3 types of fields we care about for sorting

- Text
- Number
- Date
- Purpose build indexes / fields for more sort options

There are more complex fields like currency, where we might want to sort by currency type or amount, users could pass as "total_amount.amount" or "total_amount.currency". This is out of scope for now. ...but we can actually just handle these as sort_number_value and sort_string_value respectively.

We could create 3 seperate indexes columns for each type and seed the values using triggers on insert / update of ticketing_ticket_field_value

**Why not use materialized views?**
My opinion: materialized views are good for snapshotting datasets for later analysis, I used them a lot for daily / weekly / monthly reporting when I was a data engineer at Servian.
They are not designed for high frequency updates, and refreshing them can be expensive because every update requires a rebuild or you end up with a schedule where records are stale for a period of time. Postgres can optimize incremental refreshes, but it's still not as real time and "light weight" as triggers.

**Why not use generated columns?**
We can, if things get any more complex we won'tto use generated columns. I would rather use triggers instead of generated columns for flexibility.
If we want to change how our indexes are proactively built, we can just update the trigger function instead of having to drop and recreate the generated columns (danger).

**CDC vs Batch**
Think of triggers as a CDC approach and materialized views as a batch approach.

**Cons of triggers**
Hard to maintain (sometimes), usually people say this when they don't have much experience with them. The real reason reason is triggers don't do away with the initial refresh problem, you still need to backfill existing data every time you change the logic.

Luckily we can just do benign updates to force triggers to run again. And these queries can be run every schema update:

```sql
UPDATE my_table
SET some_column = some_column;
```

^^ Almost the same amount of code as refreshing a materialized view! We can do this dynamically for every table, but in that case we need standards around how triggers are written, e.g around purity etc.

It can also be useful to know when the initial trigger backfill is done so we get patterns like this:

```sql
ALTER TABLE my_table ADD COLUMN last_enrichment timestamptz;

UPDATE my_table
SET last_enrichment = now();
```

## Staying in scope

Usually I'm a big fan of moving things like search and sorting indexes into their own tables e.g "s*ticketing_ticket_field_value" (s* for search_table), but for this task I'll add the indexes directly to ticketing_ticket_field_value to keep things simple and in scope.

In practice I would built use case specific indexes for different types of searches and sorts with triggers, but for this spec I'm going to index the existing fields best I can and use case statements to pick the right field for sorting.

## CASE statements

The only reason I want to use case statements is so I can use PDO named parameters for the sort field name. In practice I would use a query builder like knex.

```sql
CASE :field_type
    WHEN 'created_at' THEN tt.created_at
    WHEN 'updated_at' THEN tt.updated_at
    WHEN 'number' THEN ttfv_sort.number_value
    WHEN 'text' THEN ttfv_sort.text_value
    WHEN 'select' THEN tfo.sequence
    WHEN 'status' THEN tfso.sequence
    WHEN 'date' THEN ttfv_sort.date_value
    WHEN 'currency' THEN ttfv_sort.currency_value
    WHEN 'boolean' THEN ttfv_sort.boolean_value::int
    WHEN 'user' THEN u.full_name
    ELSE ttfv_sort.string_value
END AS sort_key
```

## Issue with case statements

There is no way even when using a CTE to stop postgres from re-evaluating the case statement for every row.
Unfortunately this means we can't take advantage of PDO and we just need to be "careful" to avoid SQL injection.

We could use this in a SQL function call it and then paste in the result to the next query, I'm not going to do this.
