# Testing

## Unit Testing

Since I was told to focus on the query performance aspect of the tech test, I spent the least time testing so I'll document my thoughts here.

### Main testing pain points I can see

Handlers / Services and Repos don't use dependency injection. This makes it annoying to test because you have to mock globals rather than passing objects from your test.

Ideally you end up with a pattern like this (or use a library that does DI for you):

```ts
const MatterRepo = new MatterRepo(pool);
const MatterService = new MatterService(MatterRepo);

app.get("/endpoint", getHandler(MatterService));
```

## Negatives of my implementation

The main issue with my implementation is that it's very SQL heavy, I wouldn't always do this, but I felt it was the best way to demonstrate my understanding of postgres and query optimization for this tech test.

The issue here, is that a lot of my logic, triggers / sql functions are impossible to unit test and require proper e2e test fixtures to be tested properly.

Another reason I opted for business logic inside the database, is it allowed me to implement the tech test spec without touching parts of the codebase that were'nt directly related to the task.

### Things I would more into the application layer (if I had more time)

- format function for SLA
- trigger for sla start and end times
- search_value aggregation for fuzzy search

### Things I could do to make my implementation easier to test

Note: Unfortunately lenient search APIs often feature a lot of coupling between different search parameters, and this makes them inherently difficult to unit test.

But... there are some things I could do:

1. Find another way to run both the count and data queries at the same time without promise.all, this would make it way simpler to mock return values for the mockClient in my tests
    1. One way to do this would be to use a count CTE, and SELECT it into every return record. The count would be duplicated for every field_value returned
2. Define typed interfaces for raw flat data coming from the repo e.g: `RawSearchMatterRecord[]`
3. Handle the hydration and field parsing in the matter service layer
4. Create a centralised field parsing function (this requires changes all over the place)
5. Move SLA calculations to the cycleTimeService
6. Fetch SLA start and end times in a seperate query
    1. This would allow us to test the SLA logic in isolation, without needing to worry about the complexities of the main getMatters query. We could just mock the SLA times in our tests and focus on testing the SLA logic itself.
    2. This comes at a performance cost though.
    3. Can be done with a single where in query
7. Generate the search query strings in a seperate function

### Things that can't be decoupled

1. sortBy field parsing and case statements
    1. To parse the sort field requires knowledge of the tables and fields in the query, things will get confusing quickly if you try and move it out.
2. seperating ticketing_ticket sorts and ticketing_field_value sorts
    1. In order to avoid uneccessary joins when ordering by ticketing_ticket fields vs ticketing_ticket_field_value fields, I had to split the sorts into two case statements, and then combine them in a final case statement. This means that the sort field parsing is inherently coupled to the query structure.

### Query Splitting

1. We could split the query into multiple queries, instead of using multiple CTEs.
    1. The big issue with this, is that we would have to materialize datasets in the application layer and then pass them into the next query.
    2. CTEs are pretty special in that postgres won't materialize the queries unless it has to.
    3. If you run an `explain anaylyse` on my query you'll see that the CTEs are not materialized and are instead optimized into the main query, this is a big reason why my implementation is so performant.

One split we could make would be one query for search->sort->limit and one query for the rejoin to get the field values. We could every seperate this into it's own testable function in the MatterRepo. This comes at a performance cost.

### Why didn't I e2e test?

I've already spent the alloted time for this tech test, and from my experience with creating e2e API suites with proper fixtures, it can take a while to get the ball rolling if there is not existing testing standard.

E2E would be the most effective way to test this current implementation though.
