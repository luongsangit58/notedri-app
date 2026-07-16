# NoteDri Technical Bible v6

# Knowledge Generation Pipeline

## Mission

Build an AI-powered Knowledge Factory that continuously generates
structured automotive knowledge.

The output is always validated JSON, never database records.

------------------------------------------------------------------------

# Overall Pipeline

Topic ↓ Research Agent ↓ Normalizer ↓ JSON Generator ↓ Validator ↓
Reviewer ↓ Git Repository ↓ Future Laravel Import

------------------------------------------------------------------------

# Step 1 - Research Agent

Input examples:

-   P0420
-   Engine Overheating
-   Dirty MAF
-   Brake Pads

Responsibilities:

-   Search authoritative technical references
-   Compare multiple sources
-   Extract facts
-   Preserve references
-   Detect conflicting information

Output:

Research Summary

------------------------------------------------------------------------

# Step 2 - Normalizer

Convert research into the NoteDri JSON schema.

Normalize:

-   terminology
-   units
-   severity
-   confidence
-   repair costs
-   maintenance intervals

Never copy source articles verbatim.

------------------------------------------------------------------------

# Step 3 - JSON Generator

Generate:

diagnosis/ rules/ repair_cost/ faq/ checklists/ maintenance/ parts/

Every file must follow the official schemas.

------------------------------------------------------------------------

# Step 4 - Validator

Automatically verify:

-   Schema validity
-   Required fields
-   Duplicate IDs
-   Duplicate slugs
-   Broken relationships
-   Missing references
-   Invalid enums

Reject invalid JSON.

------------------------------------------------------------------------

# Step 5 - Reviewer

Produce a review report:

-   Completeness
-   Confidence
-   Missing information
-   Suggested improvements

Only approved JSON enters the repository.

------------------------------------------------------------------------

# AI Prompt Library

Create reusable prompts for:

-   Generate Diagnosis
-   Generate Rule
-   Generate Maintenance
-   Generate Repair Cost
-   Generate FAQ
-   Generate Checklist
-   Generate Parts
-   Generate Symptom
-   Update Existing Knowledge

Every prompt outputs JSON only.

------------------------------------------------------------------------

# Knowledge Quality

Each JSON should include:

-   schemaVersion
-   contentVersion
-   updatedAt
-   confidence
-   references
-   reviewStatus

Review status:

-   draft
-   reviewed
-   approved
-   deprecated

------------------------------------------------------------------------

# Automation

Design CLI commands:

knowledge generate `<topic>`{=html}

knowledge validate

knowledge review

knowledge report

knowledge update `<topic>`{=html}

knowledge export

------------------------------------------------------------------------

# Future

Future workflow:

Git Commit ↓ CI Validation ↓ Knowledge Report ↓ Laravel Import ↓
Knowledge Engine

The Knowledge Factory continuously expands the repository while the
Knowledge Engine consumes trusted knowledge.
