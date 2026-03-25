# Walkthrough - Fixed Graph Highlighting & SQL Data Accuracy

I have fixed the issue where referenced IDs in query results were not correctly depicted on the graph and were sometimes mislabeled due to SQL column collisions.

## Changes Made
- **SQL Column Collision Prevention**: Mandatory use of aliases for ID columns.
- **Comprehensive Highlighting**: Include all extracted IDs in the highlighted array.
- **Graph Stability**: Layout now stays stable between queries with optimized auto-zoom.
