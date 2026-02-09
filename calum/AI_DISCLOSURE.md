# AI Usage

ChatGPT for review and to double check my thinking in terms of query performance and indexing strategies.
Copilot for small code suggestions, none of the big refactors were taken as is.

I never used AI tools to generate initial versions of any of the code in this project.
However, I did use AI tools to review and suggest improvements to some parts of the code after I had written them. These suggestions were carefully considered and manually integrated where appropriate, ensuring that the final code reflects my own understanding and style. I still implemented all changes myself, and I take full responsibility for the final code.

# Pull request review

I did a full manual first pass review of the codebase before using any AI tooling to suggest improvements.

# Fuzzy Search implementation

At no point did AI suggest my trigger aggregated GIN index approach for fuzzy searching text fields. This idea is my own.
The lowercase index build to reduce index size was my own.

# Top Matches search

I was back and forth with ChatGPT for a little while on this, discussing different approaches to implement it and to see how far I could push the idea in postgres.

# Formatting functions E.g: for SLA task

I'm using AI to generate the initial SQL functions for this, I've solved this problem by hand many times before and I want to get this task done quickly, so I can focus on parts of the assessment
that demonstrate my unique skills better.

I have reviewed and refactored them myself to make sure they fit the spec.

# Documentation

All documentation is written by hand.
