# Class Diagram — CodeAtlas

Two views:

1. **Implemented F1 class structure** — the concrete TypeScript modules (functions grouped
   into logical classes), verified from `backend/src/**` and `frontend/src/**`.
2. **Proposed service layer** — the classes the proposal's six-module MVP implies.

## 1. Implemented (F1 prototype)

`<<module>>` marks a TypeScript module presented as a class; methods are its exported
functions.

```mermaid
classDiagram
    direction LR

    class RepositoryController {
        <<module>>
        +health()
        +analyzeRepositoryUpload()
        +getGraph()
        +getRepositories()
    }
    class IngestionService {
        <<module>>
        +extractZip()
    }
    class ParserService {
        <<module>>
        +analyzeAndStore()
    }
    class AnalysisService {
        <<module>>
        +analyzeRepository()
    }
    class RepositoryService {
        <<module>>
        +findSourceFiles()
    }
    class GraphService {
        <<module>>
        +saveGraph()
        +fetchGraph()
        +listRepositories()
        +verifyConnection()
    }
    class AstParser {
        <<module>>
        +parseFile()
    }
    class EntityExtractor {
        <<module>>
        +extractEntities()
    }
    class RelationshipExtractor {
        <<module>>
        +extractRelationships()
    }
    class ModuleResolver {
        <<module>>
        +resolveModule()
    }
    class SymbolResolver {
        <<interface>>
        +resolveCallFromLocation()
    }
    class GraphBuilder {
        <<module>>
        +buildGraph()
    }
    class Env {
        <<module>>
        +port
        +neo4j
        +uploadsDir
        +extractedDir
    }
    class Neo4jDriver {
        <<module>>
        +driver
        +database
    }

    class GraphNode {
        +string id
        +EntityType type
        +string name
        +string filePath
        +number startLine
        +number endLine
    }
    class GraphRelationship {
        +string source
        +string target
        +RelationshipType type
    }
    class GraphData {
        +List~GraphNode~ nodes
        +List~GraphRelationship~ relationships
    }
    class RelationshipContext {
        +string filePath
        +string absoluteFilePath
        +string repositoryRoot
    }
    class AnalysisResult {
        +GraphData graph
        +boolean persisted
    }
    class ExtractedRepository {
        +string repositoryName
        +string repositoryPath
    }

    class Api {
        <<module>>
        +analyzeArchive()
        +loadGraph()
        +listRepositories()
    }
    class App {
        <<module>>
        +handleAnalyze()
        +handleLoad()
        +handleSelect()
    }
    class GraphView {
        <<module>>
        +render()
    }
    class DetailsPanel {
        <<module>>
        +render()
    }
    class UploadPanel {
        <<module>>
        +render()
    }
    class Legend {
        <<module>>
        +render()
    }

    RepositoryController --> IngestionService
    RepositoryController --> ParserService
    RepositoryController --> GraphService
    ParserService --> AnalysisService
    ParserService --> GraphService
    AnalysisService --> RepositoryService
    AnalysisService --> AstParser
    AnalysisService --> EntityExtractor
    AnalysisService --> RelationshipExtractor
    AnalysisService --> SymbolResolver
    AnalysisService --> GraphBuilder
    RelationshipExtractor --> ModuleResolver
    RelationshipExtractor --> SymbolResolver
    RelationshipExtractor --> RelationshipContext
    GraphBuilder --> GraphData
    GraphBuilder --> GraphNode
    GraphBuilder --> GraphRelationship
    GraphService --> GraphData
    GraphService --> Neo4jDriver
    ParserService --> AnalysisResult
    IngestionService --> ExtractedRepository
    AstParser --> EntityExtractor
    Api --> GraphData
    App --> Api
    App --> GraphView
    App --> DetailsPanel
    App --> UploadPanel
    App --> Legend
```

## 2. Proposed service layer (six-module MVP)

Classes implied by the proposal's scope. `<<planned>>` = not yet implemented in F1.

```mermaid
classDiagram
    direction LR

    class AstParsingEngine {
        <<planned>>
        +parse(repository)
        +extractEntities()
        +extractRelationships()
    }
    class IncrementalUpdateService {
        <<planned>>
        +reparseChangedFiles()
    }
    class KnowledgeGraphEngine {
        <<planned>>
        +build()
        +validate()
        +persist()
    }
    class GraphRepository {
        <<planned>>
        +saveGraph()
        +traverse()
        +query()
    }
    class SearchService {
        <<planned>>
        +searchEntities()
        +graphContext()
    }
    class GuidedTourService {
        <<planned>>
        +identifyFlows()
        +buildTour()
    }
    class ChangeImpactAnalyzer {
        <<planned>>
        +interpretRequirement()
        +validateEntities()
        +traverseImpact()
    }
    class TechnicalDebtAssessor {
        <<planned>>
        +assessRisk()
    }
    class VulnerabilityAnalyzer {
        <<planned>>
        +scanPatterns()
        +classifyFindings()
    }
    class ReportGenerator {
        <<planned>>
        +buildReport()
    }
    class ExportService {
        <<planned>>
        +exportPackage()
    }
    class AiExplanationService {
        <<planned>>
        +explain()
        +suggestRemediation()
    }
    class AnalysisService {
        <<planned>>
        +runGraphAlgorithms()
    }
    class ProjectRepository {
        <<planned>>
        +saveProject()
        +saveUser()
    }

    AstParsingEngine --> KnowledgeGraphEngine
    IncrementalUpdateService --> AstParsingEngine
    KnowledgeGraphEngine --> GraphRepository
    SearchService --> GraphRepository
    GuidedTourService --> GraphRepository
    ChangeImpactAnalyzer --> GraphRepository
    ChangeImpactAnalyzer --> AiExplanationService
    ChangeImpactAnalyzer --> TechnicalDebtAssessor
    TechnicalDebtAssessor --> GraphRepository
    VulnerabilityAnalyzer --> AstParsingEngine
    VulnerabilityAnalyzer --> AiExplanationService
    ReportGenerator --> VulnerabilityAnalyzer
    ReportGenerator --> ChangeImpactAnalyzer
    ExportService --> GraphRepository
    ExportService --> ReportGenerator
    AnalysisService --> GraphRepository
    GraphRepository --> ProjectRepository
```

> **Mapping:** the F1 `GraphService`, `AnalysisService`, `AstParser`, `EntityExtractor`,
> `RelationshipExtractor`, and `GraphBuilder` correspond to the front half of the proposed
> `KnowledgeGraphEngine` / `AstParsingEngine`. The remaining proposed classes are future work.
