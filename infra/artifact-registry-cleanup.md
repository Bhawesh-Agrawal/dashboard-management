# Artifact Registry Cleanup Policy (GCP Free-Tier Guardrail)

To prevent container images from accumulating and exceeding GCP Artifact Registry free storage limits (0.5 GB/month), this policy keeps only the 3 most recent container image versions and automatically prunes older ones.

## Policy Configuration File
The policy definition is located at [artifact-registry-cleanup.json](file:///home/bhawesh/Projects/dashboard-management/infra/artifact-registry-cleanup.json).

```json
[
  {
    "name": "keep-last-3-versions",
    "action": {
      "type": "Keep"
    },
    "mostRecentVersions": {
      "keepCount": 3
    }
  }
]
```

## How to Apply

Run the following `gcloud` command to apply this policy to the production repository:

```bash
gcloud artifacts repositories set-cleanup-policies dashboard-management \
  --project=dashboard-management-prod \
  --location=asia-south1 \
  --policy=infra/artifact-registry-cleanup.json
```

## Verify Active Policies

To verify that the cleanup policy is active on the repository:

```bash
gcloud artifacts repositories describe dashboard-management \
  --project=dashboard-management-prod \
  --location=asia-south1 \
  --format="yaml(cleanupPolicies)"
```
