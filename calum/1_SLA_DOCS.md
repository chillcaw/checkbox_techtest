# The Problem

We want to enrich our data with a human readable SLA status.

## Initial thoughts

### Specification

- Determine SLA status:
    - **"In Progress"**: Not yet complete
    - **"Met"**: Resolved ≤ 8 hours
    - **"Breached"**: Resolved > 8 hours
- Format durations human-readable (e.g., "2h 30m", "3d 5h")

### Approach

We can use a combo of SQL formatter functions and a view to achieve this.

### Why not use a materialized view?

This calculation is used for real time insights and the construction of these values is not heavy (from the looks of it is not heavy).

The SLA status and SLA duration needs to be calculated on the fly to ensure accuracy.

### SQL Functions

The commments here are my own

```sql
-- Doesn't handle months / years, out of scope for now, if you need to support this there are bigger issues
-- Doesn't handle nulls, assume input is always valid
-- Negative durations need handling too, out of scope for now, bigint signed by default (I think)
CREATE OR REPLACE FUNCTION format_duration(seconds bigint)
RETURNS text
LANGUAGE sql
-- Purity level, no side effects, always returns same output for same input
IMMUTABLE
AS $$
SELECT
  CASE
    -- If less than a minute, just return seconds
    WHEN seconds < 60 THEN
      seconds || 's'

    -- If less than an hour the format will omit hours and days
    WHEN seconds < 3600 THEN
      (seconds / 60) || 'm ' ||
      (seconds % 60) || 's'

    -- If less than a day the format will omit seconds and days
    WHEN seconds < 86400 THEN
      (seconds / 3600) || 'h ' ||
      ((seconds % 3600) / 60) || 'm'

    -- If there are days present, format will omit minutes and seconds
    ELSE
      (seconds / 86400) || 'd ' ||
      ((seconds % 86400) / 3600) || 'h'
  END;
$$;
```

```sql
-- Dumping the view syntax here so I can reference it later
CREATE [OR REPLACE] VIEW view_name AS
SELECT column1, column2, ...
FROM table_name
WHERE conditions;
```

## O(N+1) Queries

This is the main place we'll be enriching the matters with SLA data.
Calc per record it seems, so we're definitely looking at a view here.
Love that it's called enriched already :) so I know exactly where the view goes.

Plan run the search filter to get ids on the raw table, then use those ids to get enriched data from the view.

```ts
const enrichedMatters = await Promise.all(
    matters.map(async (matter) => {
        // Get current status group name
        const statusField = matter.fields["Status"];
        let statusGroupName: string | null = null;

        if (statusField && statusField.value && typeof statusField.value === "object") {
            statusGroupName = (statusField.value as StatusValue).groupName || null;
        }

        const { cycleTime, sla } = await this.cycleTimeService.calculateCycleTimeAndSLA(matter.id, statusGroupName);

        return {
            ...matter,
            cycleTime,
            sla,
        };
    }),
);
```

## Performance hits

As I'm running out of time I'm just going to explain how to make the SLA query more performant.

Instead of using a view that does two full scans every time we query it, we can create an enriched table with a foreign key reference to the ticketing_ticket.
Everytime a status change happens on a ticket, we build those records in a trigger function. As a change, the table won't be able to store the formatted total time, we'd be storing the start and nullable end and calculating when we need it.

We could use a materialized view, but we would run into the same problem as the view. We'd trigger a refresh every minute or before every query, which is not ideal.
This will result in 20,000 records Seq per query still.

We could do a middle ground approach, remove seconds from formatted total time and refresh every minute, I would rather a trigger CDC style approach though.

## "Build in trigger"

For performance, posting aggregated values ahead of time from a trigger is honestly unmatched... you can't beat reading a value that already exists ahead of time. Plus your updates are always realtime.

Not to mention that the trigger / table approach allows for even more creative indexing strategies. E.g: You're enriched data is isolated and therefore can be handled any way you want.

The cons, new triggers and tables are things that need to be maintained. Also "does our logic go in the db or the app?" is something that comes into question here.
