# Development Workflow

This project uses a repository-wide implementation and verification workflow.

## Standard cycle

1. Review the relevant source files, configuration, tests, migrations, and documentation.
2. Follow existing project conventions before adding new patterns or dependencies.
3. Implement the requested change across all affected files.
4. Run the applicable lint, type-check, test, and build checks.
5. Inspect GitHub checks, Vercel build and runtime logs, and Supabase validation where relevant.
6. Correct failures and repeat verification until the available checks pass or an external blocker is identified.
7. Summarize changed files, validation results, deployment status, database impact, and unresolved risks.

## Operational notes

- Changes may be committed directly to the default branch for requested work.
- Production deployment may be included as part of implementation and verification.
- Database changes should include an impact statement and post-change verification.
- Sensitive configuration must not be committed or printed; validate configuration without displaying values whenever possible.
