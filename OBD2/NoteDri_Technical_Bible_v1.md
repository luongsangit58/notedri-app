# NoteDri Technical Bible v1

## 1. Vision

-   NoteDri is a Vehicle Health Platform.
-   OBD2 is only a data source.
-   The goal is to build a digital health record for every vehicle.

## 2. Core Architecture

Vehicle → OBD2 / Manual Input / Maintenance → Vehicle Data Layer →
Vehicle Timeline → Knowledge Repository (JSON) → Rule Engine →
Recommendation Engine → Vehicle Health → AI (assistant only)

## 3. Current Status

Completed: - BLE Transport - GATT Discovery - ELM327 Driver - VIN - Live
Data - PID Capability Discovery

Next: - Vehicle Timeline - Knowledge Repository - Rule Engine - Health
Score

## 4. Knowledge Strategy

Store knowledge as JSON in Git first.

knowledge/ - diagnosis/ - rules/ - symptoms/ - maintenance/ -
repair_cost/ - parts/ - faq/ - checklists/ - schemas/ - prompts/

Git is the source of truth. Import into Laravel later.

## 5. AI Knowledge Factory

Pipeline: Research → Normalize → Validate → JSON → Git Review → Laravel
Import

AI creates knowledge. Knowledge Engine consumes knowledge.

## 6. User Value

Daily OBD connection enables: - Vehicle Health Score - Trend Analysis -
Predictive Maintenance - DTC Explanation - Repair Suggestions -
Maintenance Planning - Vehicle Timeline

## 7. 30-Day Roadmap

Week 1 - JSON schemas - Knowledge repository - Knowledge generator
prompts

Week 2 - Generate diagnosis library - Generate maintenance library -
Generate repair cost library

Week 3 - Generate rule library - Build validator - Build importer

Week 4 - Import into Laravel - Connect Rule Engine - Connect Mobile App

## 8. Claude Rules

-   Never hardcode rules.
-   Never hardcode manufacturers.
-   JSON first, database later.
-   Git is the source of truth.
-   OBD2 is only a data source.
-   Vehicle Timeline is more important than Dashboard.
-   AI assists research, never replaces the Rule Engine.
