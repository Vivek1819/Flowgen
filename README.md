# FlowGen: Technical Deep Dive & Architecture

**FlowGen** is an AI-powered Graph Intelligence platform for SAP Order-to-Cash (O2C) data. This document outlines the core architecture decisions and technical strategies that power the system.

---

## 🏗️ Architecture Decisions

### 1. Decoupled Pipeline (Intent -> SQL -> Graph)
Instead of a single monolithic LLM call, FlowGen uses a multi-stage pipeline:
- **Phase 1: Intent Classification**: Identifies if the user is tracing a flow, exploring an entity, or asking a general data question. This reduces the search space for the next phase.
- **Phase 2: Semantic SQL Generation**: Translates business logic into raw PostgreSQL commands.
- **Phase 3: Contextual Augmentation**: A recursive graph traversal engine expands the result set to include historically relevant entities (e.g., pulling in a Product node just because it was part of an Order).
- **Phase 4: Multi-Modal Answer**: Streams a natural language answer while simultaneously rendering an interactive React Flow graph.

### 2. Zero-Latency Streaming (SSE)
We chose **Server-Sent Events (SSE)** via Next.js `ReadableStream` to solve the "black box" problem of long-running LLM tasks. Users receive immediate feedback through "Status Chunks" (e.g., *Classifying intent...*) while the backend performs heavy SQL generation and graph traversal.

---

## 🗄️ Database Choice & Schema

### Why PostgreSQL?
We opted for **PostgreSQL** (via Prisma) over specialized Graph databases (like Neo4j) for several reasons:
- **Data Integrity**: SAP O2C data is inherently relational and strictly typed. PostgreSQL's ACID compliance is non-negotiable for billing and payment data.
- **Flexible Search**: Using ILIKE and PostgreSQL's powerful JOIN capabilities allowed us to implement "Graph-like" behavior without the overhead of a dedicated GQL layer.
- **Recursive Ability**: Our custom traversal logic simulates graph-native multi-hop queries using efficient Prisma lookups.

### The Schema
The schema is modeled after real SAP ERP tables:
- `Customer`, `Order`, `Delivery`, `Invoice`, `JournalEntry`, `Payment`.
- **Relationships**: A cascading hierarchy from Sales to Cash, allowing for automated "Flow Tracing" across identifiers.

---

## 🤖 LLM Prompting Strategy

### 1. Model Tiering
- **Llama 3.3 70B (Versatile)**: Used for Intent Classification and SQL Generation. Its higher reasoning capabilities ensure that complex JOINs and double-quoting rules are followed accurately.
- **Llama 3.1 8B (Instant)**: Used for rapid Entity Extraction, Graph Filtering, and final Answer streaming to minimize latency and cost.

### 2. Self-Correcting SQL Loop
The SQL generator is wrapped in a **retry-and-fix mechanism**:
- If the generated SQL fails (e.g., a syntax error or missing quotes), the error message is fed back into the LLM in a second "Repair" prompt.
- This dramatically increases the reliability of the "Text-to-SQL" feature for non-technical users.

### 3. Smart Graph Filtering
To prevent "Graph Hairballs" (too many nodes), we use a specific LLM pass that reviews the database results and selects only the **most relevant "Seeds" and "Highlights"** for visualization.

---

## 🛡️ Guardrails

### 1. Hardcoded Keyword Filtering
The system implements a `isRelevantQuery` check that validates the presence of O2C-specific keywords (e.g., *order, invoice, flow, gap*).

### 2. Semantic Domain Bounding
The Intent Classifier is prompted to reject any query that does not fall into the four defined business intents. If a user asks about the weather or general trivia, the system returns a polite refusal based on domain constraints.

### 3. SQL Safety Layer
The system uses an `isSafeSQL` helper that strictly permits only `SELECT` statements, explicitly blocking destructive commands like `DROP`, `DELETE`, or `UPDATE`.

---

## 📊 Dataset Setup

The project requires a specific SAP O2C dataset to function correctly. This dataset is not included in the repository due to size.

1. **Download the Dataset**: [Click here to download (Google Drive)](https://drive.google.com/file/d/1UqaLbFaveV-3MEuiUrzKydhKmkeC1iAL/view?usp=sharing)
2. **Extract**: Unzip the contents into the `sap-o2c-data/` directory at the root of the project.
3. **Verify Structure**: Ensure you have subdirectories like `business_partners`, `sales_order_headers`, etc., inside `sap-o2c-data/`, and each contains `.jsonl` files.

---

## 🚦 Getting Started

### Installation & Setup

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Environment Variables**:
   Create a `.env.local` file and add your keys:
   ```env
   DATABASE_URL="file:./dev.db" # Or your PostgreSQL URL
   GROQ_API_KEY="your_groq_api_key_here"
   ```

3. **Initialize Database**:
   ```bash
   npx prisma db push
   ```

4. **Seed Data**:
   ```bash
   npx prisma db seed
   ```

5. **Run Development Server**:
   ```bash
   npm run dev
   ```

---

Developed for the **Forward Deployed Engineer** assignment.
