# 5. Document Scalability Strategy 📈

In your `README.md` submission, address:

**If this system needed to handle 10× the current load (100,000 matters, 1,000+ concurrent users), what would you do?**

Consider:

- Database optimization (indexes, materialized views, partitioning)
- Caching strategies (Redis, query caching)
- Application scaling (horizontal scaling, load balancing)
- Search optimization (Elasticsearch migration)
- Connection pooling adjustments
- Query optimization

Be specific and justify your choices with:

- Performance impact
- Complexity trade-offs
- Cost implications
- Implementation timeline

## Scope

I'm going to leave "change to event driven architecture" and "move to microservices" out of scope for this document.

## Database optimization

100,000 matters, 1,000+ users potentially a few million ticket fields. Having worked on datasets with billions of records before, this is not a particularly large dataset.
Likely you could get away with trusting postgres to handle this load from a database perspective, but nonetheless some things to consider below.

### Indexes

Purpose build indexes for searches and sorts, like my implementation in this application.

### Aggregate columns and table

Building aggregates and index values that can be built ahead of time incrementally in triggers

### Partitioning

Identifying potentially large tables that could benefit from partitioning.
Examples could include:

- account_id
    - users I imagine won't often need to search records outside of their organisation (I could be completely wrong about this)
- date partitioning
    - It's rare to find a use case where date partitioning isn't useful, that's why some datawarehousing technologies use date based partitioning as a default
    - if its mostly recent records that are being queried this is a very good way of reducing the overall search sizes
    - e.g partitions containing records from a year ago are rarely touched, we can omit them from most searches

### Sharding

Sharding and partitioning are not the same thing.

An example of why correlating them to the same thing can be dangerous:
date is a great candidate for partitioning, but a terrible candidate for data distribution, because you'll end up with one node that does the process for all recent records and all other nodes are just wasted idled CPU resources most the time. I'm assuming since this application has an "SLA" component that recent records are more important.
**DISCLAIMER:** There are probably use cases for using date based sharding, I don't think this app is one of them.

It's impossible to suggest good distributions without knowing the data access patterns and how heavy each one is.

A suggestion I could give would be account_id based distribution, assuming most queries are scoped to a single account, with date partitioning.
Keep in mind, if there are huge disparities between number of records per account or queries per account, this could lead to hotspots and performance hits for small accounts that have done nothing wrong.
A couple of big accounts could affect the performance of the entire DB cluster.

There are other things to consider like cross shard joins, distributed transactions etc. These are out of scope for this document. This is a tech test in of itself.

## Caching strategies

This is where my knowledge is somewhat limited, because it's something I actively avoid when possible. Even with datasets of billions of records per table (redshift) at JCDecaux we were able to get away with not having any special maintained caching layer. I like developing around the idea that caching isn't an option (figuratively speaking).

Good candidates for query caching are tables that are read from a lot, but don't change often.

- E.g: account info, user info, state tables

We could also split the getMatters query and cache the matter IDs for query parameter queries for a short period of time.

## Application scaling

To avoid a single account from overwhelming the system with requests, implement account level rate limiting. Communicating limits to users is important so they can plan around them.

Since the docker configuration is already setup for horizontal scaling, we can use services like fargate or ecs to scale. Will spin up new instances based on CPU / memory / request count metrics.

Fargate implications: Vendor lock in, can scale to zero when not in use, pay for what you use. Expensive is architecture never scales to zero.
ECS implications: Can be cheaper when there is a constant load, more management overhead, less vendor lock in.

## Search optimization

If you looking in my [fuzzy search](./3_FUZZYSEARCH_DOCS.md) I explore a couple of things around search optimization. In my implementation of search I build a search column and a trigram index to speed up fuzzy searches, this single index search should be pretty damn fast for most use cases (especially with distribution keys and proper partitioning). Elastic search could actually be slower, because it does entire document analysis. That's why it's important to understand whether the features of elasticsearch are actually needed.

Having managed elasticsearch services before, I will say it's fantastic, but the migration and upskilling costs are high. Elasticsearch is not just a quick tool you'll spin up and it'll magically fix everything, it's another database with indexing strategies, scaling strategies, maintenance tasks of it's own.

I also believe that to benefit from elasticsearch the spec of the search query needs to be more focused on best matches rather than "give me a page of everything that matches this substring". Search vs "I'm feeling lucky" type searches.

It important to note, that this spec change completely changes the user experience of one of the most core features of the application. This needs to be a seperate isolated feature "advanced search" or it needs to be communicated very clearly to users. I think a good stepping stone to test the waters would be using the similarity search features in postgres first.

Implications: To benefits most from elasticsearch features requires changing fundamentally how the search and sorting functionality works and communicating this to users, another system to maintain test and tune, potentially staff to manage it.

What we don't want to happen: Move to elasticsearch before realising that the current search implementation is sufficient for the specific searches we want to do.

## Connection pooling adjustments

With 1000+ concurrent users (<10000 users), we would continue using connections per repo call. Keeping in mind that per query connections will increase the per request latency slightly due to connection acquisition time, but will be able to handle more concurrent requests.

You could scale up the pool size to handle more concurrent queries, but this will come down to whether the DB can handle the extra connections. It's likely that your DB will be the big bottleneck until sharding / clustering / distribution is implemented. (Though we've got the give postgres credit, it can handle a lot of complex queries on modest hardware)

My main worry with the current configuration is actually the connection timeout figures rather than the pool size, they should be set lower to avoid requests waiting too long for a connection to become available. Setting the max timeout can be a good KPI for keeping queries under x ms as well.

Implications: Reducing timeouts too low could lead to more failed requests if the DB is under heavy load. Giving users a clear reason for failure is important.

## Query optimization

More of the same. Purpose built aggregates, indexes and pre computed values to avoid heavy queries on large datasets. (triggers for CDC style, materialized views for batch processing style).
If using distributed DBs, keeping all data a query needs in a single shard is important to avoid cross shard queries.

Further down the line, for dashboards and automated reporting etc, I'd be moving towards using dimensional data (star schemas, etc). Denormalized / preaggregated data for fast reads of snapshots.

Speaking on data warehousing, you're likely not going to want to use postgres for dimensional data, and you'll likely want to use a columnar store like redshift, bigquery, snowflake etc.

Cost: Main cost, employees. Data engineers, DBAs etc to design and maintain the system. 1 of each minimum you could be talking $300,000+

## Security and compliance (some more performance benefits too)

Not mentioned in the above, but there is a good direction we can go in. RLS (Row Level Security) to ensure users can only access data they are allowed to see.
Also we can indirectly get performance benefits from RLS because every table now has a potentially good partitioning or distribution key.
