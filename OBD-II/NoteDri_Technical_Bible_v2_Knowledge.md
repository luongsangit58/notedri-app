# NoteDri Technical Bible v2

# Knowledge Factory & Knowledge Engine

## 1. Mission

The purpose of the Knowledge Factory is to continuously create
high-quality automotive knowledge.

The Knowledge Engine consumes that knowledge to generate useful
recommendations.

Knowledge Factory != Knowledge Engine

------------------------------------------------------------------------

## 2. Workflow

Vehicle Data + AI Research + Existing Blogs + Technical References ↓
Knowledge Factory ↓ JSON Repository ↓ Validation ↓ Git Review ↓
Knowledge Engine ↓ Mobile App

------------------------------------------------------------------------

## 3. Repository Structure

knowledge/ ├── diagnosis/ ├── dtc/ ├── symptoms/ ├── maintenance/ ├──
rules/ ├── repair_cost/ ├── parts/ ├── faq/ ├── checklists/ ├── schemas/
├── prompts/ └── scripts/

------------------------------------------------------------------------

## 4. Knowledge Object

Each Diagnosis should contain:

-   id
-   slug
-   title
-   severity
-   confidence
-   canDrive
-   possibleCauses
-   symptoms
-   recommendedActions
-   repairCost
-   relatedBlogs
-   relatedFAQs
-   relatedParts
-   maintenanceItems
-   references
-   schemaVersion
-   updatedAt

------------------------------------------------------------------------

## 5. AI Responsibilities

AI SHOULD:

-   Research
-   Compare sources
-   Normalize information
-   Generate JSON
-   Validate schema
-   Suggest relationships

AI SHOULD NOT:

-   Write directly to database
-   Invent unsupported facts
-   Remove references
-   Bypass validation

------------------------------------------------------------------------

## 6. User Value

Daily OBD usage builds:

-   Vehicle Timeline
-   Vehicle Health Score
-   Trend Analysis
-   Predictive Maintenance
-   Personalized Recommendations
-   DTC History
-   Maintenance History
-   Repair History

The goal is to understand the vehicle over time, not just today's sensor
values.

------------------------------------------------------------------------

## 7. Immediate Tasks

Task 1 Design JSON schemas.

Task 2 Create Knowledge Generator prompts.

Task 3 Generate first 100 Diagnosis JSON files.

Task 4 Generate Maintenance Library.

Task 5 Generate Rule Library.

Task 6 Build JSON validator.

Task 7 Build Laravel importer.

Only after these steps should the Knowledge Engine consume the
repository.

------------------------------------------------------------------------

## 8. Success Criteria

The repository should eventually contain:

-   1000+ Diagnoses
-   5000+ Rules
-   1000+ Maintenance Items
-   1000+ Repair Costs
-   5000+ FAQs

Knowledge becomes the long-term asset of NoteDri.
