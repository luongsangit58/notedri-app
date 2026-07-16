# NoteDri Technical Bible v4

# Rule Engine & Knowledge Reasoning

## 1. Mission

The Rule Engine is the decision-making core of NoteDri.

It converts normalized vehicle data into structured diagnoses.

AI does NOT replace the Rule Engine.

AI only explains the result in natural language.

------------------------------------------------------------------------

## 2. Inputs

The Rule Engine consumes:

-   Live sensor values
-   DTCs
-   Vehicle profile
-   Vehicle capabilities
-   Vehicle timeline
-   Maintenance history
-   Repair history
-   User symptoms
-   Environmental data (future)

Never consume raw PID responses.

------------------------------------------------------------------------

## 3. Rule Types

Support multiple rule categories:

1.  Threshold Rule

-   coolant \> 105°C

2.  Combination Rule

-   Fuel Trim High + Low MAF

3.  Historical Rule

-   Repeated DTC within 30 days

4.  Trend Rule

-   Battery voltage decreasing over weeks

5.  Maintenance Rule

-   Oil life + Engine hours

6.  Manufacturer Rule

-   Optional manufacturer-specific rules

------------------------------------------------------------------------

## 4. Rule JSON Example

{ "id": "engine_overheat", "priority": 100, "enabled": true,
"conditions": \[ { "field": "coolant", "operator": "\>", "value": 105 }
\], "diagnosis": \[ { "id": "engine_overheat", "confidence": 95 } \] }

Rules must never be hardcoded in PHP.

------------------------------------------------------------------------

## 5. Rule Evaluation

Vehicle Data ↓ Find Matching Rules ↓ Score Diagnoses ↓ Merge Results ↓
Recommendation Engine

Multiple diagnoses may be returned.

Never assume only one root cause.

------------------------------------------------------------------------

## 6. Confidence Score

Every diagnosis should contain a confidence score.

Example:

Dirty MAF ............ 82%

Vacuum Leak ......... 54%

Fuel Pump ........... 18%

Sort by confidence.

------------------------------------------------------------------------

## 7. Explainability

Every diagnosis must explain WHY.

Example:

Fuel Trim is higher than normal while MAF airflow is lower than
expected.

This pattern commonly indicates a dirty MAF sensor.

No black-box decisions.

------------------------------------------------------------------------

## 8. Recommendation Engine

Input:

Diagnosis IDs

Output:

-   Risk Level
-   Can Continue Driving
-   Estimated Repair Cost
-   Estimated Repair Time
-   Recommended Actions
-   Related Blogs
-   Related FAQs
-   Related Parts
-   Maintenance Advice

The Rule Engine decides. The Recommendation Engine enriches.

------------------------------------------------------------------------

## 9. Future AI

AI receives:

-   Vehicle Timeline
-   Diagnoses
-   Rules
-   Recommendations

AI rewrites the output into natural language.

AI must not invent diagnoses.

------------------------------------------------------------------------

## 10. Design Principles

-   Rules are data, not code.
-   JSON is the source of truth.
-   Rules are versioned.
-   Rules are testable.
-   Rules are explainable.
-   Rules are manufacturer-independent by default.
-   Knowledge grows without changing application code.

The Rule Engine should remain stable while the Knowledge Repository
continuously expands.
