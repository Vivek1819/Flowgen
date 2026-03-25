# Walkthrough - Technical Documentation Expansion

I have significantly expanded the [README.md](file:///d:/Projects/flowgen/README.md) to provide the technical depth required for the Forward Deployed Engineer task.

## Key Additions

### 1. Architecture Decisions
I detailed the **Decoupled Pipeline** strategy, explaining why we separated Intent, SQL, and Graph Traversal into distinct phases to improve accuracy and speed.

### 2. Database Rationale
Provided a clear justification for choosing **PostgreSQL** over native Graph DBs, focusing on ACID compliance and relational integrity while using a custom traversal engine for graph behavior.

### 3. Prompting & LLM Strategy
- Explained the **Model Tiering** strategy (70B for reasoning, 8B for speed).
- Documented the **Self-Correcting SQL Loop** which automatically repairs syntax errors.
- Described the **Smart Filtering** logic used to keep graph visualizations clean and relevant.

### 4. Robust Guardrails
Detailed a three-layer security model:
- **Keyword Filtering** for basic domain bounding.
- **Intent Constraints** for semantic domain bounding.
- **SQL Sanitization** to prevent any non-SELECT data manipulation.

## Verification
- Verified each section accurately describes the code in [route.ts](file:///d:/Projects/flowgen/app/api/query/route.ts).
- Confirmed that all requested pillars (Architecture, DB, Prompting, Guardrails) are now explicitly covered.
