# Notes / Issues / Concerns

## Sort by text and string when sorting a by text field

I have kept my sort order and sort field logic seperate, do if you sort by a text field it'll only ever sort by text_value.

Solution:

```ts
case 'text':
    sortField = `ttfv.text_value ${sortOrder} ttfv.string_value`;
```

## Seperation of concerns

### Parsing values and display values

This should really be handled in the service layer, as display value in particular is business logic.

The reason I didn't build this out this the service layer, is it would require defining Raw DB records types that are returned from the repo. I also opted to do it in the repo because from a glance it looks like field parsing is already being handled in repo methods. Though if I had more time I would consider field parsing business logic and move it to the service layer.

### Cycle time and SLA calculation

I also did this in the matter repo, but it should be centralised in the cycle time service.

The reason I did it in the matter repo is because I was told to focus on query performance and O(n+1) query issues. If I wanted to fix the O(n+1) query issues, I would have had to pull the core cycle time and SLA data through the matter repo and then send that raw data to the cycle time service to do the calculations. This requires me to have a separate page of types for the matter repo and creates some complicated dependencies between services and repos.

I wanted `getMatters` to return `interface Matter`

One way around this would have been to return undefined for both SLA and cycleTime on the matter interface and then populate those fields in the service layer, but relying on multi-layer mutations didn't feel like a great idea to me.

## Hydration

Why am I doing my own hydration?
Mostly so I can get away with a single query. I saw that the app was already using pg directly, and I wanted to demonstrate that I can work with whatever libraries you give me access to and still get a good result.

Realistically you'd want to pull in libraries like knex/micro-orm that have built-in hydration and query building capabilities, but for the sake of the tech test I only needed to hydrate one query result. You could roll your own standard for hydration. The reason I didn't create a standard hydrate function is because hydration standards are hard to define, require a lot of edge case handling, and loads of documentation for the team using them.

I felt like this was out of scope for the tech test, but in a production app I would want to have a standard for how we handle hydration and data parsing across the entire app.

## Duplication

To keep in scope the best I could, I tried to touch as little code as possible. As a result, there are places in `getMatters` where I have duplicated logic from other functions. I think these switch case statements for parsing fields should be done in a centralized mapping function. Since this mapping function would be dealing with ticketing_fields, I would put it in a FieldService file.

```ts
// The idea is to have a centralised place where we can define the standard for how these fields are parsed and displayed across the entire app.
const mapping = {
    'number': {
        parseValue: (field) => field.number_value,
        parseDisplayValue: (field) => parseFloat(field.number_value) ?? undefined,
    },
    'text': {
        parseValue: (field) => field.text_value,
        parseDisplayValue: (field) => field.text_value ?? undefined,
    },
    'date': {
        parseValue: (field) => field.string_value,
        parseDisplayValue: (field) => field.string_value ? new Date(field.string_value) : undefined,
    },
    'user': {
        parseValue: (field) => ..., // User
        parseDisplayValue: (field) => ..., // User
    },
}
```

Why not just reuse the existing repo functions that already do this? For performance, all the existing functions are built around handling one matter or even one field at a time. If I implemented shared logic for parsing / handling fields it would require touching a lot of code that isn't actually related to the spec I was given.

## Stylistic choices

### Switch Expressions (js doesn't support them out the box)

You will see a lot of code like this (anon functions that return values directly from a switch)

```ts
const value = (() => {
    switch (fieldType) {
        case "number":
            return numberValue;
        case "string":
            return stringValue;
        case "text":
            return textValue;
        default:
            return null;
    }
})();
```

Why? They allow you to create consts from function outputs. Which means no dealing with multiscope mutations. No dealing with let or var, and no ambiguity around what the current value for these variables will be.

## Triggers

Why? They're an obvious choice for performance, because they allow you to denormalize data on writes. This means you can read pre-aggregated values that are ready to go when you need them, instead of having to do expensive calculations on the fly when you read the data. This is especially important for things like start/finish and search indexes, which can be expensive to calculate on the fly for large datasets.

The reasons however, are a bit deeper than that in the context of this tech test. In the context of the tech test, using triggers actually saves me from having to touch code that's out of scope and isn't directly related to the spec.

### Cons of triggers

1. A lot of dev teams aren't comfortable with them.
2. They can add ambiguity to how and where data is being updated and transformed from.
3. They make it difficult to define where business logic should live (db vs app).
4. You need to create SQL management programs to help you manage versioning and such.
5. They can be difficult to test, especially if you have a lot of complex logic in them.
6. They require one off backfills on every update

### Materialized Views (Why didn't I use them?)

Materialized views are a great option for things like reports and analytics snapshots, but I felt that in the context of this tech test, they didn't fit the use case as well as triggers.

Why?

1. Rebuilds on every write (ironically probably via a trigger) and updates are expensive and not ideal for real-time data.
2. SLA data is time sensitive and needs to be refreshed on every read.
3. Rebuilds of my search_value index could be expensive

### Raw Views

I actually did start my MVP with using a view for the SLA calculations. The main issue with this is that joining to a view can have serious performance impacts. Your queries will end up spending most of their time with hash joins to your view, because the query planner has no indexes to work with.

### Application Updates

You'd be able to do exactly the same things that my triggers are doing through application updates, but I was trying to avoid touching code that wasn't related to the task.

### Application Lifecycles

Libraries like mikro orm allow you to define lifecycles in your application layer, they are a really good alternative to triggers if one is worried about moving logic into the database.

## Why bother aggregating search_value?

I was told to focus on query optimization and I noticed early on that even though there are trigram indexes defined in schema.sql already, with the requirements I was given for `getMatters`, there was no way to force postgres to actually use the defined indexes.
