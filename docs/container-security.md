# Container image security scanning

The `Container image security scan` GitHub Actions workflow builds the API and web Docker images and scans both with Trivy for operating-system and application-library vulnerabilities.

## When it runs

- Pull requests targeting `main`
- Pushes to `main`
- Manual runs from the GitHub Actions tab

The workflow uses the repository's existing Dockerfiles and does not connect to the database, start the application, or upload application data. It prints a table of HIGH and CRITICAL findings in the workflow logs. Unfixed findings are excluded from this first baseline.

## Initial report-only policy

The Trivy steps use `exit-code: "0"` intentionally. This makes findings visible without blocking assignment CI while the project establishes its initial container vulnerability baseline. A green workflow therefore means the images were scanned successfully; it does **not** mean that the images have zero vulnerabilities.

Review the logs for both the API and web scan steps on each run. Before using these images for a public production deployment, review the findings, update affected base images/dependencies, and decide on a severity threshold. Once the baseline is understood, change `exit-code` to `"1"` (and optionally add a reviewed ignore policy with expiry/justification) so selected findings can block merges.

## Scope and limitations

- Scans OS packages and application libraries in the built images.
- Reports HIGH and CRITICAL findings with known fixes excluded when Trivy marks a finding as unfixed.
- Does not replace CodeQL, Dependabot, secret scanning, runtime testing, or a manual security review.
- Does not scan a deployed environment and does not prove the absence of vulnerabilities.
- Uses the Trivy GitHub Action; review upstream action releases and pin the action to a verified full commit SHA when adopting a stricter supply-chain policy.
