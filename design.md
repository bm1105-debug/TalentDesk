# design.md

### 1. SOLID Implementation Framework
*   **SRP:** Ensure each class performs a single duty; separate data persistence from business logic.
*   **OCP:** Use polymorphism to allow for new features without altering existing, stable modules.
*   **LSP:** Maintain hierarchy integrity so that derived classes never throw exceptions for inherited methods (e.g., a `Penguin` shouldn't inherit a `Fly` method it cannot use).
*   **ISP:** Decompose large interfaces into smaller, task-specific ones to reduce client-side overhead.
*   **DIP:** Inject dependencies through interfaces to allow for easier mocking and testing.

### 2. Clean Code & Readability Guidelines
*   **Intentional Naming:** Use names that answer: *Why does this exist? What does it do? How is it used?*.
*   **One Level of Abstraction:** Each function should descend only **one level of abstraction** to maintain a "step-down" reading order.
*   **Eliminate Side Effects:** Functions should not have hidden behaviors, such as modifying global state when the name implies a simple check.
*   **Minimize Comments:** Code should explain itself; use comments only for **legal requirements, intent explanation, or warning of consequences**.

### 3. UI Development Standards (React/Bootstrap)
*   **Functional over Class:** Always use functional components to leverage **React hooks** for better composability.
*   **Prop Hygiene:** Keep props minimal and well-defined; use **destructuring** to improve readability.
*   **Modular Validation:** Use libraries like **Yup** for form validation to separate logic from rendering.
*   **Skeleton Loading:** Use **section-wise skeleton patterns** rather than full-page loaders to improve perceived performance.

### 4. Accessibility & UX Laws
*   **Keyboard Operability:** Ensure all functionality is reachable and operable via **keyboard interface**.
*   **Hick's Law:** Simplify user choices to speed up decision-making processes.
*   **Miller's Law:** Limit the number of items in working memory (7 ± 2) to reduce cognitive load.
*   **Postel's Law:** Be liberal in what you accept (inputs) and conservative in what you send (outputs).

### 5. Maintenance & Refactoring Strategy
*   **Assess and Map:** Identify tight coupling and hidden dependencies before altering legacy modules.
*   **Feature Flags:** Isolate structural changes using **feature flags or sandboxed environments** to prevent accidental production impact.
*   **Automated Validation:** Apply **unit tests and regression checks** to every refactored module to future-proof maintainability.
*   **AI Acceleration:** Utilize AI-assisted analysis to identify **repeated patterns and code smells** across thousands of lines of code.
