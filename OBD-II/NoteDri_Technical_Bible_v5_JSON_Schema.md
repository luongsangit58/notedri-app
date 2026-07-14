# NoteDri Technical Bible v5

# JSON Schema Specification

## Purpose

This document defines the standard JSON schemas used by the Knowledge
Repository.

Rules: - Every object has a unique id. - Every object has
schemaVersion. - Every object has updatedAt. - Every object is version
controlled in Git. - JSON is the source of truth.

------------------------------------------------------------------------

# 1. Diagnosis Schema

Required fields:

-   id
-   slug
-   title
-   summary
-   severity
-   confidence
-   canDrive
-   possibleCauses\[\]
-   symptoms\[\]
-   recommendedActions\[\]
-   repairCostId
-   maintenanceIds\[\]
-   partIds\[\]
-   faqIds\[\]
-   blogIds\[\]
-   checklistIds\[\]
-   ruleIds\[\]
-   references\[\]
-   schemaVersion
-   updatedAt

------------------------------------------------------------------------

# 2. Rule Schema

Required fields:

-   id
-   name
-   priority
-   enabled
-   conditions\[\]
-   diagnosisIds\[\]
-   confidence
-   explanation
-   schemaVersion
-   updatedAt

Supported operators:

> # \<
>
> # \<=
>
> != contains exists

Supported rule types:

-   Threshold
-   Combination
-   Historical
-   Trend
-   Maintenance

------------------------------------------------------------------------

# 3. Symptom Schema

Fields:

-   id
-   title
-   category
-   description
-   relatedDiagnosisIds\[\]
-   relatedRuleIds\[\]

Examples:

-   Hard Start
-   Rough Idle
-   Poor Fuel Economy
-   Engine Knock
-   White Smoke

------------------------------------------------------------------------

# 4. Maintenance Schema

Fields:

-   id
-   title
-   intervalMileage
-   intervalMonths
-   intervalEngineHours
-   description
-   relatedParts\[\]
-   relatedDiagnosis\[\]
-   checklistIds\[\]

------------------------------------------------------------------------

# 5. Repair Cost Schema

Fields:

-   id
-   diagnosisId
-   minCost
-   maxCost
-   currency
-   laborHours
-   confidence
-   notes

------------------------------------------------------------------------

# 6. Part Schema

Fields:

-   id
-   name
-   category
-   manufacturer
-   compatibleVehicles\[\]
-   relatedDiagnosis\[\]

------------------------------------------------------------------------

# 7. FAQ Schema

Fields:

-   id
-   question
-   answer
-   relatedDiagnosis\[\]
-   relatedMaintenance\[\]

------------------------------------------------------------------------

# 8. Checklist Schema

Fields:

-   id
-   title
-   steps\[\]
-   estimatedTime
-   requiredTools\[\]
-   safetyNotes\[\]

------------------------------------------------------------------------

# 9. Reference Schema

Every knowledge object should contain references.

Fields:

-   title
-   source
-   url
-   publishedDate
-   confidence

------------------------------------------------------------------------

# 10. Validation Rules

Every JSON must pass:

-   Unique ID
-   Unique Slug
-   Valid Schema
-   Existing References
-   No Broken Relationships
-   Required Fields
-   Valid Enum Values

------------------------------------------------------------------------

# 11. Naming Convention

IDs: snake_case

Slugs: kebab-case

Files: `<slug>`{=html}.json

Examples:

diagnosis/ p0420.json

maintenance/ engine_oil_change.json

rules/ coolant_overheat_rule.json

------------------------------------------------------------------------

# 12. Goal

All AI-generated knowledge must follow these schemas.

A valid JSON can be imported into Laravel without manual modification.
